/**
 * "Después de producir": pérdidas, cobranza esperada, saldo, stock por
 * lote (con fallback FIFO), "costo de la botella" en prosa (dos formatos:
 * agregado y detallado por insumo) y comparación entre lotes/saldo
 * pendiente.
 */

import type { LineaAceiteInput } from "@/lib/dominio/costos-lote/aceite";
import type { LineaEtiquetaInput } from "@/lib/dominio/costos-lote/etiquetas";
import { notaCostoInsumo } from "@/lib/dominio/costos-lote/tipos";
import { notaEnvase, type LineaEnvaseInput } from "@/lib/dominio/costos-lote/envasado";
import { formatNumeroInsumo } from "@/lib/dominio/insumos";
import { formatCentavos, formatMonto } from "@/lib/money";
import { NEGOCIO, type NegocioConfig } from "@/lib/negocio";

type NegocioParaTexto = Pick<NegocioConfig, "envase">;

// ============================================================
// Pérdidas por lote (v_perdidas_lote) — salidas que NO son venta
// (degustación/rotura/regalo/ajuste/otro), valuadas al costo real del lote.
// ============================================================

export type MotivoPerdida = "degustacion" | "rotura" | "regalo" | "ajuste" | "otro";

export interface MovimientoConMotivo {
  motivo: MotivoPerdida | "venta" | null;
  cantidad: number;
}

export interface PerdidaPorMotivo {
  motivo: MotivoPerdida;
  unidades: number;
  costoTotalCentavos: number;
}

/** Espejo de `v_perdidas_lote`: agrupa por motivo (excluye `'venta'` y
 * `null` — un egreso legado sin motivo no se puede llamar "pérdida", no
 * sabemos qué fue) y valúa cada grupo al costo unitario real del lote. */
export function calcularPerdidasLote(
  movimientos: MovimientoConMotivo[],
  costoUnitarioCentavos: number,
): PerdidaPorMotivo[] {
  const porMotivo = new Map<MotivoPerdida, number>();
  for (const m of movimientos) {
    if (m.motivo === null || m.motivo === "venta") continue;
    porMotivo.set(m.motivo, (porMotivo.get(m.motivo) ?? 0) + m.cantidad);
  }
  return Array.from(porMotivo.entries()).map(([motivo, unidades]) => ({
    motivo,
    unidades,
    costoTotalCentavos: unidades * costoUnitarioCentavos,
  }));
}

// ============================================================
// Cobranza esperada por lote (v_cobranza_lote).
// ============================================================

/** Un movimiento de `movimientos_stock` con `lote_id`, para netear
 * "vendidas" de sus devoluciones — ver `calcularVendidasNetas`. */
export interface MovimientoParaCobranza {
  productoId: string;
  tipo: "ingreso" | "egreso";
  cantidad: number;
  /** `true` = egreso con `motivo = 'venta'` (`crear_comprobante`/
   * `actualizar_comprobante`, o `registrar_entrega_revendedor` tipo
   * 'entrega'). Solo tiene sentido en un egreso. */
  esVenta: boolean;
  /** `true` = ingreso de DEVOLUCIÓN (lleva `entrega_id`) — revierte una
   * entrega previa marcada como venta. Solo tiene sentido en un ingreso. */
  esDevolucion: boolean;
}

/**
 * Espejo de `v_cobranza_lote.vendidas`: Σ egresos `motivo = 'venta'` NETOS
 * de sus devoluciones (una entrega a revendedor devuelta parcial o
 * totalmente ya no es una venta completa), nunca negativo. BLOCKER
 * corregido en review de 0029: sin netear, `producidas − vendidas −
 * perdidas ≠ en_depósito` (repro: 100 producidas, entrega 30, devolución
 * 10 -> vendidas tiene que quedar en 20, no 30) — ver
 * `calcularStockPorLote`/`calcularPoolSinAsignarPorProducto`, que ya
 * netean devoluciones con el mismo criterio para `en_depósito`.
 */
