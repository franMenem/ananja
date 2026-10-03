/**
 * Lecturas de Pedidos/Lotes de producción — capa `lib/data` (convención en
 * `lib/data/README.md`, referencia `lib/data/gastos.ts`). Cada función
 * junta en UN `Promise.all` todas las consultas independientes de una
 * pantalla — antes cada `page.tsx` armaba su propio
 * array de consultas inline.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { listarVendedoresNombre } from "@/lib/data/catalogos";
import { listarStockRevendedorasPorLote } from "@/lib/data/stock";
import type { EnManosFila } from "@/lib/dominio/lote-en-manos";
import type { LoteConStockDeProducto } from "@/lib/dominio/lotes-disponibles";
import { itemsDeLote, type ItemLoteRow } from "@/lib/dominio/pedidos-lote";
import type { PCostosLote } from "@/lib/dominio/lotes";
import type { Database, Tables } from "@/lib/types";

type Supa = SupabaseClient<Database>;

export type LoteConItems = Tables<"v_costo_lote">;

/** Vendedores (id, nombre) — CANDIDATA A CATÁLOGO COMPARTIDO: otros
 * dominios (revendedores, comprobantes) también consultan `vendedores`,
 * cada uno con su propio `select`. Acá solo lo mínimo que necesita
 * `enManosDeLote` (`lib/dominio/lote-en-manos.ts`) para poner nombre a cada
 * revendedora. */
export type VendedorNombre = Pick<Tables<"vendedores">, "id" | "nombre">;

// ────────────────────────────────────────────────────────────────
// /stock/lotes/[id] — detalle de un pedido
// ────────────────────────────────────────────────────────────────

export interface DetalleLoteDatos {
  lote: LoteConItems | null;
  loteProduccion: Pick<
    Tables<"lotes_produccion">,
    "iva_pct" | "precios_incluyen_iva" | "transporte_pct" | "envase_cobrado_sin_iva"
  > | null;
  desglose: Tables<"v_costo_lote_desglose">[];
  costosFilas: (Pick<
    Tables<"lote_costos">,
    | "concepto"
    | "producto_id"
    | "insumo_id"
    | "cantidad"
    | "costo_unitario_centavos"
    | "neto_centavos"
    | "costo_neto_centavos"
    | "envio_centavos"
    | "total_centavos"
    | "a_pagar_centavos"
  > & { insumos: { nombre: string } | null })[];
  saldo: Tables<"v_saldo_lote"> | null;
  stockPorLote: Pick<Tables<"v_stock_por_lote">, "producto_id" | "quedan">[];
  pagos: (Pick<Tables<"gastos">, "id" | "monto_centavos" | "fecha" | "medio_pago" | "nota" | "concepto_pago"> & {
    productos: { presentacion_ml: number } | null;
  })[];
  gastosLegacy: (Pick<Tables<"gastos">, "id" | "monto_centavos" | "fecha" | "nota" | "producto_id"> & {
    categorias_gasto: { nombre: string } | null;
    productos: { nombre: string; presentacion_ml: number } | null;
  })[];
  cobranzaFilas: Tables<"v_cobranza_lote">[];
  perdidas: Tables<"v_perdidas_lote">[];
  saldoConceptos: Tables<"v_saldo_lote_concepto">[];
  enManosFilas: EnManosFila[];
  enManosError: string | null;
  vendedores: VendedorNombre[];
  deudaAceite: Tables<"v_deuda_aceite_lote"> | null;
  vigente: Pick<
    Tables<"v_costo_lote_vigente">,
    | "producto_id"
    | "costo_unitario_centavos"
    | "costo_ananja_centavos"
    | "costo_ananja_calculado_centavos"
    | "precio_mayorista_sugerido_centavos"
    | "precio_minorista_sugerido_centavos"
    | "costo_unitario_original_centavos"
    | "costo_ananja_original_centavos"
    | "actualizado_en"
  >[];
  valoraciones: (Pick<
    Tables<"lote_valoraciones">,
    "id" | "producto_id" | "costo_unitario_centavos" | "costo_ananja_centavos" | "ganancia_pct" | "nota" | "created_at"
  > & { vendedores: { nombre: string } | null })[];
}

