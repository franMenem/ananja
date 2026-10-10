/**
 * "Entregas a sus revendedoras" de la ficha admin de una coordinadora
 * (`/revendedores/[id]`, rama `rol = 'coordinador'`): qué botellas, de qué
 * lote y a quién entregó. Funciones puras, sin Supabase — las lecturas
 * están en `lib/data/revendedores.ts` (`cargarEntregasDeVendedores`).
 */

import { compararPorFechaDesc } from "@/lib/fechas";

/** Cuántas entregas se ven de entrada; el resto va plegado en un `<details>`. */
export const ENTREGAS_COORDINADORA_VISIBLES = 20;

export interface EntregaCruda {
  id: string;
  vendedor_id: string;
  admin_id: string;
  tipo: string;
  fecha: string;
  created_at: string;
}

export interface ItemEntregaCrudo {
  entrega_id: string;
  producto_id: string;
  cantidad: number;
  lote_id: string | null;
}

export interface ItemEntregaCoordinadora {
  productoNombre: string;
  cantidad: number;
  loteId: string | null;
  /** `null` si el ítem no tiene lote o no se pudo leer su fecha. */
  loteFecha: string | null;
}

export interface FilaEntregaCoordinadora {
  id: string;
  tipo: "entrega" | "devolucion";
  fecha: string;
  createdAt: string;
  revendedoraId: string;
  revendedoraNombre: string;
  /** Nombre de quien la registró cuando NO fue la propia coordinadora
   * (un admin, típicamente); `null` si la cargó ella. */
  cargadaPor: string | null;
  items: ItemEntregaCoordinadora[];
}

export interface TotalPorProducto {
  productoNombre: string;
  /** Entregadas − devueltas. */
  cantidad: number;
}

export interface EntregasCoordinadora {
  /** De la más nueva a la más vieja. */
  filas: FilaEntregaCoordinadora[];
  /** Entregadas − devueltas, todos los productos. */
  totalBotellas: number;
  /** Lo mismo, por producto (solo los que no dan cero), por nombre. */
  totalPorProducto: TotalPorProducto[];
}

export interface DatosEntregasCoordinadora {
  coordinadorId: string;
  entregas: EntregaCruda[];
  items: ItemEntregaCrudo[];
  /** id de vendedor → nombre: las revendedoras a cargo y quienes cargaron. */
  nombrePorVendedor: ReadonlyMap<string, string>;
  nombrePorProducto: ReadonlyMap<string, string>;
  fechaPorLote: ReadonlyMap<string, string>;
}

export function armarEntregasCoordinadora(datos: DatosEntregasCoordinadora): EntregasCoordinadora {
  const { coordinadorId, entregas, items, nombrePorVendedor, nombrePorProducto, fechaPorLote } = datos;

  const itemsPorEntrega = new Map<string, ItemEntregaCoordinadora[]>();
  for (const it of items) {
    const lista = itemsPorEntrega.get(it.entrega_id) ?? [];
    lista.push({
      productoNombre: nombrePorProducto.get(it.producto_id) ?? "?",
      cantidad: it.cantidad,
      loteId: it.lote_id,
      loteFecha: it.lote_id ? (fechaPorLote.get(it.lote_id) ?? null) : null,
    });
    itemsPorEntrega.set(it.entrega_id, lista);
  }

  const filas: FilaEntregaCoordinadora[] = entregas.map((e) => ({
    id: e.id,
    tipo: e.tipo === "devolucion" ? "devolucion" : "entrega",
    fecha: e.fecha,
    createdAt: e.created_at,
    revendedoraId: e.vendedor_id,
    revendedoraNombre: nombrePorVendedor.get(e.vendedor_id) ?? "?",
    cargadaPor: e.admin_id === coordinadorId ? null : (nombrePorVendedor.get(e.admin_id) ?? "alguien"),
    items: itemsPorEntrega.get(e.id) ?? [],
  }));
  filas.sort((a, b) => compararPorFechaDesc(a, b) || a.id.localeCompare(b.id));

  let totalBotellas = 0;
  const porProducto = new Map<string, number>();
  for (const f of filas) {
    const signo = f.tipo === "devolucion" ? -1 : 1;
    for (const it of f.items) {
      totalBotellas += signo * it.cantidad;
      porProducto.set(it.productoNombre, (porProducto.get(it.productoNombre) ?? 0) + signo * it.cantidad);
    }
  }
  const totalPorProducto = [...porProducto.entries()]
    .filter(([, cantidad]) => cantidad !== 0)
    .map(([productoNombre, cantidad]) => ({ productoNombre, cantidad }))
    .sort((a, b) => a.productoNombre.localeCompare(b.productoNombre));

  return { filas, totalBotellas, totalPorProducto };
}
