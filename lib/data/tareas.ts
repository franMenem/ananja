/**
 * Lecturas de Tareas — capa `lib/data` (convención en `lib/data/README.md`,
 * `lib/data/gastos.ts` es la referencia). Nada de JSX ni agregación: eso
 * vive en `app/(app)/tareas/page.tsx` y en `lib/dominio/tareas.ts` (puro).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { fechaArgentinaDeTimestamp } from "@/lib/fechas";
import { listarStockInsumos } from "@/lib/data/insumos";
import { leerTodasLasPaginas } from "@/lib/paginado";
import { getSignedUrls } from "@/lib/storage";
import {
  agruparPedidosPorPagar,
  calcularTareas,
  comprobantePathDeTarea,
  conComprobanteUrl,
  esPedidoViejoSinCostos,
  faltantesCostosLote,
  fechaPlataEnManoMasVieja,
  fechaVentaImpagaMasVieja,
  filtrarDeudasNegocioPendientes,
  type CalcularTareasInput,
  type DepositoInformadoTarea,
  type LoteCostosIncompletos,
  type LoteCostosInput,
  type PagoPorConfirmarTarea,
  type Tarea,
} from "@/lib/dominio/tareas";
import type { Database, Tables } from "@/lib/types";

type Supa = SupabaseClient<Database>;

export interface OpcionesTareas {
  /** `vendedores.id` de quien mira — decide qué tareas le tocan. */
  miVendedorId: string | null;
  /** Fecha de hoy en Argentina (`hoyISO()`). */
  hoy: string;
}

/** Todo lo que se leyó para armar las tareas — Inicio reusa estas filas en
 * sus bloques en vez de volver a consultarlas. */
export interface FuentesTareas {
  input: CalcularTareasInput;
  plataEnManos: Tables<"v_plata_en_manos">[];
  deudaVendedor: Tables<"v_deuda_vendedor">[];
  stock: Tables<"v_stock_actual">[];
  deudaCliente: Tables<"v_deuda_cliente">[];
}

/**
 * Junta las fuentes de Tareas para cualquier cliente de Supabase (server en
 * `/tareas` e Inicio, browser en el badge — las tres traen SIEMPRE las
 * mismas fuentes, para que las tres cuenten el mismo total,
 * `contarTareasPendientes` en `lib/tareas.ts`). Dos tandas en paralelo:
 * primero las vistas/tablas livianas; después, solo si hace falta, las
 * ventas de las revendedoras que deben (antigüedad FIFO de la deuda) y los
 * ingresos de la plata en mano de cada persona (desde cuándo la tiene). Las
 * tablas que crecen se leen paginadas (`leerTodasLasPaginas`) para no
 * cortarse a las 1000 filas.
 *
 * Si falla una fuente principal, lanza (la pantalla muestra el error en vez
 * de "Todo al día" sobre datos incompletos). Los pagos por confirmar y la
 * segunda tanda solo loguean: sin ellas la lista sigue siendo útil.
 */
