/**
 * Lecturas de Revendedores — capa `lib/data` (convención en
 * `lib/data/README.md`, referencia en `lib/data/gastos.ts`). Nada de JSX ni
 * agregación acá: eso vive en `app/(app)/revendedores/**` (UI) y en los
 * módulos puros del dominio (`lib/revendedores.ts`, `lib/pagos-revendedor.ts`,
 * `lib/movimientos-revendedor.ts`, etc.).
 *
 * OJO: `lib/revendedores.ts` (sin `/data/`) ya existe desde antes de esta
 * etapa y trae varias lecturas con la misma convención (cliente como primer
 * parámetro, `{data, error}`/`null`) — `listarVentasRevendedor`,
 * `listarPagosRevendedor`, `listarPreciosRevendedor`,
 * `listarStockRevendedor`, `obtenerResumenRevendedor`,
 * `listarRendicionesRevendedor`, `listarEntregaItemsFifo`,
 * `obtenerMiEncargado`, etc. Ese archivo también lo consumen pantallas
 * fuera de este territorio (`app/(auth)/sin-acceso/page.tsx`), así que no
 * se movió/renombró acá para no tocar archivos ajenos — queda como
 * candidato a fusionarse con este en una limpieza aparte. Este archivo solo
 * junta las lecturas que hasta ahora vivían EMBEBIDAS directo en las
 * páginas de `/revendedores` (`supabase.from()` suelto en el Server
 * Component).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { listarProductos as listarProductosCatalogo } from "@/lib/data/catalogos";
import type { Database, Tables } from "@/lib/types";

type Supa = SupabaseClient<Database>;

export type VendedorRow = Tables<"vendedores">;
export type StockRevendedorRow = Tables<"v_stock_revendedor">;
export type ResumenRevendedorRow = Tables<"v_resumen_revendedor">;
export type ValorStockRevendedorRow = Tables<"v_valor_stock_revendedor">;
export type EntregaRevendedorRow = Tables<"entregas_revendedor">;
export type RendicionRow = Tables<"rendiciones">;
export type EncargadoOpcion = { id: string; nombre: string };

/** Un vendedor (cualquier rol) por id — usado por `/revendedores/[id]`,
 * `/revendedores/[id]/carga` y `/revendedores/[id]/devolucion`. `null` si
 * no existe o si la consulta falla (las tres pantallas ya trataban ambos
 * casos como "no encontrado"). */
export async function obtenerVendedorPorId(supabase: Supa, id: string): Promise<VendedorRow | null> {
  const { data, error } = await supabase.from("vendedores").select("*").eq("id", id).maybeSingle();
  if (error) console.error("obtenerVendedorPorId", error);
  return data ?? null;
}

/** Deuda vigente de un vendedor con Ananja (`v_deuda_vendedor.saldo_centavos`,
 * supabase/migrations/0037_plata_en_manos.sql) — mismo patrón que usan
 * `/revendedores/[id]`, `/revendedores/[id]/carga`, `/mi`, `/mi/ganancia` y
 * `/mi/pagar`. `null` tanto si no hay fila (sin deuda) como si la consulta
 * falla — los cinco callers ya lo trataban igual (`?? 0`). */
export async function obtenerDeudaVendedor(supabase: Supa, vendedorId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from("v_deuda_vendedor")
    .select("saldo_centavos")
    .eq("vendedor_id", vendedorId)
    .maybeSingle();
  if (error) console.error("obtenerDeudaVendedor", error);
  return data?.saldo_centavos ?? null;
}

/** Admins y coordinadores activos, para elegir "Coordinador" de una
 * revendedora — usado por `/revendedores/[id]` (cambiar encargado) y
 * `/revendedores/invitar` (alta). */
