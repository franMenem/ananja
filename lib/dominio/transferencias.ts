import { MEDIO_PAGO_LABELS, MEDIOS_CAJA, type MedioPago } from "@/lib/dominio/caja";

/** Los dos medios que pueden recibir efectivo — nunca "efectivo" mismo
 * (CHECK `cajas_destino_efectivo_no_es_efectivo`, `0024_transferencias_caja.sql`). */
export const MEDIOS_DESTINO_TRANSFERENCIA: MedioPago[] = MEDIOS_CAJA.filter(
  (medio) => medio !== "efectivo",
);

/**
 * Etiqueta de una transferencia entre cajas ("Transferencia Efectivo →
 * Mercado Pago"), armada con `MEDIO_PAGO_LABELS` — compartida por el
 * historial unificado de Plata (`app/(app)/plata/page.tsx`) y el historial
 * por medio (`app/(app)/plata/cuenta/[medio]/page.tsx`) para no duplicar
 * el formateo.
 */
export function describirTransferencia(
  origen: MedioPago,
  destino: MedioPago,
): string {
  return `Transferencia ${MEDIO_PAGO_LABELS[origen]} → ${MEDIO_PAGO_LABELS[destino]}`;
}

/** Fallback si `cajas.destino_efectivo` no tiene ninguna fila en `true`
 * (no debería pasar tras aplicar `0024_transferencias_caja.sql`, que lo
 * siembra — defensa en profundidad). Coincide con el seed. */
export const DESTINO_EFECTIVO_DEFAULT: MedioPago = "mercado_pago";
