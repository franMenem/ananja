/**
 * Lectura de "cuántas botellas se le deben a Ananja" — capa `lib/data`
 * (convención en `lib/data/README.md`). El cálculo está en
 * `lib/dominio/botellas-adeudadas.ts` (ver ahí qué es cada estado); acá solo
 * se traen los datos y se pasan a las funciones puras.
 *
 * Consultas separadas + join en memoria (sin embeds implícitos de
 * PostgREST: `ventas_revendedor` y `entrega_items` ya tuvieron problemas de
 * FKs ambiguas, PGRST201), con `leerTodasLasPaginas` y los ids en trozos de
 * 100 para `.in(...)`. Cualquier error se propaga: la página lo atrapa y
 * muestra "No se pudo calcular." en el bloque, sin romper el resto.
 *
 * Solo lectura. Reusa de las otras pantallas: el stock en poder
 * (`stockRevendedorasPorLote`, espejo de `stock_revendedor_por_entrega`) y
 * las mismas fuentes que `cargarLineasPorLote` (`v_rendiciones_ananja`,
 * depósitos, ventas) — acá abiertas para varias personas a la vez.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { listarProductos } from "@/lib/data/catalogos";
import {
  armarResumenBotellas,
  calcularSinPagar,
  calcularSinPasar,
  filasEnPoder,
  type FilaBotellas,
  type ProductoRef,
  type ResumenBotellas,
  type VentaBotellas,
} from "@/lib/dominio/botellas-adeudadas";
import type { EntregaItemVendedor, VentaVendedor } from "@/lib/dominio/lote-en-manos";
import { stockRevendedorasPorLote } from "@/lib/dominio/lote-en-manos";
import type { RendicionConParteAnanja } from "@/lib/dominio/plata-por-lote";
import { leerTodasLasPaginas } from "@/lib/paginado";
import type { Database } from "@/lib/types";

type Supa = SupabaseClient<Database>;

/** Ids por consulta `.in(...)` — con uuids de 36 caracteres la URL queda muy por debajo del límite. */
const TAMANO_LOTE_IDS = 100;

/**
 * Qué personas se calculan:
 *  - `todo`: todas las revendedoras y todas las coordinadoras (listado).
 *  - `coordinadora`: A y B de las revendedoras que tiene a cargo + su propio C.
 *  - `revendedora`: A y B de una sola revendedora (C no se atribuye a ella).
 */
export type AlcanceBotellas =
  | { tipo: "todo" }
  | { tipo: "coordinadora"; coordinadoraId: string; revendedoraIds: string[] }
  | { tipo: "revendedora"; vendedorId: string };

function orFail<T>(res: { data: T | null; error: { message: string } | null }, que: string): T {
  if (res.error) throw new Error(`cargarBotellasAdeudadas: ${que}: ${res.error.message}`);
  return res.data as T;
}

function trozos<T>(items: T[], tamano: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) out.push(items.slice(i, i + tamano));
  return out;
}

type Consulta<T> = (
  ids: string[] | null,
  desde: number,
  hasta: number,
) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Lee todas las páginas de `consulta`; si `ids` es una lista, la parte en trozos (`null`: sin filtro). */
async function leer<T>(ids: string[] | null, que: string, consulta: Consulta<T>): Promise<T[]> {
  const grupos: (string[] | null)[] = ids === null ? [null] : trozos(ids, TAMANO_LOTE_IDS);
  const partes = await Promise.all(
    grupos.map(async (grupo) =>
      orFail(await leerTodasLasPaginas<T>((desde, hasta) => consulta(grupo, desde, hasta)), que),
    ),
  );
  return partes.flat();
}

/**
 * Botellas que se le deben a Ananja, abiertas por estado, producto, lote y
 * persona, para el `alcance` pedido. Lanza si falla cualquier lectura.
 */
