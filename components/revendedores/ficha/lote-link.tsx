import Link from "next/link";

import { formatFechaSinAnio } from "@/lib/fechas";

/**
 * "Lote del D/M" con link al lote (`/stock/lotes/{id}`), o "sin lote" si el
 * ítem no tiene — los lotes no tienen nombre, se rotulan por su fecha (igual
 * que `components/plata/desglose-por-lote.tsx`). Si por algo no se pudo leer
 * la fecha, dice "Lote" a secas pero el link se mantiene.
 */
export function LoteLink({ loteId, fecha }: { loteId: string | null; fecha: string | null }) {
  if (loteId === null) return <span className="text-text-muted">sin lote</span>;
  return (
    <Link
      href={`/stock/lotes/${loteId}`}
      className="text-text underline decoration-border underline-offset-4 hover:text-primary"
    >
      {fecha ? `Lote del ${formatFechaSinAnio(fecha)}` : "Lote"}
    </Link>
  );
}
