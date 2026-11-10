/**
 * Cálculos puros de Deudas — la lectura/escritura vive en
 * `lib/deudas.ts` (junto a los tipos de tabla, que no se duplican acá).
 */

/**
 * Espejo de `v_saldo_deuda` (`supabase/migrations/0027_pagos_deuda.sql`):
 * pagado = Σ `pagos_deuda.monto_centavos` de la deuda, restante = monto −
 * pagado. Función pura para poder testear el invariante "restante nunca
 * negativo tras `registrar_pago_deuda`" sin depender de la base — mismo
 * criterio que `calcularDeudaCliente` (lib/dominio/calculos.ts) para
 * `v_deuda_cliente`.
 */
export function calcularSaldoDeuda(
  montoCentavos: number,
  pagos: { monto_centavos: number }[],
): { pagadoCentavos: number; restanteCentavos: number } {
  const pagadoCentavos = pagos.reduce((acc, p) => acc + p.monto_centavos, 0);
  return { pagadoCentavos, restanteCentavos: montoCentavos - pagadoCentavos };
}

/**
 * Etiqueta de un pago de deuda ("Pago de deuda: <descripcion>"), armada
 * igual que `describirCobro` (`lib/dominio/cobros.ts`) — compartida por el
 * historial de Caja (general y por medio) para no duplicar el formateo.
 */
export function describirPagoDeuda(descripcion: string): string {
  return `Pago de deuda: ${descripcion}`;
}

export type EstadoDeuda = "pendiente" | "parcial" | "saldada";

/**
 * ÚNICO criterio de "esta deuda sigue debiéndose" (y por eso también de "se
 * puede registrar un pago"): no tiene `saldada_en` Y todavía le queda saldo
 * (`restante > 0`). Lo usan el listado de `/plata/deudas`, el bloque "Ananja
 * debe" (`listarDeudasPendientes`), la tarea "Deudas"
 * (`filtrarDeudasNegocioPendientes`) y la pantalla de pago.
 *
 * Los dos lados cuentan:
 *  - `saldada_en` con fecha y restante > 0 = "marcada saldada a mano"
 *    (`marcarDeudaSaldada`, `lib/precios.ts`: perdón/anulación, a propósito
 *    con saldo): no se debe.
 *  - restante <= 0 sin `saldada_en` = cubierta por pagos: no se debe, aunque
 *    la fecha no esté puesta. `registrar_pago_deuda` y
 *    `sincronizar_deuda_aceite_lote` (0081) ponen la fecha al llegar a 0, así
 *    que hoy la base no produce ese estado; si apareciera, no se muestra
 *    como deuda.
 */
export function deudaSigueDebiendose(
  saldadaEn: string | null,
  restanteCentavos: number,
): boolean {
  return !saldadaEn && restanteCentavos > 0;
}

/**
 * Clasifica una deuda para el listado de `/plata/deudas`: "saldada" si NO
 * {@link deudaSigueDebiendose} (se pagó del todo, se marcó saldada sin
 * registrar pago, o el saldo llegó a 0), "parcial" si sigue debiéndose y ya
 * tiene algún pago registrado, "pendiente" si todavía no tiene ningún pago.
 *
 * `restanteCentavos` es opcional solo para llamadas viejas: si no se pasa se
 * asume que queda saldo (se mira solo `saldadaEn`).
 */
export function calcularEstadoDeuda(
  saldadaEn: string | null,
  pagadoCentavos: number,
  restanteCentavos: number = Number.POSITIVE_INFINITY,
): EstadoDeuda {
  if (!deudaSigueDebiendose(saldadaEn, restanteCentavos)) return "saldada";
  if (pagadoCentavos > 0) return "parcial";
  return "pendiente";
}