export async function cargarFuentesTareas(supabase: Supa, opciones: OpcionesTareas): Promise<FuentesTareas> {
  const { miVendedorId, hoy } = opciones;

  const [
    plataRes,
    deudaVendedorRes,
    resumenRes,
    saldoLoteRes,
    saldoConceptoRes,
    saldoDeudaRes,
    lotesRes,
    loteItemsRes,
    loteCostosRes,
    gastosViejosRes,
    vendedoresRes,
    stockRes,
    insumosRes,
    deudaClienteRes,
    pagosPorConfirmar,
    depositosInformados,
  ] = await Promise.all([
    supabase.from("v_plata_en_manos").select("*"),
    supabase.from("v_deuda_vendedor").select("*"),
    supabase
      .from("v_resumen_revendedor")
      .select("vendedor_id, nombre, unidades_sin_precio")
      .gt("unidades_sin_precio", 0),
    supabase.from("v_saldo_lote").select("lote_id, fecha, saldo_centavos").gt("saldo_centavos", 0),
    supabase
      .from("v_saldo_lote_concepto")
      .select("lote_id, concepto, producto_id, saldo_centavos")
      .gt("saldo_centavos", 0),
    supabase
      .from("v_saldo_deuda")
      .select("deuda_id, descripcion, fecha, moneda, restante_centavos, saldada_en")
      .gt("restante_centavos", 0),
    leerTodasLasPaginas((desde, hasta) =>
      supabase
        .from("lotes_produccion")
        .select("id, fecha, dolar_centavos, precio_litro_aceite_usd_centavos")
        .order("id")
        .range(desde, hasta),
    ),
    leerTodasLasPaginas((desde, hasta) =>
      supabase.from("lote_items").select("lote_id, producto_id").order("id").range(desde, hasta),
    ),
    leerTodasLasPaginas((desde, hasta) =>
      supabase
        .from("lote_costos")
        .select("lote_id, concepto, producto_id, costo_unitario_centavos, total_centavos")
        .order("id")
        .range(desde, hasta),
    ),
    // Gastos viejos de un lote (antes de 0028, sin concepto de pago): marcan
    // los pedidos viejos que no tienen líneas en `lote_costos`.
    leerTodasLasPaginas((desde, hasta) =>
      supabase
        .from("gastos")
        .select("lote_id")
        .not("lote_id", "is", null)
        .is("concepto_lote", null)
        .order("id")
        .range(desde, hasta),
    ),
    supabase.from("vendedores").select("id, activo, rol"),
    supabase.from("v_stock_actual").select("*").order("presentacion_ml", { ascending: true }),
    listarStockInsumos(supabase),
    supabase.from("v_deuda_cliente").select("*"),
    listarPagosPorConfirmar(supabase),
    listarDepositosInformadosPorConfirmar(supabase),
  ]);

  const errores = {
    plata: plataRes.error,
    deudaVendedor: deudaVendedorRes.error,
    resumen: resumenRes.error,
    saldoLote: saldoLoteRes.error,
    saldoConcepto: saldoConceptoRes.error,
    saldoDeuda: saldoDeudaRes.error,
    lotes: lotesRes.error,
    loteItems: loteItemsRes.error,
    loteCostos: loteCostosRes.error,
    gastosViejos: gastosViejosRes.error,
    vendedores: vendedoresRes.error,
    stock: stockRes.error,
    insumos: insumosRes.error,
    deudaCliente: deudaClienteRes.error,
  };
  if (Object.values(errores).some(Boolean)) {
    console.error("cargarFuentesTareas", errores);
    throw new Error("No se pudieron cargar las tareas.");
  }

  const plataEnManos = plataRes.data ?? [];
  const deudaVendedor = deudaVendedorRes.data ?? [];
  const stock = stockRes.data ?? [];

  const presentacionPorProducto = new Map<string, number | null>(
    stock.filter((s) => s.producto_id).map((s) => [s.producto_id as string, s.presentacion_ml]),
  );
  // Las revendedoras dadas de baja no generan tareas de deuda vieja ni de
  // ventas sin precio (siguen apareciendo en Plata/Inicio si deben).
  const inactivos = new Set((vendedoresRes.data ?? []).filter((v) => !v.activo).map((v) => v.id));
  // `registrar_deposito_cuenta` acepta un tenedor admin O coordinador
  // activo (0055_coordinador.sql, TENEDOR_INVALIDO) — antes de 0057 acá
  // solo se contaba `rol = 'admin'`, así que la tarea "plata en mano" de
  // un coordinador salía sin el botón "Registrar que lo pasó" para el
  // resto de los admins (quedaba como aviso sin acción posible).
  const tenedoresValidos = new Set(
    (vendedoresRes.data ?? [])
      .filter((v) => v.activo && (v.rol === "admin" || v.rol === "coordinador"))
      .map((v) => v.id),
  );

  // ── Segunda tanda ──
  const deudoras = deudaVendedor.filter(
    (d) =>
      d.vendedor_id &&
      d.vendedor_id !== miVendedorId &&
      !inactivos.has(d.vendedor_id) &&
      (d.saldo_centavos ?? 0) > 0,
  );
  const filasPlata = plataEnManos.filter(
    (p): p is typeof p & { tenedor_id: string } => Boolean(p.tenedor_id) && (p.total_centavos ?? 0) > 0,
  );
  const tenedoresConIngresos = filasPlata.map((p) => p.tenedor_id);

  const [ventasDeudoras, ingresosEnMano] = await Promise.all([
    deudoras.length > 0
      ? listarVentasParaDeuda(
          supabase,
          deudoras.map((d) => d.vendedor_id as string),
        )
      : Promise.resolve([]),
    tenedoresConIngresos.length > 0
      ? listarIngresosEnMano(supabase, tenedoresConIngresos)
      : Promise.resolve(null),
  ]);

  const lotesConGastosViejos = new Set(
    (gastosViejosRes.data ?? []).map((g) => g.lote_id).filter((id): id is string => id !== null),
  );

  const input: CalcularTareasInput = {
    hoy,
    miVendedorId,
    pagosPorConfirmar,
    depositosInformados,
    plataEnManos: filasPlata.map((p) => ({
      tenedor_id: p.tenedor_id,
      nombre: p.nombre ?? "Alguien",
      total_centavos: p.total_centavos ?? 0,
      activo: tenedoresValidos.has(p.tenedor_id),
      desde:
        ingresosEnMano && tenedoresConIngresos.includes(p.tenedor_id)
          ? fechaPlataEnManoMasVieja(
              ingresosEnMano.filter((i) => i.tenedorId === p.tenedor_id),
              p.total_centavos ?? 0,
            )
          : null,
    })),
    pedidosPorPagar: agruparPedidosPorPagar(
      (saldoLoteRes.data ?? [])
        .filter((l) => l.lote_id && l.fecha)
        .map((l) => ({ lote_id: l.lote_id as string, fecha: l.fecha as string, saldo_centavos: l.saldo_centavos ?? 0 })),
      (saldoConceptoRes.data ?? [])
        .filter((c) => c.lote_id && c.concepto)
        .map((c) => ({
          lote_id: c.lote_id as string,
          concepto: c.concepto as string,
          producto_id: c.producto_id,
          saldo_centavos: c.saldo_centavos ?? 0,
        })),
      presentacionPorProducto,
    ),
    deudasNegocio: filtrarDeudasNegocioPendientes(
      (saldoDeudaRes.data ?? [])
        .filter((d) => d.deuda_id && d.fecha)
        .map((d) => ({
          deuda_id: d.deuda_id as string,
          descripcion: d.descripcion ?? "Deuda",
          fecha: d.fecha as string,
          moneda: d.moneda === "USD" ? ("USD" as const) : ("ARS" as const),
          restante_centavos: d.restante_centavos ?? 0,
          saldada_en: d.saldada_en,
        })),
    ),
    revendedorasConDeuda: deudoras.map((d) => ({
      vendedor_id: d.vendedor_id as string,
      nombre: d.nombre ?? "Una revendedora",
      saldo_centavos: d.saldo_centavos ?? 0,
      venta_impaga_desde: fechaVentaImpagaMasVieja(
        ventasDeudoras.filter((v) => v.vendedorId === d.vendedor_id),
        d.entregado_centavos ?? 0,
      ),
    })),
    revendedorasSinPrecio: (resumenRes.data ?? [])
      .filter((r) => r.vendedor_id && !inactivos.has(r.vendedor_id))
      .map((r) => ({
        vendedor_id: r.vendedor_id as string,
        nombre: r.nombre ?? "Una revendedora",
        unidades_sin_precio: r.unidades_sin_precio ?? 0,
      })),
    lotesIncompletos: armarLotesCostos(
      lotesRes.data,
      loteItemsRes.data,
      loteCostosRes.data,
      lotesConGastosViejos,
    ).flatMap((lote): LoteCostosIncompletos[] => {
      if (esPedidoViejoSinCostos(lote)) {
        return [{ loteId: lote.loteId, fecha: lote.fecha, faltantes: [], viejo: true }];
      }
      const faltantes = faltantesCostosLote(lote, presentacionPorProducto);
      return faltantes.length > 0 ? [{ loteId: lote.loteId, fecha: lote.fecha, faltantes }] : [];
    }),
    stock: stock.map((s) => ({ nombre: s.nombre ?? "—", bajo_umbral: s.bajo_umbral ?? false })),
    // Ananja ya no trackea stock de envases (0028 § 3): un insumo tipo
    // 'envase' bajo umbral por datos viejos no debe generar la tarea.
    insumos: (insumosRes.data ?? [])
      .filter((i) => i.tipo !== "envase")
      .map((i) => ({ nombre: i.nombre ?? "—", bajo_umbral: i.bajo_umbral ?? false })),
    clientesConDeuda: (deudaClienteRes.data ?? []).map((c) => ({
      cliente_id: c.cliente_id ?? "",
      deuda_centavos: c.deuda_centavos ?? 0,
    })),
  };

  return {
    input,
    plataEnManos,
    deudaVendedor,
    stock,
    deudaCliente: deudaClienteRes.data ?? [],
  };
}

