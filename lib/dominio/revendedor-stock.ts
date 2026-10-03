/**
 * Stock de una revendedora por entrega y atribución automática de sus
 * ventas (supabase/migrations/0040_revendedores_pagos_precios.sql § 2).
 *
 * La revendedora nunca elige lote: cada venta sale de la entrega más vieja
 * que todavía tiene botellas de ese producto (FIFO), y lo que le debe a
 * Ananja por botella es el `costo_ananja_unitario_centavos` que el admin
 * aprobó en ESA entrega. Funciones puras, espejo exacto de
 * `stock_revendedor_por_entrega` (SQL) — el RPC `registrar_venta_revendedor`
 * es la fuente de verdad al guardar; esto se usa en pantalla para
 * anticipar costo, precio sugerido y ganancia, y en los tests.
 *
 * Reglas (idénticas en SQL):
 *  1. Entregas en orden (fecha, created_at, id del ítem).
 *  2. A cada ítem se le restan las ventas que ya quedaron atribuidas a él
 *     (`ventas_revendedor.entrega_item_id`), sin bajar de 0.
 *  3. Ventas viejas sin atribución (anteriores a 0040): se descuentan de
 *     la entrega más vieja con stock (FIFO).
 *  4. Devoluciones con lote: salen de los ítems de ESE lote, del más nuevo
 *     al más viejo (el admin elige por default el lote de la última
 *     entrega). Lo que no alcanza a cubrir su lote pasa al paso 5.
 *  5. Devoluciones sin lote (más el sobrante del paso 4): del ítem más
 *     nuevo al más viejo.
 */

export interface EntregaItemFifo {
  /** `entrega_items.id` */
  id: string;
  entregaId: string;
  tipo: "entrega" | "devolucion";
  /** `entregas_revendedor.fecha`, "yyyy-mm-dd" */
  fecha: string;
  /** `entregas_revendedor.created_at` (ISO tal cual llega de Supabase) */
  createdAt: string;
  productoId: string;
  loteId: string | null;
  cantidad: number;
  costoAnanjaUnitarioCentavos: number | null;
  precioSugeridoCentavos: number | null;
}

export interface VentaFifo {
  productoId: string;
  cantidad: number;
  /** `ventas_revendedor.entrega_item_id` — `null` en ventas anteriores a 0040. */
  entregaItemId: string | null;
}

export interface TramoStock {
  entregaItemId: string;
  entregaId: string;
  fecha: string;
  productoId: string;
  loteId: string | null;
  entregado: number;
  quedan: number;
  costoAnanjaUnitarioCentavos: number | null;
  precioSugeridoCentavos: number | null;
}

