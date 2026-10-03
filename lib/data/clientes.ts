/**
 * Lecturas de Clientes — capa `lib/data` (convención en
 * `lib/data/README.md`, referencia en `lib/data/gastos.ts`). Nada de JSX ni
 * agregación acá: eso vive en `app/(app)/clientes/**` (UI).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Tables } from "@/lib/types";

type Supa = SupabaseClient<Database>;

export type Cliente = Tables<"clientes">;

// --- /clientes (lista) --------------------------------------------------

export type ClienteActivoRow = Pick<Cliente, "id" | "nombre" | "telefono">;

/** Clientes activos, sin historial — usado por `/clientes` para armar la
 * lista (el total comprado y la deuda se agregan aparte). */
export async function listarClientesActivos(
  supabase: Supa,
): Promise<{ data: ClienteActivoRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("clientes")
    .select("id, nombre, telefono")
    .eq("activo", true);

  if (error) {
    console.error("listarClientesActivos", error);
    return { data: [], error: "No se pudo cargar la lista de clientes." };
  }
  return { data: data ?? [], error: null };
}

export type ComprobanteClienteAgregado = {
  cliente_id: string | null;
  monto_centavos: number;
  fecha: string;
};

/** Comprobantes de TODOS los clientes (columnas mínimas) — usado por
 * `/clientes` para agregar total comprado y última compra por cliente. */
export async function listarComprobantesConCliente(
  supabase: Supa,
): Promise<{ data: ComprobanteClienteAgregado[]; error: string | null }> {
  const { data, error } = await supabase
    .from("comprobantes")
    .select("cliente_id, monto_centavos, fecha")
    .not("cliente_id", "is", null);

  if (error) {
    console.error("listarComprobantesConCliente", error);
    return { data: [], error: "No se pudo cargar las compras de los clientes." };
  }
  return { data: data ?? [], error: null };
}

export type DeudaClienteRow = {
  cliente_id: string | null;
  deuda_centavos: number | null;
};

/** Deuda de TODOS los clientes — usado por `/clientes` para el badge
 * "Debe $X" de cada fila. */
export async function listarDeudaClientes(
  supabase: Supa,
): Promise<{ data: DeudaClienteRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("v_deuda_cliente")
    .select("cliente_id, deuda_centavos");

  if (error) {
    console.error("listarDeudaClientes", error);
    return { data: [], error: "No se pudo cargar la deuda de los clientes." };
  }
  return { data: data ?? [], error: null };
}

// --- /clientes/[id] y /clientes/[id]/editar ------------------------------

/** Un cliente por id, con todos sus campos — usado por `/clientes/[id]`
 * (ficha) y `/clientes/[id]/editar` (el segundo ignora `activo`). `null` si
 * no existe o la consulta falla. */
export async function obtenerCliente(supabase: Supa, id: string): Promise<Cliente | null> {
  const { data, error } = await supabase
    .from("clientes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("obtenerCliente", error);
  return data ?? null;
}

export type ComprobanteDeClienteRow = {
  id: string;
  monto_centavos: number;
  medio_pago: Database["public"]["Enums"]["medio_pago"];
  fecha: string;
  vendedores: { nombre: string } | null;
  comprobante_items: { cantidad: number; productos: { presentacion_ml: number } | null }[];
};

const COLUMNAS_COMPROBANTE_DE_CLIENTE =
  "id, monto_centavos, medio_pago, fecha, vendedores(nombre), comprobante_items(cantidad, productos(presentacion_ml))";

/** Historial de compras de UN cliente, más nuevas primero — usado por
 * `/clientes/[id]`. */
export async function listarComprobantesDeCliente(
  supabase: Supa,
  clienteId: string,
): Promise<{ data: ComprobanteDeClienteRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("comprobantes")
    .select(COLUMNAS_COMPROBANTE_DE_CLIENTE)
    .eq("cliente_id", clienteId)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listarComprobantesDeCliente", error);
    return { data: [], error: "No se pudo cargar el historial de compras." };
  }
  // El embed anidado no tipa bien contra el jsonb que devuelve PostgREST —
  // el cast queda encerrado acá, no en la página (mismo criterio que
  // lib/data/gastos.ts).
  return { data: (data ?? []) as unknown as ComprobanteDeClienteRow[], error: null };
}