function armarLotesCostos(
  lotes: { id: string; fecha: string; dolar_centavos: number | null; precio_litro_aceite_usd_centavos: number | null }[],
  items: { lote_id: string; producto_id: string }[],
  costos: {
    lote_id: string;
    concepto: string;
    producto_id: string | null;
    costo_unitario_centavos: number | null;
    total_centavos: number;
  }[],
  lotesConGastosViejos: Set<string>,
): LoteCostosInput[] {
  return lotes.map((l) => ({
    loteId: l.id,
    fecha: l.fecha,
    dolarCentavos: l.dolar_centavos,
    precioLitroAceiteUsdCentavos: l.precio_litro_aceite_usd_centavos,
    productoIds: items.filter((i) => i.lote_id === l.id).map((i) => i.producto_id),
    costos: costos
      .filter((c) => c.lote_id === l.id)
      .map((c) => ({
        concepto: c.concepto,
        productoId: c.producto_id,
        costoUnitarioCentavos: c.costo_unitario_centavos,
        totalCentavos: c.total_centavos,
      })),
    tieneGastosViejos: lotesConGastosViejos.has(l.id),
  }));
}

async function listarVentasParaDeuda(
  supabase: Supa,
  vendedorIds: string[],
): Promise<{ vendedorId: string; fecha: string; montoCentavos: number }[]> {
  const { data, error } = await leerTodasLasPaginas((desde, hasta) =>
    supabase
      .from("ventas_revendedor")
      .select("vendedor_id, fecha, cantidad, precio_costo_centavos")
      .in("vendedor_id", vendedorIds)
      .order("id")
      .range(desde, hasta),
  );
  if (error) {
    console.error("listarVentasParaDeuda", error);
    return [];
  }
  return data.map((v) => ({
    vendedorId: v.vendedor_id,
    fecha: v.fecha,
    montoCentavos: v.cantidad * v.precio_costo_centavos,
  }));
}

