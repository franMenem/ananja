/**
 * Lecturas de Comprobantes — capa `lib/data` (convención en
 * `lib/data/README.md`, referencia en `lib/data/gastos.ts`). Nada de JSX ni
 * agregación acá: eso vive en `app/(app)/comprobantes/**` (UI) y
 * `lib/negocio.ts`/`lib/dominio/lotes-disponibles.ts` (funciones puras) y
 * `lib/data/lotes.ts` (lectura compartida).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { listarProductos as listarProductosCatalogo } from "@/lib/data/catalogos";
import { obtenerLotesConStock } from "@/lib/data/lotes";
import type { LoteConStockDeProducto } from "@/lib/dominio/lotes-disponibles";
import type { Database, Tables } from "@/lib/types";

type Supa = SupabaseClient<Database>;

export type Producto = Tables<"productos">;

// --- /comprobantes (lista) -------------------------------------------

export type ComprobanteListRow = Pick<
  Tables<"comprobantes">,
  "id" | "monto_centavos" | "medio_pago" | "imagen_path" | "fecha"
> & {
  vendedores: { nombre: string } | null;
  clientes: { nombre: string } | null;
  comprobante_items: { cantidad: number; productos: { presentacion_ml: number } | null }[];
};

const COLUMNAS_COMPROBANTE_LISTA =
  "id, monto_centavos, medio_pago, imagen_path, fecha, vendedores(nombre), clientes(nombre), comprobante_items(cantidad, productos(presentacion_ml))";

/** Lista de comprobantes para `/comprobantes`, más nuevos primero. */
export async function listarComprobantes(
  supabase: Supa,
): Promise<{ data: ComprobanteListRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("comprobantes")
    .select(COLUMNAS_COMPROBANTE_LISTA)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listarComprobantes", error);
    return { data: [], error: "No se pudo cargar la lista de comprobantes." };
  }
  // El embed anidado no tipa bien contra el jsonb que devuelve PostgREST —
  // el cast queda encerrado acá, no en la página (mismo criterio que
  // lib/data/gastos.ts).
  return { data: (data ?? []) as unknown as ComprobanteListRow[], error: null };
}

export type SaldoComprobanteRow = {
  comprobante_id: string | null;
  deuda_centavos: number | null;
};

/** Saldo de TODOS los comprobantes (sin filtro) — usado por `/comprobantes`
 * para armar el mapa `comprobante_id -> deuda_centavos` de la lista. */
export async function listarSaldosComprobantes(
  supabase: Supa,
): Promise<{ data: SaldoComprobanteRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("v_saldo_comprobante")
    .select("comprobante_id, deuda_centavos");

  if (error) {
    console.error("listarSaldosComprobantes", error);
    return { data: [], error: "No se pudo cargar el saldo de los comprobantes." };
  }
  return { data: data ?? [], error: null };
}

// --- /comprobantes/[id] (detalle) -------------------------------------

export type ComprobanteDetalleRow = Pick<
  Tables<"comprobantes">,
  "id" | "monto_centavos" | "cobrado_centavos" | "medio_pago" | "imagen_path" | "fecha" | "nota"
> & {
  vendedores: { nombre: string } | null;
  clientes: { id: string; nombre: string } | null;
  comprobante_items: {
    cantidad: number;
    productos: { nombre: string; presentacion_ml: number } | null;
    lotes_produccion: { fecha: string } | null;
  }[];
};

const COLUMNAS_COMPROBANTE_DETALLE =
  "id, monto_centavos, cobrado_centavos, medio_pago, imagen_path, fecha, nota, vendedores(nombre), clientes(id, nombre), comprobante_items(cantidad, productos(nombre, presentacion_ml), lotes_produccion(fecha))";

/** Un comprobante por id, con su detalle completo — usado por
 * `/comprobantes/[id]`. `null` si no existe o si la consulta falla. */
export async function obtenerComprobante(
  supabase: Supa,
  id: string,
): Promise<ComprobanteDetalleRow | null> {
  const { data, error } = await supabase
    .from("comprobantes")
    .select(COLUMNAS_COMPROBANTE_DETALLE)
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("obtenerComprobante", error);
  if (error || !data) return null;
  return data as unknown as ComprobanteDetalleRow;
}

export type SaldoComprobanteDetalle = {
  cobrado_total_centavos: number | null;
  deuda_centavos: number | null;
};

