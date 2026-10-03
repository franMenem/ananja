import { PagoDeudaDeleteButton } from "@/components/deudas/pago-deuda-delete-button";
import { MEDIO_PAGO_LABELS } from "@/lib/dominio/caja";
import { formatFecha } from "@/lib/fechas";
import { formatCentavos, formatMonto } from "@/lib/money";
import type { Enums } from "@/lib/types";

export type PagoDeudaListItem = {
  id: string;
  montoCentavos: number;
  montoCajaCentavos: number;
  medioPago: Enums<"medio_pago">;
  fecha: string;
  nota: string | null;
};

type PagosDeudaListProps = {
  pagos: PagoDeudaListItem[];
  moneda: "USD" | "ARS";
};

/**
 * Lista de pagos de una deuda, con acción "Eliminar" por fila — mismo
 * patrón que `CobrosList` (`components/cobros/cobros-list.tsx`). Para una
 * deuda en USD, cada fila también muestra los pesos que salieron de la
 * caja (`montoCajaCentavos`) entre paréntesis, porque no coinciden con el
 * monto pagado; para una deuda en ARS son siempre el mismo número, así que
 * mostrarlo dos veces sería ruido.
 */
export function PagosDeudaList({ pagos, moneda }: PagosDeudaListProps) {
  if (pagos.length === 0) return null;

  return (
    <ul className="flex flex-col">
      {pagos.map((pago) => (
        <li
          key={pago.id}
          className="flex items-center justify-between gap-3 border-b border-border py-2.5"
        >
          <div className="flex flex-col">
            <span className="text-sm text-text">
              {formatMonto(moneda, pago.montoCentavos)}
              {moneda === "USD" && (
                <span className="text-text-muted">
                  {" "}
                  ({formatCentavos(pago.montoCajaCentavos)})
                </span>
              )}{" "}
              · {MEDIO_PAGO_LABELS[pago.medioPago]}
            </span>
            <span className="text-xs text-text-muted">
              {formatFecha(pago.fecha)}
              {pago.nota ? ` · ${pago.nota}` : ""}
            </span>
          </div>
          <PagoDeudaDeleteButton
            pagoId={pago.id}
            moneda={moneda}
            montoCentavos={pago.montoCentavos}
          />
        </li>
      ))}
    </ul>
  );
}
