import Link from "next/link";

import { AjusteCajaAcciones } from "@/components/caja/ajuste-caja-acciones";
import { EliminarDepositoAccion } from "@/components/caja/eliminar-deposito-accion";
import { formatFecha } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";
import type { FilaMovimiento } from "@/lib/data/plata";

export interface ItemMovimiento {
  fila: FilaMovimiento;
  /** Centavos con signo que mueve el saldo de ESTA lista. */
  montoCentavos: number;
  /** Pasa plata de un lugar a otro (lista general): "⇄" sin signo. */
  neutro?: boolean;
  /** Mostrar dónde cae el movimiento (lista general de Caja). */
  mostrarDonde?: boolean;
}

/**
 * Filas regladas de movimientos de plata (Plata, Mercado Pago / Banco,
 * "en manos de"). Una sola maqueta flexible para todos los anchos: el
 * título hace salto de línea en vez de cortarse, monto y fecha no se
 * achican.
 */
export function ListaMovimientos({
  items,
  vacio,
}: {
  items: ItemMovimiento[];
  vacio: string;
}) {
  if (items.length === 0) {
    return <p className="py-3 text-sm text-text-muted">{vacio}</p>;
  }

  return (
    <div className="flex flex-col">
      {items.map(({ fila, montoCentavos, neutro = false, mostrarDonde = false }) => {
        const positivo = montoCentavos >= 0;
        const signo = neutro ? "⇄" : positivo ? "+" : "−";
        const detalle = [mostrarDonde ? fila.donde : null, fila.detalle]
          .filter(Boolean)
          .join(" · ");

        return (
          <div key={fila.key} className="flex items-baseline gap-3 border-b border-border py-3">
            <span
              aria-hidden="true"
              className={`w-[13px] shrink-0 ${
                neutro ? "text-text-muted" : positivo ? "text-secondary" : "text-accent"
              }`}
            >
              {signo}
            </span>

            <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-[13px]">
              <div className="flex items-baseline justify-between gap-3">
                {fila.href ? (
                  <Link
                    href={fila.href}
                    className="min-w-0 break-words text-text underline decoration-border underline-offset-4 hover:text-primary"
                  >
                    {fila.titulo}
                  </Link>
                ) : (
                  <span className="min-w-0 break-words text-text">{fila.titulo}</span>
                )}
                <span
                  className={`shrink-0 font-medium tabular-nums ${
                    neutro || positivo ? "text-text" : "text-accent"
                  }`}
                >
                  {neutro ? "" : `${signo} `}
                  {formatCentavos(Math.abs(montoCentavos))}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3 text-[11px] text-text-muted">
                <span className="min-w-0 break-words">{detalle}</span>
                <span className="shrink-0">{formatFecha(fila.fecha)}</span>
              </div>
              {fila.ajuste && (
                <AjusteCajaAcciones
                  ajusteId={fila.id}
                  medioPago={fila.ajuste.medioPago}
                  montoCentavos={fila.ajuste.montoCentavos}
                  nota={fila.ajuste.nota}
                  fecha={fila.fecha}
                  className="mt-0.5 flex gap-3"
                />
              )}
              {fila.deposito && (
                <EliminarDepositoAccion
                  depositoId={fila.id}
                  medioPago={fila.deposito.medioPago}
                  montoCentavos={fila.deposito.montoCentavos}
                  tenedor={fila.deposito.tenedor}
                  className="mt-0.5 flex gap-3"
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