export function calcularVendidasNetas(movimientos: MovimientoParaCobranza[]): number {
  let vendidas = 0;
  let devoluciones = 0;
  for (const m of movimientos) {
    if (m.tipo === "egreso" && m.esVenta) {
      vendidas += m.cantidad;
    } else if (m.tipo === "ingreso" && m.esDevolucion) {
      devoluciones += m.cantidad;
    }
  }
  return Math.max(vendidas - devoluciones, 0);
}

export interface CobranzaLoteInput {
  producidas: number;
  /** Vendidas NETAS de devoluciones (`calcularVendidasNetas`). */
  vendidas: number;
  perdidas: number;
  costoAnanjaCentavos: number;
}

export interface CobranzaLote {
  esperadoTotalCentavos: number;
  esperadoPorVendidasCentavos: number;
}

/** Espejo de `v_cobranza_lote`: lo YA cobrado depende del rediseño de Plata
 * (no se calcula acá, ver el comentario de la vista) — estas dos son apenas
 * las expectativas de cobro, siempre al costo Ananja del lote. */
export function calcularCobranzaLote(input: CobranzaLoteInput): CobranzaLote {
  return {
    esperadoTotalCentavos: input.costoAnanjaCentavos * (input.producidas - input.perdidas),
    esperadoPorVendidasCentavos: input.costoAnanjaCentavos * input.vendidas,
  };
}

// ============================================================
// Saldo de un lote (v_saldo_lote)
// ============================================================

export interface SaldoLoteInput {
  aPagarCentavos: number;
  pagadoCentavos: number;
}

/** Espejo de v_saldo_lote.saldo_centavos: nunca negativo (un pago de más
 * ya lo rechaza registrar_pago_lote antes de llegar acá). */
export function calcularSaldoLote(input: SaldoLoteInput): number {
  return Math.max(input.aPagarCentavos - input.pagadoCentavos, 0);
}

// ============================================================
// Stock por lote — explícito (v_stock_por_lote), con fallback FIFO para
// los egresos que no llevan lote_id.
// ============================================================

/** Una fila de `movimientos_stock` que lleva `lote_id` (ingreso o egreso).
 * Un mismo lote puede recibir VARIAS filas del mismo producto — una sola
 * entrega/comprobante puede repartir la misma presentación entre dos
 * lotes ("30 del lote viejo y 20 del nuevo"), y además distintos
 * documentos a lo largo del tiempo tocan el mismo lote — por eso
 * `agregarMovimientosPorLote` sirve para sumarlas ANTES de armar
 * `LoteStockInput`, igual que hacen `egresos_lote`/`devoluciones_lote`
 * (`sum(cantidad) ... group by lote_id, producto_id`) en `v_stock_por_lote`. */
export interface MovimientoStockConLote {
  loteId: string;
  productoId: string;
  tipo: "ingreso" | "egreso";
  cantidad: number;
  /** true si es un ingreso de DEVOLUCIÓN (lleva entrega_id) — el ingreso
   * de PRODUCCIÓN del lote nunca lo es, así que nunca se resta acá. */
  esDevolucion: boolean;
}

export interface AgregadoLote {
  egresosDirectos: number;
  devolucionesDirectas: number;
}

/**
 * Suma todas las filas de `movimientos_stock` de un (lote, producto),
 * sin importar cuántas sean ni de cuántos documentos distintos vengan —
 * mismo criterio que las vistas SQL. La clave del Map es `${loteId}:${productoId}`.
 */
export function agregarMovimientosPorLote(
  movimientos: MovimientoStockConLote[],
): Map<string, AgregadoLote> {
  const porLote = new Map<string, AgregadoLote>();
  for (const m of movimientos) {
    const key = `${m.loteId}:${m.productoId}`;
    const actual = porLote.get(key) ?? { egresosDirectos: 0, devolucionesDirectas: 0 };
    if (m.tipo === "egreso") {
      actual.egresosDirectos += m.cantidad;
    } else if (m.esDevolucion) {
      actual.devolucionesDirectas += m.cantidad;
    }
    porLote.set(key, actual);
  }
  return porLote;
}

