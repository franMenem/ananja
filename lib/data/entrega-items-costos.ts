/**
 * Fotos de costo de los ítems de entrega — capa `lib/data` (convención en
 * `lib/data/README.md`): `entrega_items.costo_lote_unitario_centavos` (el
 * costo Ananja del lote, congelado al entregar) y
 * `entrega_items.costo_produccion_unitario_centavos` (el costo real de
 * producción).
 *
 * Desde `supabase/migrations/0074_fotos_costo_entrega_solo_admin.sql` esas
 * dos columnas NO se pueden pedir a la tabla con la sesión de un usuario
 * (admins, revendedoras y coordinadoras comparten el rol `authenticated`,
 * así que el permiso de columna se le sacó a todos; pedirlas, o pedir `*`,
 * da "permission denied"). Se leen con la función `entrega_items_costos()`,
 * que devuelve filas solo si quien consulta es admin: para cualquier otra
 * sesión el mapa vuelve vacío, sin error. Solo la usan pantallas de admin.
 *
 * TOLERANTE a la base todavía sin migrar: 0074 se aplica a mano, después
 * del deploy. Mientras la función no exista, las fotos se piden directo a
 * la tabla, como antes de 0074 (ahí todavía se puede).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types";

type Supa = SupabaseClient<Database>;

/** Ids por consulta `.in(...)` — con uuids de 36 caracteres la URL queda muy por debajo del límite. */
const TAMANO_LOTE_IDS = 100;

/** Códigos de PostgREST/Postgres cuando una función todavía no existe en la
 * base (mismos que `lib/dominio/proveedor.ts`): `PGRST202` = función no
 * encontrada en el schema cache, `42883` = undefined_function. */
const CODIGOS_FUNCION_SIN_MIGRAR = new Set(["PGRST202", "42883"]);

/** ¿El error de un `.rpc()` es "esa función todavía no existe" (falta
 * aplicar la migración que la crea)? */
export function esFuncionSinMigrar(error: { code?: string } | null): boolean {
  return !!error?.code && CODIGOS_FUNCION_SIN_MIGRAR.has(error.code);
}

/** Las dos fotos de un ítem. `null` = el ítem no tiene esa foto (una
 * devolución, o una entrega de un lote que todavía no tenía los costos
 * completos). El generador de tipos marca las columnas de salida de una
 * función como no nulas; acá se declaran como son de verdad. */
export type CostosDeEntregaItem = {
  costo_lote_unitario_centavos: number | null;
  costo_produccion_unitario_centavos: number | null;
};

type FilaCostos = { entrega_item_id: string } & CostosDeEntregaItem;

/** Las fotos de un grupo de ítems: por la función y, si la base todavía no
 * tiene 0074 (la función no existe), directo de la tabla. */
async function leerGrupo(
  supabase: Supa,
  grupo: string[],
): Promise<{ data: FilaCostos[]; error: { message: string } | null }> {
  const porFuncion = await supabase.rpc("entrega_items_costos").in("entrega_item_id", grupo);
  if (!porFuncion.error) return { data: porFuncion.data ?? [], error: null };
  if (!esFuncionSinMigrar(porFuncion.error)) return { data: [], error: porFuncion.error };

  const directo = await supabase
    .from("entrega_items")
    .select("id, costo_lote_unitario_centavos, costo_produccion_unitario_centavos")
    .in("id", grupo);
  if (directo.error) return { data: [], error: directo.error };
  return {
    data: (directo.data ?? []).map((f) => ({
      entrega_item_id: f.id,
      costo_lote_unitario_centavos: f.costo_lote_unitario_centavos,
      costo_produccion_unitario_centavos: f.costo_produccion_unitario_centavos,
    })),
    error: null,
  };
}

/**
 * Fotos de costo de los ítems pedidos, por id de ítem. Un id sin entrada en
 * el mapa = sin dato (o quien consulta no es admin). Lista vacía sin
 * consultar si `entregaItemIds` viene vacío. Si una lectura falla devuelve
 * el error.
 */
export async function leerCostosDeEntregaItems(
  supabase: Supa,
  entregaItemIds: string[],
): Promise<{ data: Map<string, CostosDeEntregaItem>; error: { message: string } | null }> {
  const ids = [...new Set(entregaItemIds)];
  const grupos: string[][] = [];
  for (let i = 0; i < ids.length; i += TAMANO_LOTE_IDS) grupos.push(ids.slice(i, i + TAMANO_LOTE_IDS));

  const respuestas = await Promise.all(grupos.map((grupo) => leerGrupo(supabase, grupo)));

  const costos = new Map<string, CostosDeEntregaItem>();
  for (const { data, error } of respuestas) {
    if (error) return { data: new Map(), error };
    for (const fila of data) {
      costos.set(fila.entrega_item_id, {
        costo_lote_unitario_centavos: fila.costo_lote_unitario_centavos,
        costo_produccion_unitario_centavos: fila.costo_produccion_unitario_centavos,
      });
    }
  }
  return { data: costos, error: null };
}
