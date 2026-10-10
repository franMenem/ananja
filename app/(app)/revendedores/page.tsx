import Link from "next/link";

import { AsignarRolButton } from "@/components/revendedores/asignar-rol-button";
import { BotellasAdeudadas } from "@/components/revendedores/botellas-adeudadas";
import { EspacioRevendedorButton } from "@/components/revendedores/espacio-revendedor-button";
import { RechazarPendienteButton } from "@/components/revendedores/rechazar-pendiente-button";
import {
  agruparValorStockPorVendedor,
  calcularTotalRevendedor,
} from "@/lib/dominio/calculos";
import { cargarBotellasAdeudadas } from "@/lib/data/botellas-adeudadas";
import {
  listarAdminsActivos,
  listarAdminsConEspacio,
  listarCoordinadoresActivos,
  listarEncargadoIdsActivos,
  listarPendientesAprobacion,
  listarResumenRevendedorTodos,
  listarRevendedoresRol,
  listarStockRevendedorTodos,
  listarValorStockRevendedorTodos,
  type ResumenRevendedorRow,
  type VendedorRow,
} from "@/lib/data/revendedores";
import { formatFechaHora } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";
import { NEGOCIO } from "@/lib/negocio";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Vendedor = VendedorRow;

/**
 * `/revendedores` — panel de admin para el ciclo de vida de un usuario
 * (reglas de negocio en
 * `0026_roles_pendiente_espacio_revendedor.sql`):
 *
 *  1. "Pendientes de aprobación" — alta automática sin revisar todavía
 *     (`rol = 'pendiente'`): un admin lo aprueba como revendedor o admin,
 *     o lo rechaza.
 *  2. "Revendedores" — `rol = 'revendedor'` MÁS los admins con su propio
 *     espacio habilitado (tag "admin" — operan `/mi` con sus propios
 *     datos, ver `VerComoRevendedor`).
 *  3. "Admins" — todos los admins activos, con el toggle de su espacio de
 *     revendedor propio. Un admin NUNCA se pasa a revendedor (por eso no
 *     hay ningún botón "pasar a revendedor" en esta página).
 *
 * Cada tabla es un grid con scroll horizontal propio (`overflow-x-auto`)
 * en vez de dejar que la página completa scrollee de costado en mobile.
 *
 * Rediseño "de 10 bloques a 5" (2026-09-16): la columna "Vendido" se va
 * (queda "Le debe a Ananja", "Valor en poder" y "Total" de 0051) y los
 * bloques 1 y 3 ("Pendientes de aprobación" y "Admins") bajan a un único
 * `<details>` "Equipo", plegado por defecto.
 *
 * "Valor en poder" y "Total" usan `valor_en_poder_ananja_centavos`
 * (`0059_valor_stock_revendedor_costo_real.sql`), el costo REAL de
 * Ananja — no `valor_en_poder_centavos` (lo que se le cobró a la
 * revendedora, que para una revendedora de un coordinador es el precio
 * DEL COORDINADOR, con su margen). Un admin acá mira cuánto tiene Ananja
 * en juego de verdad, no lo que un coordinador eventualmente cobra de más.
 */
