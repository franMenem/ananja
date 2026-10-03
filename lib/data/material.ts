/**
 * Lecturas de Material — capa `lib/data` (convención en
 * `lib/data/README.md`, referencia en `lib/data/gastos.ts`). Las escrituras
 * (alta/edición/borrado/reordenar) siguen en `lib/material.ts`, que
 * reexporta estas lecturas y `ordenarMateriales` para no romper a sus otros
 * consumidores (`app/(mi)/mi/material/**`, fuera de este territorio).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Tables } from "@/lib/types";

type Supa = SupabaseClient<Database>;

export type Material = Tables<"materiales_venta">;

/** Ordena por (orden, created_at) — mismo criterio en admin y revendedor,
 * para desempatar de forma estable cuando dos piezas comparten `orden`
 * (ver `moverMaterial` en `lib/material.ts`, que intercambia valores de a
 * dos). */
export function ordenarMateriales(materiales: Material[]): Material[] {
  return [...materiales].sort((a, b) => {
    if (a.orden !== b.orden) return a.orden - b.orden;
    return a.created_at.localeCompare(b.created_at);
  });
}

/** Todas las piezas (cualquier estado) — RLS ya exige `es_admin()` para
 * ver un borrador, así que un revendedor que llamara esto solo recibiría
 * las publicadas igual. Usado por `/material`. */
export async function listarMaterialesAdmin(
  supabase: Supa,
): Promise<{ data: Material[]; error: string | null }> {
  const { data, error } = await supabase.from("materiales_venta").select("*");

  if (error) {
    console.error("listarMaterialesAdmin", error);
    return { data: [], error: "No se pudo cargar el material." };
  }

  return { data: ordenarMateriales(data ?? []), error: null };
}

/** Piezas publicadas — usado por `/mi/material`. La consulta filtra por
 * `publicado` explícitamente (aunque RLS ya se lo garantice a un
 * revendedor) para que un admin viendo esta misma pantalla vea lo mismo
 * que vería un revendedor. */
export async function listarMaterialesPublicados(
  supabase: Supa,
): Promise<{ data: Material[]; error: string | null }> {
  const { data, error } = await supabase
    .from("materiales_venta")
    .select("*")
    .eq("publicado", true);

  if (error) {
    console.error("listarMaterialesPublicados", error);
    return { data: [], error: "No se pudo cargar el material." };
  }

  return { data: ordenarMateriales(data ?? []), error: null };
}

/** Una pieza por id — `null` si no existe o RLS la esconde (borrador para
 * un revendedor, o id inexistente). Usado por `/material/[id]` y
 * `/mi/material/[id]`. */
export async function obtenerMaterial(supabase: Supa, id: string): Promise<Material | null> {
  const { data, error } = await supabase
    .from("materiales_venta")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("obtenerMaterial", error);
    return null;
  }

  return data ?? null;
}