/**
 * Ingresos de plata en mano de una o más personas (los mismos que suma
 * `v_plata_en_manos`): ventas cobradas en efectivo, cobros en efectivo,
 * rendiciones recibidas como encargado (ya con su parte Ananja resuelta,
 * `v_rendiciones_ananja`, 0058 — no el `monto_centavos` crudo: un
 * coordinador con margen propio tiene MENOS plata de Ananja en mano que
 * lo que sus revendedoras le rindieron, así que contar el rendido
 * completo acá calculaba mal desde cuándo la tiene) y transferencias
 * hacia efectivo.
 *
 * La fecha de cada ingreso es el día (Argentina) de su `created_at`, no su
 * `fecha`: es cuándo la plata entró de verdad a sus manos. Clave en las
 * rendiciones, que se crean al confirmar un pago (su `fecha` es la del pago,
 * que puede ser de días antes); para las demás fuentes también se usa el
 * registro, así una venta cargada tarde no hace parecer más vieja la plata.
 * `null` si alguna consulta falla (la tarea sale igual, sin antigüedad).
 */
async function listarIngresosEnMano(
  supabase: Supa,
  tenedorIds: string[],
): Promise<{ tenedorId: string; fecha: string; montoCentavos: number }[] | null> {
  const [comprobantes, cobros, rendiciones, transferencias] = await Promise.all([
    leerTodasLasPaginas((desde, hasta) =>
      supabase
        .from("comprobantes")
        .select("vendedor_id, created_at, cobrado_centavos")
        .in("vendedor_id", tenedorIds)
        .eq("medio_pago", "efectivo")
        .gt("cobrado_centavos", 0)
        .order("id")
        .range(desde, hasta),
    ),
    leerTodasLasPaginas((desde, hasta) =>
      supabase
        .from("cobros")
        .select("vendedor_id, created_at, monto_centavos")
        .in("vendedor_id", tenedorIds)
        .eq("medio_pago", "efectivo")
        .order("id")
        .range(desde, hasta),
    ),
    // v_rendiciones_ananja (0058) ya filtra a via = 'encargado' por
    // construcción — no hace falta repetir el `.eq`.
    leerTodasLasPaginas((desde, hasta) =>
      supabase
        .from("v_rendiciones_ananja")
        .select("tenedor_id, created_at, monto_ananja_centavos")
        .in("tenedor_id", tenedorIds)
        .order("rendicion_id")
        .range(desde, hasta),
    ),
    leerTodasLasPaginas((desde, hasta) =>
      supabase
        .from("transferencias_caja")
        .select("vendedor_id, created_at, monto_centavos")
        .in("vendedor_id", tenedorIds)
        .eq("destino", "efectivo")
        .order("id")
        .range(desde, hasta),
    ),
  ]);
  if (comprobantes.error || cobros.error || rendiciones.error || transferencias.error) {
    console.error("listarIngresosEnMano", {
      comprobantes: comprobantes.error,
      cobros: cobros.error,
      rendiciones: rendiciones.error,
      transferencias: transferencias.error,
    });
    return null;
  }
  const dia = fechaArgentinaDeTimestamp;
  return [
    ...comprobantes.data.flatMap((c) =>
      c.vendedor_id ? [{ tenedorId: c.vendedor_id, fecha: dia(c.created_at), montoCentavos: c.cobrado_centavos }] : [],
    ),
    ...cobros.data.map((c) => ({ tenedorId: c.vendedor_id, fecha: dia(c.created_at), montoCentavos: c.monto_centavos })),
    ...rendiciones.data.flatMap((r) =>
      r.tenedor_id && r.created_at && r.monto_ananja_centavos !== null
        ? [{ tenedorId: r.tenedor_id, fecha: dia(r.created_at), montoCentavos: r.monto_ananja_centavos }]
        : [],
    ),
    ...transferencias.data.map((t) => ({
      tenedorId: t.vendedor_id,
      fecha: dia(t.created_at),
      montoCentavos: t.monto_centavos,
    })),
  ];
}

