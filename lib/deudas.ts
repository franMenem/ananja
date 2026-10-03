import type { SupabaseClient } from "@supabase/supabase-js";

import { calcularEstadoDeuda, type EstadoDeuda } from "@/lib/dominio/deudas";
import type { Database, Enums, Tables } from "@/lib/types";

export type Deuda = Tables<"deudas">;
export type PagoDeuda = Tables<"pagos_deuda">;
export type SaldoDeuda = Tables<"v_saldo_deuda">;
type MedioPago = Enums<"medio_pago">;
type Moneda = "USD" | "ARS";

// Las funciones puras (`calcularSaldoDeuda`, `describirPagoDeuda`,
// `calcularEstadoDeuda`) viven en `lib/dominio/deudas.ts`. Este archivo se
// queda con las lecturas y escrituras.

export type DeudaConSaldo = {
  id: string;
  descripcion: string;
  moneda: Moneda;
  montoCentavos: number;
  fecha: string;
  nota: string | null;
  saldadaEn: string | null;
  pagadoCentavos: number;
  restanteCentavos: number;
  estado: EstadoDeuda;
  pagos: PagoDeuda[];
};

/**
 * Todas las deudas con su saldo (pagado/restante) y la lista de sus pagos,
 * más recientes primero (mismo orden que `listarDeudas`, `lib/precios.ts`:
 * `fecha` desc, `created_at` desc como desempate) — usado por
 * `/plata/deudas`. Dos consultas en paralelo (`v_saldo_deuda` para el saldo
 * agregado, `pagos_deuda` para el detalle por deuda) — mismo criterio que
 * `/comprobantes/[id]` con `v_saldo_comprobante` + `cobros`.
 */
export async function listarDeudasConSaldo(
  supabase: SupabaseClient<Database>,
): Promise<{ data: DeudaConSaldo[]; error: string | null }> {
  const [
    { data: saldos, error: saldosError },
    { data: pagos, error: pagosError },
  ] = await Promise.all([
    supabase
      .from("v_saldo_deuda")
      .select("*")
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("pagos_deuda")
      .select("*")
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (saldosError || pagosError) {
    console.error("listarDeudasConSaldo", { saldosError, pagosError });
    return { data: [], error: "No se pudo cargar la lista de deudas." };
  }

  const pagosPorDeuda = new Map<string, PagoDeuda[]>();
  for (const pago of pagos ?? []) {
    const lista = pagosPorDeuda.get(pago.deuda_id) ?? [];
    lista.push(pago);
    pagosPorDeuda.set(pago.deuda_id, lista);
  }

  const data: DeudaConSaldo[] = (saldos ?? [])
    .filter((s): s is SaldoDeuda & { deuda_id: string } => s.deuda_id !== null)
    .map((s) => {
      const pagosDeuda = pagosPorDeuda.get(s.deuda_id) ?? [];
      const pagadoCentavos = s.pagado_centavos ?? 0;
      const saldadaEn = s.saldada_en;
      return {
        id: s.deuda_id,
        descripcion: s.descripcion ?? "",
        moneda: (s.moneda === "USD" ? "USD" : "ARS") as Moneda,
        montoCentavos: s.monto_centavos ?? 0,
        fecha: s.fecha ?? "",
        nota: s.nota,
        saldadaEn,
        pagadoCentavos,
        restanteCentavos: s.restante_centavos ?? 0,
        estado: calcularEstadoDeuda(saldadaEn, pagadoCentavos),
        pagos: pagosDeuda,
      };
    });

  return { data, error: null };
}

export type DeudaPendienteResumen = {
  id: string;
  descripcion: string;
  moneda: Moneda;
  restanteCentavos: number;
};

/**
 * Deudas pendientes (no saldadas) con su restante — usado por el bloque
 * "Ananja debe" de `/plata` (`app/(app)/plata/page.tsx`, vía
 * `lib/deuda-ananja.ts`) y antes por el bloque "Deudas" de `/caja`, que
 * solo necesita el total y el restante de cada una, no la lista completa
 * de sus pagos. Consulta liviana contra `v_saldo_deuda` en vez de
 * `listarDeudasConSaldo` (que también trae toda la tabla `pagos_deuda`).
 */
export async function listarDeudasPendientes(
  supabase: SupabaseClient<Database>,
): Promise<{ data: DeudaPendienteResumen[]; error: string | null }> {
  const { data, error } = await supabase
    .from("v_saldo_deuda")
    .select("deuda_id, descripcion, moneda, restante_centavos")
    .is("saldada_en", null)
    .order("fecha", { ascending: false });

  if (error) {
    console.error("listarDeudasPendientes", error);
    return { data: [], error: "No se pudo cargar la lista de deudas." };
  }

  const lista = (data ?? [])
    .filter((d): d is typeof d & { deuda_id: string } => d.deuda_id !== null)
    .map((d) => ({
      id: d.deuda_id,
      descripcion: d.descripcion ?? "",
      moneda: (d.moneda === "USD" ? "USD" : "ARS") as Moneda,
      restanteCentavos: d.restante_centavos ?? 0,
    }));

  return { data: lista, error: null };
}

export type RegistrarPagoDeudaArgs = {
  deudaId: string;
  montoCentavos: number;
  medioPago: MedioPago;
  fecha: string;
  /** Pesos que salen de la caja — requerido para una deuda en USD, se
   * ignora para una deuda en ARS (el RPC fuerza monto_caja = monto). */
  montoCajaCentavos?: number;
  nota?: string;
};

/**
 * Registra un pago parcial o total sobre una deuda (RPC
 * `registrar_pago_deuda`, `supabase/migrations/0027_pagos_deuda.sql`).
 * Devuelve el `{data, error}` crudo de supabase-js, igual que
 * `registrarCobro` (`lib/cobros.ts`) — el caller traduce `error.message`
 * (`MONTO_INVALIDO`, `MONTO_CAJA_INVALIDO`, `PAGO_EXCEDE_SALDO`,
 * `DEUDA_NO_ENCONTRADA`, `DEUDA_YA_SALDADA`, `NO_AUTORIZADO`) a texto.
 */
export async function registrarPagoDeuda(
  supabase: SupabaseClient<Database>,
  args: RegistrarPagoDeudaArgs,
) {
  return supabase.rpc("registrar_pago_deuda", {
    p_deuda_id: args.deudaId,
    p_monto_centavos: args.montoCentavos,
    p_medio_pago: args.medioPago,
    p_fecha: args.fecha,
    p_monto_caja_centavos: args.montoCajaCentavos,
    p_nota: args.nota,
  });
}

/**
 * Elimina un pago de deuda (RPC `eliminar_pago_deuda`) — si la deuda
 * quedaba saldada por ese pago, vuelve a quedar pendiente/parcial.
 * `error.message` llega con `PAGO_NO_ENCONTRADO` | `NO_AUTORIZADO`.
 */
export async function eliminarPagoDeuda(
  supabase: SupabaseClient<Database>,
  pagoId: string,
) {
  return supabase.rpc("eliminar_pago_deuda", { p_pago_id: pagoId });
}
