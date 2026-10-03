/**
 * Constantes compartidas por las pantallas de /caja (US4): etiquetas y orden
 * de los tres medios de pago. Centralizado acá para no repetir el mismo
 * `Record` en cada componente (saldo-card, ajustar-saldo, historial, home).
 */

import type { Enums } from "@/lib/types";
import { formatCentavos } from "@/lib/money";
import { ETIQUETA_MEDIO_PAGO } from "@/lib/etiquetas/medio-pago";

export type MedioPago = Enums<"medio_pago">;

/** Reexportado desde `lib/etiquetas/medio-pago.ts` (fuente única de la
 * etiqueta) — se mantiene este nombre porque ya lo importan ~20 lugares. */
export const MEDIO_PAGO_LABELS = ETIQUETA_MEDIO_PAGO;

/** Orden fijo en el que se muestran las tres cajas en toda la UI. */
export const MEDIOS_CAJA: MedioPago[] = ["banco", "mercado_pago", "efectivo"];

export function esMedioPagoValido(value: string): value is MedioPago {
  return (MEDIOS_CAJA as string[]).includes(value);
}

/**
 * Mensaje de confirmación al eliminar un ajuste de caja
 * (`AjusteCajaAcciones`, `supabase/migrations/0034_editar_ajuste_caja.sql`).
 *
 * Un ajuste tiene signo propio (`ajustes_caja.monto_centavos`, distinto de
 * `gastos`/`rendiciones` que siempre son positivos — ver `lib/calculos.ts`):
 * uno positivo SUMÓ al saldo, así que borrarlo lo hace bajar; uno negativo
 * RESTÓ, así que borrarlo lo hace subir. El mensaje explicita esa
 * consecuencia en vez de asumir siempre "se descuenta", para no confundir
 * al borrar un ajuste que originalmente restaba.
 */
export function mensajeEliminarAjuste(
  medioPago: MedioPago,
  montoCentavos: number,
): string {
  const monto = formatCentavos(Math.abs(montoCentavos));
  const medio = MEDIO_PAGO_LABELS[medioPago];
  return montoCentavos >= 0
    ? `Se va a descontar ${monto} del saldo de ${medio}.`
    : `Se va a sumar ${monto} al saldo de ${medio}.`;
}