/**
 * Pagos de revendedoras pendientes de confirmar
 * (0040_revendedores_pagos_precios.sql). Un error acá no tira abajo el
 * resto de las tareas: se loguea y se sigue sin esta fuente.
 */
async function listarPagosPorConfirmar(supabase: Supa): Promise<PagoPorConfirmarTarea[]> {
  const { data, error } = await supabase
    .from("pagos_revendedor")
    .select(
      "id, vendedor_id, monto_centavos, medio_pago, fecha, created_at, destinatario_id, imagen_path, vendedor:vendedores!pagos_revendedor_vendedor_id_fkey(nombre), destinatario:vendedores!pagos_revendedor_destinatario_id_fkey(nombre, activo, rol)",
    )
    .eq("estado", "pendiente");

  if (error) {
    console.error("listarPagosPorConfirmar", error);
    return [];
  }

  return (data ?? []).map((p) => ({
    pago_id: p.id,
    vendedor_id: p.vendedor_id,
    vendedor_nombre: p.vendedor?.nombre ?? "Una revendedora",
    monto_centavos: p.monto_centavos,
    medio_pago: p.medio_pago,
    fecha: p.fecha,
    informado_el: fechaArgentinaDeTimestamp(p.created_at),
    destinatario_id: p.destinatario_id,
    destinatario_nombre: p.destinatario?.nombre ?? null,
    // 0055_coordinador.sql: el destinatario de un pago puede ser admin o
    // coordinador (antes solo admin) — ver `PagoPorConfirmarTarea` en
    // `lib/tareas.ts` para qué significa cada flag.
    destinatario_activo: Boolean(
      p.destinatario?.activo && (p.destinatario.rol === "admin" || p.destinatario.rol === "coordinador"),
    ),
    destinatario_es_coordinador: p.destinatario?.rol === "coordinador",
    imagen_path: p.imagen_path,
  }));
}

