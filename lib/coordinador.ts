import type { SupabaseClient } from "@supabase/supabase-js";

import {
  armarRevendedorasCoordinador,
  mapearLotesDisponibles,
  type ItemEntregaCoordinador,
  type RevendedoraCoordinador,
} from "@/lib/dominio/coordinador";
import type { LoteConStock } from "@/lib/dominio/lotes-split";
import type { Database } from "@/lib/types";

/**
 * Lecturas/escrituras del coordinador (`0055_coordinador.sql`): reparte
 * botellas a un grupo de revendedoras y les cobra por Ananja, pero no es
 * una revendedora (sin stock propio, no vende) ni carga ventas/pagos —
 * "solo mirar y entregar" (pedido de Fran). Consumido por
 * `app/(mi)/mi/page.tsx` (rama coordinador) y
 * `components/mi/coordinador-home.tsx`.
 *
 * Las funciones puras (`armarRevendedorasCoordinador`,
 * `mapearLotesDisponibles`, `armarItemsEntregaCoordinador`,
 * `ERRORES_ENTREGA_COORDINADOR`, `totalDisponible`,
 * `formatDisponiblePorPresentacion`) viven en `lib/dominio/coordinador.ts`.
 */

/**
 * Revendedoras a cargo del coordinador logueado (`vendedores.encargado_id
 * = coordinadorId`), con cuánto tienen en su poder y cuánto deben. La RLS
 * ampliada de 0055 (`es_coordinador_de`) ya garantiza que un coordinador
 * solo puede leer estas filas — el `.eq("encargado_id", ...)` de acá es
 * un filtro explícito, mismo criterio que el resto de `lib/revendedores.ts`
 * (nunca confiar solo en la RLS para armar la consulta). El armado en sí
 * es `armarRevendedorasCoordinador`, pura.
 */
export async function listarMisRevendedoras(
  supabase: SupabaseClient<Database>,
  coordinadorId: string,
): Promise<{ data: RevendedoraCoordinador[]; error: string | null }> {
  const { data: revendedoras, error } = await supabase
    .from("vendedores")
    .select("id, nombre")
    .eq("encargado_id", coordinadorId)
    .eq("activo", true)
    .order("nombre");

  if (error) {
    console.error("listarMisRevendedoras", error);
    return { data: [], error: "No se pudo cargar la lista de revendedoras." };
  }

  const ids = (revendedoras ?? []).map((r) => r.id);
  if (ids.length === 0) return { data: [], error: null };

  const [{ data: stock }, { data: deudas }, { data: valorStock }] = await Promise.all([
    supabase.from("v_stock_revendedor").select("vendedor_id, en_poder").in("vendedor_id", ids),
    supabase.from("v_deuda_vendedor").select("vendedor_id, saldo_centavos").in("vendedor_id", ids),
    // "Valor en poder" (0059): al precio DEL COORDINADOR (lo que le
    // cobra), no `valor_en_poder_ananja_centavos` — acá inlaura lo que
    // sus revendedoras le deben A ÉL, no lo que Ananja tiene en juego.
    supabase.from("v_valor_stock_revendedor").select("vendedor_id, valor_en_poder_centavos").in("vendedor_id", ids),
  ]);

  return {
    data: armarRevendedorasCoordinador(revendedoras ?? [], stock ?? [], deudas ?? [], valorStock ?? []),
    error: null,
  };
}

/**
 * Stock por lote de UN producto, SIN costos — RPC
 * `lotes_disponibles_coordinador` (0055), gateada a `es_coordinador()`. Es
 * el insumo de `repartirCantidadEntreLotes` (`lib/dominio/lotes-split.ts`):
 * el coordinador nunca ve el costo de un lote, solo cuánto queda y desde
 * cuándo, lo mínimo para poder repartir "más viejo primero" igual que un
 * admin. El armado del resultado (y el manejo de error) es
 * `mapearLotesDisponibles`, pura.
 */
export async function listarLotesDisponiblesCoordinador(
  supabase: SupabaseClient<Database>,
  productoId: string,
): Promise<{ data: LoteConStock[]; error: string | null }> {
  const { data, error } = await supabase.rpc("lotes_disponibles_coordinador", { p_producto_id: productoId });
  if (error) {
    console.error("listarLotesDisponiblesCoordinador", error);
  }
  return mapearLotesDisponibles(data, error);
}

/**
 * Entrega botellas a UNA revendedora a cargo del coordinador logueado —
 * RPC `registrar_entrega_revendedor` (ampliado en 0055): el coordinador
 * nunca fija el costo a mano (se congela siempre desde el costo Ananja
 * vigente, redondeado incluido por 0054); `items` ya viene repartido por
 * lote (`armarItemsEntregaCoordinador`). Devuelve el `{data, error}`
 * crudo; el error se traduce con `ERRORES_ENTREGA_COORDINADOR`.
 */
export async function entregarComoCoordinador(
  supabase: SupabaseClient<Database>,
  args: { vendedorId: string; fecha: string; nota: string | null; items: ItemEntregaCoordinador[] },
) {
  return supabase.rpc("registrar_entrega_revendedor", {
    p_vendedor_id: args.vendedorId,
    p_tipo: "entrega",
    p_fecha: args.fecha,
    p_nota: args.nota ?? undefined,
    p_items: args.items.map((i) => ({ producto_id: i.productoId, lote_id: i.loteId, cantidad: i.cantidad })),
    p_permitir_negativo: false,
  });
}

/**
 * "La coordinadora vendió N botellas" — RPC `registrar_venta_coordinador`
 * (0073). Lo llama un admin para cualquier coordinadora o la propia
 * coordinadora para sí misma. Es de UN lote y NO es idempotente: quien la use
 * protege el botón contra el doble envío. Devuelve el `{data, error}` crudo;
 * el error se traduce con `mensajeErrorVentaCoordinador`.
 */
export async function registrarVentaCoordinador(
  supabase: SupabaseClient<Database>,
  args: {
    coordinadorId: string;
    productoId: string;
    cantidad: number;
    loteId: string;
    fecha: string;
    nota: string | null;
  },
) {
  return supabase.rpc("registrar_venta_coordinador", {
    p_coordinador_id: args.coordinadorId,
    p_producto_id: args.productoId,
    p_cantidad: args.cantidad,
    p_lote_id: args.loteId,
    p_fecha: args.fecha,
    p_nota: args.nota ?? undefined,
  });
}
