import type { SupabaseClient } from "@supabase/supabase-js";

import { ordenarVersiones } from "@/lib/dominio/precios";
import type { Database, Tables } from "@/lib/types";

export type VersionPrecio = Tables<"versiones_precio">;
export type PrecioItem = Tables<"v_precio_item">;

/** Todas las versiones de precios, ya ordenadas (`ordenarVersiones`,
 * `lib/dominio/precios.ts`) — paso interno de {@link obtenerVersionVigente}. */
async function listarVersiones(
  supabase: SupabaseClient<Database>,
): Promise<{ data: VersionPrecio[]; error: string | null }> {
  const { data, error } = await supabase.from("versiones_precio").select("*");

  if (error) {
    console.error("listarVersiones", error);
    return { data: [], error: "No se pudo cargar la lista de precios." };
  }

  return { data: ordenarVersiones(data ?? []), error: null };
}

export type VersionConItems = {
  version: VersionPrecio;
  items: PrecioItem[];
};

/** La versión vigente (la más reciente, ver `ordenarVersiones`) con el
 * desglose completo de `v_precio_item` por presentación — `null` si
 * todavía no se cargó ninguna versión. Usado por el precio mayorista
 * precargado de `/revendedores/[id]` y por el dólar vigente de
 * `/plata/deudas/[id]/pago`. */
export async function obtenerVersionVigente(
  supabase: SupabaseClient<Database>,
): Promise<VersionConItems | null> {
  const { data: versiones, error: versionesError } = await listarVersiones(
    supabase,
  );
  if (versionesError || versiones.length === 0) return null;

  const vigente = versiones[0];
  const { data: items, error: itemsError } = await supabase
    .from("v_precio_item")
    .select("*")
    .eq("version_id", vigente.id);

  if (itemsError) {
    throw new Error("No se pudo cargar la versión de precios vigente.");
  }

  return { version: vigente, items: items ?? [] };
}

export type CrearDeudaArgs = {
  descripcion: string;
  moneda: "USD" | "ARS";
  montoCentavos: number;
  fecha: string;
  nota: string | null;
};

/** Alta de una deuda vía RPC `crear_deuda` (solo admin; el vendedor lo pone
 * la base con la ficha del usuario logueado). */
export async function crearDeuda(
  supabase: SupabaseClient<Database>,
  args: CrearDeudaArgs,
) {
  return supabase.rpc("crear_deuda", {
    p_descripcion: args.descripcion,
    p_moneda: args.moneda,
    p_monto_centavos: args.montoCentavos,
    p_fecha: args.fecha,
    p_nota: args.nota ?? undefined,
  });
}

/** Marca una deuda como saldada hoy vía RPC `marcar_deuda_saldada` (perdón o
 * anulación, sin movimiento de plata). La fecha es la local del navegador. */
export async function marcarDeudaSaldada(
  supabase: SupabaseClient<Database>,
  id: string,
) {
  const hoy = new Date();
  const fechaISO = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;

  return supabase.rpc("marcar_deuda_saldada", { p_deuda_id: id, p_fecha: fechaISO });
}
