/**
 * Reglas de una venta de revendedora que se deciden en pantalla antes de
 * llamar al RPC (espejo de `eliminar_venta_revendedor`,
 * supabase/migrations/0040_revendedores_pagos_precios.sql). Funciones puras.
 */

export interface VentaParaBorrar {
  /** Quien mira es admin (`es_admin()`). */
  esAdmin: boolean;
  /** `vendedores.id` de quien mira. */
  miVendedorId: string;
  /** Dueña de la venta (`ventas_revendedor.vendedor_id`). */
  vendedorId: string;
  /** Quién la cargó (`ventas_revendedor.registrada_por`, `null` = la dueña). */
  registradaPor: string | null;
}

/**
 * Decisión de Fran: un admin puede borrar cualquier venta; la revendedora
 * solo las suyas que cargó ella misma — una venta que cargó un admin en su
 * nombre solo la borra un admin.
 */
export function puedeBorrarVentaRevendedor(venta: VentaParaBorrar): boolean {
  if (venta.esAdmin) return true;
  if (venta.vendedorId !== venta.miVendedorId) return false;
  return venta.registradaPor === null || venta.registradaPor === venta.miVendedorId;
}

/** Fila de `ventas_revendedor_borradas` (0045 § 1) con lo que muestra la ficha. */
export interface FilaVentaBorrada {
  grupo_id: string;
  fecha: string;
  producto_id: string;
  cantidad: number;
  precio_venta_centavos: number | null;
  borrada_por: string | null;
  borrada_at: string;
}

export interface VentaBorrada {
  grupoId: string;
  fecha: string;
  productoId: string;
  cantidad: number;
  precioVentaCentavos: number | null;
  borradaPor: string | null;
  borradaAt: string;
}

/**
 * Una venta partida en dos entregas son dos filas con el mismo grupo_id y se
 * borran juntas (`eliminar_venta_revendedor`): se muestran como UNA venta,
 * sumando cantidades. Más reciente arriba.
 */
export function agruparVentasBorradas(filas: FilaVentaBorrada[]): VentaBorrada[] {
  const porGrupo = new Map<string, VentaBorrada>();
  for (const f of filas) {
    const clave = `${f.grupo_id}|${f.borrada_por ?? ""}`;
    const existente = porGrupo.get(clave);
    if (existente) {
      existente.cantidad += f.cantidad;
      if (f.borrada_at > existente.borradaAt) existente.borradaAt = f.borrada_at;
    } else {
      porGrupo.set(clave, {
        grupoId: f.grupo_id,
        fecha: f.fecha,
        productoId: f.producto_id,
        cantidad: f.cantidad,
        precioVentaCentavos: f.precio_venta_centavos,
        borradaPor: f.borrada_por,
        borradaAt: f.borrada_at,
      });
    }
  }
  return [...porGrupo.values()].sort((a, b) => b.borradaAt.localeCompare(a.borradaAt));
}
