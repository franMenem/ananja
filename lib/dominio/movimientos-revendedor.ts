/**
 * Un solo hilo cronológico de movimientos de una revendedora — entregas,
 * devoluciones y ventas — para `/revendedores/[id]` (rediseño "de 10
 * bloques a 5", 2026-09-16). Antes eran dos listas separadas ("Entregas" y
 * "Ventas"); acá se fusionan, más recientes primero, con el mismo
 * comparador que usa el historial de `/plata` (`compararPorFechaDesc`).
 * Función pura, sin Supabase.
 */

import { compararPorFechaDesc } from "@/lib/fechas";
import type { Enums } from "@/lib/types";

export type MedioPago = Enums<"medio_pago">;

export interface ItemMovimientoEntrega {
  productoId: string;
  cantidad: number;
  /** Le cobrás por botella — `null` si el ítem no tiene costo aprobado
   * (entregas de antes de 0040, o sin lote). */
  costoCentavos: number | null;
  /** Foto del costo Ananja del lote en la entrega
   * (`entrega_items.costo_lote_unitario_centavos`, 0044) — `null` si no
   * salió de un lote con costo. */
  costoLoteCentavos: number | null;
  /** Lote de producción del que salieron (o al que volvieron) estas
   * botellas — `null` en ítems viejos sin lote asignado. */
  loteId: string | null;
  /** `lotes_produccion.fecha` de `loteId` ("yyyy-mm-dd"), para rotularlo
   * "Lote del D/M" — `null` si no hay lote o no se pudo leer su fecha. */
  loteFecha: string | null;
}

export interface MovimientoEntrega {
  tipo: "entrega" | "devolucion";
  id: string;
  fecha: string;
  createdAt: string;
  items: ItemMovimientoEntrega[];
}

export interface MovimientoVenta {
  tipo: "venta";
  id: string;
  grupoId: string;
  fecha: string;
  createdAt: string;
  productoId: string;
  cantidad: number;
  /** `null` = todavía no se sabe a cuánto la vendió. */
  precioVentaCentavos: number | null;
  medioPago: MedioPago | null;
  /** La cargó un admin en su nombre, no ella. */
  cargadaPorAdmin: boolean;
}

export type MovimientoRevendedor = MovimientoEntrega | MovimientoVenta;

export interface EntregaParaMovimiento {
  id: string;
  fecha: string;
  created_at: string;
  tipo: string;
}

export interface EntregaItemParaMovimiento {
  entrega_id: string;
  producto_id: string;
  cantidad: number;
  costo_ananja_unitario_centavos: number | null;
  costo_lote_unitario_centavos: number | null;
  lote_id: string | null;
}

/** `entregas_revendedor` + `entrega_items` (filas crudas de Supabase) → un
 * movimiento por entrega, con sus ítems adentro. `fechaPorLote` (id de lote
 * → su fecha) rotula cada ítem con su lote. */
export function entregasComoMovimientos(
  entregas: EntregaParaMovimiento[],
  items: EntregaItemParaMovimiento[],
  fechaPorLote: ReadonlyMap<string, string> = new Map(),
): MovimientoEntrega[] {
  const itemsPorEntrega = new Map<string, ItemMovimientoEntrega[]>();
  for (const item of items) {
    const lista = itemsPorEntrega.get(item.entrega_id) ?? [];
    lista.push({
      productoId: item.producto_id,
      cantidad: item.cantidad,
      costoCentavos: item.costo_ananja_unitario_centavos,
      costoLoteCentavos: item.costo_lote_unitario_centavos,
      loteId: item.lote_id,
      loteFecha: item.lote_id ? (fechaPorLote.get(item.lote_id) ?? null) : null,
    });
    itemsPorEntrega.set(item.entrega_id, lista);
  }
  return entregas.map((e) => ({
    tipo: e.tipo === "devolucion" ? "devolucion" : "entrega",
    id: e.id,
    fecha: e.fecha,
    createdAt: e.created_at,
    items: itemsPorEntrega.get(e.id) ?? [],
  }));
}

export interface VentaParaMovimiento {
  id: string;
  grupo_id: string;
  fecha: string;
  created_at: string;
  producto_id: string;
  cantidad: number;
  precio_venta_centavos: number | null;
  medio_pago: MedioPago | null;
  registrada_por: string | null;
}

/**
 * `ventas_revendedor` (filas crudas) → un movimiento por venta. Una venta
 * que salió de dos entregas son dos filas con el mismo `grupo_id`
 * (0040_revendedores_pagos_precios.sql § 2): se suman en un solo
 * movimiento.
 */
export function ventasComoMovimientos(ventas: VentaParaMovimiento[]): MovimientoVenta[] {
  const porGrupo = new Map<string, MovimientoVenta>();
  for (const v of ventas) {
    const existente = porGrupo.get(v.grupo_id);
    if (existente) {
      existente.cantidad += v.cantidad;
      continue;
    }
    porGrupo.set(v.grupo_id, {
      tipo: "venta",
      id: v.id,
      grupoId: v.grupo_id,
      fecha: v.fecha,
      createdAt: v.created_at,
      productoId: v.producto_id,
      cantidad: v.cantidad,
      precioVentaCentavos: v.precio_venta_centavos,
      medioPago: v.medio_pago,
      cargadaPorAdmin: v.registrada_por !== null,
    });
  }
  return [...porGrupo.values()];
}

/** Cuántos movimientos se ven de entrada en la ficha de la revendedora
 * antes de tocar "Ver todos los movimientos" (`MovimientosFicha`). */
export const LIMITE_MOVIMIENTOS_VISIBLES = 30;

/**
 * Fusiona entregas/devoluciones y ventas en un solo hilo, más reciente
 * primero, recortado a `limite` (`LIMITE_MOVIMIENTOS_VISIBLES` por
 * default). La página llama esto con un límite alto (todo el hilo): el
 * recorte a 30 y el botón "Ver todos" viven en `MovimientosFicha`, para que
 * `primerGrupoSinPrecio` pueda buscar en el hilo completo aunque la venta
 * sin precio quede al principio oculta detrás de ese botón.
 */
export function fusionarMovimientos(
  entregas: MovimientoEntrega[],
  ventas: MovimientoVenta[],
  limite = LIMITE_MOVIMIENTOS_VISIBLES,
): MovimientoRevendedor[] {
  return [...entregas, ...ventas].sort(compararPorFechaDesc).slice(0, limite);
}

/**
 * El `grupoId` de la primera venta sin precio del hilo (la más reciente),
 * o `null` si no hay ninguna — ancla de "Cargar precios" del resumen de
 * ganancia (`IrAPrecioPendiente`, apunta a `id="sin-precio"` en esa fila).
 * Recibe el hilo COMPLETO (sin recortar a `LIMITE_MOVIMIENTOS_VISIBLES`):
 * si la venta sin precio queda fuera de lo visible, `MovimientosFicha` la
 * muestra igual abriendo "Ver todos" al hacer clic en "Cargar precios".
 */
export function primerGrupoSinPrecio(movimientos: MovimientoRevendedor[]): string | null {
  const venta = movimientos.find((m): m is MovimientoVenta => m.tipo === "venta" && m.precioVentaCentavos === null);
  return venta?.grupoId ?? null;
}
