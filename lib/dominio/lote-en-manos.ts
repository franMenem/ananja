import { stockPorEntrega, type EntregaItemFifo, type VentaFifo } from "@/lib/dominio/revendedor-stock";

/**
 * Botellas de cada lote que están en manos de revendedoras ("Martín tiene
 * 13, Sofi tiene 7"). Usa el mismo reparto por entrega que
 * `stockPorEntrega` (espejo de `stock_revendedor_por_entrega`, 0040): lo
 * que le queda de cada ítem de entrega, con ventas FIFO y devoluciones
 * dentro de su lote. Así, sumando los lotes de una revendedora da lo mismo
 * que `v_stock_revendedor.en_poder` para ese producto (salvo stock
 * negativo por datos inconsistentes, que acá no se muestra).
 *
 * Entregas viejas sin `lote_id` quedan con `loteId: null`: no aparecen en
 * ningún lote.
 */

export interface EntregaItemVendedor extends EntregaItemFifo {
  vendedorId: string;
}

export interface VentaVendedor extends VentaFifo {
  vendedorId: string;
}

export interface EnManosFila {
  vendedorId: string;
  loteId: string | null;
  productoId: string;
  enPoder: number;
}

/** Stock en poder de cada revendedora por lote y producto (solo > 0). */
export function stockRevendedorasPorLote(
  items: EntregaItemVendedor[],
  ventas: VentaVendedor[],
): EnManosFila[] {
  const itemsPorVendedor = new Map<string, EntregaItemVendedor[]>();
  for (const i of items) {
    const lista = itemsPorVendedor.get(i.vendedorId) ?? [];
    lista.push(i);
    itemsPorVendedor.set(i.vendedorId, lista);
  }
  const ventasPorVendedor = new Map<string, VentaVendedor[]>();
  for (const v of ventas) {
    const lista = ventasPorVendedor.get(v.vendedorId) ?? [];
    lista.push(v);
    ventasPorVendedor.set(v.vendedorId, lista);
  }

  const filas: EnManosFila[] = [];
  for (const vendedorId of Array.from(itemsPorVendedor.keys()).sort()) {
    const tramos = stockPorEntrega(
      itemsPorVendedor.get(vendedorId) ?? [],
      ventasPorVendedor.get(vendedorId) ?? [],
    );
    const porLoteProducto = new Map<string, EnManosFila>();
    for (const t of tramos) {
      if (t.quedan <= 0) continue;
      const clave = `${t.loteId ?? ""}:${t.productoId}`;
      const fila = porLoteProducto.get(clave);
      if (fila) {
        fila.enPoder += t.quedan;
      } else {
        porLoteProducto.set(clave, {
          vendedorId,
          loteId: t.loteId,
          productoId: t.productoId,
          enPoder: t.quedan,
        });
      }
    }
    filas.push(...porLoteProducto.values());
  }
  return filas;
}

/** Total en manos de revendedoras por `${loteId}:${productoId}` (listado de lotes). */
export function totalEnManosPorLoteProducto(filas: EnManosFila[]): Map<string, number> {
  const totales = new Map<string, number>();
  for (const f of filas) {
    if (f.loteId === null) continue;
    const clave = `${f.loteId}:${f.productoId}`;
    totales.set(clave, (totales.get(clave) ?? 0) + f.enPoder);
  }
  return totales;
}

/**
 * Total sin vender de un lote+presentación: depósito + en manos de
 * revendedoras. `/stock/lotes` mostraba "Quedan N" (solo depósito) con
 * "M en revendedoras" debajo, que se leía como si fueran dos cosas que se
 * contradicen (Fran, 2026-09-15) — acá el número grande pasa a ser la
 * suma de las dos.
 *
 * `enDeposito: null` cuando no hay fila en `v_stock_por_lote` para ese
 * lote+producto (no debería pasar en los datos reales, pero la UI ya lo
 * trataba como dato faltante, "—") — en ese caso el total también es
 * `null`: no hay forma honesta de sumar un depósito desconocido.
 */
export interface ResumenStockLote {
  totalSinVender: number | null;
  enDeposito: number | null;
  enRevendedoras: number;
}

export function resumenStockLote(
  enDeposito: number | null,
  enRevendedoras: number,
): ResumenStockLote {
  return {
    totalSinVender: enDeposito === null ? null : enDeposito + enRevendedoras,
    enDeposito,
    enRevendedoras,
  };
}

export interface ProductoEnManos {
  productoId: string;
  nombre: string;
  presentacionMl: number;
  cantidad: number;
}

export interface PersonaEnManos {
  vendedorId: string;
  nombre: string;
  productos: ProductoEnManos[];
  total: number;
}

/**
 * Quién tiene botellas de `loteId`: una entrada por revendedora, de la que
 * más tiene a la que menos (empate: por nombre), con sus productos de la
 * presentación más grande a la más chica.
 */
export function enManosDeLote(
  filas: EnManosFila[],
  loteId: string,
  nombres: Map<string, string>,
  productos: Map<string, { nombre: string; presentacionMl: number }>,
): { personas: PersonaEnManos[]; total: number } {
  const porPersona = new Map<string, PersonaEnManos>();
  for (const f of filas) {
    if (f.loteId !== loteId || f.enPoder <= 0) continue;
    const persona = porPersona.get(f.vendedorId) ?? {
      vendedorId: f.vendedorId,
      nombre: nombres.get(f.vendedorId) ?? "Revendedora",
      productos: [],
      total: 0,
    };
    const producto = productos.get(f.productoId);
    persona.productos.push({
      productoId: f.productoId,
      nombre: producto?.nombre ?? "Producto",
      presentacionMl: producto?.presentacionMl ?? 0,
      cantidad: f.enPoder,
    });
    persona.total += f.enPoder;
    porPersona.set(f.vendedorId, persona);
  }

  const personas = Array.from(porPersona.values());
  for (const p of personas) {
    p.productos.sort((a, b) => b.presentacionMl - a.presentacionMl);
  }
  personas.sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, "es"));
  return { personas, total: personas.reduce((acc, p) => acc + p.total, 0) };
}

/** "13 × Botella 500 ml, 26 × Botella 250 ml" */
export function formatProductosEnManos(productos: ProductoEnManos[]): string {
  return productos.map((p) => `${p.cantidad} × ${p.nombre}`).join(", ");
}
