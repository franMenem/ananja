/**
 * Lecturas del depósito y movimientos de stock — capa `lib/data`
 * (convención en `lib/data/README.md`, referencia `lib/data/gastos.ts`).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { listarProductos as listarProductosCatalogo } from "@/lib/data/catalogos";
import { listarStockInsumos, type StockInsumo } from "@/lib/data/insumos";
import {
  stockRevendedorasPorLote,
  type EnManosFila,
  type EntregaItemVendedor,
} from "@/lib/dominio/lote-en-manos";
import { leerTodasLasPaginas } from "@/lib/paginado";
import type { Database, Tables } from "@/lib/types";

type Supa = SupabaseClient<Database>;

export type StockActual = Tables<"v_stock_actual">;
export type RecetaTipo = Pick<Tables<"recetas">, "producto_id" | "insumo_id" | "cantidad"> & {
  insumos: Pick<Tables<"insumos">, "tipo"> | null;
};
export type TanqueAceite = Tables<"v_tanque_aceite">;
export type StockPorLoteFila = Pick<Tables<"v_stock_por_lote">, "lote_id" | "producto_id" | "fecha" | "quedan">;
export type Producto = Pick<Tables<"productos">, "id" | "nombre" | "presentacion_ml">;

export interface DepositoDatos {
  stockRows: StockActual[];
  recetasRows: RecetaTipo[];
  tanqueRows: TanqueAceite[];
  stockPorLote: StockPorLoteFila[];
  stockInsumos: StockInsumo[];
}

/**
 * Todo lo que pinta `/stock` (Depósito): stock por presentación, recetas
 * (para "alcanza para N botellas"), tanque de aceite vigente, reparto por
 * pedido de lo que queda, y el stock de insumos (para "En el proveedor"). Las
 * cinco consultas son independientes entre sí — antes `listarStockInsumos`
 * se pedía en una segunda tanda separada, sin necesidad (no depende de
 * ninguna de las otras cuatro).
 */
export async function obtenerDeposito(supabase: Supa): Promise<DepositoDatos> {
  const [{ data: stockRows }, { data: recetasRows }, { data: tanqueRows }, { data: stockPorLote }, { data: stockInsumos }] =
    await Promise.all([
      supabase.from("v_stock_actual").select("*").order("presentacion_ml", { ascending: true }),
      supabase.from("recetas").select("producto_id, insumo_id, cantidad, insumos(tipo)"),
      supabase.from("v_tanque_aceite").select("*"),
      supabase.from("v_stock_por_lote").select("lote_id, producto_id, fecha, quedan"),
      listarStockInsumos(supabase),
    ]);

  return {
    stockRows: stockRows ?? [],
    recetasRows: recetasRows ?? [],
    tanqueRows: tanqueRows ?? [],
    stockPorLote: stockPorLote ?? [],
    stockInsumos: stockInsumos ?? [],
  };
}

export type MovimientoStockRow = {
  id: string;
  tipo: string;
  cantidad: number;
  created_at: string;
  nota: string | null;
  motivo: string | null;
  comprobante_id: string | null;
  entrega_id: string | null;
  feria_id: string | null;
  lote_id: string | null;
  /** Fecha ("yyyy-mm-dd") del lote del movimiento; `null` sin lote o si no se pudo leer. */
  fecha_lote: string | null;
  productos: { nombre: string; presentacion_ml: number } | null;
  vendedores: { nombre: string } | null;
};

/** Fechas ("yyyy-mm-dd") de los lotes pedidos, por id. Consulta aparte (sin
 * embed de PostgREST). Tolerante: si falla, devuelve un mapa vacío y los
 * movimientos se muestran sin la fecha del lote. */
async function fechasDeLotes(supabase: Supa, loteIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(loteIds)];
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from("lotes_produccion").select("id, fecha").in("id", ids);
  if (error) {
    console.error("fechasDeLotes", error);
    return new Map();
  }
  return new Map((data ?? []).map((l) => [l.id, l.fecha]));
}

/** Últimos 200 movimientos de stock (ingresos/egresos), para
 * `/stock/movimientos`. Trae también motivo, lote (con su fecha, vía una
 * segunda consulta a `lotes_produccion` unida en memoria) y los ids que
 * dicen si el movimiento es manual (`esMovimientoStockBorrable`). */
export async function listarMovimientosStock(
  supabase: Supa,
): Promise<{ data: MovimientoStockRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("movimientos_stock")
    .select(
      "id, tipo, cantidad, created_at, nota, motivo, comprobante_id, entrega_id, feria_id, lote_id, productos(nombre, presentacion_ml), vendedores(nombre)",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("listarMovimientosStock", error);
    return { data: [], error: "No se pudo cargar el historial." };
  }

  const filas = data ?? [];
  const fechas = await fechasDeLotes(
    supabase,
    filas.flatMap((m) => (m.lote_id ? [m.lote_id] : [])),
  );

  return {
    data: filas.map((m) => ({ ...m, fecha_lote: m.lote_id ? (fechas.get(m.lote_id) ?? null) : null })),
    error: null,
  };
}

