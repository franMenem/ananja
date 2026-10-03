import { CobroDeleteButton } from "@/components/cobros/cobro-delete-button";
import { MEDIO_PAGO_LABELS } from "@/lib/dominio/caja";
import { formatFecha } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";
import type { Enums } from "@/lib/types";

export type CobroListItem = {
  id: string;
  montoCentavos: number;
  medioPago: Enums<"medio_pago">;
  fecha: string;
  nota: string | null;
};

type CobrosListProps = {
  cobros: CobroListItem[];
};

/**
 * Lista de cobros de una venta, con acción "Eliminar" por fila (detalle de
 * comprobante). No renderiza nada si la lista está vacía: el bloque
 * "Cobrado / Debe" que la antecede ya comunica que todavía no hubo cobros.
 */
export function CobrosList({ cobros }: CobrosListProps) {
  if (cobros.length === 0) return null;

  return (
    <ul className="flex flex-col">
      {cobros.map((cobro) => (
        <li
          key={cobro.id}
          className="flex items-center justify-between gap-3 border-b border-border py-2.5"
        >
          <div className="flex flex-col">
            <span className="text-sm text-text">
              {formatCentavos(cobro.montoCentavos)} · {MEDIO_PAGO_LABELS[cobro.medioPago]}
            </span>
            <span className="text-xs text-text-muted">
              {formatFecha(cobro.fecha)}
              {cobro.nota ? ` · ${cobro.nota}` : ""}
            </span>
          </div>
          <CobroDeleteButton cobroId={cobro.id} montoCentavos={cobro.montoCentavos} />
        </li>
      ))}
    </ul>
  );
}