export async function listarEncargadosPosibles(
  supabase: Supa,
): Promise<{ data: EncargadoOpcion[]; error: string | null }> {
  const { data, error } = await supabase
    .from("vendedores")
    .select("id, nombre")
    .in("rol", ["admin", "coordinador"])
    .eq("activo", true)
    .order("nombre");
  if (error) {
    console.error("listarEncargadosPosibles", error);
    return { data: [], error: "No se pudo cargar la lista de encargados." };
  }
  return {
    data: (data ?? []).filter((v): v is EncargadoOpcion => Boolean(v.id && v.nombre)),
    error: null,
  };
}

// ---------------------------------------------------------------------
// `/revendedores` — panel de admin (ver comentario de la página para el
// detalle de las tres tablas). Nueve consultas independientes, una función
// por consulta — la página las junta en UN solo `Promise.all`.
// ---------------------------------------------------------------------

/** Cuentas `rol = 'pendiente'` activas, más nuevas primero. */
export async function listarPendientesAprobacion(supabase: Supa): Promise<{ data: VendedorRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("vendedores")
    .select("*")
    .eq("rol", "pendiente")
    .eq("activo", true)
    .order("creado_en", { ascending: false });
  if (error) {
    console.error("listarPendientesAprobacion", error);
    return { data: [], error: "No se pudo cargar la lista de pendientes." };
  }
  return { data: data ?? [], error: null };
}

/** `rol = 'revendedor'` (cualquier `activo`), por nombre. */
export async function listarRevendedoresRol(supabase: Supa): Promise<{ data: VendedorRow[]; error: string | null }> {
  const { data, error } = await supabase.from("vendedores").select("*").eq("rol", "revendedor").order("nombre");
  if (error) {
    console.error("listarRevendedoresRol", error);
    return { data: [], error: "No se pudo cargar la lista de revendedores." };
  }
  return { data: data ?? [], error: null };
}

/** Admins activos con su propio espacio de revendedor habilitado
 * (`revende = true`) — aparecen en la tabla "Revendedores" con el tag
 * "admin". */
export async function listarAdminsConEspacio(supabase: Supa): Promise<{ data: VendedorRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("vendedores")
    .select("*")
    .eq("rol", "admin")
    .eq("activo", true)
    .eq("revende", true)
    .order("nombre");
  if (error) {
    console.error("listarAdminsConEspacio", error);
    return { data: [], error: "No se pudo cargar la lista de admins con espacio." };
  }
  return { data: data ?? [], error: null };
}

/** Todos los admins activos (con o sin espacio propio) — tabla "Admins". */
export async function listarAdminsActivos(supabase: Supa): Promise<{ data: VendedorRow[]; error: string | null }> {
  const { data, error } = await supabase.from("vendedores").select("*").eq("rol", "admin").eq("activo", true).order("nombre");
  if (error) {
    console.error("listarAdminsActivos", error);
    return { data: [], error: "No se pudo cargar la lista de admins." };
  }
  return { data: data ?? [], error: null };
}

/** Coordinadores activos (0055_coordinador.sql) — tabla "Coordinadores". */
export async function listarCoordinadoresActivos(supabase: Supa): Promise<{ data: VendedorRow[]; error: string | null }> {
  const { data, error } = await supabase.from("vendedores").select("*").eq("rol", "coordinador").eq("activo", true).order("nombre");
  if (error) {
    console.error("listarCoordinadoresActivos", error);
    return { data: [], error: "No se pudo cargar la lista de coordinadores." };
  }
  return { data: data ?? [], error: null };
}

/** `encargado_id` de cada vendedor activo con encargado asignado — para
 * contar cuántas revendedoras tiene cada coordinador/admin. */
export async function listarEncargadoIdsActivos(
  supabase: Supa,
): Promise<{ data: { encargado_id: string | null }[]; error: string | null }> {
  const { data, error } = await supabase
    .from("vendedores")
    .select("encargado_id")
    .eq("activo", true)
    .not("encargado_id", "is", null);
  if (error) {
    console.error("listarEncargadoIdsActivos", error);
    return { data: [], error: "No se pudo cargar la lista de encargados." };
  }
  return { data: data ?? [], error: null };
}

