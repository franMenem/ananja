import { pagoEstado, type PagoHistorial } from "@/lib/dominio/pagos-revendedor";
import type { VentaFifo } from "@/lib/dominio/revendedor-stock";
import type { Tables } from "@/lib/types";

/**
 * Funciones puras de Revendedores — las lecturas/escrituras (RPC de venta,
 * carga, pago, etc.) viven en `lib/revendedores.ts`.
 */

export type PagoRevendedor = Tables<"pagos_revendedor">;
export type VentaRevendedor = Tables<"ventas_revendedor">;

/** Ventas con la forma que espera `stockPorEntrega`
 * (`lib/dominio/revendedor-stock.ts`). */
export function ventasComoFifo(ventas: VentaRevendedor[]): VentaFifo[] {
  return ventas.map((v) => ({
    productoId: v.producto_id,
    cantidad: v.cantidad,
    entregaItemId: v.entrega_item_id,
  }));
}

/** `pagos_revendedor` → forma de `lib/dominio/pagos-revendedor.ts`. */
export function pagoComoHistorial(p: PagoRevendedor): PagoHistorial {
  return {
    id: p.id,
    montoCentavos: p.monto_centavos,
    medioPago: p.medio_pago,
    fecha: p.fecha,
    createdAt: p.created_at,
    estado: pagoEstado(p.estado),
    motivoRechazo: p.motivo_rechazo,
    rendicionId: p.rendicion_id,
  };
}
