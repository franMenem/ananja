import { formatDiaMes } from "@/lib/fechas";

/** Una fila de `v_stock_por_lote` (supabase/migrations/0028_costos_por_lote.sql)
 * ya filtrada a un producto puntual. */
export interface LoteConQuedan {
  loteId: string;
  /** `lotes_produccion.fecha`, "yyyy-mm-dd". */
  fecha: string;
  quedan: number;
}

export interface SegmentoDeposito {
  texto: string;
  /** Pedido al que linkear (`/stock/lotes/{loteId}`) — `null` en el
   * segmento "sin pedido asignado", que no tiene detalle al que ir. */
  loteId: string | null;
}

/**
 * Reparto de lo que queda en depósito entre los pedidos que todavía tienen
 * stock de un producto (`v_stock_por_lote.quedan`), para la línea chica
 * bajo la cifra grande de `StockCard` (recuperado de antes de la tanda
 * produccion-simple, ver `git show 1ec2294^:components/stock/stock-card.tsx`,
 * ahora adaptado: sin costos, y con el caso "sin pedido asignado").
 * Del pedido más viejo al más nuevo — el dueño entrega primero lo viejo.
 *
 * `stockTotalDelProducto` es el número grande que ya muestra la tarjeta
 * (`v_stock_actual.stock`). Puede ser MAYOR que la suma de `quedan` de los
 * pedidos: un ingreso manual fuera de un pedido (alta de stock que no es
 * una devolución) suma al stock total pero `v_stock_por_lote` no lo
 * atribuye a ningún lote a propósito (ver el comentario de
 * `pool_sin_asignar` en la migración). Esa diferencia se muestra aparte,
 * sin link, como "N sin pedido asignado" — nunca se inventa un pedido
 * para explicarla. (Si por algún motivo la suma de los pedidos superara
 * el total, cosa que el diseño de `v_stock_por_lote` no debería permitir,
 * la diferencia se recorta a 0 en vez de mostrarse negativa.)
 *
 * Con un solo pedido que cubre TODO el stock (sin diferencia sin asignar),
 * el texto es "todo del pedido D/M" en vez de repetir el número, que ya
 * se ve arriba. Sin pedidos con stock y sin diferencia (stock total 0),
 * no hay nada que mostrar: array vacío. Los pedidos con `quedan <= 0` no
 * se muestran.
 */
export function segmentosDeposito(
  lotes: LoteConQuedan[],
  stockTotalDelProducto: number,
): SegmentoDeposito[] {
  const conStock = lotes
    .filter((lote) => lote.quedan > 0)
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));

  const sumaPedidos = conStock.reduce((acc, lote) => acc + lote.quedan, 0);
  const sinAsignar = Math.max(stockTotalDelProducto - sumaPedidos, 0);

  if (conStock.length === 1 && sinAsignar === 0) {
    const [unico] = conStock;
    return [{ texto: `todo del pedido ${formatDiaMes(unico.fecha)}`, loteId: unico.loteId }];
  }

  const segmentos: SegmentoDeposito[] = conStock.map((lote) => ({
    texto: `${lote.quedan} del pedido ${formatDiaMes(lote.fecha)}`,
    loteId: lote.loteId,
  }));

  if (sinAsignar > 0) {
    segmentos.push({ texto: `${sinAsignar} sin pedido asignado`, loteId: null });
  }

  return segmentos;
}
