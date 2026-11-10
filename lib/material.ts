import type { SupabaseClient } from "@supabase/supabase-js";

import { ordenarMateriales, type Material } from "@/lib/data/material";
import { intercambiarOrden, type Direccion } from "@/lib/dominio/material";
import type { Database } from "@/lib/types";

// Las lecturas (`listarMaterialesAdmin`, `listarMaterialesPublicados`,
// `obtenerMaterial`, `ordenarMateriales`) viven en `lib/data/material.ts`;
// las funciones puras (`siguienteOrden`, `intercambiarOrden`) en
// `lib/dominio/material.ts`. Este archivo se queda solo con las escrituras.

export type CrearMaterialArgs = {
  titulo: string;
  cuerpo: string;
  orden: number;
  publicado: boolean;
};

/** Alta vía RPC `crear_material` (solo admin) — devuelve el `{data, error}`
 * crudo de supabase-js (mismo criterio que `registrarVentaRevendedor` de
 * `lib/revendedores.ts`) para que el caller traduzca el error. `data` es
 * `{ id }`. */
export async function crearMaterial(
  supabase: SupabaseClient<Database>,
  args: CrearMaterialArgs,
) {
  return supabase.rpc("crear_material", {
    p_titulo: args.titulo,
    p_cuerpo: args.cuerpo,
    p_orden: args.orden,
    p_publicado: args.publicado,
  });
}

export type ActualizarMaterialArgs = {
  titulo: string;
  cuerpo: string;
  publicado: boolean;
};

/** Edición vía RPC `actualizar_material` — no toca `orden` (solo cambia vía
 * `moverMaterial`). */
export async function actualizarMaterial(
  supabase: SupabaseClient<Database>,
  id: string,
  args: ActualizarMaterialArgs,
) {
  return supabase.rpc("actualizar_material", {
    p_material_id: id,
    p_titulo: args.titulo,
    p_cuerpo: args.cuerpo,
    p_publicado: args.publicado,
  });
}

/** Baja vía RPC `eliminar_material` (idempotente). */
export async function eliminarMaterial(supabase: SupabaseClient<Database>, id: string) {
  return supabase.rpc("eliminar_material", { p_material_id: id });
}

/**
 * Intercambia el `orden` de la fila `id` con el de su vecino inmediato en
 * `materiales` (ya ordenada con `ordenarMateriales`/`listarMaterialesAdmin`)
 * en la dirección pedida, usando `intercambiarOrden`, y aplica los dos
 * cambios JUNTOS con la RPC `reordenar_materiales` (una sola transacción:
 * o se aplican los dos o ninguno). Sin-op si la fila ya está en el extremo
 * correspondiente. Devuelve `null` si no hizo falta ningún cambio, o
 * `{error}` si la RPC falla, para que el caller lo muestre.
 */
export async function moverMaterial(
  supabase: SupabaseClient<Database>,
  materiales: Material[],
  id: string,
  direccion: Direccion,
): Promise<{ error: string | null } | null> {
  const ordenados = ordenarMateriales(materiales);
  const index = ordenados.findIndex((m) => m.id === id);
  if (index === -1) return null;

  const updates = intercambiarOrden(ordenados, index, direccion);
  if (updates === null) return null;

  const { error } = await supabase.rpc("reordenar_materiales", { p_items: updates });

  if (error) {
    console.error("moverMaterial", error);
    return { error: "No se pudo reordenar el material." };
  }

  return { error: null };
}
