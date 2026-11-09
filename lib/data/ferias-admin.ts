/**
 * Lecturas de la feria para las pantallas de admin (`/ferias`). Complementa
 * `lib/data/ferias.ts`. Solo lecturas.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { FeriaRow } from "@/lib/data/ferias";
import type { Database } from "@/lib/types";

type Supa = SupabaseClient<Database>;

export type FeriaConConteo = FeriaRow & { participantes: number };

/** Ferias con la cantidad de participantes de cada una. */
export async function listarFeriasConConteo(
  supabase: Supa,
): Promise<{ data: FeriaConConteo[]; error: string | null }> {
  const [ferias, participantes] = await Promise.all([
    supabase
      .from("feria_revendedoras")
      .select("*")
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id"),
    supabase.from("feria_participantes").select("feria_id"),
  ]);

  const fallo = ferias.error ?? participantes.error;
  if (fallo) {
    console.error("listarFeriasConConteo", fallo);
    return { data: [], error: "No se pudieron cargar las ferias." };
  }

  const conteo = new Map<string, number>();
  for (const p of participantes.data ?? []) {
    conteo.set(p.feria_id, (conteo.get(p.feria_id) ?? 0) + 1);
  }
  return {
    data: (ferias.data ?? []).map((f) => ({ ...f, participantes: conteo.get(f.id) ?? 0 })),
    error: null,
  };
}
