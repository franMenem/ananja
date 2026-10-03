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

/**
 * Un trigger en `deudas` (ver `supabase/migrations/0016_precios_deudas.sql`
 * § forzar_vendedor_deuda) fuerza `vendedor_id` al vendedor vinculado al
 * usuario logueado, ignorando lo que mande el cliente — mismo patrón que
 * `components/stock/movimiento-form.tsx`. El valor de acá abajo es un
 * placeholder para satisfacer el tipo `Insert`.
 */
const VENDEDOR_ID_IGNORADO_POR_TRIGGER =
  "00000000-0000-0000-0000-000000000000";

/** Alta directa (insert, no RPC — decisión "Modelo de datos § RLS" del
 * spec: el trigger `forzar_vendedor_deuda` pone `vendedor_id`, no hace
 * falta un RPC dedicado porque no hay validación cruzada). */
export async function crearDeuda(
  supabase: SupabaseClient<Database>,
  args: CrearDeudaArgs,
) {
  return supabase.from("deudas").insert({
    descripcion: args.descripcion,
    moneda: args.moneda,
    monto_centavos: args.montoCentavos,
    fecha: args.fecha,
    nota: args.nota,
    vendedor_id: VENDEDOR_ID_IGNORADO_POR_TRIGGER,
  });
}

/** Marca una deuda como saldada hoy — `update` directo (RLS solo permite
 * tocar `saldada_en`), sin RPC. */
export async function marcarDeudaSaldada(
  supabase: SupabaseClient<Database>,
  id: string,
) {
  const hoy = new Date();
  const fechaISO = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;

  return supabase.from("deudas").update({ saldada_en: fechaISO }).eq("id", id);
}
