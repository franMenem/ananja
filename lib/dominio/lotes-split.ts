/**
 * Reparto de una cantidad vendida/entregada entre los lotes de producción
 * que todavía tienen stock de ese producto (`v_stock_por_lote.quedan`,
 * supabase/migrations/0028_costos_por_lote.sql) — el dueño elige a mano de
 * qué lote sale cada salida ("a esta revendedora le di 30 botellas del
 * lote viejo y 20 del nuevo"), stock por lote es explícito, no FIFO
 * automático. Funciones puras (sin Supabase) usadas por
 * `components/lotes/selector-lote.tsx` y testeadas en
 * `tests/lotes-split.test.ts`.
 *
 * `crear_comprobante`/`actualizar_comprobante`/`registrar_entrega_revendedor`
 * aceptan varias filas para el mismo `producto_id` con `lote_id` distinto,
 * pero rechazan (ITEM_DUPLICADO) dos filas con el MISMO
 * `(producto_id, lote_id)` — `fusionarFilasDuplicadas` suma esas antes de
 * mandar el payload.
 */

/** Un lote con stock disponible de un producto puntual (`v_stock_por_lote`
 * ya filtrada a un `producto_id`). `costoUnitarioCentavos` es opcional
 * (`v_costo_lote_item.costo_unitario_centavos`, puede faltar si el lote
 * todavía no tiene costos cargados). */
export interface LoteConStock {
  loteId: string;
  /** Fecha del lote (`lotes_produccion.fecha`, "yyyy-mm-dd") — determina
   * el orden "el dueño vende primero lo viejo". */
  fecha: string;
  quedan: number;
  costoUnitarioCentavos?: number | null;
}

/** Una fila del reparto: cuánto sale de un lote puntual. `loteId: null` =
 * "sin lote" (el backend lo reparte FIFO entre los lotes más viejos, ver
 * `v_stock_por_lote` § fallback) — solo aparece al editar un ítem legado
 * que nunca tuvo lote asignado. */
export interface FilaLote {
  loteId: string | null;
  cantidad: number;
}

/** Lotes ordenados del más viejo al más nuevo (`fecha` asc). */
export function ordenarLotesPorAntiguedad<T extends { fecha: string }>(
  lotes: T[],
): T[] {
  return [...lotes].sort((a, b) =>
    a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0,
  );
}

/** Lote más nuevo (`fecha` máxima), o `null` sin lotes. */
export function loteMasNuevo(lotes: LoteConStock[]): LoteConStock | null {
  if (lotes.length === 0) return null;
  const ordenados = ordenarLotesPorAntiguedad(lotes);
  return ordenados[ordenados.length - 1];
}

/** Lotes con `quedan > 0` — los únicos elegibles sin pasar por "permitir
 * negativo". */
export function lotesConStock(lotes: LoteConStock[]): LoteConStock[] {
  return lotes.filter((lote) => lote.quedan > 0);
}

/** El único lote con stock de este producto, o `null` si hay 0 o 2+ —
 * dispara el caso "auto-asignación silenciosa" del selector. */
export function loteUnicoConStock(lotes: LoteConStock[]): LoteConStock | null {
  const conStock = lotesConStock(lotes);
  return conStock.length === 1 ? conStock[0] : null;
}

/** Suma de cantidades de un reparto — para comparar contra la cantidad
 * total del ítem ("el total tiene que dar igual"). */
export function totalFilas(filas: FilaLote[]): number {
  return filas.reduce((acc, fila) => acc + fila.cantidad, 0);
}

/** `true` si el reparto no suma exactamente `cantidad` — el selector
 * muestra un mensaje de descuadre en ese caso, en vez de bloquear en
 * silencio. */
export function hayDescuadre(filas: FilaLote[], cantidad: number): boolean {
  return totalFilas(filas) !== cantidad;
}

/**
 * Reparto por default para una VENTA/ENTREGA (sale stock): llena el lote
 * más viejo con stock primero, el resto al siguiente, hasta agotar
 * `cantidad` o quedarse sin lotes con stock. Si el stock total no alcanza,
 * el remanente queda SIN repartir (no se le carga de más a ningún lote en
 * silencio) — el dueño lo asigna a mano, a un lote con `quedan = 0`, vía el
 * flujo existente de "permitir negativo"/"Guardar igual".
 */
export function repartirCantidadEntreLotes(
  cantidad: number,
  lotes: LoteConStock[],
): FilaLote[] {
  const ordenados = ordenarLotesPorAntiguedad(lotes);
  let restante = cantidad;
  const filas: FilaLote[] = [];

  for (const lote of ordenados) {
    if (restante <= 0) break;
    if (lote.quedan <= 0) continue;
    const asignar = Math.min(restante, lote.quedan);
    filas.push({ loteId: lote.loteId, cantidad: asignar });
    restante -= asignar;
  }

  return filas;
}

/**
 * Default para una DEVOLUCIÓN (entra stock, no hay "quedan" que respetar):
 * todo a un único lote preferido — el que el revendedor tenía en mano más
 * recientemente (`loteIdPreferido`, resuelto por el caller a partir de
 * `entrega_items`) o, sin ese dato, el lote más nuevo. El dueño puede
 * repartir a mano igual desde el selector.
 */
export function repartirEnLotePreferido(
  cantidad: number,
  lotes: LoteConStock[],
  loteIdPreferido: string | null,
): FilaLote[] {
  if (cantidad <= 0) return [];

  const preferidoExiste =
    loteIdPreferido !== null &&
    lotes.some((lote) => lote.loteId === loteIdPreferido);

  const destino = preferidoExiste
    ? loteIdPreferido
    : (loteMasNuevo(lotes)?.loteId ?? null);

  return destino === null ? [] : [{ loteId: destino, cantidad }];
}

/** Agrupa filas ya guardadas (ej. `comprobante_items` al editar) por
 * `productoId`, para precargar el split de cada `SelectorLote`. */
export function agruparFilasPorProducto<
  T extends { productoId: string; cantidad: number; loteId: string | null },
>(items: T[]): Record<string, FilaLote[]> {
  const resultado: Record<string, FilaLote[]> = {};
  for (const item of items) {
    const filas = resultado[item.productoId] ?? [];
    filas.push({ loteId: item.loteId, cantidad: item.cantidad });
    resultado[item.productoId] = filas;
  }
  return resultado;
}

/**
 * Funde filas con el mismo `(loteId, cantidad se suma)` antes de mandar el
 * payload a `crear_comprobante`/`actualizar_comprobante`/
 * `registrar_entrega_revendedor` — esas RPCs rechazan dos filas con el
 * mismo `(producto_id, lote_id)` dentro de un mismo documento
 * (`ITEM_DUPLICADO`, `comprobante_items`/`entrega_items` son únicas en
 * `(doc, producto_id, lote_id)` con `NULLS NOT DISTINCT`, ver
 * supabase/migrations/0028_costos_por_lote.sql). En el uso normal del
 * selector no debería hacer falta (cada lote aparece una sola vez por
 * producto), pero mandar el payload ya fusionado es más seguro que confiar
 * en que ningún caller vuelva a introducir un duplicado.
 */
export function fusionarFilasDuplicadas(filas: FilaLote[]): FilaLote[] {
  const porLote = new Map<string | null, number>();
  const orden: (string | null)[] = [];

  for (const fila of filas) {
    if (!porLote.has(fila.loteId)) orden.push(fila.loteId);
    porLote.set(fila.loteId, (porLote.get(fila.loteId) ?? 0) + fila.cantidad);
  }

  return orden.map((loteId) => ({ loteId, cantidad: porLote.get(loteId)! }));
}
