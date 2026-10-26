import Link from "next/link";

import { PastillaEstadoPedido } from "@/components/stock/pedido/estado-pedido";
import type { EstadoPedido } from "@/lib/dominio/pedidos-lote";
import { formatDiaMesAbrev } from "@/lib/fechas";
import { envase, formatPresentacion } from "@/lib/negocio";

/** "Pedido del 2 oct": el título de un pedido a partir de su fecha. */
export function tituloPedido(fecha: string | null | undefined): string {
  return fecha ? `Pedido del ${formatDiaMesAbrev(fecha)}` : "Pedido";
}

/** "200 botellas · 120 × 500 ml + 80 × 250 ml". */
export function detallePedido(items: { cantidad: number; presentacionMl: number }[]): string {
  const total = items.reduce((acc, i) => acc + i.cantidad, 0);
  const partes = items.map((i) => `${i.cantidad} × ${formatPresentacion(i.presentacionMl)}`).join(" + ");
  return `${total} ${envase(total)} · ${partes}`;
}

/** "Quedan 12 sin vender" (o `null` si no queda ninguna o no se sabe). */
export function textoQuedanSinVender(sinVender: number | null): string | null {
  if (sinVender === null || sinVender <= 0) return null;
  return `Quedan ${sinVender} sin vender`;
}

/**
 * Un pedido en la lista: fecha, qué incluye y cuánto queda sin vender a la
 * izquierda; a la derecha UNA pastilla de estado (falta pagar / sin costos /
 * pagado). Toda la fila lleva al detalle.
 */
export function FilaPedido({
  loteId,
  fecha,
  items,
  sinVender,
  estado,
}: {
  loteId: string;
  fecha: string;
  items: { cantidad: number; presentacionMl: number }[];
  sinVender: number | null;
  estado: EstadoPedido;
}) {
  const quedan = textoQuedanSinVender(sinVender);
  return (
    <Link
      href={`/stock/lotes/${loteId}`}
      className="flex min-h-[72px] flex-wrap items-center justify-between gap-x-3 gap-y-2 bg-surface px-4 py-3 hover:bg-background"
    >
      <div className="flex min-w-0 flex-1 basis-[200px] flex-col">
        <span className="text-[16px] font-semibold text-text">{tituloPedido(fecha)}</span>
        <span className="text-[14px] text-text-muted">{detallePedido(items)}</span>
        {quedan && <span className="text-[14px] text-text-muted">{quedan}</span>}
      </div>
      <PastillaEstadoPedido estado={estado} className="shrink-0" />
    </Link>
  );
}