/** Una fila de `movimientos_stock` SIN lote_id (`lote_id is null`). */
export interface MovimientoSinLoteInput {
  productoId: string;
  tipo: "ingreso" | "egreso";
  cantidad: number;
  /** true si es un ingreso de DEVOLUCIÓN (lleva entrega_id). */
  esDevolucion: boolean;
}

/**
 * Espejo de `pool_sin_asignar` en `v_stock_por_lote`: por producto,
 * `greatest(Σ egresos sin lote − Σ ingresos sin lote de devolución, 0)`.
 *
 * BLOCKER corregido (review de 0028): una devolución de revendedor SIN
 * lote elegido (ingreso, `entrega_id` no nulo, `lote_id` null) revierte
 * una salida sin lote anterior — sin restarla, el pool se queda "corto"
 * apenas hay un ciclo entrega-sin-lote + devolución-sin-lote, aunque
 * `v_stock_actual` ya volvió a su base. Un ingreso sin lote que NO es
 * devolución (alta manual, ajuste) no se resta: es stock nuevo sin lote de
 * origen, no la reversión de ninguna salida — mismo criterio que
 * `v_stock_por_lote` documenta en el comentario de la vista.
 */
export function calcularPoolSinAsignarPorProducto(
  movimientos: MovimientoSinLoteInput[],
): Map<string, number> {
  const pool = new Map<string, number>();
  for (const m of movimientos) {
    const actual = pool.get(m.productoId) ?? 0;
    if (m.tipo === "egreso") {
      pool.set(m.productoId, actual + m.cantidad);
    } else if (m.esDevolucion) {
      pool.set(m.productoId, actual - m.cantidad);
    }
  }
  for (const [productoId, total] of pool) {
    pool.set(productoId, Math.max(total, 0));
  }
  return pool;
}

export interface LoteStockInput {
  loteId: string;
  productoId: string;
  /** "YYYY-MM-DD", igual que lotes_produccion.fecha. */
  fecha: string;
  /** Desempate cuando dos lotes comparten fecha — orden de creación. */
  createdAt: string;
  producido: number;
  /** Σ movimientos_stock.cantidad egreso con este lote_id. */
  egresosDirectos: number;
  /** Σ movimientos_stock.cantidad ingreso con este lote_id Y entrega_id no
   * nulo (una devolución de revendedor) — el ingreso de PRODUCCIÓN del
   * lote nunca tiene entrega_id, así que nunca se resta acá. */
  devolucionesDirectas: number;
}

export interface StockPorLote {
  loteId: string;
  productoId: string;
  producido: number;
  salidasAsignadas: number;
  salidasSinAsignarAtribuidas: number;
  quedan: number;
}

/**
 * Espejo de `v_stock_por_lote`: primero descuenta a cada lote sus
 * salidas EXPLÍCITAS (egresos con ese lote_id, netos de sus devoluciones);
 * lo que sobra de cada lote (`remanenteTrasDirectas`) es la capacidad
 * disponible para absorber el pool de egresos SIN lote asignado, que se
 * reparte del lote más viejo al más nuevo (fallback FIFO) — así
 * Σquedan siempre cierra contra el stock actual del producto.
 */