/**
 * Todo lo que pinta `/stock/lotes/[id]` (16 consultas + el reparto por
 * revendedoras) — todas independientes entre sí, en UN `Promise.all` (ya
 * lo estaban antes de esta migración; acá solo se junta el array que vivía
 * en la página).
 *
 * `listarStockRevendedorasPorLote` (`lib/data/stock.ts`) lee el
 * historial COMPLETO de entregas/ventas de TODAS las revendedoras, no solo
 * las de este lote — ver el comentario en ese archivo sobre por qué no se
 * acota (el reparto FIFO de una revendedora puede cruzar lotes).
 */
export async function obtenerDetalleLote(supabase: Supa, loteId: string): Promise<DetalleLoteDatos> {
  const [
    { data: lote },
    { data: loteProduccion },
    { data: desglose },
    { data: costosFilas },
    { data: saldo },
    { data: stockPorLote },
    { data: pagos },
    { data: gastosLegacy },
    { data: cobranzaFilas },
    { data: perdidas },
    { data: saldoConceptos },
    { data: enManosFilas, error: enManosError },
    { data: vendedores },
    { data: deudaAceite },
    { data: vigente },
    { data: valoraciones },
  ] = await Promise.all([
    supabase.from("v_costo_lote").select("*").eq("lote_id", loteId).maybeSingle(),
    supabase
      .from("lotes_produccion")
      .select("iva_pct, precios_incluyen_iva, transporte_pct, envase_cobrado_sin_iva")
      .eq("id", loteId)
      .maybeSingle(),
    supabase
      .from("v_costo_lote_desglose")
      .select("*")
      .eq("lote_id", loteId)
      .order("presentacion_ml", { ascending: false }),
    supabase
      .from("lote_costos")
      .select(
        "concepto, producto_id, insumo_id, cantidad, costo_unitario_centavos, neto_centavos, costo_neto_centavos, envio_centavos, total_centavos, a_pagar_centavos, insumos(nombre)",
      )
      .eq("lote_id", loteId)
      .in("concepto", ["aceite", "etiqueta", "envase", "transporte"]),
    supabase.from("v_saldo_lote").select("*").eq("lote_id", loteId).maybeSingle(),
    supabase.from("v_stock_por_lote").select("producto_id, quedan").eq("lote_id", loteId),
    supabase
      .from("gastos")
      .select("id, monto_centavos, fecha, medio_pago, nota, concepto_pago, productos(presentacion_ml)")
      .eq("lote_id", loteId)
      .eq("concepto_lote", "pago")
      .order("fecha", { ascending: false }),
    supabase
      .from("gastos")
      .select(
        "id, monto_centavos, fecha, nota, producto_id, categorias_gasto(nombre), productos(nombre, presentacion_ml)",
      )
      .eq("lote_id", loteId)
      .is("concepto_lote", null)
      .order("fecha", { ascending: false }),
    supabase.from("v_cobranza_lote").select("*").eq("lote_id", loteId),
    supabase.from("v_perdidas_lote").select("*").eq("lote_id", loteId),
    supabase.from("v_saldo_lote_concepto").select("*").eq("lote_id", loteId),
    listarStockRevendedorasPorLote(supabase),
    listarVendedoresNombre(supabase),
    supabase.from("v_deuda_aceite_lote").select("*").eq("lote_id", loteId).maybeSingle(),
    supabase
      .from("v_costo_lote_vigente")
      .select(
        "producto_id, costo_unitario_centavos, costo_ananja_centavos, costo_ananja_calculado_centavos, precio_mayorista_sugerido_centavos, precio_minorista_sugerido_centavos, costo_unitario_original_centavos, costo_ananja_original_centavos, actualizado_en",
      )
      .eq("lote_id", loteId),
    supabase
      .from("lote_valoraciones")
      .select("id, producto_id, costo_unitario_centavos, costo_ananja_centavos, ganancia_pct, nota, created_at, vendedores(nombre)")
      .eq("lote_id", loteId)
      .order("created_at", { ascending: false }),
  ]);

  return {
    lote: lote ?? null,
    loteProduccion: loteProduccion ?? null,
    desglose: desglose ?? [],
    costosFilas: costosFilas ?? [],
    saldo: saldo ?? null,
    stockPorLote: stockPorLote ?? [],
    pagos: pagos ?? [],
    gastosLegacy: gastosLegacy ?? [],
    cobranzaFilas: cobranzaFilas ?? [],
    perdidas: perdidas ?? [],
    saldoConceptos: saldoConceptos ?? [],
    enManosFilas: enManosFilas ?? [],
    enManosError: enManosError ?? null,
    vendedores: vendedores ?? [],
    deudaAceite: deudaAceite ?? null,
    vigente: vigente ?? [],
    valoraciones: valoraciones ?? [],
  };
}

