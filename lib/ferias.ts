/**
 * Feria de revendedoras — llamadas desde el cliente a las funciones de la
 * migración 0078. Cada wrapper devuelve el `{data, error}` crudo del RPC (mismo
 * criterio que `lib/revendedores.ts`); el error se traduce con
 * `mensajeErrorFeria` (`lib/dominio/feria.ts`).
 *
 * Los parámetros que aceptan `null` en la base (`p_lugar`, `p_nota`,
 * `p_vendedor_id`) no tienen `default`, así que el generador de tipos los
 * pone como `string` a secas (no modela la nulabilidad de los argumentos):
 * por eso la aserción de `sinValor`, igual que `p_imagen_path` en
 * `use-guardar-comprobante.ts`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types";

type Supa = SupabaseClient<Database>;

/** `null` tipado como `string` para argumentos que la base acepta nulos. */
function sinValor(valor: string | null | undefined): string {
  return (valor == null || valor === "" ? null : valor) as string;
}

export type PrecioFeria = { productoId: string; precioCentavos: number };
export type CantidadFeria = { productoId: string; cantidad: number };

function precios(lista: PrecioFeria[]) {
  return lista.map((p) => ({ producto_id: p.productoId, precio_centavos: p.precioCentavos }));
}

function cantidades(lista: CantidadFeria[]) {
  return lista.filter((c) => c.cantidad > 0).map((c) => ({ producto_id: c.productoId, cantidad: c.cantidad }));
}

export type DatosFeria = {
  nombre: string;
  lugar: string | null;
  fecha: string;
  nota: string | null;
  precios: PrecioFeria[];
};

/** `feria_crear` -> `{ feria_id }`. Solo admin. */
export async function feriaCrear(supabase: Supa, datos: DatosFeria) {
  return supabase.rpc("feria_crear", {
    p_nombre: datos.nombre,
    p_lugar: sinValor(datos.lugar),
    p_fecha: datos.fecha,
    p_nota: sinValor(datos.nota),
    p_precios: precios(datos.precios),
  });
}

/** `feria_editar` -> `{ feria_id }`. Solo admin, solo con la feria abierta. */
export async function feriaEditar(supabase: Supa, feriaId: string, datos: DatosFeria) {
  return supabase.rpc("feria_editar", {
    p_feria_id: feriaId,
    p_nombre: datos.nombre,
    p_lugar: sinValor(datos.lugar),
    p_fecha: datos.fecha,
    p_nota: sinValor(datos.nota),
    p_precios: precios(datos.precios),
  });
}

export async function feriaAgregarParticipante(supabase: Supa, feriaId: string, vendedorId: string) {
  return supabase.rpc("feria_agregar_participante", { p_feria_id: feriaId, p_vendedor_id: vendedorId });
}

export async function feriaQuitarParticipante(supabase: Supa, feriaId: string, vendedorId: string) {
  return supabase.rpc("feria_quitar_participante", { p_feria_id: feriaId, p_vendedor_id: vendedorId });
}

export async function feriaCerrar(supabase: Supa, feriaId: string) {
  return supabase.rpc("feria_cerrar", { p_feria_id: feriaId });
}

export async function feriaReabrir(supabase: Supa, feriaId: string) {
  return supabase.rpc("feria_reabrir", { p_feria_id: feriaId });
}

export type CierreParticipacionArgs = {
  feriaId: string;
  /** `null` = la persona logueada. */
  vendedorId: string | null;
  fecha: string;
  devueltas: CantidadFeria[];
  degustadas: CantidadFeria[];
  /** Precios corregidos por ella; los demás usan el de la feria. */
  precios: PrecioFeria[];
  efectivoCentavos: number;
  mercadoPagoCentavos: number;
  bancoCentavos: number;
  nota: string | null;
};

/** Respuesta de `feria_cerrar_participacion`. */
export type ResultadoCierreParticipacion = {
  /** Solo las ventas NUEVAS de este cierre (sin las `ya_vendidas`). */
  vendidas: { producto_id: string; cantidad: number; precio_centavos: number }[];
  /** Botellas de la feria que ya había vendido por el flujo normal. */
  ya_vendidas: number;
  /** Total de las ventas nuevas. */
  total_centavos: number;
  /** Plata juntada (efectivo + MP + banco) - `total_centavos`. Informativo. */
  diferencia_centavos: number;
  devolucion_id: string | null;
};

/** `feria_cerrar_participacion`: registra devolución, degustación y ventas, y
 * cierra la parte de la participante. */
export async function feriaCerrarParticipacion(supabase: Supa, args: CierreParticipacionArgs) {
  return supabase.rpc("feria_cerrar_participacion", {
    p_feria_id: args.feriaId,
    p_vendedor_id: sinValor(args.vendedorId),
    p_fecha: args.fecha,
    p_devueltas: cantidades(args.devueltas),
    p_degustadas: cantidades(args.degustadas),
    p_precios: precios(args.precios),
    p_efectivo_centavos: args.efectivoCentavos,
    p_mercado_pago_centavos: args.mercadoPagoCentavos,
    p_banco_centavos: args.bancoCentavos,
    p_nota: sinValor(args.nota),
  });
}

/** Solo admin, con la feria abierta. DESHACE el cierre completo (ventas,
 * degustaciones y devolución) y deja a la persona pendiente. Falla
 * `STOCK_REVENDEDOR_INSUFICIENTE` si quedaría con stock negativo. */
export async function feriaReabrirParticipacion(supabase: Supa, feriaId: string, vendedorId: string) {
  return supabase.rpc("feria_reabrir_participacion", { p_feria_id: feriaId, p_vendedor_id: vendedorId });
}
