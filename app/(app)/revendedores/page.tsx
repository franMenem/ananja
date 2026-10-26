import Link from "next/link";

import { AsignarRolButton } from "@/components/revendedores/asignar-rol-button";
import { ListaRevendedores } from "@/components/personas/lista-revendedores";
import { BotellasAdeudadas } from "@/components/revendedores/botellas-adeudadas";
import { EspacioRevendedorButton } from "@/components/revendedores/espacio-revendedor-button";
import { RechazarPendienteButton } from "@/components/revendedores/rechazar-pendiente-button";
import { BOTON_SECUNDARIO } from "@/components/ui/boton";
import { EncabezadoPantalla } from "@/components/ui/encabezado-pantalla";
import { agruparValorStockPorVendedor } from "@/lib/dominio/calculos";
import { ordenarPorDeuda, resumenEquipo, textoBotellas, type FilaRevendedor } from "@/lib/dominio/personas";
import { sumarPendientesPorVendedor } from "@/lib/data/pagos-revendedor";
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
 * Rediseño fase 5 (2026-10): una sola lista ordenada por deuda (mayor
 * primero) con un estado por persona (debe / por confirmar / al día), y
 * los coordinadores pasan a la lista principal. Bajo "Equipo" quedan los
 * pendientes de aprobación y los admins. La columna "Total" (deuda +
 * valor de lo que tiene) se sacó: sumaba plata por cobrar con botellas en
 * stock y no coincidía con ninguna otra pantalla.
 *
 * "Valor de lo que tiene" usa `valor_en_poder_ananja_centavos`
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
    porConfirmarPorVendedor,
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
    // Pagos que informaron y todavía nadie confirmó, por persona.
    sumarPendientesPorVendedor(supabase),
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

  // Revendedores propiamente dichos + admins con espacio propio habilitado
  // (mismo universo que `v_resumen_revendedor` desde 0026) + coordinadores
  // (antes solo estaban en "Equipo"; sin esto no había forma de llegar a su
  // ficha desde la lista principal).
  const filaDe = (r: Vendedor, tipo: "revendedor" | "coordinadora"): FilaRevendedor => ({
    id: r.id,
    nombre: r.nombre,
    esCoordinadora: tipo === "coordinadora",
    esAdmin: r.rol === "admin",
    enPoder: stockPorVendedor.get(r.id) ?? 0,
    aCargo: revendedorasPorCoordinador.get(r.id) ?? 0,
    valorEnPoderCentavos: valorStockPorVendedor.get(r.id)?.valorEnPoderAnanjaCentavos ?? 0,
    debeCentavos: resumenPorVendedor.get(r.id)?.debe_centavos ?? 0,
    porConfirmarCentavos: porConfirmarPorVendedor.get(r.id) ?? 0,
  });
  const filas: FilaRevendedor[] = ordenarPorDeuda([
    ...[...(revendedoresRol ?? []), ...(adminsConEspacio ?? [])].map((r) => filaDe(r, "revendedor")),
    ...(coordinadores ?? []).map((c) => filaDe(c, "coordinadora")),
  ]);
  const totales = resumenEquipo(filas);
  const cantidadEquipo = (admins ?? []).length + (pendientes ?? []).length;

  return (
    <div className="flex flex-col gap-6 pb-8">
      <EncabezadoPantalla
        titulo="Revendedores"
        pregunta="¿Quién tiene botellas y quién debe plata?"
        acciones={
          <Link href="/revendedores/invitar" className={`${BOTON_SECUNDARIO} flex px-4`}>
            + Sumar persona
          </Link>
        }
      />

      {filas.length > 0 && (
        <p className="text-[16px] text-text">
          Entre todos deben{" "}
          <span className={`font-semibold tabular-nums ${totales.debeCentavos > 0 ? "text-accent" : "text-text"}`}>
            {formatCentavos(totales.debeCentavos)}
          </span>{" "}
          y tienen <span className="font-semibold tabular-nums">{textoBotellas(totales.botellas)}</span>
        </p>
      )}

      <ListaRevendedores filas={filas} />

      <BotellasAdeudadas resumen={botellas} variante="equipo" mostrarPorPersona />

      <section className="overflow-hidden rounded-2xl border border-border bg-surface">
        <details className="group">
          <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-3 px-4 py-2 text-[16px] font-semibold text-text select-none lg:px-5 [&::-webkit-details-marker]:hidden">
            <span>
              Equipo: admins y pendientes{" "}
              <span className="font-normal text-text-muted">({cantidadEquipo})</span>
            </span>
            <span aria-hidden className="inline-block text-text-muted transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>

          <div className="flex flex-col gap-6 border-t border-line px-4 py-4 lg:px-5">
            {(pendientes ?? []).length > 0 && (
              <section className="flex flex-col gap-2" aria-labelledby="equipo-pendientes">
                <h3 id="equipo-pendientes" className="text-[16px] font-semibold text-text">
                  Pendientes de aprobación
                </h3>
                <div className="flex flex-col divide-y divide-line">
                  {(pendientes ?? []).map((p) => (
                    <div key={p.id} className="flex flex-col gap-3 py-3">
                      <div className="flex flex-col">
                        <span className="text-[16px] font-semibold break-words text-text">{p.nombre}</span>
                        <span className="text-[14px] break-words text-text-muted">{p.email ?? "—"}</span>
                        <span className="text-[14px] text-text-muted">
                          Se registró {p.creado_en ? formatFechaHora(p.creado_en) : "—"}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <AsignarRolButton
                          vendedorId={p.id}
                          nombre={p.nombre}
                          rolDestino="revendedor"
                          label="Hacer revendedor"
                          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-primary px-4 text-[15px] font-semibold text-primary"
                        />
                        <AsignarRolButton
                          vendedorId={p.id}
                          nombre={p.nombre}
                          rolDestino="admin"
                          label="Hacer admin"
                          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d0cec8] bg-surface px-4 text-[15px] font-semibold text-text hover:bg-background"
                        />
                        <RechazarPendienteButton
                          vendedorId={p.id}
                          nombre={p.nombre}
                          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d0cec8] bg-surface px-4 text-[15px] font-semibold text-text-muted hover:bg-background hover:text-accent"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="flex flex-col gap-2" aria-labelledby="equipo-admins">
              <h3 id="equipo-admins" className="text-[16px] font-semibold text-text">
                Admins
              </h3>
              {(admins ?? []).length === 0 ? (
                <p className="text-[16px] text-text-muted">No hay admins activos.</p>
              ) : (
                <div className="flex flex-col divide-y divide-line">
                  {(admins ?? []).map((a) => (
                    <div
                      key={a.id}
                      className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                    >
                      <div className="flex min-w-0 flex-col">
                        <span className="text-[16px] font-semibold break-words text-text">{a.nombre}</span>
                        <span className="text-[14px] break-words text-text-muted">{a.email ?? "—"}</span>
                        <span className="text-[14px] text-text-muted">
                          Espacio de revendedor: {a.revende ? "habilitado" : "apagado"}
                        </span>
                      </div>
                      {a.revende ? (
                        <EspacioRevendedorButton
                          vendedorId={a.id}
                          nombre={a.nombre}
                          habilitar={false}
                          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-[#d0cec8] bg-surface px-4 text-[15px] font-semibold text-text-muted hover:bg-background hover:text-accent"
                        />
                      ) : (
                        <EspacioRevendedorButton
                          vendedorId={a.id}
                          nombre={a.nombre}
                          habilitar={true}
                          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-primary px-4 text-[15px] font-semibold text-primary"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </details>
      </section>
    </div>
  );
}
