import Link from "next/link";

import { AjusteCajaAcciones } from "@/components/caja/ajuste-caja-acciones";
import { EliminarDepositoAccion } from "@/components/caja/eliminar-deposito-accion";
import { Fila } from "@/components/ui/fila";
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
 * Filas de movimientos de plata (Plata, Mercado Pago / Banco, "en manos
 * de") con la pieza `Fila`: título y detalle a la izquierda, monto con signo
 * a la derecha. El título hace salto de línea en vez de cortarse y el monto
 * no se achica. Va dentro de una `Tarjeta`.
 */
export function ListaMovimientos({
  items,
  vacio,
}: {
  items: ItemMovimiento[];
  vacio: string;
}) {
  if (items.length === 0) {
    return <p className="py-3 text-[16px] text-text-muted">{vacio}</p>;
  }

  return (
    <div className="flex flex-col divide-y divide-line">
      {items.map(({ fila, montoCentavos, neutro = false, mostrarDonde = false }) => {
        const positivo = montoCentavos >= 0;
        const signo = neutro ? "⇄" : positivo ? "+" : "−";
        const detalle = [mostrarDonde ? fila.donde : null, fila.detalle, formatFecha(fila.fecha)]
          .filter(Boolean)
          .join(" · ");

        return (
          <div key={fila.key} className="flex flex-col">
            <Fila
              titulo={
                fila.href ? (
                  <Link
                    href={fila.href}
                    className="inline-flex min-h-11 items-center break-words underline decoration-border underline-offset-4 hover:text-primary"
                  >
                    {fila.titulo}
                  </Link>
                ) : (
                  <span className="break-words">{fila.titulo}</span>
                )
              }
              detalle={<span className="break-words">{detalle}</span>}
              valor={
                neutro ? (
                  <span className="text-text-muted">
                    <span aria-hidden="true">⇄ </span>
                    {formatCentavos(Math.abs(montoCentavos))}
                  </span>
                ) : (
                  <>
                    {signo} {formatCentavos(Math.abs(montoCentavos))}
                  </>
                )
              }
            />
            {fila.ajuste && (
              <AjusteCajaAcciones
                ajusteId={fila.id}
                medioPago={fila.ajuste.medioPago}
                montoCentavos={fila.ajuste.montoCentavos}
                nota={fila.ajuste.nota}
                fecha={fila.fecha}
                className="-mt-1 flex gap-3 pb-2"
              />
            )}
            {fila.deposito && (
              <div className="-mt-1 flex gap-3 pb-2">
                {fila.comprobanteUrl && (
                  <a
                    href={fila.comprobanteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center text-[14px] text-text-muted hover:text-primary"
                  >
                    Ver comprobante
                  </a>
                )}
                {/* `contents`: el botón Eliminar queda en esta misma fila,
                    al lado del link, sin su propio contenedor. */}
                <EliminarDepositoAccion
                  depositoId={fila.id}
                  medioPago={fila.deposito.medioPago}
                  montoCentavos={fila.deposito.montoCentavos}
                  tenedor={fila.deposito.tenedor}
                  className="contents"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