function compararOrden(a: EntregaItemFifo, b: EntregaItemFifo): number {
  if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

function tramosDeProducto(
  items: EntregaItemFifo[],
  ventas: VentaFifo[],
  productoId: string,
): TramoStock[] {
  const entregas = items
    .filter((i) => i.tipo === "entrega" && i.productoId === productoId)
    .sort(compararOrden);

  const vendidoPorItem = new Map<string, number>();
  let ventasSinAtribuir = 0;
  for (const v of ventas) {
    if (v.productoId !== productoId) continue;
    if (v.entregaItemId === null) {
      ventasSinAtribuir += v.cantidad;
    } else {
      vendidoPorItem.set(v.entregaItemId, (vendidoPorItem.get(v.entregaItemId) ?? 0) + v.cantidad);
    }
  }

  const tramos: TramoStock[] = entregas.map((e) => ({
    entregaItemId: e.id,
    entregaId: e.entregaId,
    fecha: e.fecha,
    productoId: e.productoId,
    loteId: e.loteId,
    entregado: e.cantidad,
    quedan: Math.max(e.cantidad - (vendidoPorItem.get(e.id) ?? 0), 0),
    costoAnanjaUnitarioCentavos: e.costoAnanjaUnitarioCentavos,
    precioSugeridoCentavos: e.precioSugeridoCentavos,
  }));

  // 3) ventas sin atribución: de la más vieja a la más nueva
  let resto = ventasSinAtribuir;
  for (const t of tramos) {
    if (resto <= 0) break;
    const tomar = Math.min(t.quedan, resto);
    t.quedan -= tomar;
    resto -= tomar;
  }

  // 4) devoluciones con lote: dentro de su lote, de la más nueva a la más vieja
  const devueltoPorLote = new Map<string, number>();
  let devueltoSinLote = 0;
  for (const d of items) {
    if (d.tipo !== "devolucion" || d.productoId !== productoId) continue;
    if (d.loteId === null) {
      devueltoSinLote += d.cantidad;
    } else {
      devueltoPorLote.set(d.loteId, (devueltoPorLote.get(d.loteId) ?? 0) + d.cantidad);
    }
  }

  let sobrante = 0;
  for (const [loteId, total] of devueltoPorLote) {
    let restoLote = total;
    for (let i = tramos.length - 1; i >= 0 && restoLote > 0; i--) {
      if (tramos[i].loteId !== loteId) continue;
      const tomar = Math.min(tramos[i].quedan, restoLote);
      tramos[i].quedan -= tomar;
      restoLote -= tomar;
    }
    sobrante += restoLote;
  }

  // 5) devoluciones sin lote + sobrante: de la más nueva a la más vieja
  resto = devueltoSinLote + sobrante;
  for (let i = tramos.length - 1; i >= 0 && resto > 0; i--) {
    const tomar = Math.min(tramos[i].quedan, resto);
    tramos[i].quedan -= tomar;
    resto -= tomar;
  }

  return tramos;
}

/** Stock que le queda a la revendedora en cada ítem de entrega, todos los
 * productos, en orden FIFO dentro de cada producto (incluye tramos en 0). */
export function stockPorEntrega(items: EntregaItemFifo[], ventas: VentaFifo[]): TramoStock[] {
  const productos = Array.from(new Set(items.map((i) => i.productoId))).sort();
  return productos.flatMap((p) => tramosDeProducto(items, ventas, p));
}

export interface TramoVenta {
  entregaItemId: string;
  entregaId: string;
  fecha: string;
  loteId: string | null;
  cantidad: number;
  /** Lo que le debe a Ananja por botella en este tramo: el costo aprobado
   * en la entrega, o el precio revendedor manual si la entrega es anterior
   * a 0040. `null` si no hay ninguno de los dos. */
  costoUnitarioCentavos: number | null;
  precioSugeridoCentavos: number | null;
}

export interface AtribucionVenta {
  tramos: TramoVenta[];
  /** Botellas que no se pudieron atribuir (pidió más de lo que tiene). */
  faltante: number;
  /** Fecha de la primera entrega tomada que es POSTERIOR a la fecha de la
   * venta (`null` si no hay, o si no se pasó fecha) — el RPC la rechaza con
   * FECHA_ANTERIOR_A_ENTREGA: una venta no puede llevarse botellas que
   * todavía no le habían entregado. */
  entregaPosterior: string | null;
}

/**
 * Parte una venta de `cantidad` botellas entre las entregas con stock, de
 * la más vieja a la más nueva — espejo del loop de
 * `registrar_venta_revendedor`, que guarda una fila de venta por tramo.
 *
 * `loteId` (0062_venta_revendedor_elegir_lote.sql): `undefined`/`null` =
 * automático, FIFO entre TODAS las entregas (comportamiento de siempre). Un
 * lote puntual restringe el reparto a los tramos de ESE lote únicamente —
 * aunque otro lote tenga stock de sobra, no se toca (mismo criterio que
 * `insertar_venta_revendedor` en SQL).
 */
export function atribuirVenta(
  tramosStock: TramoStock[],
  productoId: string,
  cantidad: number,
  precioRevendedorCentavos: number | null,
  /** "yyyy-mm-dd" de la venta — si se pasa, detecta `entregaPosterior`. */
  fechaVenta?: string,
  loteId?: string | null,
): AtribucionVenta {
  const tramos: TramoVenta[] = [];
  let entregaPosterior: string | null = null;
  let resto = Math.max(cantidad, 0);
  for (const t of tramosStock) {
    if (resto <= 0) break;
    if (t.productoId !== productoId || t.quedan <= 0) continue;
    if (loteId != null && t.loteId !== loteId) continue;
    if (fechaVenta !== undefined && entregaPosterior === null && t.fecha > fechaVenta) {
      entregaPosterior = t.fecha;
    }
    const tomar = Math.min(t.quedan, resto);
    tramos.push({
      entregaItemId: t.entregaItemId,
      entregaId: t.entregaId,
      fecha: t.fecha,
      loteId: t.loteId,
      cantidad: tomar,
      costoUnitarioCentavos: t.costoAnanjaUnitarioCentavos ?? precioRevendedorCentavos,
      precioSugeridoCentavos: t.precioSugeridoCentavos,
    });
    resto -= tomar;
  }
  return { tramos, faltante: resto, entregaPosterior };
}

/** Total que le va a deber a Ananja por la venta (`null` si algún tramo no
 * tiene costo). */
export function costoTotalVenta(tramos: TramoVenta[]): number | null {
  let total = 0;
  for (const t of tramos) {
    if (t.costoUnitarioCentavos === null) return null;
    total += t.costoUnitarioCentavos * t.cantidad;
  }
  return total;
}

/** Ganancia de la venta a `precioVentaCentavos` por botella (`null` si
 * algún tramo no tiene costo). */
export function gananciaVenta(tramos: TramoVenta[], precioVentaCentavos: number): number | null {
  const costo = costoTotalVenta(tramos);
  if (costo === null) return null;
  const cantidad = tramos.reduce((acc, t) => acc + t.cantidad, 0);
  return precioVentaCentavos * cantidad - costo;
}

export interface FilaVentaAdmin {
  productoId: string;
  cantidad: number;
  /** `null` = "No sé a cuánto la vendió". */
  precioVentaCentavos: number | null;
  /** Lote elegido a mano (0062), o `null`/`undefined` = automático (FIFO
   * entre todos los lotes, como siempre). */
  loteId?: string | null;
}

export interface VentaAdminRevisada extends FilaVentaAdmin {
  tramos: TramoVenta[];
  faltante: number;
  /** Ver `AtribucionVenta.entregaPosterior`. */
  entregaPosterior: string | null;
  /** Lo que le va a deber a Ananja (`null` si algún tramo no tiene costo). */
  costoCentavos: number | null;
  /** `null` sin precio de venta o sin costo. */
  gananciaCentavos: number | null;
}

/**
 * Revisión de "Cargar ventas" de un admin en nombre de una revendedora
 * (`registrar_venta_revendedor_admin`): cada fila se atribuye con
 * `atribuirVenta`, exactamente el mismo reparto FIFO que usa la venta que
 * carga ella (los dos RPCs comparten `insertar_venta_revendedor`). Las
 * filas se revisan de a una contra el stock inicial: son de productos
 * distintos, así que no compiten por los mismos tramos.
 */
export function revisarVentasAdmin(
  tramosStock: TramoStock[],
  filas: FilaVentaAdmin[],
  preciosManualesPorProducto: Record<string, number | null>,
  /** "yyyy-mm-dd" de las ventas — detecta entregas posteriores a la venta. */
  fechaVenta?: string,
): VentaAdminRevisada[] {
  return filas
    .filter((f) => f.cantidad > 0)
    .map((f) => {
      const { tramos, faltante, entregaPosterior } = atribuirVenta(
        tramosStock,
        f.productoId,
        f.cantidad,
        preciosManualesPorProducto[f.productoId] ?? null,
        fechaVenta,
        f.loteId ?? null,
      );
      const costoCentavos = costoTotalVenta(tramos);
      const gananciaCentavos =
        f.precioVentaCentavos !== null ? gananciaVenta(tramos, f.precioVentaCentavos) : null;
      return { ...f, tramos, faltante, entregaPosterior, costoCentavos, gananciaCentavos };
    });
}

/** `true` si el precio de venta queda por debajo de lo que le debe a
 * Ananja en al menos uno de los tramos — aviso, no bloqueo. */
export function vendeBajoCosto(tramos: TramoVenta[], precioVentaCentavos: number): boolean {
  return tramos.some(
    (t) => t.costoUnitarioCentavos !== null && precioVentaCentavos < t.costoUnitarioCentavos,
  );
}

export interface LoteConStockRevendedora {
  loteId: string;
  /** Fecha de la entrega más vieja de ese lote (para ordenar y rotular
   * "Lote del ..." — no es la fecha del lote de producción). */
  fecha: string;
  /** Botellas de ese lote que le quedan a la revendedora, sumando todos
   * los tramos (puede haber más de una entrega del mismo lote). */
  quedan: number;
}

/** Lotes de los que la revendedora TIENE STOCK de un producto puntual —
 * agrupa los tramos por `loteId` y suma `quedan` (ignora tramos sin lote:
 * entregas legadas de antes de 0028). Insumo del selector de lote en
 * "Cargar movimiento" § Ventas (0062): la opción por default es
 * "Automático (FIFO)" (`loteId: null` en `atribuirVenta`); esto es solo
 * para cuando el admin quiere elegir uno puntual. */
export function lotesConStockRevendedora(
  tramosStock: TramoStock[],
  productoId: string,
): LoteConStockRevendedora[] {
  const porLote = new Map<string, LoteConStockRevendedora>();
  for (const t of tramosStock) {
    if (t.productoId !== productoId || t.loteId === null || t.quedan <= 0) continue;
    const actual = porLote.get(t.loteId);
    if (actual) {
      actual.quedan += t.quedan;
      if (t.fecha < actual.fecha) actual.fecha = t.fecha;
    } else {
      porLote.set(t.loteId, { loteId: t.loteId, fecha: t.fecha, quedan: t.quedan });
    }
  }
  return Array.from(porLote.values()).sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
}