export function calcularStockPorLote(
  lotes: LoteStockInput[],
  egresosSinAsignarPorProducto: Map<string, number>,
): StockPorLote[] {
  const porProducto = new Map<string, LoteStockInput[]>();
  for (const lote of lotes) {
    const grupo = porProducto.get(lote.productoId) ?? [];
    grupo.push(lote);
    porProducto.set(lote.productoId, grupo);
  }

  const resultado: StockPorLote[] = [];

  for (const [productoId, items] of porProducto) {
    const ordenados = [...items].sort((a, b) =>
      a.fecha === b.fecha
        ? a.createdAt.localeCompare(b.createdAt)
        : a.fecha.localeCompare(b.fecha),
    );
    const poolSinAsignar = egresosSinAsignarPorProducto.get(productoId) ?? 0;
    let capacidadPrevia = 0;

    for (const lote of ordenados) {
      const directas = Math.max(lote.egresosDirectos - lote.devolucionesDirectas, 0);
      const salidasAsignadas = Math.min(directas, lote.producido);
      const remanenteTrasDirectas = lote.producido - salidasAsignadas;

      const consumidoSinAsignar = Math.min(
        Math.max(poolSinAsignar - capacidadPrevia, 0),
        remanenteTrasDirectas,
      );
      const quedan = remanenteTrasDirectas - consumidoSinAsignar;

      resultado.push({
        loteId: lote.loteId,
        productoId,
        producido: lote.producido,
        salidasAsignadas,
        salidasSinAsignarAtribuidas: consumidoSinAsignar,
        quedan,
      });

      capacidadPrevia += remanenteTrasDirectas;
    }
  }

  return resultado;
}

// ============================================================
// "Costo de la botella" en prosa — mismo patrón que
// `construirLineasCuentaCosto` de `lib/costo-lote.ts` (el modelo viejo),
// ahora sobre el desglose explícito por concepto de
// `v_costo_lote_desglose`/`lote_costos` en vez de "gastos asignados"
// genéricos.
// ============================================================

/** Un concepto directo (aceite/etiqueta/envase) con la cantidad y el
 * precio unitario que lo componen — `null` si ese concepto no se cargó
 * todavía (no aparece como línea). */
export interface ConceptoConCantidad {
  cantidad: number;
  costoUnitarioCentavos: number;
  totalCentavos: number;
}

export interface DesgloseTextoInput {
  aceite: ConceptoConCantidad | null;
  etiqueta: ConceptoConCantidad | null;
  envase: ConceptoConCantidad | null;
  transporteCentavos: number;
  otrosCentavos: number;
  totalCentavos: number;
  costoUnitarioCentavos: number;
  cantidadBotellas: number;
}

/** Reutiliza el mismo shape `{antes, resultado}` que
 * `construirLineasCuentaCosto` (lib/costo-lote.ts) para poder resaltar el
 * resultado de cada línea en negrita al renderizar. */
export interface LineaCosto {
  antes: string;
  resultado: string;
}

/**
 * Arma la cuenta explícita "Costo de la botella" de `/stock/lotes/[id]`:
 * una línea por concepto presente (con cantidad × precio unitario para los
 * directos, solo el monto para los compartidos "su parte"), terminando en
 * "Total ÷ botellas = $ por botella". Un concepto en 0/null simplemente no
 * aparece — no hace falta mostrar "Envase $ 0" cuando todavía no se cargó.
 */
export function construirLineasCostoBotella(
  input: DesgloseTextoInput,
  negocio: NegocioParaTexto = NEGOCIO,
): LineaCosto[] {
  const lineas: LineaCosto[] = [];

  if (input.aceite && input.aceite.totalCentavos > 0) {
    lineas.push({
      antes: `Aceite ${formatNumeroInsumo(input.aceite.cantidad)} L × ${formatCentavos(input.aceite.costoUnitarioCentavos)}/L = `,
      resultado: formatCentavos(input.aceite.totalCentavos),
    });
  }
  if (input.etiqueta && input.etiqueta.totalCentavos > 0) {
    lineas.push({
      antes: `Etiquetas ${formatNumeroInsumo(input.etiqueta.cantidad)} × ${formatCentavos(input.etiqueta.costoUnitarioCentavos)} = `,
      resultado: formatCentavos(input.etiqueta.totalCentavos),
    });
  }
  if (input.envase && input.envase.totalCentavos > 0) {
    lineas.push({
      antes: `Envase ${formatNumeroInsumo(input.envase.cantidad)} × ${formatCentavos(input.envase.costoUnitarioCentavos)} = `,
      resultado: formatCentavos(input.envase.totalCentavos),
    });
  }
  if (input.transporteCentavos > 0) {
    lineas.push({
      antes: "Transporte (su parte) = ",
      resultado: formatCentavos(input.transporteCentavos),
    });
  }
  if (input.otrosCentavos > 0) {
    lineas.push({ antes: "Otros = ", resultado: formatCentavos(input.otrosCentavos) });
  }

  const plural = input.cantidadBotellas === 1 ? negocio.envase.singular : negocio.envase.plural;
  lineas.push({
    antes: `Total ${formatCentavos(input.totalCentavos)} ÷ ${input.cantidadBotellas} ${plural} = Costo de producción `,
    resultado: `${formatCentavos(input.costoUnitarioCentavos)} por ${negocio.envase.singular}`,
  });

  return lineas;
}

