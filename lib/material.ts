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

/** Alta — devuelve el `{data, error}` crudo de supabase-js (mismo
 * criterio que `registrarVentaRevendedor` de `lib/revendedores.ts`) para
 * que el caller traduzca el error. Sin RPC: `insert` directo, cerrado por
 * la policy `materiales_venta_insert` (`es_admin()`). */
export async function crearMaterial(
  supabase: SupabaseClient<Database>,
  args: CrearMaterialArgs,
) {
  return supabase
    .from("materiales_venta")
    .insert({
      titulo: args.titulo,
      cuerpo: args.cuerpo,
      orden: args.orden,
      publicado: args.publicado,
    })
    .select()
    .single();
}

export type ActualizarMaterialArgs = {
  titulo: string;
  cuerpo: string;
  publicado: boolean;
};

/** Edición — no toca `orden` (solo cambia vía `moverMaterial`). */
export async function actualizarMaterial(
  supabase: SupabaseClient<Database>,
  id: string,
  args: ActualizarMaterialArgs,
) {
  return supabase
    .from("materiales_venta")
    .update({
      titulo: args.titulo,
      cuerpo: args.cuerpo,
      publicado: args.publicado,
    })
    .eq("id", id);
}

export async function eliminarMaterial(supabase: SupabaseClient<Database>, id: string) {
  return supabase.from("materiales_venta").delete().eq("id", id);
}

/**
 * Intercambia el `orden` de la fila `id` con el de su vecino inmediato en
 * `materiales` (ya ordenada con `ordenarMateriales`/`listarMaterialesAdmin`)
 * en la dirección pedida, usando `intercambiarOrden` — dos `update`
 * secuenciales, sin RPC (ver spec § Alternativas descartadas: RLS +
 * `es_admin()` alcanza sola para este CRUD). Sin-op si la fila ya está en
 * el extremo correspondiente. Devuelve `null` si no hizo falta ningún
 * cambio, o el `{error}` del primer update que falle (si alguno falla)
 * para que el caller lo traduzca.
 *
 * Los dos `update` NO son transaccionales (sin RPC no hay forma de
 * atarlos): si el segundo falla después de que el primero ya se aplicó,
 * dos filas pueden quedar con el mismo `orden` (el mismo caso que corrige
 * `intercambiarOrden`). Es recuperable: otro movimiento sobre cualquiera
 * de esas dos filas vuelve a desempatarlas.
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

  const [{ error: errorActual }, { error: errorVecino }] = await Promise.all(
    updates.map(({ id: filaId, orden }) =>
      supabase.from("materiales_venta").update({ orden }).eq("id", filaId),
    ),
  );

  if (errorActual || errorVecino) {
    console.error("moverMaterial", errorActual ?? errorVecino);
    return { error: "No se pudo reordenar el material." };
  }

  return { error: null };
}
