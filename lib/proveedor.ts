import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types";

/** Guarda el nombre del proveedor vía RPC `guardar_proveedor` (solo admins,
 * migración 0069). Vacío = volver al valor por defecto ("el proveedor"):
 * el generador de tipos de Supabase tipa `p_nombre` como no-nulo, así que
 * "borrar" se manda como `''`. Devuelve el `{error}` crudo de supabase-js
 * (el caller lo traduce con `mensajeErrorProveedor`). */
export async function guardarProveedor(supabase: SupabaseClient<Database>, nombre: string) {
  return supabase.rpc("guardar_proveedor", { p_nombre: nombre });
}
