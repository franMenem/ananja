/**
 * Catálogos compartidos — capa `lib/data` (convención en
 * `lib/data/README.md`). Estas dos lecturas (`productos` completo,
 * `vendedores` id/nombre sin filtrar) las pedían por separado varios
 * dominios con exactamente las mismas columnas/filtros/orden — ver
 * `lib/data/README.md` § Catálogos compartidos para el detalle de qué se
 * unificó acá y qué se dejó donde estaba por diferir de verdad (orden
 * descendente, filtros, o un subconjunto de columnas distinto).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Tables } from "@/lib/types";

type Supa = SupabaseClient<Database>;

export type Producto = Tables<"productos">;

/** Catálogo completo de productos (todas las columnas), ordenado por
 * presentación. Usado por Comprobantes, Revendedores y Depósito/Stock —
 * cada uno queda con su propio wrapper (mismo nombre/mensaje de error de
 * antes) que llama a esta consulta y, si le hace falta, se queda solo con
 * un subconjunto de columnas. */
export async function listarProductos(
  supabase: Supa,
  orden: "asc" | "desc" = "asc",
): Promise<{ data: Producto[]; error: string | null }> {
  const { data, error } = await supabase
    .from("productos")
    .select("*")
    .order("presentacion_ml", { ascending: orden === "asc" });

  if (error) {
    console.error("listarProductos (catalogos)", error);
    return { data: [], error: "No se pudo cargar el catálogo de productos." };
  }

  return { data: data ?? [], error: null };
}

export interface VendedorNombre {
  id: string;
  nombre: string;
}

/** `id`/`nombre` de TODOS los vendedores, sin filtro ni orden — usado por
 * Ganancia y por la ficha de Lote para mostrar el nombre de quien cargó
 * algo. Distinto de `listarAdminsActivos` (`lib/data/plata.ts`) o de
 * buscar por lista de ids (`lib/data/revendedores.ts`), que sí filtran. */
export async function listarVendedoresNombre(
  supabase: Supa,
): Promise<{ data: VendedorNombre[]; error: string | null }> {
  const { data, error } = await supabase.from("vendedores").select("id, nombre");
  if (error) {
    console.error("listarVendedoresNombre (catalogos)", error);
    return { data: [], error: "No se pudo cargar la lista de vendedores." };
  }
  return { data: data ?? [], error: null };
}