/**
 * Depósitos que un coordinador avisó y todavía nadie resolvió
 * (0057_coordinador_plata_stock.sql). A diferencia de
 * `listarPagosPorConfirmar` no hay destinatario que resolver: le toca a
 * cualquier admin. Un error acá tampoco tira abajo el resto de las tareas.
 */
async function listarDepositosInformadosPorConfirmar(supabase: Supa): Promise<DepositoInformadoTarea[]> {
  const { data, error } = await supabase
    .from("depositos_informados")
    .select(
      "id, tenedor_id, monto_centavos, medio_pago, created_at, imagen_path, tenedor:vendedores!depositos_informados_tenedor_id_fkey(nombre)",
    )
    .eq("estado", "pendiente");

  if (error) {
    console.error("listarDepositosInformadosPorConfirmar", error);
    return [];
  }

  return (data ?? []).map((d) => ({
    deposito_informado_id: d.id,
    tenedor_id: d.tenedor_id,
    tenedor_nombre: d.tenedor?.nombre ?? "Un coordinador",
    monto_centavos: d.monto_centavos,
    medio_pago: d.medio_pago,
    informado_el: fechaArgentinaDeTimestamp(d.created_at),
    imagen_path: d.imagen_path,
  }));
}

/** Fuentes + cálculo en una sola llamada. */
export async function cargarTareas(
  supabase: Supa,
  opciones: OpcionesTareas,
): Promise<{ tareas: Tarea[]; fuentes: FuentesTareas }> {
  const fuentes = await cargarFuentesTareas(supabase, opciones);
  return { tareas: calcularTareas(fuentes.input), fuentes };
}

/** Completa la signed URL del comprobante de las tareas "Confirmar pago" y
 * "Confirmar depósito" (para el link del BottomSheet). Solo server: una
 * llamada a Storage para todos los comprobantes juntos. Si no se puede
 * firmar, la tarea queda sin link (no rompe la pantalla). */
export async function completarComprobantes(supabase: Supa, tareas: Tarea[]): Promise<Tarea[]> {
  const paths = tareas.flatMap((t) => {
    const path = comprobantePathDeTarea(t);
    return path ? [path] : [];
  });
  if (paths.length === 0) return tareas;
  const urls = await getSignedUrls(paths, 3600, supabase);
  return tareas.map((t) => conComprobanteUrl(t, urls));
}