// ────────────────────────────────────────────────────────────────
// /stock/lotes/[id]/costos — "Completar costos" / "Editar costos"
// ────────────────────────────────────────────────────────────────

type LoteCostoFormRow = Pick<
  Tables<"lote_costos">,
  | "concepto"
  | "producto_id"
  | "insumo_id"
  | "cantidad"
  | "costo_unitario_centavos"
  | "neto_centavos"
  | "costo_neto_centavos"
  | "envio_centavos"
  | "total_centavos"
  | "descripcion"
  | "a_pagar_centavos"
>;

type RecetaConInsumo = Pick<Tables<"recetas">, "producto_id" | "insumo_id" | "cantidad"> & {
  insumos: Pick<Tables<"insumos">, "tipo" | "nombre"> | null;
};

type LoteProduccionCostos = Pick<
  Tables<"lotes_produccion">,
  | "ganancia_pct"
  | "mayorista_pct"
  | "minorista_pct"
  | "iva_pct"
  | "precios_incluyen_iva"
  | "transporte_pct"
  | "dolar_centavos"
  | "precio_litro_aceite_usd_centavos"
  | "envase_cobrado_sin_iva"
>;

export interface CostosLoteFormDatos {
  lote: LoteConItems | null;
  items: ItemLoteRow[];
  costosRows: LoteCostoFormRow[];
  recetasRows: RecetaConInsumo[];
  loteProduccion: LoteProduccionCostos | null;
  loteItemsRows: Pick<Tables<"lote_items">, "producto_id" | "costo_ananja_redondeado_centavos">[];
  /** Dólar/USD del pedido de fecha más reciente, EXCLUYENDO este mismo
   * lote — para el aviso "¿lo actualizás?" (`AceiteHeredado`). Antes era
   * una segunda tanda aparte (comentario viejo decía que "dependía de
   * `lote`", pero la consulta solo usa `loteId` para excluirse a sí
   * misma, así que entra en el mismo `Promise.all`). */
  loteAnterior: Pick<Tables<"lotes_produccion">, "fecha" | "dolar_centavos" | "precio_litro_aceite_usd_centavos"> | null;
}

/** Todo lo que arma "Completar/Editar costos" (`/stock/lotes/[id]/costos`)
 * — 6 consultas independientes (solo necesitan `loteId`), en UN
 * `Promise.all`. `obtenerUltimasComprasInsumos` (lib/data/insumos.ts)
 * sigue como segunda tanda, dependiente de qué insumos de etiqueta usa
 * este lote (`recetasRows`, resuelto recién acá). */