export type MovimientoStockBorrado = {
  id: string;
  tipo: string;
  cantidad: number;
  motivo: string | null;
  nota: string | null;
  /** Cuándo se cargó el movimiento original. */
  created_at: string;
  borrado_at: string;
  producto: string | null;
  fecha_lote: string | null;
  lote_id: string | null;
  /** Quién lo borró; `null` si no se sabe. */
  borrado_por: string | null;
};

/** Últimos 100 movimientos de stock eliminados (`movimientos_stock_borrados`,
 * 0072), con nombres resueltos por consultas aparte (la tabla no tiene FKs).
 *
 * TOLERANTE a propósito: la migración 0072 se aplica en producción DESPUÉS del
 * deploy, así que mientras tanto la tabla no existe. Ante cualquier error
 * (tabla inexistente, sin permiso, conexión) se loguea y devuelve `[]` — la
 * página se ve igual que antes, sin la sección de eliminados. */
export async function listarMovimientosStockBorrados(supabase: Supa): Promise<MovimientoStockBorrado[]> {
  try {
    const { data, error } = await supabase
      .from("movimientos_stock_borrados")
      .select("id, tipo, cantidad, motivo, nota, created_at, borrado_at, producto_id, lote_id, borrado_por")
      .order("borrado_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("listarMovimientosStockBorrados", error.message);
      return [];
    }
    const filas = data ?? [];
    if (filas.length === 0) return [];

    const productoIds = [...new Set(filas.map((f) => f.producto_id))];
    const borradorIds = [...new Set(filas.flatMap((f) => (f.borrado_por ? [f.borrado_por] : [])))];

    const [fechas, { data: productos }, { data: borradores }] = await Promise.all([
      fechasDeLotes(
        supabase,
        filas.flatMap((f) => (f.lote_id ? [f.lote_id] : [])),
      ),
      supabase.from("productos").select("id, nombre").in("id", productoIds),
      borradorIds.length > 0
        ? supabase.from("vendedores").select("id, nombre").in("id", borradorIds)
        : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
    ]);
    const nombreProducto = new Map((productos ?? []).map((p) => [p.id, p.nombre]));
    const nombreBorrador = new Map((borradores ?? []).map((v) => [v.id, v.nombre]));

    return filas.map((f) => ({
      id: f.id,
      tipo: f.tipo,
      cantidad: f.cantidad,
      motivo: f.motivo,
      nota: f.nota,
      created_at: f.created_at,
      borrado_at: f.borrado_at,
      producto: nombreProducto.get(f.producto_id) ?? null,
      fecha_lote: f.lote_id ? (fechas.get(f.lote_id) ?? null) : null,
      lote_id: f.lote_id,
      borrado_por: f.borrado_por ? (nombreBorrador.get(f.borrado_por) ?? null) : null,
    }));
  } catch (e) {
    console.error("listarMovimientosStockBorrados", e);
    return [];
  }
}

/** Productos (id, nombre, presentación), para selectores de
 * `/stock/nuevo` y `/stock/lotes/nuevo`. Mismo catálogo que usan
 * Comprobantes y Revendedores (columnas completas) → `lib/data/catalogos.ts`
 * — acá solo nos quedamos con el subconjunto de columnas que hace falta. */
export async function listarProductos(
  supabase: Supa,
  orden: "asc" | "desc" = "asc",
): Promise<{ data: Producto[]; error: string | null }> {
  const { data, error } = await listarProductosCatalogo(supabase, orden);

  if (error) {
    return { data: [], error: "No se pudo cargar la lista de productos." };
  }

  return { data: data.map(({ id, nombre, presentacion_ml }) => ({ id, nombre, presentacion_ml })), error: null };
}

/** Stock actual (`v_stock_actual.stock`) de un producto puntual — chequeo
 * de "no dejar stock negativo" antes de guardar un egreso manual
 * (`MovimientoForm`). `stock: 0` con `error` no nulo si la consulta
 * falla (mismo criterio que ya tenía la pantalla: no distingue "no hay
 * fila" de "no se pudo consultar"). */
export async function obtenerStockActualProducto(
  supabase: Supa,
  productoId: string,
): Promise<{ stock: number; error: string | null }> {
  const { data, error } = await supabase
    .from("v_stock_actual")
    .select("stock")
    .eq("producto_id", productoId)
    .single();

  if (error) {
    console.error("obtenerStockActualProducto", error);
    return { stock: 0, error: "No se pudo verificar el stock actual." };
  }

  return { stock: data?.stock ?? 0, error: null };
}