export type ResumenDeudaCliente = {
  vendido_centavos: number | null;
  cobrado_centavos: number | null;
  deuda_centavos: number | null;
};

/** Vendido/Cobrado/Debe agregado de UN cliente — usado por
 * `/clientes/[id]`. `null` si no hay fila (sin compras) o la consulta
 * falla; la página ya trata ambos casos como "todo en 0". */
export async function obtenerResumenDeudaCliente(
  supabase: Supa,
  clienteId: string,
): Promise<ResumenDeudaCliente | null> {
  const { data, error } = await supabase
    .from("v_deuda_cliente")
    .select("vendido_centavos, cobrado_centavos, deuda_centavos")
    .eq("cliente_id", clienteId)
    .maybeSingle();
  if (error) console.error("obtenerResumenDeudaCliente", error);
  return data ?? null;
}

/** Saldo de una lista puntual de comprobantes (las ventas de un cliente) —
 * usado por `/clientes/[id]` para marcar "Debe $X" en cada venta. Lista
 * vacía sin ninguna consulta si `comprobanteIds` viene vacío (cliente sin
 * compras). */
export async function listarSaldosDeComprobantes(
  supabase: Supa,
  comprobanteIds: string[],
): Promise<{ data: SaldoComprobanteRow[]; error: string | null }> {
  if (comprobanteIds.length === 0) return { data: [], error: null };

  const { data, error } = await supabase
    .from("v_saldo_comprobante")
    .select("comprobante_id, deuda_centavos")
    .in("comprobante_id", comprobanteIds);

  if (error) {
    console.error("listarSaldosDeComprobantes", error);
    return { data: [], error: "No se pudo cargar el saldo de las ventas." };
  }
  return { data: data ?? [], error: null };
}

export type SaldoComprobanteRow = {
  comprobante_id: string | null;
  deuda_centavos: number | null;
};

export type CobroDeClienteRow = {
  id: string;
  comprobante_id: string | null;
  monto_centavos: number;
  medio_pago: Database["public"]["Enums"]["medio_pago"];
  fecha: string;
  nota: string | null;
};

/** Cobros de una lista puntual de comprobantes (las ventas de un cliente),
 * más nuevos primero — usado por `/clientes/[id]`. Lista vacía sin
 * consulta si `comprobanteIds` viene vacío. */
export async function listarCobrosDeComprobantes(
  supabase: Supa,
  comprobanteIds: string[],
): Promise<{ data: CobroDeClienteRow[]; error: string | null }> {
  if (comprobanteIds.length === 0) return { data: [], error: null };

  const { data, error } = await supabase
    .from("cobros")
    .select("id, comprobante_id, monto_centavos, medio_pago, fecha, nota")
    .in("comprobante_id", comprobanteIds)
    .order("fecha", { ascending: false });

  if (error) {
    console.error("listarCobrosDeComprobantes", error);
    return { data: [], error: "No se pudo cargar los cobros de este cliente." };
  }
  return { data: data ?? [], error: null };
}

// --- ClienteSelect (componente compartido) -------------------------------

/** Clientes activos, todas las columnas — usado por `ClienteSelect` (el
 * picker del formulario de comprobante), que a diferencia de
 * `listarClientesActivos` necesita el objeto completo para poder mostrarlo
 * ya elegido sin otra consulta. */
export async function listarClientesActivosCompletos(
  supabase: Supa,
): Promise<{ data: Cliente[]; error: string | null }> {
  const { data, error } = await supabase
    .from("clientes")
    .select("*")
    .eq("activo", true)
    .order("nombre", { ascending: true });

  if (error) {
    console.error("listarClientesActivosCompletos", error);
    return { data: [], error: "No se pudo cargar la lista de clientes." };
  }
  return { data: data ?? [], error: null };
}
