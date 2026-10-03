import type { SupabaseClient } from "@supabase/supabase-js";

import type { TipoInsumo, UnidadInsumo } from "@/lib/dominio/insumos";
import type { Database } from "@/lib/types";

// Los tipos (`StockInsumo`, `Insumo`, etc.), las funciones puras
// (`agruparPorTipo`, `formatCantidadConUnidad`, `elegirUltimasComprasPorInsumo`,
// etc.) viven en `lib/dominio/insumos.ts`; las lecturas
// (`listarStockInsumos`, `obtenerInsumo`, `listarInsumosActivos`,
// `obtenerUltimasComprasInsumos`, `listarRecetas`) en `lib/data/insumos.ts`.
// Este archivo se queda solo con las escrituras (RPC de alta/ajuste).

/** Actualiza `umbral_minimo` (edición inline en `/stock/insumos/[id]`,
 * mismo patrón que `components/stock/stock-card.tsx`) — RLS solo permite
 * tocar `nombre`/`umbral_minimo`/`activo`. */
export async function actualizarUmbralInsumo(
  supabase: SupabaseClient<Database>,
  id: string,
  umbralMinimo: number,
) {
  return supabase.from("insumos").update({ umbral_minimo: umbralMinimo }).eq("id", id);
}

export type RegistrarCompraFacturaArgs = {
  fecha: string;
  medioPago: "banco" | "mercado_pago" | "efectivo";
  lineas: { insumoId: string; cantidad: number; precioUnitarioCentavos: number }[];
  preciosSinIva: boolean;
  ivaPct: number;
  envioCentavos: number;
  /** Proveedor / nota de la factura — va al principio de la nota de cada
   * gasto ("Factura Imprenta Ejemplo S.A. · …"). */
  nota: string | null;
  imagenPath: string | null;
  /** Total que mostró "Revisá la factura" (`calcularFacturaInsumos`); si la
   * base calcula otro, no guarda nada (`TOTAL_NO_COINCIDE`). */
  totalEsperadoCentavos: number;
};

/** Alta de una factura con varias líneas vía RPC
 * `registrar_compra_insumos_factura`: un gasto + un ingreso de insumo por
 * línea, con IVA y envío repartidos (espejo en `lib/dominio/factura-insumos.ts`),
 * todo en una transacción. */
export async function registrarCompraFactura(
  supabase: SupabaseClient<Database>,
  args: RegistrarCompraFacturaArgs,
) {
  return supabase.rpc("registrar_compra_insumos_factura", {
    p_fecha: args.fecha,
    p_medio_pago: args.medioPago,
    p_lineas: args.lineas.map((l) => ({
      insumo_id: l.insumoId,
      cantidad: l.cantidad,
      precio_unitario_centavos: l.precioUnitarioCentavos,
    })),
    p_precios_sin_iva: args.preciosSinIva,
    p_iva_pct: args.ivaPct,
    p_envio_centavos: args.envioCentavos,
    p_nota: args.nota ?? undefined,
    p_imagen_path: args.imagenPath ?? undefined,
    p_total_esperado_centavos: args.totalEsperadoCentavos,
  });
}

export type AjustarInsumoArgs = {
  insumoId: string;
  /** Con signo: positivo = ingreso, negativo = egreso. */
  cantidad: number;
  nota: string;
};

/** Ajuste manual vía RPC `ajustar_insumo` (sin costo asociado). */
export async function ajustarInsumo(
  supabase: SupabaseClient<Database>,
  args: AjustarInsumoArgs,
) {
  return supabase.rpc("ajustar_insumo", {
    p_insumo_id: args.insumoId,
    p_cantidad: args.cantidad,
    p_nota: args.nota,
  });
}

export type CrearInsumoArgs = {
  nombre: string;
  tipo: TipoInsumo;
  unidad: UnidadInsumo;
  umbralMinimo: number;
};

/** Alta de un insumo nuevo vía RPC `crear_insumo`. */
export async function crearInsumo(
  supabase: SupabaseClient<Database>,
  args: CrearInsumoArgs,
) {
  return supabase.rpc("crear_insumo", {
    p_nombre: args.nombre,
    p_tipo: args.tipo,
    p_unidad: args.unidad,
    p_umbral_minimo: args.umbralMinimo,
  });
}