/** `v_stock_revendedor` completa (todos los vendedores) — usada por
 * `/revendedores` para sumar "En poder" por vendedor. */
export async function listarStockRevendedorTodos(supabase: Supa): Promise<{ data: StockRevendedorRow[]; error: string | null }> {
  const { data, error } = await supabase.from("v_stock_revendedor").select("*");
  if (error) {
    console.error("listarStockRevendedorTodos", error);
    return { data: [], error: "No se pudo cargar el stock." };
  }
  return { data: data ?? [], error: null };
}

/** `v_resumen_revendedor` completa — "Le debe a Ananja" en `/revendedores`. */
export async function listarResumenRevendedorTodos(
  supabase: Supa,
): Promise<{ data: ResumenRevendedorRow[]; error: string | null }> {
  const { data, error } = await supabase.from("v_resumen_revendedor").select("*");
  if (error) {
    console.error("listarResumenRevendedorTodos", error);
    return { data: [], error: "No se pudo cargar el resumen." };
  }
  return { data: data ?? [], error: null };
}

/** `v_valor_stock_revendedor` completa — "Valor en poder"/"Total" en
 * `/revendedores` (costo REAL de Ananja, 0059). */
export async function listarValorStockRevendedorTodos(
  supabase: Supa,
): Promise<{ data: ValorStockRevendedorRow[]; error: string | null }> {
  const { data, error } = await supabase.from("v_valor_stock_revendedor").select("*");
  if (error) {
    console.error("listarValorStockRevendedorTodos", error);
    return { data: [], error: "No se pudo cargar el valor de stock." };
  }
  return { data: data ?? [], error: null };
}

// ---------------------------------------------------------------------
// `/revendedores/[id]` — ficha de una revendedora (admin).
// ---------------------------------------------------------------------

export type ProductoRow = Tables<"productos">;
export type ProductoResumen = Pick<ProductoRow, "id" | "nombre">;
export type EntregaItemDeVendedorRow = Tables<"entrega_items"> & {
  entregas_revendedor: { vendedor_id: string | null };
};
export type VentaBorradaRow = Pick<
  Tables<"ventas_revendedor_borradas">,
  "grupo_id" | "fecha" | "producto_id" | "cantidad" | "precio_venta_centavos" | "borrada_por" | "borrada_at"
>;
export type ValorStockPorProductoRow = Pick<ValorStockRevendedorRow, "producto_id" | "valor_en_poder_ananja_centavos">;

/** Catálogo completo de productos, por presentación — usado por
 * `/revendedores/[id]` y `/revendedores/[id]/devolucion` (columnas
 * completas, a diferencia de `/revendedores/[id]/carga`, que solo necesita
 * id/nombre — ver {@link listarProductosResumen}). Misma consulta que usan
 * Comprobantes y Depósito/Stock → `lib/data/catalogos.ts`. */
export async function listarProductos(supabase: Supa): Promise<{ data: ProductoRow[]; error: string | null }> {
  return listarProductosCatalogo(supabase);
}

/** Catálogo de productos, solo id/nombre — usado por
 * `/revendedores/[id]/carga` (no necesita el resto de las columnas). */
export async function listarProductosResumen(
  supabase: Supa,
): Promise<{ data: ProductoResumen[]; error: string | null }> {
  const { data, error } = await listarProductosCatalogo(supabase);
  if (error) return { data: [], error };
  return { data: data.map(({ id, nombre }) => ({ id, nombre })), error: null };
}

/** Entregas y devoluciones de un vendedor, más nuevas primero — insumo del
 * hilo de "Movimientos" en `/revendedores/[id]` (`entregasComoMovimientos`,
 * `lib/movimientos-revendedor.ts`). */
