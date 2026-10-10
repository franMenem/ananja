/**
 * Lectura del desglose por lote de lo que una coordinadora tiene que pasar a
 * Ananja — capa `lib/data` (convención en `lib/data/README.md`). El cálculo
 * está en `lib/dominio/plata-por-lote.ts`; acá solo se traen los datos.
 *
 * Los conjuntos base son los mismos que usan `ventas_base`/`pagos_base` de la
 * vista `v_rendiciones_ananja` (0061): TODAS las ventas de cada revendedora
 * y TODAS sus rendiciones `via = 'encargado'` (de cualquier tenedor, porque
 * el FIFO es por revendedora). Consultas separadas + join en memoria (sin
 * embeds de PostgREST: `ventas_revendedor` y `entrega_items` ya tuvieron
 * problemas de FKs ambiguas, PGRST201). Cualquier error se propaga.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  calcularLineasPorLote,
  type LineaLote,
  type RendicionConParteAnanja,
  type VentaConLote,
} from "@/lib/dominio/plata-por-lote";
import { leerTodasLasPaginas } from "@/lib/paginado";
import type { Database } from "@/lib/types";

type Supa = SupabaseClient<Database>;

/** Ids por consulta `.in(...)` — con uuids de 36 caracteres la URL queda muy por debajo del límite. */
const TAMANO_LOTE_IDS = 100;

function orFail<T>(res: { data: T | null; error: { message: string } | null }, que: string): T {
  if (res.error) throw new Error(`cargarLineasPorLote: ${que}: ${res.error.message}`);
  return res.data as T;
}

function trozos<T>(items: T[], tamano: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) out.push(items.slice(i, i + tamano));
  return out;
}

/**
 * Líneas por lote (recibido / pasado / pendiente) de `tenedorId` — todas,
 * incluidas las que ya quedaron saldadas; `armarDesglose` (dominio) filtra y
 * cuadra contra el total de la pantalla. Devuelve `[]` si el tenedor no
 * recibió ninguna rendición `via = 'encargado'`.
 */
export async function cargarLineasPorLote(supabase: Supa, tenedorId: string): Promise<LineaLote[]> {
  // 1) Revendedoras cuyas rendiciones recibió este tenedor.
  const propias = orFail(
    await leerTodasLasPaginas((desde, hasta) =>
      supabase
        .from("rendiciones")
        .select("id, vendedor_id")
        .eq("via", "encargado")
        .eq("tenedor_id", tenedorId)
        .order("id")
        .range(desde, hasta),
    ),
    "rendiciones del tenedor",
  );
  const vendedorIds = [...new Set(propias.map((r) => r.vendedor_id))];
  if (vendedorIds.length === 0) return [];

  // 2) Todo lo demás en paralelo.
  const [ventasRes, rendicionesRes, partesRes, depositosRes, lotesRes] = await Promise.all([
    leerTodasLasPaginas((desde, hasta) =>
      supabase
        .from("ventas_revendedor")
        .select("id, vendedor_id, cantidad, precio_costo_centavos, lote_id, entrega_item_id")
        .in("vendedor_id", vendedorIds)
        .order("fecha")
        .order("created_at")
        .order("id")
        .range(desde, hasta),
    ),
    leerTodasLasPaginas((desde, hasta) =>
      supabase
        .from("rendiciones")
        .select("id, vendedor_id, tenedor_id, monto_centavos")
        .eq("via", "encargado")
        .in("vendedor_id", vendedorIds)
        .order("created_at")
        .order("id")
        .range(desde, hasta),
    ),
    leerTodasLasPaginas((desde, hasta) =>
      supabase
        .from("v_rendiciones_ananja")
        .select("rendicion_id, monto_ananja_centavos")
        .in("vendedor_id", vendedorIds)
        .order("rendicion_id")
        .range(desde, hasta),
    ),
    leerTodasLasPaginas((desde, hasta) =>
      supabase
        .from("depositos_cuenta")
        .select("monto_centavos")
        .eq("tenedor_id", tenedorId)
        .order("id")
        .range(desde, hasta),
    ),
    leerTodasLasPaginas((desde, hasta) =>
      supabase.from("lotes_produccion").select("id, fecha").order("id").range(desde, hasta),
    ),
  ]);
  const ventasDb = orFail(ventasRes, "ventas");
  const rendicionesDb = orFail(rendicionesRes, "rendiciones");
  const partesDb = orFail(partesRes, "v_rendiciones_ananja");
  const depositosDb = orFail(depositosRes, "depósitos");
  const lotesDb = orFail(lotesRes, "lotes");

  // 3) Costos y lote de las entregas de esas ventas (join en memoria).
  const entregaItemIds = [...new Set(ventasDb.map((v) => v.entrega_item_id).filter((id): id is string => !!id))];
  const itemsRes = await Promise.all(
    trozos(entregaItemIds, TAMANO_LOTE_IDS).map((ids) =>
      supabase
        .from("entrega_items")
        .select("id, lote_id, costo_lote_unitario_centavos, costo_ananja_unitario_centavos")
        .in("id", ids),
    ),
  );
  const itemPorId = new Map(itemsRes.flatMap((res) => orFail(res, "entrega_items")).map((i) => [i.id, i]));

  const ventas: VentaConLote[] = ventasDb.map((v) => {
    const item = v.entrega_item_id ? itemPorId.get(v.entrega_item_id) : undefined;
    return {
      vendedorId: v.vendedor_id,
      cantidad: v.cantidad,
      precioCostoCentavos: v.precio_costo_centavos,
      // Misma cadena que `ventas_base` de la vista (0061).
      costoAnanjaCentavos:
        item?.costo_lote_unitario_centavos ?? item?.costo_ananja_unitario_centavos ?? v.precio_costo_centavos,
      loteId: v.lote_id ?? item?.lote_id ?? null,
    };
  });

  // Si por algo una rendición no figura en la vista, su parte queda en 0 y
  // el desglose lo muestra como diferencia ("Otros movimientos").
  const parteAnanjaPorId = new Map(partesDb.map((p) => [p.rendicion_id, p.monto_ananja_centavos]));
  const rendiciones: RendicionConParteAnanja[] = rendicionesDb.map((r) => ({
    id: r.id,
    // `rendiciones.tenedor_id` es nullable en la tabla; una sin tenedor
    // entra al FIFO igual (como en la vista) pero no cuenta para nadie.
    tenedorId: r.tenedor_id ?? "",
    vendedorId: r.vendedor_id,
    montoCentavos: r.monto_centavos,
    montoAnanjaCentavos: parteAnanjaPorId.get(r.id) ?? 0,
  }));

  return calcularLineasPorLote({
    tenedorId,
    ventas,
    rendiciones,
    depositosCentavos: depositosDb.reduce((acc, d) => acc + d.monto_centavos, 0),
    lotes: lotesDb,
  });
}
