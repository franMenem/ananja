import Link from "next/link";
import type { ReactNode } from "react";

import { BOTON_ACCION_TAREA, BOTON_SECUNDARIO } from "@/components/ui/boton";
import { Fila } from "@/components/ui/fila";
import { Tarjeta } from "@/components/ui/tarjeta";
import type { DeudaAnanja } from "@/lib/data/plata";
import { totalAnanjaDebe } from "@/lib/dominio/inicio";
import { formatFecha } from "@/lib/fechas";
import { formatCentavos, formatMonto } from "@/lib/money";
import { NEGOCIO } from "@/lib/negocio";

type PersonaEnManos = { tenedor_id: string; nombre: string; total_centavos: number };
type Deudor = { vendedor_id: string; nombre: string; saldo_centavos: number };
type Clientes = { cantidad: number; totalCentavos: number };

function desdeTexto(dias: number): string {
  if (dias <= 0) return "desde hoy";
  if (dias === 1) return "hace 1 día";
  return `hace ${dias} días`;
}

/** Monto que el cliente DEBE: rojo solo si hay algo para pagar (> 0). Un cero
 * nunca va en rojo. */
function Deuda({ centavos, texto }: { centavos: number; texto: string }) {
  return <span className={centavos > 0 ? "text-accent" : "text-text"}>{texto}</span>;
}

function Grupo({
  id,
  titulo,
  total,
  children,
}: {
  id: string;
  titulo: string;
  total: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col">
      <div className="flex items-baseline justify-between gap-3 pb-1">
        <h3 id={id} className="min-w-0 text-[17px] font-semibold text-text">
          {titulo}
        </h3>
        <span className="shrink-0 text-[17px] font-semibold tabular-nums text-text">{total}</span>
      </div>
      <div className="flex flex-col divide-y divide-line">{children}</div>
    </section>
  );
}

function Vacio({ children }: { children: ReactNode }) {
  return <p className="py-3 text-[16px] text-text-muted">{children}</p>;
}

/** Fila tocable (toda la fila lleva a la ficha). */
function FilaLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link prefetch={false} href={href} className={`block rounded-lg hover:bg-background ${className}`}>
      {children}
    </Link>
  );
}

/**
 * Tarjeta "Fuera de la cuenta" de `/plata`: toda la plata que no está en
 * Mercado Pago ni en el banco, en tres grupos con su total en el encabezado.
 *  - En manos de personas (`v_plata_en_manos`): efectivo que alguien tiene y
 *    tiene que pasar a la cuenta.
 *  - Te deben (`v_deuda_vendedor` + `v_deuda_cliente`): misma cifra que Hoy
 *    (`totalLeDeben`).
 *  - Ananja debe: pedidos al proveedor y deudas del negocio, cada una con su
 *    "Pagar".
 */
