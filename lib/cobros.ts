import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Enums } from "@/lib/types";

type MedioPago = Enums<"medio_pago">;

// `describirCobro` (pura) vive en `lib/dominio/cobros.ts`. Este archivo se
// queda con las escrituras.

export type RegistrarCobroArgs = {
  comprobanteId: string;
  montoCentavos: number;
  medioPago: MedioPago;
  fecha: string;
  nota?: string;
};

/**
 * Registra un cobro sobre una venta a crédito (RPC `registrar_cobro`).
 * Devuelve el `{data, error}` crudo de supabase-js, igual que
 * `registrarVentaRevendedor`/`eliminarVentaRevendedor` (lib/revendedores.ts)
 * — el caller traduce `error.message` (`MONTO_INVALIDO`,
 * `COBRO_EXCEDE_DEUDA`, `COMPROBANTE_NO_ENCONTRADO`, `NO_AUTORIZADO`) a
 * texto, mismo criterio que el resto de la app (ver
 * `components/revendedores/carga-form.tsx`).
 */
export async function registrarCobro(
  supabase: SupabaseClient<Database>,
  args: RegistrarCobroArgs,
) {
  return supabase.rpc("registrar_cobro", {
    p_comprobante_id: args.comprobanteId,
    p_monto_centavos: args.montoCentavos,
    p_medio_pago: args.medioPago,
    p_fecha: args.fecha,
    p_nota: args.nota,
  });
}

/**
 * Elimina un cobro (RPC `eliminar_cobro`) — la deuda de la venta que lo
 * originó vuelve a subir por ese monto. `error.message` llega con
 * `COBRO_NO_ENCONTRADO` | `NO_AUTORIZADO`.
 */
export async function eliminarCobro(
  supabase: SupabaseClient<Database>,
  cobroId: string,
) {
  return supabase.rpc("eliminar_cobro", { p_cobro_id: cobroId });
}
