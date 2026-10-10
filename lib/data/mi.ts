/**
 * Lecturas del shell `/mi` (revendedora, admin con espacio propio o
 * coordinador) — capa `lib/data` (convención en `lib/data/README.md`,
 * referencia en `lib/data/gastos.ts`). Nada de JSX ni agregación acá: eso
 * vive en `app/(mi)/**` (UI) y en los módulos puros del dominio
 * (`lib/revendedor-stock.ts`, `lib/pagos-revendedor.ts`, etc.).
 *
 * Las lecturas de "vendedores"/`vendedor_id` que también usa el lado admin
 * (`/revendedores/**`) viven en `lib/data/revendedores.ts` — este archivo
 * es solo lo específico de `/mi` (el catálogo PÚBLICO `v_productos_publicos`,
 * que un revendedor sí puede leer a diferencia de `productos`, y el detalle
 * de una venta propia). `lib/revendedores.ts` (sin `/data/`, preexistente)
 * sigue teniendo el resto de las lecturas de `/mi` (stock, precios, ventas,
 * pagos, rendiciones, mi encargado) con la misma convención — no se movió
 * acá para no tocar los otros archivos que ya lo consumen fuera de este
 * territorio.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Tables } from "@/lib/types";

type Supa = SupabaseClient<Database>;

export type ProductoPublicoRow = Tables<"v_productos_publicos">;
export type ProductoPublicoResumen = { id: string; nombre: string; presentacion_ml: number | null };
export type VentaRevendedorRow = Tables<"ventas_revendedor">;
export type ValorStockMiRow = Pick<
  Tables<"v_valor_stock_revendedor">,
  "valor_en_poder_centavos" | "valor_en_poder_ananja_centavos"
>;

/** Catálogo público de productos (`v_productos_publicos`, RLS acota
 * `productos` a `es_vendedor()` — este es lo que SÍ puede leer una
 * revendedora), por presentación. Usado por `/mi` y, sin que el orden
 * importe para su único uso (armar un mapa id→nombre), por `/mi/ventas`. */
export async function listarProductosPublicos(
  supabase: Supa,
): Promise<{ data: ProductoPublicoRow[]; error: string | null }> {
  const { data, error } = await supabase.from("v_productos_publicos").select("*").order("presentacion_ml");
  if (error) {
    console.error("listarProductosPublicos", error);
    return { data: [], error: "No se pudo cargar el catálogo de productos." };
  }
  return { data: data ?? [], error: null };
}

/** Catálogo público, solo id/nombre/presentación — usado por
 * `/mi/ventas/nueva` (no necesita el resto de las columnas de la vista). */
export async function listarProductosPublicosResumen(
  supabase: Supa,
): Promise<{ data: ProductoPublicoResumen[]; error: string | null }> {
  const { data, error } = await supabase
    .from("v_productos_publicos")
    .select("id, nombre, presentacion_ml")
    .order("presentacion_ml");
  if (error) {
    console.error("listarProductosPublicosResumen", error);
    return { data: [], error: "No se pudo cargar el catálogo de productos." };
  }
  return {
    data: (data ?? []).filter((p): p is ProductoPublicoResumen => p.id !== null && p.nombre !== null),
    error: null,
  };
}

/** ¿La persona "agarra directo del depósito"? (`vendedores.toma_directo`,
 * 0073) — su propia fila, que la RLS le deja leer. Si la lectura falla
 * devuelve `false`: la pantalla se comporta como siempre (con tope de
 * stock) y el servidor igual decide; no se le muestra nada de más. */
export async function leerTomaDirecto(supabase: Supa, vendedorId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("vendedores")
    .select("toma_directo")
    .eq("id", vendedorId)
    .maybeSingle();
  if (error) console.error("leerTomaDirecto", error);
  return data?.toma_directo === true;
}

/** Nombre de un producto público por id — usado por `/mi/ventas/[id]`.
 * `null` si no existe o si la consulta falla. */
export async function obtenerProductoPublicoNombre(supabase: Supa, productoId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("v_productos_publicos")
    .select("nombre")
    .eq("id", productoId)
    .maybeSingle();
  if (error) console.error("obtenerProductoPublicoNombre", error);
  return data?.nombre ?? null;
}

/** Plata en mano de quien mira, vía RLS (`v_plata_en_manos`, sin filtro
 * explícito: la vista ya devuelve solo la fila propia desde
 * 0057_coordinador_plata_stock.sql) — usado por `/mi` en la rama
 * coordinador. `null` si no tiene nada en mano o si la consulta falla. */
export async function obtenerMiPlataEnMano(supabase: Supa): Promise<number | null> {
  const { data, error } = await supabase.from("v_plata_en_manos").select("total_centavos").maybeSingle();
  if (error) console.error("obtenerMiPlataEnMano", error);
  return data?.total_centavos ?? null;
}

/** "Valor en poder" de quien mira, al precio de quien se lo entregó (no el
 * costo real de Ananja: a diferencia de la ficha de admin, acá es SU deuda
 * si vende todo) — usado por `/mi`. */
export async function listarValorStockMi(
  supabase: Supa,
  vendedorId: string,
): Promise<{ data: ValorStockMiRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("v_valor_stock_revendedor")
    .select("valor_en_poder_centavos, valor_en_poder_ananja_centavos")
    .eq("vendedor_id", vendedorId);
  if (error) {
    console.error("listarValorStockMi", error);
    return { data: [], error: "No se pudo cargar el valor de stock." };
  }
  return { data: data ?? [], error: null };
}

/** Una venta propia por id — filtro explícito por `vendedorId` (además del
 * `id`): la RLS deja pasar cualquier venta a un admin, y un admin con
 * espacio propio entra a `/mi` como un revendedor más — sin este filtro
 * podría abrir el detalle de la venta de otro con solo cambiar el id en la
 * URL. Usado por `/mi/ventas/[id]`. `null` si no existe/no es suya o si la
 * consulta falla. */
export async function obtenerVentaRevendedorPropia(
  supabase: Supa,
  id: string,
  vendedorId: string,
): Promise<VentaRevendedorRow | null> {
  const { data, error } = await supabase
    .from("ventas_revendedor")
    .select("*")
    .eq("id", id)
    .eq("vendedor_id", vendedorId)
    .maybeSingle();
  if (error) console.error("obtenerVentaRevendedorPropia", error);
  return data ?? null;
}

export type VentaDelGrupoRow = VentaRevendedorRow & {
  entrega_items: { entregas_revendedor: { fecha: string; automatica: boolean } | null } | null;
};

/** Todas las filas de un grupo de venta (`grupo_id`, una venta que salió
 * de dos entregas) con la fecha de la entrega de cada una (y si fue automática, 0073) — usado por
 * `/mi/ventas/[id]` para mostrar "de dónde salió". Filtro explícito por
 * `vendedorId`, mismo motivo que {@link obtenerVentaRevendedorPropia}. */
export async function listarVentasDelGrupo(
  supabase: Supa,
  grupoId: string,
  vendedorId: string,
): Promise<{ data: VentaDelGrupoRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("ventas_revendedor")
    .select("*, entrega_items(entregas_revendedor(fecha, automatica))")
    .eq("grupo_id", grupoId)
    .eq("vendedor_id", vendedorId)
    .order("created_at");
  if (error) {
    console.error("listarVentasDelGrupo", error);
    return { data: [], error: "No se pudo cargar el grupo de ventas." };
  }
  return { data: (data ?? []) as unknown as VentaDelGrupoRow[], error: null };
}
