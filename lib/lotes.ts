import type { SupabaseClient } from "@supabase/supabase-js";

import type { ConceptoPago } from "@/lib/dominio/gastos";
import type { PCostosLote } from "@/lib/dominio/lotes";
import type { Database, Enums, Json } from "@/lib/types";

type MedioPago = Enums<"medio_pago">;

// Los tipos de estado/validación y las funciones puras (`construirPCostosLote`,
// `mensajeErrorLote`, etc.) viven en `lib/dominio/lotes.ts`. Este archivo se
// queda con las escrituras (RPC).

export type CrearLoteArgs = {
  fecha: string;
  nota: string | null;
  items: { producto_id: string; cantidad: number }[];
  permitirNegativo: boolean;
  costos: PCostosLote | null;
};

/** Alta de un lote de producción vía RPC `crear_lote` — devuelve el
 * `{data, error}` crudo de supabase-js, mismo criterio que el resto de
 * `lib/*.ts` (el caller traduce `error.message`). */
export async function crearLote(supabase: SupabaseClient<Database>, args: CrearLoteArgs) {
  return supabase.rpc("crear_lote", {
    p_fecha: args.fecha,
    p_nota: args.nota ?? undefined,
    p_items: args.items,
    p_permitir_negativo: args.permitirNegativo,
    // `PCostosLote` es un tipo con forma fija (no un índice `[key: string]`),
    // así que TS no lo ve estructuralmente asignable a `Json` aunque lo sea
    // en runtime — mismo criterio que el resto del repo para los jsonb de
    // RPCs (`p_items` de `crear_lote` recibe el mismo tratamiento implícito
    // vía el tipo laxo que genera supabase-js para argumentos jsonb).
    p_costos: (args.costos ?? undefined) as Json | undefined,
  });
}

/** Completa/edita los costos de un lote ya existente vía RPC
 * `fijar_costos_lote` — reemplaza TODOS los `lote_costos` del lote. */
export async function fijarCostosLote(
  supabase: SupabaseClient<Database>,
  loteId: string,
  costos: PCostosLote,
) {
  return supabase.rpc("fijar_costos_lote", {
    p_lote_id: loteId,
    p_costos: costos as unknown as Json,
  });
}

/**
 * Actualiza el costo VIGENTE de un lote — SOLO afecta las botellas que
 * siguen en el depósito (`supabase/migrations/0052_costo_vigente_lote.sql`):
 * lo ya entregado/vendido conserva su costo congelado y lo pagado al proveedor no
 * cambia. Mismo contrato `p_costos` que `fijarCostosLote` (mismo formulario,
 * `construirPCostosLote`) — a diferencia de esa función, esta NUNCA toca
 * `lote_costos`/`gastos`/`deudas`/`lotes_produccion`; agrega una fila por
 * producto en `lote_valoraciones` (historial append-only).
 */
export async function actualizarCostoLoteVigente(
  supabase: SupabaseClient<Database>,
  loteId: string,
  costos: PCostosLote,
  nota: string | null = null,
) {
  return supabase.rpc("actualizar_costo_lote_vigente", {
    p_lote_id: loteId,
    p_costos: costos as unknown as Json,
    p_nota: nota ?? undefined,
  });
}

export type PagoLoteItem = {
  medioPago: MedioPago;
  montoCentavos: number;
  /** 0038: concepto pagado — sin concepto, el pago cuenta solo en el total
   * del pedido (comportamiento anterior). */
  concepto?: ConceptoPago;
  /** Obligatorio cuando `concepto` es "envase". */
  productoId?: string | null;
};

export type RegistrarPagoLoteArgs = {
  loteId: string;
  fecha: string;
  pagos: PagoLoteItem[];
  nota: string | null;
};

/** Registra el pago real (uno o varios medios) de un pedido vía RPC
 * `registrar_pago_lote` — crea un gasto por medio, todos con
 * `concepto_lote = 'pago'`. */
export async function registrarPagoLote(
  supabase: SupabaseClient<Database>,
  args: RegistrarPagoLoteArgs,
) {
  return supabase.rpc("registrar_pago_lote", {
    p_lote_id: args.loteId,
    p_fecha: args.fecha,
    p_pagos: args.pagos.map((p) => ({
      medio_pago: p.medioPago,
      monto_centavos: p.montoCentavos,
      ...(p.concepto
        ? { concepto: p.concepto, producto_id: p.concepto === "envase" ? (p.productoId ?? null) : null }
        : {}),
    })),
    p_nota: args.nota ?? undefined,
  });
}