// ============================================================
// "Costo de la botella" detallado (0029) — misma idea que
// `construirLineasCostoBotella` de arriba, pero con UNA línea por insumo de
// etiqueta (frente/retro por separado, con su envío) y la nota "sin IVA $X +
// IVA 21%" en las líneas que corresponda (envase/etiqueta, nunca aceite) —
// usado por `/stock/lotes/[id]`. La versión vieja de arriba sigue viva
// (usada por lotes cargados antes de esta migración, o mientras se sigue
// mostrando una sola fila agregada de etiqueta en otros lugares).
// ============================================================

export interface DesgloseDetalladoInput {
  aceite: LineaAceiteInput | null;
  /** Una fila por insumo de etiqueta (frente, retro) — vacío si no hay
   * ninguna cargada todavía. */
  etiquetas: LineaEtiquetaInput[];
  envase: LineaEnvaseInput | null;
  transporteCentavos: number;
  /** % usado en modo directo (0039, sobre aceite + envase + etiquetas de ESTA
   * presentación) — `null` cuando el transporte de este pedido es
   * compartido/fijo, o no hay transporte cargado. */
  transportePct: number | null;
  otrosCentavos: number;
  totalCentavos: number;
  costoUnitarioCentavos: number;
  cantidadBotellas: number;
  ivaPct: number;
  /** `true`: los precios ya se cargaron con IVA incluido — no hace falta
   * la nota "sin IVA + IVA%" porque no hubo gross-up. Rige etiquetas Y la
   * rama legado de envase (anterior a 0038) — ver `envaseSinIva` para el
   * toggle propio del envase, desde 0038. */
  incluyeIva: boolean;
  /** `lotes_produccion.envase_cobrado_sin_iva` (0038, ver
   * `0053_pago_vs_costo_insumo.sql`): `true` si el proveedor cobra el envase sin
   * IVA — el costo le suma `ivaPct`, lo pagado no. Reemplaza, desde 0053,
   * a la vieja inferencia "a_pagar < total ⇒ sin IVA" (`notaEnvase`), que
   * ahora también se activa solo por un precio para costo distinto, con
   * el proveedor cobrando CON IVA. `undefined`/ausente: `false` (mismo criterio
   * que la columna, y compatible con callers que todavía no lo mandan). */
  envaseSinIva?: boolean;
}

/**
 * Arma la cuenta explícita "Costo de la botella" de `/stock/lotes/[id]`
 * (0029): aceite, una línea por insumo de etiqueta (con su envío y la nota
 * de IVA), envase (con la nota de IVA), transporte (mostrando el % cuando
 * el pedido usa modo directo) y otros — terminando en "Total ÷ botellas =
 * $ por botella", igual que `construirLineasCostoBotella`.
 */