export async function obtenerCostosLoteForm(supabase: Supa, loteId: string): Promise<CostosLoteFormDatos> {
  const [
    { data: lote },
    { data: costosRows },
    { data: recetasRows },
    { data: loteProduccion },
    { data: loteItemsRows },
    { data: loteAnterior },
  ] = await Promise.all([
    supabase.from("v_costo_lote").select("*").eq("lote_id", loteId).maybeSingle(),
    supabase
      .from("lote_costos")
      .select(
        "concepto, producto_id, insumo_id, cantidad, costo_unitario_centavos, neto_centavos, costo_neto_centavos, envio_centavos, total_centavos, descripcion, a_pagar_centavos",
      )
      .eq("lote_id", loteId),
    supabase.from("recetas").select("producto_id, insumo_id, cantidad, insumos(tipo, nombre)"),
    supabase
      .from("lotes_produccion")
      .select(
        "ganancia_pct, mayorista_pct, minorista_pct, iva_pct, precios_incluyen_iva, transporte_pct, dolar_centavos, precio_litro_aceite_usd_centavos, envase_cobrado_sin_iva",
      )
      .eq("id", loteId)
      .maybeSingle(),
    supabase.from("lote_items").select("producto_id, costo_ananja_redondeado_centavos").eq("lote_id", loteId),
    supabase
      .from("lotes_produccion")
      .select("fecha, dolar_centavos, precio_litro_aceite_usd_centavos")
      .neq("id", loteId)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    lote: lote ?? null,
    items: lote ? itemsDeLote(lote) : [],
    costosRows: costosRows ?? [],
    recetasRows: recetasRows ?? [],
    loteProduccion: loteProduccion ?? null,
    loteItemsRows: loteItemsRows ?? [],
    loteAnterior: loteAnterior ?? null,
  };
}

// ────────────────────────────────────────────────────────────────
// /stock/lotes/[id]/actualizar-costos — "Actualizar costos del depósito"
// ────────────────────────────────────────────────────────────────

export interface UltimaValoracionLote {
  costosJsonb: PCostosLote;
  gananciaPct: number;
  mayoristaPct: number;
  minoristaPct: number;
  createdAt: string;
}

export interface ActualizarCostosLoteFormDatos {
  lote: LoteConItems | null;
  items: ItemLoteRow[];
  costosRows: LoteCostoFormRow[];
  recetasRows: RecetaConInsumo[];
  loteProduccion: LoteProduccionCostos | null;
  stockPorLote: Pick<Tables<"v_stock_por_lote">, "producto_id" | "quedan">[];
  loteItemsRows: Pick<Tables<"lote_items">, "producto_id" | "costo_ananja_redondeado_centavos">[];
  /** Última actualización de este lote (`lote_valoraciones`, 0052) ya con
   * el cast de `costos_jsonb` resuelto acá adentro (no en la página, ver
   * `lib/data/README.md` § jsonb). `null` si el lote nunca se actualizó. */
  ultimaValoracion: UltimaValoracionLote | null;
}

/** Todo lo que arma "Actualizar costos del depósito"
 * (`/stock/lotes/[id]/actualizar-costos`) — 7 consultas independientes en
 * UN `Promise.all` (ya lo estaban). */
export async function obtenerActualizarCostosLoteForm(
  supabase: Supa,
  loteId: string,
): Promise<ActualizarCostosLoteFormDatos> {
  const [
    { data: lote },
    { data: costosRows },
    { data: recetasRows },
    { data: loteProduccion },
    { data: stockPorLote },
    { data: ultimaValoracionRows },
    { data: loteItemsRows },
  ] = await Promise.all([
    supabase.from("v_costo_lote").select("*").eq("lote_id", loteId).maybeSingle(),
    supabase
      .from("lote_costos")
      .select(
        "concepto, producto_id, insumo_id, cantidad, costo_unitario_centavos, neto_centavos, costo_neto_centavos, envio_centavos, total_centavos, descripcion, a_pagar_centavos",
      )
      .eq("lote_id", loteId),
    supabase.from("recetas").select("producto_id, insumo_id, cantidad, insumos(tipo, nombre)"),
    supabase
      .from("lotes_produccion")
      .select(
        "ganancia_pct, mayorista_pct, minorista_pct, iva_pct, precios_incluyen_iva, transporte_pct, dolar_centavos, precio_litro_aceite_usd_centavos, envase_cobrado_sin_iva",
      )
      .eq("id", loteId)
      .maybeSingle(),
    supabase.from("v_stock_por_lote").select("producto_id, quedan").eq("lote_id", loteId),
    // Última actualización (0052, S2): cualquier fila de la tanda más
    // reciente sirve — costos_jsonb/ganancia_pct/mayorista_pct/
    // minorista_pct/created_at son los mismos para TODOS los productos de
    // una misma actualización.
    supabase
      .from("lote_valoraciones")
      .select("costos_jsonb, ganancia_pct, mayorista_pct, minorista_pct, created_at")
      .eq("lote_id", loteId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("lote_items").select("producto_id, costo_ananja_redondeado_centavos").eq("lote_id", loteId),
  ]);

  return {
    lote: lote ?? null,
    items: lote ? itemsDeLote(lote) : [],
    costosRows: costosRows ?? [],
    recetasRows: recetasRows ?? [],
    loteProduccion: loteProduccion ?? null,
    stockPorLote: stockPorLote ?? [],
    loteItemsRows: loteItemsRows ?? [],
    // El embed no tipa bien contra el jsonb que devuelve PostgREST — el
    // cast queda encerrado acá, no en la página.
    ultimaValoracion: ultimaValoracionRows
      ? {
          costosJsonb: ultimaValoracionRows.costos_jsonb as unknown as PCostosLote,
          gananciaPct: ultimaValoracionRows.ganancia_pct,
          mayoristaPct: ultimaValoracionRows.mayorista_pct,
          minoristaPct: ultimaValoracionRows.minorista_pct,
          createdAt: ultimaValoracionRows.created_at,
        }
      : null,
  };
}

// ────────────────────────────────────────────────────────────────
// /stock/lotes/[id]/pago — "Registrar pago"
// ────────────────────────────────────────────────────────────────

export interface PagoLoteFormDatos {
  saldo: Pick<Tables<"v_saldo_lote">, "saldo_centavos" | "pagado_centavos"> | null;
  conceptosRows: Tables<"v_saldo_lote_concepto">[];
  items: (Pick<Tables<"lote_items">, "producto_id"> & { productos: { presentacion_ml: number } | null })[];
}

/** Todo lo que arma "Registrar pago" (`/stock/lotes/[id]/pago`) — 3
 * consultas independientes en UN `Promise.all` (ya lo estaban). */
export async function obtenerPagoLoteForm(supabase: Supa, loteId: string): Promise<PagoLoteFormDatos> {
  const [{ data: saldo }, { data: conceptosRows }, { data: items }] = await Promise.all([
    supabase.from("v_saldo_lote").select("saldo_centavos, pagado_centavos").eq("lote_id", loteId).maybeSingle(),
    supabase.from("v_saldo_lote_concepto").select("*").eq("lote_id", loteId),
    supabase.from("lote_items").select("producto_id, productos(presentacion_ml)").eq("lote_id", loteId),
  ]);

  return {
    saldo: saldo ?? null,
    conceptosRows: conceptosRows ?? [],
    items: items ?? [],
  };
}

// ────────────────────────────────────────────────────────────────
// /stock/lotes/nuevo — "Nuevo pedido al proveedor"
// ────────────────────────────────────────────────────────────────

type LoteCostoConLote = Pick<
  Tables<"lote_costos">,
  | "lote_id"
  | "producto_id"
  | "insumo_id"
  | "concepto"
  | "costo_unitario_centavos"
  | "neto_centavos"
  | "costo_neto_centavos"
  | "envio_centavos"
  | "total_centavos"
  | "descripcion"
> & { lotes_produccion: Pick<Tables<"lotes_produccion">, "fecha" | "created_at"> | null };

type UltimoLotePcts = Pick<
  Tables<"lotes_produccion">,
  | "fecha"
  | "ganancia_pct"
  | "mayorista_pct"
  | "minorista_pct"
  | "iva_pct"
  | "precios_incluyen_iva"
  | "transporte_pct"
  | "dolar_centavos"
  | "precio_litro_aceite_usd_centavos"
  | "envase_cobrado_sin_iva"
>;

export interface NuevoLoteFormDatos {
  productos: { id: string; nombre: string; presentacion_ml: number }[];
  costosRows: LoteCostoConLote[];
  ultimoLote: UltimoLotePcts | null;
  tanqueRows: Tables<"v_tanque_aceite">[];
  etiquetaInsumos: Pick<Tables<"insumos">, "id">[];
}

/** Las 5 consultas independientes de "Nuevo pedido al proveedor"
 * (`/stock/lotes/nuevo`), en UN `Promise.all` (ya lo estaban).
 * `obtenerUltimasComprasInsumos` (lib/data/insumos.ts) sigue como segunda
 * tanda en la página: depende de qué insumos de etiqueta resultan acá. */
export async function obtenerNuevoLoteForm(supabase: Supa): Promise<NuevoLoteFormDatos> {
  const [{ data: productos }, { data: costosRows }, { data: ultimoLote }, { data: tanqueRows }, { data: etiquetaInsumos }] =
    await Promise.all([
      supabase.from("productos").select("id, nombre, presentacion_ml").order("presentacion_ml", { ascending: false }),
      supabase
        .from("lote_costos")
        .select(
          "lote_id, producto_id, insumo_id, concepto, costo_unitario_centavos, neto_centavos, costo_neto_centavos, envio_centavos, total_centavos, descripcion, lotes_produccion(fecha, created_at)",
        ),
      supabase
        .from("lotes_produccion")
        .select(
          "fecha, ganancia_pct, mayorista_pct, minorista_pct, iva_pct, precios_incluyen_iva, transporte_pct, dolar_centavos, precio_litro_aceite_usd_centavos, envase_cobrado_sin_iva",
        )
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("v_tanque_aceite").select("*"),
      supabase.from("insumos").select("id").eq("tipo", "etiqueta").eq("activo", true),
    ]);

  return {
    productos: productos ?? [],
    costosRows: costosRows ?? [],
    ultimoLote: ultimoLote ?? null,
    tanqueRows: tanqueRows ?? [],
    etiquetaInsumos: etiquetaInsumos ?? [],
  };
}

// ────────────────────────────────────────────────────────────────
// /stock/lotes — listado de pedidos
// ────────────────────────────────────────────────────────────────

export interface ListaLotesDatos {
  lotesRows: LoteConItems[];
  error: string | null;
  vigente: Pick<
    Tables<"v_costo_lote_vigente">,
    "lote_id" | "producto_id" | "costo_ananja_centavos" | "costo_ananja_calculado_centavos" | "tiene_costos" | "actualizado_en" | "costo_ananja_original_centavos"
  >[];
  original: Pick<Tables<"v_costo_lote_desglose">, "lote_id" | "producto_id" | "costo_unitario_centavos" | "tiene_costos">[];
  saldos: Pick<Tables<"v_saldo_lote">, "lote_id" | "saldo_centavos">[];
  stockPorLote: Pick<Tables<"v_stock_por_lote">, "lote_id" | "producto_id" | "quedan">[];
  enManosFilas: EnManosFila[];
}

/** Las 6 consultas independientes de `/stock/lotes` (incluye el reparto
 * por revendedoras de TODOS los lotes), en UN `Promise.all` (ya lo
 * estaban). */
export async function obtenerListaLotes(supabase: Supa): Promise<ListaLotesDatos> {
  const [
    { data: lotesRows, error },
    { data: vigente },
    { data: original },
    { data: saldos },
    { data: stockPorLote },
    { data: enManosFilas },
  ] = await Promise.all([
    supabase.from("v_costo_lote").select("*").order("fecha", { ascending: false }).order("created_at", { ascending: false }),
    supabase
      .from("v_costo_lote_vigente")
      .select(
        "lote_id, producto_id, costo_ananja_centavos, costo_ananja_calculado_centavos, tiene_costos, actualizado_en, costo_ananja_original_centavos",
      ),
    supabase.from("v_costo_lote_desglose").select("lote_id, producto_id, costo_unitario_centavos, tiene_costos"),
    supabase.from("v_saldo_lote").select("lote_id, saldo_centavos"),
    supabase.from("v_stock_por_lote").select("lote_id, producto_id, quedan"),
    listarStockRevendedorasPorLote(supabase),
  ]);

  if (error) console.error("obtenerListaLotes", error);

  return {
    lotesRows: lotesRows ?? [],
    error: error ? "No se pudo cargar el historial de pedidos." : null,
    vigente: vigente ?? [],
    original: original ?? [],
    saldos: saldos ?? [],
    stockPorLote: stockPorLote ?? [],
    enManosFilas: enManosFilas ?? [],
  };
}

// ────────────────────────────────────────────────────────────────
// `SelectorLote` — lotes con stock disponible por producto
// ────────────────────────────────────────────────────────────────

/** Todos los lotes con su `quedan`/costo unitario, para todos los
 * productos — el caller filtra por `productoId` con
 * `lotesDeProducto` (`lib/dominio/lotes-disponibles.ts`). */
export async function obtenerLotesConStock(
  supabase: Supa,
): Promise<LoteConStockDeProducto[]> {
  const [{ data: stock }, { data: costos }, { data: desglose }] = await Promise.all([
    supabase
      .from("v_stock_por_lote")
      .select("lote_id, producto_id, fecha, quedan"),
    supabase
      .from("v_costo_lote_item")
      .select("lote_id, producto_id, costo_unitario_centavos"),
    supabase
      .from("v_costo_lote_vigente")
      .select("lote_id, producto_id, precio_minorista_sugerido_centavos, costo_ananja_centavos, tiene_costos"),
  ]);

  const costoAnanjaPorLoteProducto = new Map<string, number | null>();
  for (const d of desglose ?? []) {
    if (d.lote_id === null || d.producto_id === null) continue;
    costoAnanjaPorLoteProducto.set(
      `${d.lote_id}:${d.producto_id}`,
      d.tiene_costos && d.costo_ananja_centavos && d.costo_ananja_centavos > 0
        ? d.costo_ananja_centavos
        : null,
    );
  }

  const costoPorLoteProducto = new Map<string, number | null>();
  for (const c of costos ?? []) {
    if (c.lote_id === null || c.producto_id === null) continue;
    costoPorLoteProducto.set(`${c.lote_id}:${c.producto_id}`, c.costo_unitario_centavos);
  }

  const precioSugeridoPorLoteProducto = new Map<string, number | null>();
  for (const d of desglose ?? []) {
    if (d.lote_id === null || d.producto_id === null) continue;
    precioSugeridoPorLoteProducto.set(
      `${d.lote_id}:${d.producto_id}`,
      d.precio_minorista_sugerido_centavos,
    );
  }

  const resultado: LoteConStockDeProducto[] = [];
  for (const s of stock ?? []) {
    if (s.lote_id === null || s.producto_id === null || s.fecha === null) continue;
    resultado.push({
      loteId: s.lote_id,
      productoId: s.producto_id,
      fecha: s.fecha,
      quedan: s.quedan ?? 0,
      costoUnitarioCentavos:
        costoPorLoteProducto.get(`${s.lote_id}:${s.producto_id}`) ?? null,
      precioMinoristaSugeridoCentavos:
        precioSugeridoPorLoteProducto.get(`${s.lote_id}:${s.producto_id}`) ?? null,
      costoAnanjaCentavos: costoAnanjaPorLoteProducto.get(`${s.lote_id}:${s.producto_id}`) ?? null,
    });
  }
  return resultado;
}
