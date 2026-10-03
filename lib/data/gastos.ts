/**
 * Lecturas de Gastos — capa `lib/data` (convención en `lib/data/README.md`,
 * este archivo es la referencia). Nada de JSX ni agregación acá: eso vive en
 * `app/(app)/gastos/**` (UI) y `lib/gastos.ts` (funciones puras).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { agruparFacturasDeGastos, type FacturaGasto, type FacturaGastoRow } from "@/lib/dominio/gastos";
import type { Database, Tables } from "@/lib/types";

type Supa = SupabaseClient<Database>;

export type GastoRow = Tables<"gastos"> & {
  categorias_gasto: { nombre: string } | null;
  vendedores: { nombre: string } | null;
  productos: { presentacion_ml: number } | null;
  movimientos_insumo: { insumos: { nombre: string } | null }[];
};

export type CategoriaGasto = Tables<"categorias_gasto">;

// FK explícita hacia `vendedores` (como ya la usaba la página original):
// si el día de mañana se agrega otra FK de `gastos` hacia `vendedores`, el
// embed implícito `vendedores(nombre)` se vuelve ambiguo para PostgREST
// (PGRST201, lección de `supabase/migrations/0049`) — nombrar la FK de
// entrada evita ese riesgo.
const COLUMNAS_GASTO =
  "*, categorias_gasto(nombre), vendedores!gastos_vendedor_id_fkey(nombre), productos(presentacion_ml), movimientos_insumo(insumos(nombre))";

export interface FiltrosGastos {
  categoriaId?: string;
  /** Rango [desde, hasta) ya calculado — ver `rangoDeMes` en `lib/gastos.ts`. */
  rango?: { desde: string; hasta: string };
}

/** Lista de gastos para `/gastos`, más nuevos primero, con filtro opcional
 * de categoría y de mes. */
export async function listarGastos(
  supabase: Supa,
  filtros: FiltrosGastos = {},
): Promise<{ data: GastoRow[]; error: string | null }> {
  let query = supabase
    .from("gastos")
    .select(COLUMNAS_GASTO)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  if (filtros.categoriaId) query = query.eq("categoria_id", filtros.categoriaId);
  if (filtros.rango) query = query.gte("fecha", filtros.rango.desde).lt("fecha", filtros.rango.hasta);

  const { data, error } = await query;
  if (error) {
    console.error("listarGastos", error);
    return { data: [], error: "No se pudo cargar la lista de gastos." };
  }
  // El embed anidado no tipa bien contra el jsonb que devuelve PostgREST —
  // el cast queda encerrado acá, no en la página.
  return { data: (data ?? []) as unknown as GastoRow[], error: null };
}

/** Un gasto por id, con el mismo embed que `listarGastos` — usado por
 * `/gastos/[id]`. `null` si no existe o si la consulta falla (la página ya
 * trataba ambos casos como "no encontrado"). */
export async function obtenerGasto(supabase: Supa, id: string): Promise<GastoRow | null> {
  const { data, error } = await supabase.from("gastos").select(COLUMNAS_GASTO).eq("id", id).maybeSingle();
  if (error) console.error("obtenerGasto", error);
  if (error || !data) return null;
  return data as unknown as GastoRow;
}

/** Todas las categorías (activas o no) — filtro de `/gastos`, que a
 * propósito no oculta las dadas de baja (un gasto viejo puede tener una). */
export async function listarCategorias(supabase: Supa): Promise<{ data: CategoriaGasto[]; error: string | null }> {
  const { data, error } = await supabase.from("categorias_gasto").select("*").order("nombre", { ascending: true });
  if (error) {
    console.error("listarCategorias", error);
    return { data: [], error: "No se pudo cargar la lista de categorías." };
  }
  return { data: data ?? [], error: null };
}

/** Categorías activas, para el selector con alta inline de un gasto
 * (`CategoriaSelect`) — a diferencia de `listarCategorias`, acá sí importa
 * no ofrecer una dada de baja para un gasto nuevo. */
export async function listarCategoriasActivas(
  supabase: Supa,
): Promise<{ data: CategoriaGasto[]; error: string | null }> {
  const { data, error } = await supabase
    .from("categorias_gasto")
    .select("*")
    .eq("activa", true)
    .order("nombre", { ascending: true });
  if (error) {
    console.error("listarCategoriasActivas", error);
    return { data: [], error: "No se pudo cargar la lista de categorías." };
  }
  return { data: data ?? [], error: null };
}

/** Una categoría por id, aunque esté dada de baja — `CategoriaSelect` la
 * usa para no perder de la lista la categoría ya elegida de un gasto en
 * edición si mientras tanto se desactivó. `null` si no existe o falla. */
export async function obtenerCategoria(supabase: Supa, id: string): Promise<CategoriaGasto | null> {
  const { data, error } = await supabase.from("categorias_gasto").select("*").eq("id", id).maybeSingle();
  if (error) console.error("obtenerCategoria", error);
  return data ?? null;
}

/** Facturas ya subidas y reutilizables (una fila por `imagen_path`
 * distinto), para el selector "Usar una que ya subí" de la sección
 * "Factura" del detalle de un gasto (`/gastos/[id]`) — una misma factura
 * puede cubrir varios gastos (ej. una factura de etiquetas grandes cubre
 * "grande frente" Y "grande retro"). La agregación por `imagen_path` es
 * pura, en `agruparFacturasDeGastos` (`lib/dominio/gastos.ts`, testeada
 * ahí); acá solo la consulta, ya ordenada por fecha desc. */
export async function listarFacturasDeGastos(
  supabase: Supa,
): Promise<{ data: FacturaGasto[]; error: string | null }> {
  const { data, error } = await supabase
    .from("gastos")
    .select("imagen_path, fecha, nota, categorias_gasto(nombre)")
    .not("imagen_path", "is", null)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listarFacturasDeGastos", error);
    return { data: [], error: "No se pudo cargar la lista de facturas." };
  }

  // Mismo motivo que `listarGastos`/`obtenerGasto`: el embed anidado no
  // tipa bien contra el jsonb que devuelve PostgREST.
  return { data: agruparFacturasDeGastos((data ?? []) as unknown as FacturaGastoRow[]), error: null };
}
