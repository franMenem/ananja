/**
 * Lecturas de la feria de revendedoras (migración 0078) — capa `lib/data`
 * (convención en `lib/data/README.md`). Solo lecturas; las escrituras están en
 * `lib/ferias.ts`. La RLS acota qué ve cada quién: el admin todo, la
 * participante su feria, la coordinadora la de sus revendedoras.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Tables } from "@/lib/types";
import { ESTADO_FERIA_ABIERTA } from "@/lib/dominio/feria-admin";

type Supa = SupabaseClient<Database>;

export type FeriaRow = Tables<"feria_revendedoras">;
export type FeriaPrecioRow = Pick<Tables<"feria_precios">, "producto_id" | "precio_centavos">;
export type ParticipanteFeriaRow = Tables<"v_feria_participantes">;
export type ProductoParticipanteRow = Tables<"v_feria_participante_productos">;

export type FeriaCompleta = {
  feria: FeriaRow;
  precios: FeriaPrecioRow[];
  participantes: ParticipanteFeriaRow[];
};

/** Todas las ferias que la persona puede ver, la más reciente primero. */
export async function listarFerias(supabase: Supa): Promise<{ data: FeriaRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("feria_revendedoras")
    .select("*")
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id");

  if (error) {
    console.error("listarFerias", error);
    return { data: [], error: "No se pudieron cargar las ferias." };
  }
  return { data: data ?? [], error: null };
}

/** Una feria con sus precios y participantes (de `v_feria_participantes`).
 * `data: null` y `error: null` = no existe (o no la puede ver). */
export async function obtenerFeria(
  supabase: Supa,
  feriaId: string,
): Promise<{ data: FeriaCompleta | null; error: string | null }> {
  const [feria, precios, participantes] = await Promise.all([
    supabase.from("feria_revendedoras").select("*").eq("id", feriaId).maybeSingle(),
    supabase.from("feria_precios").select("producto_id, precio_centavos").eq("feria_id", feriaId),
    supabase
      .from("v_feria_participantes")
      .select("*")
      .eq("feria_id", feriaId)
      .order("vendedor_nombre"),
  ]);

  const fallo = feria.error ?? precios.error ?? participantes.error;
  if (fallo) {
    console.error("obtenerFeria", fallo);
    return { data: null, error: "No se pudo cargar la feria." };
  }
  if (!feria.data) return { data: null, error: null };

  return {
    data: {
      feria: feria.data,
      precios: precios.data ?? [],
      participantes: participantes.data ?? [],
    },
    error: null,
  };
}

/** Qué se llevó, devolvió, degustó y vendió una participante, por producto. */
export async function listarProductosDeParticipante(
  supabase: Supa,
  feriaId: string,
  vendedorId: string,
): Promise<{ data: ProductoParticipanteRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("v_feria_participante_productos")
    .select("*")
    .eq("feria_id", feriaId)
    .eq("vendedor_id", vendedorId)
    .order("producto_nombre");

  if (error) {
    console.error("listarProductosDeParticipante", error);
    return { data: [], error: "No se pudieron cargar los productos de la feria." };
  }
  return { data: data ?? [], error: null };
}

export type FeriaAbiertaDe = FeriaCompleta & {
  /** La fila de la persona en esa feria. */
  participante: ParticipanteFeriaRow | null;
  productos: ProductoParticipanteRow[];
};

/** La feria abierta donde participa `vendedorId` (la más reciente si hubiera
 * más de una), con su fila de participante y sus productos; `null` si no hay. */
export async function feriaAbiertaDe(
  supabase: Supa,
  vendedorId: string,
): Promise<{ data: FeriaAbiertaDe | null; error: string | null }> {
  const { data: filas, error } = await supabase
    .from("feria_participantes")
    .select("feria_id, feria_revendedoras!inner(id, fecha, created_at, estado)")
    .eq("vendedor_id", vendedorId)
    .eq("feria_revendedoras.estado", ESTADO_FERIA_ABIERTA);

  if (error) {
    console.error("feriaAbiertaDe", error);
    return { data: null, error: "No se pudo cargar la feria." };
  }

  const masReciente = [...(filas ?? [])].sort((a, b) => {
    const fa = a.feria_revendedoras;
    const fb = b.feria_revendedoras;
    return fb.fecha.localeCompare(fa.fecha) || fb.created_at.localeCompare(fa.created_at);
  })[0];
  if (!masReciente) return { data: null, error: null };

  const [completa, productos] = await Promise.all([
    obtenerFeria(supabase, masReciente.feria_id),
    listarProductosDeParticipante(supabase, masReciente.feria_id, vendedorId),
  ]);

  if (completa.error || productos.error) {
    return { data: null, error: completa.error ?? productos.error };
  }
  if (!completa.data) return { data: null, error: null };

  return {
    data: {
      ...completa.data,
      participante: completa.data.participantes.find((p) => p.vendedor_id === vendedorId) ?? null,
      productos: productos.data,
    },
    error: null,
  };
}