export default async function RevendedoresPage() {
  const supabase = await createClient();

  const [
    { data: pendientes },
    { data: revendedoresRol },
    { data: adminsConEspacio },
    { data: admins },
    { data: coordinadores },
    { data: encargados },
    { data: stock },
    { data: resumenes },
    { data: valorStock },
    botellas,
  ] = await Promise.all([
    listarPendientesAprobacion(supabase),
    listarRevendedoresRol(supabase),
    listarAdminsConEspacio(supabase),
    listarAdminsActivos(supabase),
    // Coordinadores (0055_coordinador.sql): no aparecen en ninguna otra
    // tabla de esta página (no son "revendedor" ni "admin") — sin esto no
    // hay forma de llegar a su ficha por navegación
    // (0057_coordinador_plata_stock.sql § hueco encontrado por Fran).
    listarCoordinadoresActivos(supabase),
    // A cuántas revendedoras coordina cada uno — mismo dato que ya usa
    // `listarMisRevendedoras` (`lib/coordinador.ts`), contado acá para
    // todos de una.
    listarEncargadoIdsActivos(supabase),
    listarStockRevendedorTodos(supabase),
    listarResumenRevendedorTodos(supabase),
    listarValorStockRevendedorTodos(supabase),
    // "Se le deben a Ananja N botellas": si falla, el bloque dice "No se
    // pudo calcular." y el resto del listado se ve igual.
    cargarBotellasAdeudadas(supabase, { tipo: "todo" }).catch((error) => {
      console.error("cargarBotellasAdeudadas", error);
      return null;
    }),
  ]);

  const revendedorasPorCoordinador = new Map<string, number>();
  for (const fila of encargados ?? []) {
    if (!fila.encargado_id) continue;
    revendedorasPorCoordinador.set(fila.encargado_id, (revendedorasPorCoordinador.get(fila.encargado_id) ?? 0) + 1);
  }

  const stockPorVendedor = new Map<string, number>();
  for (const fila of stock ?? []) {
    if (!fila.vendedor_id) continue;
    const previo = stockPorVendedor.get(fila.vendedor_id) ?? 0;
    stockPorVendedor.set(fila.vendedor_id, previo + (fila.en_poder ?? 0));
  }

  const resumenPorVendedor = new Map<string, ResumenRevendedorRow>(
    (resumenes ?? [])
      .filter((r): r is typeof r & { vendedor_id: string } => r.vendedor_id !== null)
      .map((r) => [r.vendedor_id, r]),
  );

  const valorStockPorVendedor = agruparValorStockPorVendedor(
    (valorStock ?? [])
      .filter((f): f is typeof f & { vendedor_id: string } => f.vendedor_id !== null)
      .map((f) => ({
        vendedorId: f.vendedor_id,
        enPoder: f.en_poder ?? 0,
        valorEnPoderCentavos: f.valor_en_poder_centavos ?? 0,
        // Costo REAL de Ananja (0059), no lo que se le cobró a la
        // revendedora — un admin mira "Valor en poder" y "Total" al costo
        // real, no al precio de un eventual coordinador (ej. Sofi, bajo
        // Laura: Ananja tiene en juego menos de lo que Sofi le debe a
        // Laura).
        valorEnPoderAnanjaCentavos: f.valor_en_poder_ananja_centavos ?? 0,
      })),
  );

  // "Revendedores" (tabla 2): revendedores propiamente dichos + admins con
  // espacio propio habilitado (tag "admin") — mismo universo que
  // `v_resumen_revendedor` desde 0026_roles_pendiente_espacio_revendedor.sql.
  const filasRevendedores: Vendedor[] = [...(revendedoresRol ?? []), ...(adminsConEspacio ?? [])].sort(
    (a, b) => a.nombre.localeCompare(b.nombre),
  );

  return (
    <div className="flex flex-col gap-10 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-[32px] leading-[1.05] text-primary md:text-[38px]">
          Revendedores
        </h1>
        <Link
          href="/revendedores/invitar"
          className="flex min-h-11 items-center justify-center bg-primary px-4 text-[12px] font-medium tracking-[0.14em] text-background uppercase transition-colors hover:bg-primary-hover"
        >
          + Sumar persona
        </Link>
      </div>

      <BotellasAdeudadas resumen={botellas} variante="equipo" mostrarPorPersona />

      <section className="flex flex-col gap-3">
        <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
          Revendedores
        </span>
        {filasRevendedores.length === 0 ? (
          <p className="py-6 text-sm text-text-muted">
            Todavía no hay ningún revendedor.
          </p>
        ) : (
          <>
            {/* Tabla — escritorio */}
            <div className="hidden overflow-x-auto border border-border md:block">
              <div className="min-w-[730px]">
                <div className="grid grid-cols-[1.3fr_90px_130px_130px_130px] gap-3 border-b border-border bg-border/20 px-3 py-2 text-[10px] tracking-[0.14em] text-text-muted uppercase">
                  <span>Nombre</span>
                  <span className="text-right">En poder</span>
                  <span className="text-right">Le debe a {NEGOCIO.nombre}</span>
                  <span className="text-right">Valor en poder</span>
                  <span className="text-right">Total</span>
                </div>
                {filasRevendedores.map((r) => {
                  const enPoder = stockPorVendedor.get(r.id) ?? 0;
                  const resumen = resumenPorVendedor.get(r.id);
                  const debeCentavos = resumen?.debe_centavos ?? 0;
                  const valorEnPoderCentavos =
                    valorStockPorVendedor.get(r.id)?.valorEnPoderAnanjaCentavos ?? 0;
                  const totalCentavos = calcularTotalRevendedor(
                    debeCentavos,
                    valorEnPoderCentavos,
                  );
                  return (
                    <Link
                      key={r.id}
                      href={`/revendedores/${r.id}`}
                      className="grid grid-cols-[1.3fr_90px_130px_130px_130px] items-center gap-3 border-b border-border px-3 py-3 text-sm last:border-b-0 hover:bg-border/30"
                    >
                      <span className="flex items-center gap-2 font-medium text-text">
                        {r.nombre}
                        {r.rol === "admin" && (
                          <span className="border border-border px-1.5 py-px text-[9px] tracking-[0.1em] text-text-muted uppercase">
                            admin
                          </span>
                        )}
                      </span>
                      <span className="text-right tabular-nums text-text">{enPoder}</span>
                      <span className="text-right tabular-nums font-medium text-accent">
                        {formatCentavos(debeCentavos)}
                      </span>
                      <span className="text-right tabular-nums text-text">
                        {formatCentavos(valorEnPoderCentavos)}
                      </span>
                      <span className="text-right tabular-nums font-medium text-text">
                        {formatCentavos(totalCentavos)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Tarjetas — mobile */}
            <div className="flex flex-col gap-px border border-border bg-border md:hidden">
              {filasRevendedores.map((r) => {
                const enPoder = stockPorVendedor.get(r.id) ?? 0;
                const resumen = resumenPorVendedor.get(r.id);
                const debeCentavos = resumen?.debe_centavos ?? 0;
                const valorEnPoderCentavos =
                  valorStockPorVendedor.get(r.id)?.valorEnPoderAnanjaCentavos ?? 0;
                const totalCentavos = calcularTotalRevendedor(
                  debeCentavos,
                  valorEnPoderCentavos,
                );
                return (
                  <Link
                    key={r.id}
                    href={`/revendedores/${r.id}`}
                    className="flex flex-col gap-2 bg-surface-raised p-3.5"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2 break-words font-medium text-text">
                        {r.nombre}
                        {r.rol === "admin" && (
                          <span className="shrink-0 border border-border px-1.5 py-px text-[9px] tracking-[0.1em] text-text-muted uppercase">
                            admin
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 font-display text-[20px] leading-none text-accent tabular-nums">
                        {formatCentavos(debeCentavos)}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 text-[12px]">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-text-muted uppercase tracking-[0.08em]">
                          En poder
                        </span>
                        <span className="tabular-nums text-text">{enPoder}</span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-text-muted uppercase tracking-[0.08em]">
                          Valor en poder
                        </span>
                        <span className="tabular-nums text-text">
                          {formatCentavos(valorEnPoderCentavos)}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-text-muted uppercase tracking-[0.08em]">
                          Total
                        </span>
                        <span className="font-medium tabular-nums text-text">
                          {formatCentavos(totalCentavos)}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </section>

      <details className="group flex flex-col gap-3">
        <summary className="flex items-center gap-1.5 select-none text-[10px] tracking-[0.22em] text-text-muted uppercase [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="inline-block transition-transform group-open:rotate-90">
            ›
          </span>
          Equipo: admins, coordinadores y pendientes (
          {(admins ?? []).length + (coordinadores ?? []).length + (pendientes ?? []).length})
        </summary>

        <div className="flex flex-col gap-8 pt-1">
          {(pendientes ?? []).length > 0 && (
            <section className="flex flex-col gap-3">
              <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
                Pendientes de aprobación
              </span>

              {/* Tabla — escritorio */}
              <div className="hidden overflow-x-auto border border-border md:block">
                <div className="min-w-[680px]">
                  <div className="grid grid-cols-[1.1fr_1.6fr_1fr_auto] gap-3 border-b border-border bg-border/20 px-3 py-2 text-[10px] tracking-[0.14em] text-text-muted uppercase">
                    <span>Nombre</span>
                    <span>Email</span>
                    <span>Registrado</span>
                    <span>Acciones</span>
                  </div>
                  {(pendientes ?? []).map((p) => (
                    <div
                      key={p.id}
                      className="grid grid-cols-[1.1fr_1.6fr_1fr_auto] items-center gap-3 border-b border-border px-3 py-3 text-sm last:border-b-0"
                    >
                      <span className="font-medium text-text">{p.nombre}</span>
                      <span className="truncate text-text-muted">{p.email ?? "—"}</span>
                      <span className="text-text-muted">
                        {p.creado_en ? formatFechaHora(p.creado_en) : "—"}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        <AsignarRolButton
                          vendedorId={p.id}
                          nombre={p.nombre}
                          rolDestino="revendedor"
                          label="Hacer revendedor"
                          className="flex min-h-9 items-center justify-center border border-primary px-3 text-[11px] font-medium tracking-[0.1em] text-primary uppercase"
                        />
                        <AsignarRolButton
                          vendedorId={p.id}
                          nombre={p.nombre}
                          rolDestino="admin"
                          label="Hacer admin"
                          className="flex min-h-9 items-center justify-center border border-border px-3 text-[11px] font-medium tracking-[0.1em] text-text uppercase hover:border-primary hover:text-primary"
                        />
                        <RechazarPendienteButton
                          vendedorId={p.id}
                          nombre={p.nombre}
                          className="flex min-h-9 items-center justify-center border border-border px-3 text-[11px] font-medium tracking-[0.1em] text-text-muted uppercase hover:border-accent hover:text-accent"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tarjetas — mobile */}
              <div className="flex flex-col gap-px border border-border bg-border md:hidden">
                {(pendientes ?? []).map((p) => (
                  <div key={p.id} className="flex flex-col gap-2 bg-surface-raised p-3.5">
                    <span className="min-w-0 font-medium break-words text-text">{p.nombre}</span>
                    <div className="flex flex-col gap-1 text-[12px]">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-text-muted uppercase tracking-[0.08em]">Email</span>
                        <span className="min-w-0 break-words text-right text-text">
                          {p.email ?? "—"}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-text-muted uppercase tracking-[0.08em]">
                          Registrado
                        </span>
                        <span className="text-text">
                          {p.creado_en ? formatFechaHora(p.creado_en) : "—"}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <AsignarRolButton
                        vendedorId={p.id}
                        nombre={p.nombre}
                        rolDestino="revendedor"
                        label="Hacer revendedor"
                        className="flex min-h-11 items-center justify-center border border-primary px-3 text-[11px] font-medium tracking-[0.1em] text-primary uppercase"
                      />
                      <AsignarRolButton
                        vendedorId={p.id}
                        nombre={p.nombre}
                        rolDestino="admin"
                        label="Hacer admin"
                        className="flex min-h-11 items-center justify-center border border-border px-3 text-[11px] font-medium tracking-[0.1em] text-text uppercase hover:border-primary hover:text-primary"
                      />
                      <RechazarPendienteButton
                        vendedorId={p.id}
                        nombre={p.nombre}
                        className="flex min-h-11 items-center justify-center border border-border px-3 text-[11px] font-medium tracking-[0.1em] text-text-muted uppercase hover:border-accent hover:text-accent"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="flex flex-col gap-3">
            <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
              Admins
            </span>
            {(admins ?? []).length === 0 ? (
              <p className="py-6 text-sm text-text-muted">No hay admins activos.</p>
            ) : (
              <>
                {/* Tabla — escritorio */}
                <div className="hidden overflow-x-auto border border-border md:block">
                  <div className="min-w-[560px]">
                    <div className="grid grid-cols-[1fr_1.6fr_auto] gap-3 border-b border-border bg-border/20 px-3 py-2 text-[10px] tracking-[0.14em] text-text-muted uppercase">
                      <span>Nombre</span>
                      <span>Email</span>
                      <span>Espacio de revendedor</span>
                    </div>
                    {(admins ?? []).map((a) => (
                      <div
                        key={a.id}
                        className="grid grid-cols-[1fr_1.6fr_auto] items-center gap-3 border-b border-border px-3 py-3 text-sm last:border-b-0"
                      >
                        <span className="font-medium text-text">{a.nombre}</span>
                        <span className="truncate text-text-muted">{a.email ?? "—"}</span>
                        <div className="flex items-center gap-2">
                          {a.revende ? (
                            <>
                              <span className="text-[11px] tracking-[0.1em] text-text uppercase">
                                Habilitado
                              </span>
                              <EspacioRevendedorButton
                                vendedorId={a.id}
                                nombre={a.nombre}
                                habilitar={false}
                                className="flex min-h-9 items-center justify-center border border-border px-3 text-[11px] font-medium tracking-[0.1em] text-text-muted uppercase hover:border-accent hover:text-accent"
                              />
                            </>
                          ) : (
                            <EspacioRevendedorButton
                              vendedorId={a.id}
                              nombre={a.nombre}
                              habilitar={true}
                              className="flex min-h-9 items-center justify-center border border-primary px-3 text-[11px] font-medium tracking-[0.1em] text-primary uppercase"
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tarjetas — mobile */}
                <div className="flex flex-col gap-px border border-border bg-border md:hidden">
                  {(admins ?? []).map((a) => (
                    <div key={a.id} className="flex flex-col gap-2 bg-surface-raised p-3.5">
                      <span className="min-w-0 font-medium break-words text-text">{a.nombre}</span>
                      <div className="flex items-baseline justify-between gap-2 text-[12px]">
                        <span className="text-text-muted uppercase tracking-[0.08em]">Email</span>
                        <span className="min-w-0 break-words text-right text-text">
                          {a.email ?? "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-[11px] tracking-[0.08em] text-text-muted uppercase">
                          Espacio de revendedor
                        </span>
                        {a.revende ? (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] tracking-[0.1em] text-text uppercase">
                              Habilitado
                            </span>
                            <EspacioRevendedorButton
                              vendedorId={a.id}
                              nombre={a.nombre}
                              habilitar={false}
                              className="flex min-h-11 items-center justify-center border border-border px-3 text-[11px] font-medium tracking-[0.1em] text-text-muted uppercase hover:border-accent hover:text-accent"
                            />
                          </div>
                        ) : (
                          <EspacioRevendedorButton
                            vendedorId={a.id}
                            nombre={a.nombre}
                            habilitar={true}
                            className="flex min-h-11 items-center justify-center border border-primary px-3 text-[11px] font-medium tracking-[0.1em] text-primary uppercase"
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
              Coordinadores
            </span>
            {(coordinadores ?? []).length === 0 ? (
              <p className="py-6 text-sm text-text-muted">No hay coordinadores activos.</p>
            ) : (
              <>
                {/* Tabla — escritorio */}
                <div className="hidden overflow-x-auto border border-border md:block">
                  <div className="min-w-[480px]">
                    <div className="grid grid-cols-[1.6fr_1fr] gap-3 border-b border-border bg-border/20 px-3 py-2 text-[10px] tracking-[0.14em] text-text-muted uppercase">
                      <span>Nombre</span>
                      <span className="text-right">Revendedoras a cargo</span>
                    </div>
                    {(coordinadores ?? []).map((c) => (
                      <Link
                        key={c.id}
                        // `?rol=coordinador`: pista para que la ficha pida
                        // solo la tanda de coordinador de entrada — ver el
                        // comentario en `/revendedores/[id]/page.tsx`.
                        href={`/revendedores/${c.id}?rol=coordinador`}
                        className="grid grid-cols-[1.6fr_1fr] items-center gap-3 border-b border-border px-3 py-3 text-sm last:border-b-0 hover:bg-border/30"
                      >
                        <span className="font-medium text-text">{c.nombre}</span>
                        <span className="text-right tabular-nums text-text">
                          {revendedorasPorCoordinador.get(c.id) ?? 0}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>

                {/* Tarjetas — mobile */}
                <div className="flex flex-col gap-px border border-border bg-border md:hidden">
                  {(coordinadores ?? []).map((c) => (
                    <Link
                      key={c.id}
                      href={`/revendedores/${c.id}?rol=coordinador`}
                      className="flex items-baseline justify-between gap-2 bg-surface-raised p-3.5"
                    >
                      <span className="min-w-0 break-words font-medium text-text">{c.nombre}</span>
                      <span className="shrink-0 text-[12px] text-text-muted">
                        {revendedorasPorCoordinador.get(c.id) ?? 0} a cargo
                      </span>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      </details>
    </div>
  );
}
