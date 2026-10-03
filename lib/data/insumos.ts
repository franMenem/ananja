/**
 * Lecturas de Insumos — capa `lib/data` (convención en `lib/data/README.md`,
 * referencia `lib/data/gastos.ts`). Las funciones puras (agrupar, formatear,
 * `elegirUltimasComprasPorInsumo`) y las escrituras (RPC de alta/ajuste,
 * `actualizarUmbralInsumo`) se quedan en `lib/insumos.ts` — esta migración
 * solo mueve lo que hace `supabase.from(...)`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { elegirUltimasComprasPorInsumo, type UltimaCompraInsumo } from "@/lib/dominio/insumos";
import type { Database, Tables } from "@/lib/types";

type Supa = SupabaseClient<Database>;

export type StockInsumo = Tables<"v_stock_insumos">;
export type Insumo = Tables<"insumos">;
export type Receta = Tables<"recetas">;
export type MovimientoInsumo = Tables<"movimientos_insumo">;

export type MovimientoInsumoConVendedor = MovimientoInsumo & {
  vendedores: { nombre: string } | null;
};

export type InsumoConHistorial = {
  insumo: Insumo;
  stock: StockInsumo | null;
  movimientos: MovimientoInsumoConVendedor[];
};

/** Todo el stock de insumos activos (`v_stock_insumos`), sin ordenar —
 * el caller agrupa con `agruparPorTipo` (lib/insumos.ts). Usado por
 * `/stock/insumos` y por el link "Insumos" de `/stock` (contador de
 * insumos bajo umbral). */
export async function listarStockInsumos(supabase: Supa): Promise<{ data: StockInsumo[]; error: string | null }> {
  const { data, error } = await supabase.from("v_stock_insumos").select("*");

  if (error) {
    console.error("listarStockInsumos", error);
    return { data: [], error: "No se pudo cargar el stock de insumos." };
  }

  return { data: data ?? [], error: null };
}

/**
 * Detalle de un insumo + su historial completo de movimientos (más
 * recientes primero), para `/stock/insumos/[id]`. `null` si el insumo no
 * existe. `stock` viene `null` si el insumo está desactivado (no aparece
 * en `v_stock_insumos`, ver `supabase/migrations/0017_insumos.sql`).
 *
 * Las tres consultas solo dependen del `id` recibido (no una de otra), así
 * que van en UN solo `Promise.all` — antes se pedía primero el insumo y
 * recién después, en una segunda tanda, su stock y movimientos.
 */
export async function obtenerInsumo(supabase: Supa, id: string): Promise<InsumoConHistorial | null> {
  const [
    { data: insumo, error: insumoError },
    { data: stock, error: stockError },
    { data: movimientos, error: movimientosError },
  ] = await Promise.all([
    supabase.from("insumos").select("*").eq("id", id).maybeSingle(),
    supabase.from("v_stock_insumos").select("*").eq("insumo_id", id).maybeSingle(),
    supabase
      .from("movimientos_insumo")
      .select("*, vendedores(nombre)")
      .eq("insumo_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (insumoError) throw new Error("No se pudo cargar el insumo.");
  if (!insumo) return null;
  if (stockError) throw new Error("No se pudo cargar el insumo.");
  if (movimientosError) throw new Error("No se pudo cargar el historial del insumo.");

  return {
    insumo,
    stock: stock ?? null,
    movimientos: (movimientos ?? []) as MovimientoInsumoConVendedor[],
  };
}

/** Insumos activos, para los selectores de `/stock/insumos/factura`,
 * `/stock/insumos/ajuste` y `LoteForm` — orden alfabético por nombre (a
 * diferencia de `agruparPorTipo`, un `<select>` no necesita el agrupado
 * visual). */
export async function listarInsumosActivos(supabase: Supa): Promise<{ data: Insumo[]; error: string | null }> {
  const { data, error } = await supabase
    .from("insumos")
    .select("*")
    .eq("activo", true)
    .order("nombre", { ascending: true });

  if (error) {
    console.error("listarInsumosActivos", error);
    return { data: [], error: "No se pudo cargar la lista de insumos." };
  }

  return { data: data ?? [], error: null };
}

/** Fila cruda del `select` de `obtenerUltimasComprasInsumos` — separada del
 * fetch para que "quedarse con la compra más reciente por insumo" sea
 * testeable sin mockear supabase (`elegirUltimasComprasPorInsumo`,
 * `tests/insumos.test.ts`). */
type FilaCompraInsumo = {
  insumo_id: string;
  cantidad: number;
  gastos: { fecha: string; monto_centavos: number } | null;
};

/**
 * Última compra de cada insumo pedido — un ingreso de `movimientos_insumo`
 * vinculado a un `gasto` (mismo predicado de "compra real" que
 * `v_tanque_aceite`: ingresos con `gasto_id`, un ajuste manual sin gasto no
 * cuenta), la de fecha de gasto más reciente por insumo. Usado por
 * `prefillCostosLote` (`lib/lotes.ts`) para prefijar "Etiquetas" en Costos
 * del pedido cuando el lote de referencia no tiene ese insumo cargado.
 */
export async function obtenerUltimasComprasInsumos(
  supabase: Supa,
  insumoIds: string[],
): Promise<Record<string, UltimaCompraInsumo>> {
  if (insumoIds.length === 0) return {};

  const { data, error } = await supabase
    .from("movimientos_insumo")
    .select("insumo_id, cantidad, gastos!inner(fecha, monto_centavos)")
    .eq("tipo", "ingreso")
    .in("insumo_id", insumoIds);

  if (error) {
    console.error("obtenerUltimasComprasInsumos", error);
    return {};
  }

  // El embed no tipa bien contra el jsonb que devuelve PostgREST — el cast
  // queda encerrado acá, no en la página ni en `lib/insumos.ts`.
  return elegirUltimasComprasPorInsumo((data ?? []) as unknown as FilaCompraInsumo[]);
}

/** Todas las recetas (`producto_id`, `insumo_id`, `cantidad`) — usado por
 * `LoteForm` para el resumen de consumo en vivo (`calcularConsumoLote`,
 * `lib/calculos.ts`). Sin filtrar por producto: son pocas filas (2
 * presentaciones × 4 insumos hoy por negocio), más simple traerlas todas
 * de una vez que armar un filtro `in (...)`. */
export async function listarRecetas(supabase: Supa): Promise<{ data: Receta[]; error: string | null }> {
  const { data, error } = await supabase.from("recetas").select("*");

  if (error) {
    console.error("listarRecetas", error);
    return { data: [], error: "No se pudo cargar la lista de recetas." };
  }

  return { data: data ?? [], error: null };
}
