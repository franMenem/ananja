import Link from "next/link";

import { formatFechaSinAnio } from "@/lib/fechas";

/**
 * "Lote del D/M" con link al lote (`/stock/lotes/{id}`), o "sin lote" si el
 * ítem no tiene — los lotes no tienen nombre, se rotulan por su fecha (igual
 * que `components/plata/desglose-por-lote.tsx`). Si por algo no se pudo leer
 * la fecha, dice "Lote" a secas pero el link se mantiene.
 */
export function LoteLink({ loteId, fecha }: { loteId: string | null; fecha: string | null }) {
  if (loteId === null) return <span className="text-text-muted">sin pedido</span>;
  return (
    <Link
      prefetch={false}
      href={`/stock/lotes/${loteId}`}
      className="inline-flex min-h-11 items-center text-text underline decoration-border underline-offset-4 hover:text-primary"
    >
      {fecha ? `Pedido del ${formatFechaSinAnio(fecha)}` : "Pedido"}
    </Link>
  );
}
