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
 * Clasifica una deuda para el listado de `/plata/deudas`: "saldada" si tiene
 * `saldada_en` (sea porque se pagó del todo o porque se marcó saldada sin
 * registrar pago), "parcial" si ya tiene algún pago registrado sin llegar a
 * saldarse, "pendiente" si todavía no tiene ningún pago.
 */
export function calcularEstadoDeuda(
  saldadaEn: string | null,
  pagadoCentavos: number,
): EstadoDeuda {
  if (saldadaEn) return "saldada";
  if (pagadoCentavos > 0) return "parcial";
  return "pendiente";
}