export function FueraDeLaCuenta({
  personas,
  diasPorPersona,
  totalEnManos,
  efectivoSinDueno,
  deudores,
  clientes,
  totalLeDeben,
  deudaAnanja,
}: {
  personas: PersonaEnManos[];
  diasPorPersona: Map<string, number | null>;
  totalEnManos: number;
  efectivoSinDueno: number;
  deudores: Deudor[];
  clientes: Clientes;
  totalLeDeben: number;
  deudaAnanja: DeudaAnanja;
}) {
  const debe = totalAnanjaDebe(deudaAnanja.pedidosPorPagar, deudaAnanja.deudasNegocio);
  const sinNadaPorPagar =
    deudaAnanja.pedidosPorPagar.length === 0 && deudaAnanja.deudasNegocio.length === 0;

  return (
    <Tarjeta como="section" aria-labelledby="plata-fuera" className="flex flex-col gap-6">
      <h2 id="plata-fuera" className="text-[20px] leading-tight font-semibold text-text">
        Fuera de la cuenta
      </h2>

      <Grupo id="plata-en-manos" titulo="En manos de personas" total={formatCentavos(totalEnManos)}>
        {personas.length === 0 ? (
          <Vacio>Nadie tiene plata en mano.</Vacio>
        ) : (
          personas.map((p) => {
            const dias = diasPorPersona.get(p.tenedor_id);
            const negativo = p.total_centavos < 0;
            const detalle = negativo
              ? "Figura en negativo: revisá sus movimientos."
              : dias !== null && dias !== undefined
                ? `Efectivo ${desdeTexto(dias)}`
                : "Efectivo";
            return (
              <div key={p.tenedor_id} className="flex flex-col gap-1 py-1 sm:flex-row sm:items-center sm:gap-3">
                <FilaLink href={`/plata/en-manos/${p.tenedor_id}`} className="sm:flex-1">
                  <Fila
                    titulo={p.nombre}
                    detalle={detalle}
                    valor={
                      <span className={negativo ? "text-accent" : undefined}>
                        {formatCentavos(p.total_centavos)}
                      </span>
                    }
                    className="px-1"
                  />
                </FilaLink>
                {!negativo && (
                  <Link
                    prefetch={false}
                    href={`/plata/depositar?tenedor=${p.tenedor_id}&monto=${p.total_centavos}`}
                    className={`${BOTON_ACCION_TAREA} sm:ml-auto`}
                  >
                    Pasar a la cuenta
                  </Link>
                )}
              </div>
            );
          })
        )}
        {efectivoSinDueno !== 0 && (
          <p className="py-3 text-[14px] leading-relaxed text-text-muted">
            Además hay {formatCentavos(efectivoSinDueno)} en efectivo que no figura en manos de
            ningún admin (saldo inicial de efectivo o ventas en efectivo de alguien que no es
            admin). Está incluido en el total.
          </p>
        )}
      </Grupo>

      <Grupo
        id="plata-te-deben"
        titulo="Te deben"
        total={<Deuda centavos={totalLeDeben} texto={formatCentavos(totalLeDeben)} />}
      >
        {deudores.length === 0 && clientes.cantidad === 0 ? (
          <Vacio>Nadie le debe plata a {NEGOCIO.nombre} en este momento.</Vacio>
        ) : (
          <>
            {deudores.map((d) => (
              <FilaLink key={d.vendedor_id} href={`/revendedores/${d.vendedor_id}`}>
                <Fila
                  titulo={d.nombre}
                  valor={<Deuda centavos={d.saldo_centavos} texto={formatCentavos(d.saldo_centavos)} />}
                  className="px-1"
                />
              </FilaLink>
            ))}
            {clientes.cantidad > 0 && (
              <FilaLink href="/clientes">
                <Fila
                  titulo={`Clientes (${clientes.cantidad})`}
                  valor={<Deuda centavos={clientes.totalCentavos} texto={formatCentavos(clientes.totalCentavos)} />}
                  className="px-1"
                />
              </FilaLink>
            )}
          </>
        )}
      </Grupo>

      <Grupo
        id="plata-ananja-debe"
        titulo="Ananja debe"
        total={
          <>
            <Deuda centavos={debe.pesosCentavos} texto={formatCentavos(debe.pesosCentavos)} />
            {debe.usdCentavos > 0 && (
              <span className="text-accent"> + {formatMonto("USD", debe.usdCentavos)}</span>
            )}
          </>
        }
      >
        {sinNadaPorPagar ? (
          <Vacio>No hay nada pendiente de pago.</Vacio>
        ) : (
          <>
            {deudaAnanja.pedidosPorPagar.map((p) => (
              <div key={p.loteId} className="flex flex-col gap-1 py-1 sm:flex-row sm:items-center sm:gap-3">
                <Fila
                  titulo={`Pedido del ${formatFecha(p.fecha)}`}
                  detalle={
                    p.conceptos.length > 0
                      ? p.conceptos.map((c) => `${c.etiqueta} ${formatCentavos(c.saldoCentavos)}`).join(" · ")
                      : undefined
                  }
                  valor={<Deuda centavos={p.saldoCentavos} texto={formatCentavos(p.saldoCentavos)} />}
                  className="px-1 sm:flex-1"
                />
                <Link prefetch={false} href={`/stock/lotes/${p.loteId}/pago`} className={BOTON_ACCION_TAREA}>
                  Pagar
                </Link>
              </div>
            ))}
            {deudaAnanja.deudasNegocio.map((d) => (
              <div key={d.id} className="flex flex-col gap-1 py-1 sm:flex-row sm:items-center sm:gap-3">
                <Fila
                  titulo={<span className="break-words">{d.descripcion}</span>}
                  valor={<Deuda centavos={d.restanteCentavos} texto={formatMonto(d.moneda, d.restanteCentavos)} />}
                  className="px-1 sm:flex-1"
                />
                <Link prefetch={false} href={`/plata/deudas/${d.id}/pago`} className={BOTON_ACCION_TAREA}>
                  Pagar
                </Link>
              </div>
            ))}
          </>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
          <Link
            prefetch={false}
            href="/plata/deudas"
            className="inline-flex min-h-11 items-center text-[15px] text-text-muted hover:text-primary"
          >
            Ver todas las deudas
          </Link>
          <Link prefetch={false} href="/plata/deudas/nueva" className={`${BOTON_SECUNDARIO} flex px-4`}>
            + Nueva deuda
          </Link>
        </div>
      </Grupo>
    </Tarjeta>
  );
}