export async function listarEntregasDeVendedor(
  supabase: Supa,
  vendedorId: string,
): Promise<{ data: EntregaRevendedorRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("entregas_revendedor")
    .select("*")
    .eq("vendedor_id", vendedorId)
    .order("fecha", { ascending: false });
  if (error) {
    console.error("listarEntregasDeVendedor", error);
    return { data: [], error: "No se pudo cargar las entregas." };
  }
  return { data: data ?? [], error: null };
}

/** Ítems de entrega de un vendedor con la fila completa (a diferencia de
 * `listarEntregaItemsFifo` de `lib/revendedores.ts`, que solo trae las
 * columnas del reparto FIFO) — insumo de `entregasComoMovimientos` en
 * `/revendedores/[id]`. */
export async function listarEntregaItemsDeVendedor(
  supabase: Supa,
  vendedorId: string,
): Promise<{ data: EntregaItemDeVendedorRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("entrega_items")
    .select("*, entregas_revendedor!inner(vendedor_id)")
    .eq("entregas_revendedor.vendedor_id", vendedorId);
  if (error) {
    console.error("listarEntregaItemsDeVendedor", error);
    return { data: [], error: "No se pudo cargar los ítems de entrega." };
  }
  return { data: (data ?? []) as unknown as EntregaItemDeVendedorRow[], error: null };
}

/** Rendiciones de un vendedor ordenadas SOLO por fecha descendente — a
 * propósito sin el desempate por `created_at` de `listarRendicionesRevendedor`
 * (`lib/revendedores.ts`, usada por `/mi`): esta ficha de admin ya se
 * comportaba así antes de esta migración y no cambiamos el orden visible. */
export async function listarRendicionesDeVendedor(
  supabase: Supa,
  vendedorId: string,
): Promise<{ data: RendicionRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("rendiciones")
    .select("*")
    .eq("vendedor_id", vendedorId)
    .order("fecha", { ascending: false });
  if (error) {
    console.error("listarRendicionesDeVendedor", error);
    return { data: [], error: "No se pudo cargar la lista de rendiciones." };
  }
  return { data: data ?? [], error: null };
}

/** Ventas borradas de un vendedor (0045 § 1), más recientes primero, tope
 * 200 filas — foto de auditoría en `/revendedores/[id]`. */
export async function listarVentasBorradasDeVendedor(
  supabase: Supa,
  vendedorId: string,
): Promise<{ data: VentaBorradaRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("ventas_revendedor_borradas")
    .select("grupo_id, fecha, producto_id, cantidad, precio_venta_centavos, borrada_por, borrada_at")
    .eq("vendedor_id", vendedorId)
    .order("borrada_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error("listarVentasBorradasDeVendedor", error);
    return { data: [], error: "No se pudo cargar las ventas borradas." };
  }
  return { data: data ?? [], error: null };
}

/** "Valor en poder" por producto, al costo REAL de Ananja
 * (`0059_valor_stock_revendedor_costo_real.sql`) — usado por
 * `EnPoderFicha` en `/revendedores/[id]`. */
export async function listarValorStockDeVendedor(
  supabase: Supa,
  vendedorId: string,
): Promise<{ data: ValorStockPorProductoRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("v_valor_stock_revendedor")
    .select("producto_id, valor_en_poder_ananja_centavos")
    .eq("vendedor_id", vendedorId);
  if (error) {
    console.error("listarValorStockDeVendedor", error);
    return { data: [], error: "No se pudo cargar el valor de stock." };
  }
  return { data: data ?? [], error: null };
}

/** Nombre de cada vendedor de una lista de ids — usado por
 * `/revendedores/[id]` para mostrar quién borró cada venta (`ventas_revendedor_borradas`
 * no tiene FK a propósito, ver comentario de la página). Lista vacía sin
 * consultar si `ids` viene vacío. */
