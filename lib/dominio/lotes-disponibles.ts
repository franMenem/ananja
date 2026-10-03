/**
 * Lotes con stock disponible por producto (`v_stock_por_lote` + costo
 * unitario de `v_costo_lote_item`, supabase/migrations/0028_costos_por_lote.sql)
 * — insumo de `components/lotes/selector-lote.tsx` en cada pantalla que
 * elige de qué lote sale/vuelve una salida (entrega, comprobante, egreso
 * manual). Funciones puras: la lectura (`obtenerLotesConStock`) vive en
 * `lib/data/lotes.ts`.
 */

import type { LoteConStock } from "@/lib/dominio/lotes-split";

export type LoteConStockDeProducto = LoteConStock & {
  productoId: string;
  /** `v_costo_lote_vigente.precio_minorista_sugerido_centavos` — precio
   * sugerido para precargar "Precio por botella" en `ComprobanteForm`
   * (supabase/migrations/0031_margen_ventas.sql § build). `null` sin costos
   * cargados todavía para ese lote/presentación. Desde
   * `0052_costo_vigente_lote.sql`, si el lote tuvo una "actualización de
   * costos del depósito" (`lote_valoraciones`), es el sugerido VIGENTE, no
   * el original del pedido — `v_costo_lote_vigente` es un superset de
   * `v_costo_lote_desglose` (idéntica sin ninguna actualización). */
  precioMinoristaSugeridoCentavos: number | null;
  /** `v_costo_lote_vigente.costo_ananja_centavos` — lo que un vendedor le
   * debe a Ananja por cada botella de este lote; precarga "Le debe a Ananja
   * por botella" al revisar una entrega a una revendedora
   * (0040_revendedores_pagos_precios.sql). `null` si el lote todavía no
   * tiene costos cargados (`tiene_costos = false`). Vigente, ver arriba. */
  costoAnanjaCentavos: number | null;
};

/** Lotes de un producto puntual, listos para `SelectorLote`. */
export function lotesDeProducto(
  lotes: LoteConStockDeProducto[],
  productoId: string,
): LoteConStock[] {
  return lotes
    .filter((l) => l.productoId === productoId)
    .map(({ loteId, fecha, quedan, costoUnitarioCentavos }) => ({
      loteId,
      fecha,
      quedan,
      costoUnitarioCentavos,
    }));
}

/**
 * `productoId -> lote_id` de la entrega más reciente de ese producto a un
 * revendedor puntual — default de "a qué lote vuelve" una devolución (README
 * del selector: "el lote que el revendedor tenía en mano más recientemente").
 * `entregaItems` debe venir ya ordenado del más reciente al más viejo
 * (mismo criterio que la consulta en
 * `app/(app)/revendedores/[id]/devolucion/page.tsx`); se queda con la
 * primera fila con `lote_id` no nulo que encuentra por producto.
 */
export function ultimoLotePorProducto(
  entregaItems: { producto_id: string; lote_id: string | null }[],
): Record<string, string> {
  const resultado: Record<string, string> = {};
  for (const item of entregaItems) {
    if (item.lote_id === null || resultado[item.producto_id] !== undefined) continue;
    resultado[item.producto_id] = item.lote_id;
  }
  return resultado;
}

/**
 * BUGFIX (review de 0028): al EDITAR un comprobante, `v_stock_por_lote`
 * todavía cuenta las filas ACTUALES de este mismo comprobante como
 * vendidas — `actualizar_comprobante` recién las borra (`delete from
 * comprobante_items/movimientos_stock`) dentro de la transacción del
 * guardado, no antes de que la pantalla de edición las lea. El resultado:
 * `quedan` da de menos exactamente en lo que este comprobante ya tenía
 * asignado a cada lote, y el selector puede bloquear el guardado con "las
 * cantidades por lote no suman…" aunque el dueño no esté pidiendo más
 * stock del que la venta ya tenía.
 *
 * Se le vuelve a sumar a cada (lote, producto) la cantidad que las filas
 * INICIALES del comprobante (`ComprobanteFormInitial.items`, antes de
 * cualquier edición en pantalla) ya tenían asignada — así `quedan` vuelve a
 * reflejar la disponibilidad real. Filas sin `lote_id` (ítems legado) no
 * se pueden atribuir a ningún lote puntual, así que no ajustan nada (mismo
 * criterio que el fallback FIFO de `v_stock_por_lote`, que tampoco las
 * distingue por lote).
 */
export function ajustarQuedanParaEdicion(
  lotes: LoteConStockDeProducto[],
  itemsIniciales: { productoId: string; loteId: string | null; cantidad: number }[],
): LoteConStockDeProducto[] {
  const cantidadInicialPorLoteProducto = new Map<string, number>();
  for (const item of itemsIniciales) {
    if (item.loteId === null) continue;
    const key = `${item.loteId}:${item.productoId}`;
    cantidadInicialPorLoteProducto.set(
      key,
      (cantidadInicialPorLoteProducto.get(key) ?? 0) + item.cantidad,
    );
  }
  if (cantidadInicialPorLoteProducto.size === 0) return lotes;

  return lotes.map((lote) => {
    const extra = cantidadInicialPorLoteProducto.get(`${lote.loteId}:${lote.productoId}`);
    return extra ? { ...lote, quedan: lote.quedan + extra } : lote;
  });
}