/** Cobrado total / deuda de UN comprobante puntual — usado por
 * `/comprobantes/[id]`. `null` si no hay fila o la consulta falla (la
 * página ya trata ambos casos igual: usa `monto_centavos`/`0` de default). */
export async function obtenerSaldoComprobante(
  supabase: Supa,
  id: string,
): Promise<SaldoComprobanteDetalle | null> {
  const { data, error } = await supabase
    .from("v_saldo_comprobante")
    .select("cobrado_total_centavos, deuda_centavos")
    .eq("comprobante_id", id)
    .maybeSingle();
  if (error) console.error("obtenerSaldoComprobante", error);
  return data ?? null;
}

export type CobroRow = Pick<
  Tables<"cobros">,
  "id" | "monto_centavos" | "medio_pago" | "fecha" | "nota"
>;

/** Cobros de UN comprobante, más nuevos primero — usado por
 * `/comprobantes/[id]`. */
export async function listarCobrosDeComprobante(
  supabase: Supa,
  comprobanteId: string,
): Promise<{ data: CobroRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("cobros")
    .select("id, monto_centavos, medio_pago, fecha, nota")
    .eq("comprobante_id", comprobanteId)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listarCobrosDeComprobante", error);
    return { data: [], error: "No se pudo cargar los cobros de este comprobante." };
  }
  return { data: data ?? [], error: null };
}

// --- /comprobantes/[id]/editar ------------------------------------------

export type ComprobanteEditarRow = Pick<
  Tables<"comprobantes">,
  | "id"
  | "monto_centavos"
  | "cobrado_centavos"
  | "medio_pago"
  | "imagen_path"
  | "fecha"
  | "nota"
  | "cliente_id"
  | "feria_id"
> & {
  comprobante_items: {
    producto_id: string;
    cantidad: number;
    lote_id: string | null;
    precio_unitario_centavos: number | null;
  }[];
};

const COLUMNAS_COMPROBANTE_EDITAR =
  "id, monto_centavos, cobrado_centavos, medio_pago, imagen_path, fecha, nota, cliente_id, feria_id, comprobante_items(producto_id, cantidad, lote_id, precio_unitario_centavos)";

/** Un comprobante por id, con los campos que necesita el formulario de
 * edición — usado por `/comprobantes/[id]/editar`. `null` si no existe o
 * si la consulta falla. */
export async function obtenerComprobanteParaEditar(
  supabase: Supa,
  id: string,
): Promise<ComprobanteEditarRow | null> {
  const { data, error } = await supabase
    .from("comprobantes")
    .select(COLUMNAS_COMPROBANTE_EDITAR)
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("obtenerComprobanteParaEditar", error);
  if (error || !data) return null;
  return data as unknown as ComprobanteEditarRow;
}

// --- /comprobantes/[id]/cobro --------------------------------------------

/** Deuda vigente de un comprobante puntual — usado por
 * `/comprobantes/[id]/cobro` para decidir si la pantalla tiene sentido
 * (404 si no hay nada que cobrar). `null` si no hay fila o falla. */
export async function obtenerDeudaComprobante(
  supabase: Supa,
  id: string,
): Promise<{ deuda_centavos: number | null } | null> {
  const { data, error } = await supabase
    .from("v_saldo_comprobante")
    .select("deuda_centavos")
    .eq("comprobante_id", id)
    .maybeSingle();
  if (error) console.error("obtenerDeudaComprobante", error);
  return data ?? null;
}

// --- ComprobanteForm: catálogos ------------------------------------------

export type CatalogosComprobante = {
  productos: Producto[];
  lotesConStock: LoteConStockDeProducto[];
};

/**
 * Catálogos independientes que necesita `ComprobanteForm` al montar
 * (productos + lotes con stock) — antes se cargaban en dos `useEffect`
 * separados; juntarlos en una sola tanda (`Promise.all`) evita dos
 * `createClient()`/round-trips sueltos para el mismo montaje. `productos`
 * es la misma consulta que usan Revendedores y Depósito/Stock →
 * `lib/data/catalogos.ts`.
 */
export async function cargarCatalogosComprobante(supabase: Supa): Promise<CatalogosComprobante> {
  const [{ data: productos }, lotesConStock] = await Promise.all([
    listarProductosCatalogo(supabase),
    obtenerLotesConStock(supabase),
  ]);

  return { productos: productos ?? [], lotesConStock };
}