/**
 * Stock en poder de TODAS las revendedoras por lote y producto — para las
 * pantallas de lotes (solo admin; RLS de `entrega_items`/`ventas_revendedor`
 * ya limita a una revendedora a sus propias filas). Lee todas las entregas
 * y ventas porque el reparto FIFO de cada una necesita su historia
 * completa, no solo lo de un lote.
 *
 * ANALIZADO (migración a `lib/data`, tanda producción/stock): NO se acota
 * la lectura a un solo lote, aunque `/stock/lotes/[id]` solo necesita el
 * resultado de ESE lote. Motivo — `stockPorEntrega`/`tramosDeProducto`
 * (`lib/dominio/revendedor-stock.ts`) reparte, POR PRODUCTO, ventas "sin
 * atribución" (`ventas_revendedor.entrega_item_id is null`, anteriores a
 * 0040) de la entrega más vieja a la más nueva, y devoluciones "sin lote"
 * de la más nueva a la más vieja — en ambos casos SIN mirar de qué lote es
 * cada entrega. Si se filtrara `entrega_items`/`ventas_revendedor` a las
 * de un solo `lote_id`, esas dos rutas dejarían de ver los tramos de otros
 * lotes del mismo producto y podrían atribuir mal el remanente — cambiaría
 * el resultado en cualquier cuenta con una venta o devolución vieja sin
 * atribución, algo que el código sigue contemplando como caso válido (no
 * se pudo confirmar contra prod, de solo lectura, que ya no exista ningún
 * caso así).
 *
 * SÍ es seguro acotar por PRODUCTO (no por lote): cada producto se procesa
 * de forma completamente independiente dentro de `stockPorEntrega` (agrupa
 * por `productoId` y arma los tramos de cada uno por separado), así que
 * traer solo los `entrega_items`/`ventas_revendedor` de los productos de
 * ESTE lote (`itemsDeLote(lote).map(i => i.producto_id)`) da exactamente
 * el mismo resultado para ese lote. No se aplicó igual: para armar el
 * filtro hace falta conocer antes los `producto_id` del lote (una consulta
 * previa), lo que convertiría esta lectura en una segunda tanda dependiente
 * en `/stock/lotes/[id]` — hoy esa pantalla ya resuelve sus ~17 consultas
 * en UNA sola tanda (objetivo principal de esta migración), y el catálogo
 * de productos de Ananja es chico (unas pocas presentaciones), así que el
 * ahorro de filas sería marginal frente al costo de un round-trip extra.
 * Si el historial de entregas/ventas creciera mucho, una vista SQL tipo
 * `v_stock_revendedor_por_lote(lote_id)` (que ya resuelva el FIFO del lado
 * de Postgres) sería la forma de acotar sin agregar una tanda — no se
 * escribió esa vista acá (fuera de alcance: no se tocan migraciones).
 */
export async function listarStockRevendedorasPorLote(
  supabase: Supa,
): Promise<{ data: EnManosFila[]; error: string | null }> {
  const [itemsRes, ventasRes] = await Promise.all([
    leerTodasLasPaginas((desde, hasta) =>
      supabase
        .from("entrega_items")
        .select(
          "id, entrega_id, producto_id, lote_id, cantidad, costo_ananja_unitario_centavos, precio_sugerido_centavos, entregas_revendedor!inner(vendedor_id, tipo, fecha, created_at)",
        )
        .order("id")
        .range(desde, hasta),
    ),
    leerTodasLasPaginas((desde, hasta) =>
      supabase
        .from("ventas_revendedor")
        .select("id, vendedor_id, producto_id, cantidad, entrega_item_id")
        .order("id")
        .range(desde, hasta),
    ),
  ]);

  if (itemsRes.error || ventasRes.error) {
    console.error("listarStockRevendedorasPorLote", itemsRes.error ?? ventasRes.error);
    return { data: [], error: "No se pudo cargar lo que tienen las revendedoras." };
  }

  const items: EntregaItemVendedor[] = itemsRes.data.map((i) => ({
    id: i.id,
    vendedorId: i.entregas_revendedor.vendedor_id,
    entregaId: i.entrega_id,
    tipo: i.entregas_revendedor.tipo === "devolucion" ? "devolucion" : "entrega",
    fecha: i.entregas_revendedor.fecha,
    createdAt: i.entregas_revendedor.created_at,
    productoId: i.producto_id,
    loteId: i.lote_id,
    cantidad: i.cantidad,
    costoAnanjaUnitarioCentavos: i.costo_ananja_unitario_centavos,
    precioSugeridoCentavos: i.precio_sugerido_centavos,
  }));

  const ventas = ventasRes.data.map((v) => ({
    vendedorId: v.vendedor_id,
    productoId: v.producto_id,
    cantidad: v.cantidad,
    entregaItemId: v.entrega_item_id,
  }));

  return { data: stockRevendedorasPorLote(items, ventas), error: null };
}