export async function listarVendedoresPorIds(
  supabase: Supa,
  ids: string[],
): Promise<{ data: { id: string; nombre: string }[]; error: string | null }> {
  if (ids.length === 0) return { data: [], error: null };
  const { data, error } = await supabase.from("vendedores").select("id, nombre").in("id", ids);
  if (error) {
    console.error("listarVendedoresPorIds", error);
    return { data: [], error: "No se pudo cargar los nombres." };
  }
  return { data: data ?? [], error: null };
}

export type EncargadoBasico = Pick<VendedorRow, "nombre" | "rol" | "activo">;

/** Nombre/rol/activo del encargado de un vendedor, por id — sin embed
 * (self-join por FK que PostgREST no resuelve): usado por
 * `/revendedores/[id]/carga` para saber si mostrar "a nombre de
 * {encargado}". `null` si no existe o si la consulta falla. */
export async function obtenerEncargadoBasico(supabase: Supa, encargadoId: string): Promise<EncargadoBasico | null> {
  const { data, error } = await supabase
    .from("vendedores")
    .select("nombre, rol, activo")
    .eq("id", encargadoId)
    .maybeSingle();
  if (error) console.error("obtenerEncargadoBasico", error);
  return data ?? null;
}

export type LoteProduccionFecha = Pick<Tables<"lotes_produccion">, "id" | "fecha">;

/** Fecha de lotes de producción por id — usado por
 * `/revendedores/[id]/carga` para completar la fecha de lotes que ya no
 * aparecen en `obtenerLotesConStock` (`lib/lotes-disponibles.ts`, dominio
 * de stock/producción) porque se vaciaron pero un ítem de entrega vieja
 * todavía los referencia. Candidata a vivir en un módulo de datos
 * compartido de lotes si otro sector necesita lo mismo. Lista vacía sin
 * consultar si `ids` viene vacío. */
export async function listarLotesProduccionPorIds(
  supabase: Supa,
  ids: string[],
): Promise<LoteProduccionFecha[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("lotes_produccion").select("id, fecha").in("id", ids);
  if (error) {
    console.error("listarLotesProduccionPorIds", error);
    return [];
  }
  return data ?? [];
}

export type UltimaEntregaPorProductoRow = {
  producto_id: string;
  lote_id: string | null;
  entregas_revendedor: { vendedor_id: string | null; tipo: string; created_at: string };
};

/** Última entrega (no devolución) de cada producto a un vendedor puntual,
 * con su lote — default de "a qué lote vuelve" una devolución (ver
 * `lib/lotes-disponibles.ts` § `ultimoLotePorProducto`), usado por
 * `/revendedores/[id]/devolucion`. */
export async function listarUltimaEntregaPorProducto(
  supabase: Supa,
  vendedorId: string,
): Promise<{ data: UltimaEntregaPorProductoRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("entrega_items")
    .select("producto_id, lote_id, entregas_revendedor!inner(vendedor_id, tipo, created_at)")
    .eq("entregas_revendedor.vendedor_id", vendedorId)
    .eq("entregas_revendedor.tipo", "entrega")
    .order("created_at", { referencedTable: "entregas_revendedor", ascending: false });
  if (error) {
    console.error("listarUltimaEntregaPorProducto", error);
    return { data: [], error: "No se pudo cargar la última entrega." };
  }
  return { data: (data ?? []) as unknown as UltimaEntregaPorProductoRow[], error: null };
}

/** Plata en mano de un tenedor puntual (`v_plata_en_manos.total_centavos`)
 * — usado por `/revendedores/[id]` en la ficha de un coordinador (a
 * diferencia de `obtenerMiPlataEnMano` de `lib/data/mi.ts`, que es la
 * propia fila vía RLS, sin filtro). `null` si no tiene nada en mano o si
 * la consulta falla. */
export async function obtenerPlataEnManoDeTenedor(supabase: Supa, tenedorId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from("v_plata_en_manos")
    .select("total_centavos")
    .eq("tenedor_id", tenedorId)
    .maybeSingle();
  if (error) console.error("obtenerPlataEnManoDeTenedor", error);
  return data?.total_centavos ?? null;
}