export function construirLineasCostoBotellaDetallada(
  input: DesgloseDetalladoInput,
  negocio: NegocioParaTexto = NEGOCIO,
): LineaCosto[] {
  const lineas: LineaCosto[] = [];

  if (input.aceite && input.aceite.totalCentavos > 0) {
    const { cantidad, costoUnitarioCentavos, totalCentavos, dolarCentavos, usdPorLitroCentavos } =
      input.aceite;
    const antes =
      dolarCentavos != null && usdPorLitroCentavos != null
        ? `Aceite ${formatNumeroInsumo(cantidad)} L × ${formatMonto("USD", usdPorLitroCentavos)} × ${formatCentavos(dolarCentavos)} = `
        : `Aceite ${formatNumeroInsumo(cantidad)} L × ${formatCentavos(costoUnitarioCentavos)}/L = `;
    lineas.push({ antes, resultado: formatCentavos(totalCentavos) });
  }

  for (const etiqueta of input.etiquetas) {
    if (etiqueta.totalCentavos <= 0) continue;
    const envio = etiqueta.envioCentavos
      ? `, envío ${formatCentavos(etiqueta.envioCentavos)}`
      : "";
    lineas.push({
      antes: `${etiqueta.nombreInsumo} ${formatNumeroInsumo(etiqueta.cantidad)} × ${formatCentavos(etiqueta.costoUnitarioCentavos)}${notaCostoInsumo(etiqueta.netoCentavos, etiqueta.costoNetoCentavos, input.ivaPct, !input.incluyeIva)}${envio} = `,
      resultado: formatCentavos(etiqueta.totalCentavos),
    });
  }

  if (input.envase && input.envase.totalCentavos > 0) {
    lineas.push({
      antes: `Envase ${formatNumeroInsumo(input.envase.cantidad)} × ${formatCentavos(input.envase.costoUnitarioCentavos)}${notaEnvase(input.envase, input.ivaPct, input.incluyeIva, input.envaseSinIva ?? false)} = `,
      resultado: formatCentavos(input.envase.totalCentavos),
    });
  }

  if (input.transporteCentavos > 0) {
    lineas.push({
      antes:
        input.transportePct != null
          ? `Transporte (${input.transportePct}% sobre aceite + envasado + etiquetas) = `
          : "Transporte (su parte) = ",
      resultado: formatCentavos(input.transporteCentavos),
    });
  }

  if (input.otrosCentavos > 0) {
    lineas.push({ antes: "Otros = ", resultado: formatCentavos(input.otrosCentavos) });
  }

  const plural = input.cantidadBotellas === 1 ? negocio.envase.singular : negocio.envase.plural;
  lineas.push({
    antes: `Total ${formatCentavos(input.totalCentavos)} ÷ ${input.cantidadBotellas} ${plural} = Costo de producción `,
    resultado: `${formatCentavos(input.costoUnitarioCentavos)} por ${negocio.envase.singular}`,
  });

  return lineas;
}

// ============================================================
// Comparación entre lotes (/stock/lotes — "+8% vs pedido anterior") y
// etiqueta de saldo pendiente (badge "Pago pendiente $X").
// ============================================================

export interface ComparacionCosto {
  /** Redondeado al entero más cercano — "+8%"/"-5%" en pantalla. */
  pctCambio: number;
  subio: boolean;
}

/**
 * Compara el costo unitario de un lote contra el del lote anterior (misma
 * presentación) — `null` cuando no hay con qué comparar (sin lote
 * anterior, alguno de los dos en 0, o sin cambio real tras redondear a
 * entero) para que el caller simplemente no muestre nada.
 */
export function compararCostoUnitario(
  actualCentavos: number,
  anteriorCentavos: number | null | undefined,
): ComparacionCosto | null {
  if (!anteriorCentavos || anteriorCentavos <= 0 || actualCentavos <= 0) return null;
  const pctCambio = Math.round(((actualCentavos - anteriorCentavos) / anteriorCentavos) * 100);
  if (pctCambio === 0) return null;
  return { pctCambio, subio: pctCambio > 0 };
}

/** Texto del badge de saldo pendiente de `/stock/lotes` — `null` si el
 * lote ya está saldado (no se muestra ningún badge). */
export function etiquetaSaldoPendiente(saldoCentavos: number): string | null {
  if (saldoCentavos <= 0) return null;
  return `Pago pendiente ${formatCentavos(saldoCentavos)}`;
}