export async function cargarBotellasAdeudadas(supabase: Supa, alcance: AlcanceBotellas): Promise<ResumenBotellas> {
  // 1) Catálogos chicos (productos, personas, lotes) y, para una coordinadora,
  //    las revendedoras cuyas rendiciones recibió (su C las necesita aunque ya
  //    no las tenga a cargo).
  const [productosRes, vendedores, lotes, vendedoresDeSuC] = await Promise.all([
    listarProductos(supabase),
    leer(null, "vendedores", (_ids, desde, hasta) =>
      supabase.from("vendedores").select("id, nombre, rol").order("id").range(desde, hasta),
    ),
    leer(null, "lotes", (_ids, desde, hasta) =>
      supabase.from("lotes_produccion").select("id, fecha").order("id").range(desde, hasta),
    ),
    alcance.tipo === "coordinadora"
      ? leer(null, "rendiciones de la coordinadora", (_ids, desde, hasta) =>
          supabase
            .from("rendiciones")
            .select("vendedor_id")
            .eq("via", "encargado")
            .eq("tenedor_id", alcance.coordinadoraId)
            .order("id")
            .range(desde, hasta),
        )
      : Promise.resolve([] as { vendedor_id: string }[]),
  ]);
  if (productosRes.error) throw new Error(`cargarBotellasAdeudadas: productos: ${productosRes.error}`);
  const productos: ProductoRef[] = productosRes.data.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    presentacionMl: p.presentacion_ml ?? 0,
  }));

  // 2) Quiénes entran. `null` = todos.
  let idsAB: string[] | null; // revendedoras de las que se muestran A y B
  let idsVentas: string[] | null; // revendedoras de las que se leen ventas/rendiciones (A, B y el recorrido de C)
  let coordinadoraIds: string[];
  if (alcance.tipo === "todo") {
    idsAB = null;
    idsVentas = null;
    coordinadoraIds = vendedores.filter((v) => v.rol === "coordinador").map((v) => v.id);
  } else if (alcance.tipo === "coordinadora") {
    idsAB = alcance.revendedoraIds;
    idsVentas = [...new Set([...alcance.revendedoraIds, ...vendedoresDeSuC.map((r) => r.vendedor_id)])];
    coordinadoraIds = [alcance.coordinadoraId];
  } else {
    idsAB = [alcance.vendedorId];
    idsVentas = [alcance.vendedorId];
    coordinadoraIds = [];
  }

  const nombres = new Map(vendedores.map((v) => [v.id, v.nombre]));
  const armar = (filas: FilaBotellas[], sinBotella: { coordinadoraId: string; centavos: number }[]) =>
    armarResumenBotellas({
      filas,
      sinBotella,
      productos,
      nombres,
      coordinadoraIds: new Set(coordinadoraIds),
      lotes,
    });
  if (idsVentas !== null && idsVentas.length === 0 && coordinadoraIds.length === 0) return armar([], []);

  // 3) Ventas, rendiciones, entregas y lo de la plata de las coordinadoras.
  const [ventasDb, rendicionesDb, entregasDb, partesDb, depositosDb, totalesDb] = await Promise.all([
    leer(idsVentas, "ventas", (ids, desde, hasta) => {
      const base = supabase
        .from("ventas_revendedor")
        .select("id, vendedor_id, producto_id, cantidad, precio_costo_centavos, lote_id, entrega_item_id");
      return (ids ? base.in("vendedor_id", ids) : base)
        .order("fecha")
        .order("created_at")
        .order("id")
        .range(desde, hasta);
    }),
    leer(idsVentas, "rendiciones", (ids, desde, hasta) => {
      const base = supabase.from("rendiciones").select("id, vendedor_id, tenedor_id, monto_centavos, via");
      return (ids ? base.in("vendedor_id", ids) : base).order("created_at").order("id").range(desde, hasta);
    }),
    leer(idsVentas, "entregas", (ids, desde, hasta) => {
      const base = supabase.from("entregas_revendedor").select("id, vendedor_id, tipo, fecha, created_at");
      return (ids ? base.in("vendedor_id", ids) : base).order("id").range(desde, hasta);
    }),
    coordinadoraIds.length === 0
      ? Promise.resolve([] as { rendicion_id: string | null; monto_ananja_centavos: number | null }[])
      : leer(idsVentas, "v_rendiciones_ananja", (ids, desde, hasta) => {
          const base = supabase.from("v_rendiciones_ananja").select("rendicion_id, monto_ananja_centavos");
          return (ids ? base.in("vendedor_id", ids) : base).order("rendicion_id").range(desde, hasta);
        }),
    coordinadoraIds.length === 0
      ? Promise.resolve([] as { tenedor_id: string; monto_centavos: number }[])
      : leer(coordinadoraIds, "depósitos", (ids, desde, hasta) =>
          supabase
            .from("depositos_cuenta")
            .select("tenedor_id, monto_centavos")
            .in("tenedor_id", ids ?? [])
            .order("id")
            .range(desde, hasta),
        ),
    coordinadoraIds.length === 0
      ? Promise.resolve([] as { tenedor_id: string | null; total_centavos: number | null }[])
      : leer(coordinadoraIds, "v_plata_en_manos", (ids, desde, hasta) =>
          supabase
            .from("v_plata_en_manos")
            .select("tenedor_id, total_centavos")
            .in("tenedor_id", ids ?? [])
            .order("tenedor_id")
            .range(desde, hasta),
        ),
  ]);

  // 4) Ítems de esas entregas (lote, costos, producto).
  const itemsDb = await leer(
    entregasDb.map((e) => e.id),
    "entrega_items",
    (ids, desde, hasta) =>
      supabase
        .from("entrega_items")
        .select(
          "id, entrega_id, producto_id, lote_id, cantidad, costo_lote_unitario_centavos, costo_ananja_unitario_centavos, precio_sugerido_centavos",
        )
        .in("entrega_id", ids ?? [])
        .order("id")
        .range(desde, hasta),
  );
  const itemPorId = new Map(itemsDb.map((i) => [i.id, i]));
  const entregaPorId = new Map(entregasDb.map((e) => [e.id, e]));

  // A. En poder.
  const itemsFifo: EntregaItemVendedor[] = itemsDb.flatMap((i) => {
    const entrega = entregaPorId.get(i.entrega_id);
    if (!entrega) return [];
    return [
      {
        id: i.id,
        vendedorId: entrega.vendedor_id,
        entregaId: i.entrega_id,
        tipo: entrega.tipo === "devolucion" ? ("devolucion" as const) : ("entrega" as const),
        fecha: entrega.fecha,
        createdAt: entrega.created_at,
        productoId: i.producto_id,
        loteId: i.lote_id,
        cantidad: i.cantidad,
        costoAnanjaUnitarioCentavos: i.costo_ananja_unitario_centavos,
        precioSugeridoCentavos: i.precio_sugerido_centavos,
      },
    ];
  });
  const ventasStock: VentaVendedor[] = ventasDb.map((v) => ({
    vendedorId: v.vendedor_id,
    productoId: v.producto_id,
    cantidad: v.cantidad,
    entregaItemId: v.entrega_item_id,
  }));
  const filasA = filasEnPoder(stockRevendedorasPorLote(itemsFifo, ventasStock));

  // B. Vendidas sin pagar. La misma cadena de costo y lote que `ventas_base` de la vista (0061).
  const ventas: VentaBotellas[] = ventasDb.map((v) => {
    const item = v.entrega_item_id ? itemPorId.get(v.entrega_item_id) : undefined;
    return {
      vendedorId: v.vendedor_id,
      productoId: v.producto_id,
      cantidad: v.cantidad,
      precioCostoCentavos: v.precio_costo_centavos,
      costoAnanjaCentavos:
        item?.costo_lote_unitario_centavos ?? item?.costo_ananja_unitario_centavos ?? v.precio_costo_centavos,
      loteId: v.lote_id ?? item?.lote_id ?? null,
    };
  });
  const rindioPorVendedor = new Map<string, number>();
  for (const r of rendicionesDb) {
    rindioPorVendedor.set(r.vendedor_id, (rindioPorVendedor.get(r.vendedor_id) ?? 0) + r.monto_centavos);
  }
  const filasB = calcularSinPagar(ventas, rindioPorVendedor);

  // C. Cobradas por la coordinadora, sin pasar a Ananja.
  const parteAnanjaPorId = new Map(partesDb.map((p) => [p.rendicion_id, p.monto_ananja_centavos]));
  const rendicionesEncargado: RendicionConParteAnanja[] = rendicionesDb
    .filter((r) => r.via === "encargado")
    .map((r) => ({
      id: r.id,
      // Sin tenedor entra al recorrido igual (como en la vista) pero no cuenta para nadie.
      tenedorId: r.tenedor_id ?? "",
      vendedorId: r.vendedor_id,
      montoCentavos: r.monto_centavos,
      // Si por algo no figura en la vista, su parte queda en 0 (igual que `cargarLineasPorLote`).
      montoAnanjaCentavos: parteAnanjaPorId.get(r.id) ?? 0,
    }));
  const depositosPorTenedor = new Map<string, number>();
  for (const d of depositosDb) {
    depositosPorTenedor.set(d.tenedor_id, (depositosPorTenedor.get(d.tenedor_id) ?? 0) + d.monto_centavos);
  }
  const totalPorTenedor = new Map(totalesDb.map((t) => [t.tenedor_id, t.total_centavos ?? 0]));
  const sinPasar = calcularSinPasar({
    ventas,
    rendiciones: rendicionesEncargado,
    coordinadoras: coordinadoraIds.map((id) => ({
      id,
      depositosCentavos: depositosPorTenedor.get(id) ?? 0,
      totalCentavos: totalPorTenedor.get(id) ?? 0,
    })),
    lotes,
    productos,
  });

  // Se leyeron más revendedoras que las que se muestran (el recorrido de C
  // necesita las de su plata): A y B quedan solo para las pedidas.
  const mostrar = idsAB === null ? null : new Set(idsAB);
  const deLasPedidas = (f: FilaBotellas) => mostrar === null || mostrar.has(f.personaId);
  return armar([...filasA.filter(deLasPedidas), ...filasB.filter(deLasPedidas), ...sinPasar.filas], sinPasar.sinBotella);
}
