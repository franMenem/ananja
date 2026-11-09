import type { EnManosFila } from "@/lib/dominio/lote-en-manos";

/**
 * Devolución de botellas de una revendedora: solo se ofrecen los pedidos
 * (lotes) de los que ella TIENE botellas en poder, con cuánto tiene de cada
 * uno. Antes el formulario listaba todos los pedidos del depósito y la
 * devolución podía quedar anotada en un pedido del que la revendedora nunca
 * tuvo botellas (el depósito de ese pedido subía de más). Funciones puras;
 * la cuenta de "en poder por pedido" sale de `stockRevendedorasPorLote`
 * (`lote-en-manos.ts`, espejo de `stock_revendedor_por_entrega`).
 */

export interface PedidoEnPoder {
  loteId: string;
  /** Fecha del pedido ("yyyy-mm-dd"). */
  fecha: string;
  enPoder: number;
}

/** Clave de una cantidad a devolver: un producto de un pedido puntual. */
export function claveDevolucion(productoId: string, loteId: string): string {
  return `${productoId}:${loteId}`;
}

/**
 * Pedidos con botellas en poder de UNA revendedora, por producto, del más
 * viejo al más nuevo. Descarta los pedidos con cero (o menos) y las
 * botellas sin pedido asignado (entregas viejas sin `lote_id`).
 */
export function pedidosEnPoderPorProducto(
  filas: EnManosFila[],
  vendedorId: string,
  fechaPorLote: Map<string, string>,
): Record<string, PedidoEnPoder[]> {
  const resultado: Record<string, PedidoEnPoder[]> = {};
  for (const f of filas) {
    if (f.vendedorId !== vendedorId || f.loteId === null || f.enPoder <= 0) continue;
    const fecha = fechaPorLote.get(f.loteId);
    if (fecha === undefined) continue;
    const lista = resultado[f.productoId] ?? [];
    const existente = lista.find((p) => p.loteId === f.loteId);
    if (existente) existente.enPoder += f.enPoder;
    else lista.push({ loteId: f.loteId, fecha, enPoder: f.enPoder });
    resultado[f.productoId] = lista;
  }
  for (const lista of Object.values(resultado)) {
    lista.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.loteId.localeCompare(b.loteId)));
  }
  return resultado;
}

/** "Devolver todo": cada producto/pedido con todo lo que tiene en poder. */
export function devolverTodo(
  pedidosPorProducto: Record<string, PedidoEnPoder[]>,
): Record<string, number> {
  const cantidades: Record<string, number> = {};
  for (const [productoId, pedidos] of Object.entries(pedidosPorProducto)) {
    for (const p of pedidos) cantidades[claveDevolucion(productoId, p.loteId)] = p.enPoder;
  }
  return cantidades;
}

/** Todo lo de un producto (para el botón "Devolver todo" por producto). */
export function devolverTodoDeProducto(
  cantidades: Record<string, number>,
  productoId: string,
  pedidos: PedidoEnPoder[],
): Record<string, number> {
  const nuevo = { ...cantidades };
  for (const p of pedidos) nuevo[claveDevolucion(productoId, p.loteId)] = p.enPoder;
  return nuevo;
}

/** Total en poder de un producto (suma de sus pedidos). */
export function totalEnPoder(pedidos: PedidoEnPoder[]): number {
  return pedidos.reduce((acc, p) => acc + p.enPoder, 0);
}

export interface ItemDevolucion {
  producto_id: string;
  cantidad: number;
  lote_id: string;
}

/** Ítems para el RPC: una fila por (producto, pedido) con cantidad > 0, SIEMPRE con `lote_id`. */
export function itemsDeDevolucion(
  cantidades: Record<string, number>,
  pedidosPorProducto: Record<string, PedidoEnPoder[]>,
): ItemDevolucion[] {
  const items: ItemDevolucion[] = [];
  for (const [productoId, pedidos] of Object.entries(pedidosPorProducto)) {
    for (const p of pedidos) {
      const cantidad = cantidades[claveDevolucion(productoId, p.loteId)] ?? 0;
      if (cantidad > 0) items.push({ producto_id: productoId, cantidad, lote_id: p.loteId });
    }
  }
  return items;
}

/** Primer (producto, pedido) donde se quiere devolver más de lo que tiene en poder. */
export function primerExceso(
  cantidades: Record<string, number>,
  pedidosPorProducto: Record<string, PedidoEnPoder[]>,
): { productoId: string; pedido: PedidoEnPoder; cantidad: number } | null {
  for (const [productoId, pedidos] of Object.entries(pedidosPorProducto)) {
    for (const pedido of pedidos) {
      const cantidad = cantidades[claveDevolucion(productoId, pedido.loteId)] ?? 0;
      if (cantidad > pedido.enPoder) return { productoId, pedido, cantidad };
    }
  }
  return null;
}
