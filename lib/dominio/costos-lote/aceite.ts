/**
 * Costo del aceite: litros por ítem, costo en ARS (ARS explícito > USD ×
 * dólar), deuda con el proveedor en USD, y el tanque (promedio ponderado
 * de compras, stock y valor restante — v_tanque_aceite).
 */

import { etiquetasPorBotella, type RecetaEtiquetaInput } from "@/lib/dominio/costos-lote/etiquetas";
import { formatNumeroInsumo } from "@/lib/dominio/insumos";
import { formatCentavos } from "@/lib/money";

// ============================================================
// Consumo de aceite/etiqueta (aplicar_costos_lote § aceite/etiqueta)
// ============================================================

export interface ItemLoteParaConsumo {
  productoId: string;
  presentacionMl: number;
  cantidad: number;
}

/** Espejo de `presentacion_ml / 1000.0 * cantidad` en aplicar_costos_lote. */
export function litrosAceitePorItem(
  item: Pick<ItemLoteParaConsumo, "presentacionMl" | "cantidad">,
): number {
  return (item.presentacionMl / 1000) * item.cantidad;
}

export interface ConsumoAceiteEtiquetaItem {
  productoId: string;
  aceiteCantidadLitros: number;
  aceiteCentavos: number;
  etiquetaCantidadUnidades: number;
  etiquetaCentavos: number;
}

/** Vista previa en vivo del formulario de lote: cuánto va a costar el
 * aceite/etiqueta de cada presentación antes de guardar. `null` en el
 * precio = ese concepto no se cargó (mismo criterio que
 * aplicar_costos_lote: sin precio, no hay lote_costos de ese concepto). */
export function calcularConsumoAceiteEtiquetaLote(
  items: ItemLoteParaConsumo[],
  recetas: RecetaEtiquetaInput[],
  precioLitroAceiteCentavos: number | null,
  precioEtiquetaCentavos: number | null,
): ConsumoAceiteEtiquetaItem[] {
  return items.map((item) => {
    const litros = litrosAceitePorItem(item);
    const aceiteCentavos =
      precioLitroAceiteCentavos == null
        ? 0
        : Math.round(litros * precioLitroAceiteCentavos);

    const unidades = etiquetasPorBotella(item.productoId, recetas) * item.cantidad;
    const etiquetaCentavos =
      precioEtiquetaCentavos == null ? 0 : Math.round(unidades * precioEtiquetaCentavos);

    return {
      productoId: item.productoId,
      aceiteCantidadLitros: litros,
      aceiteCentavos,
      etiquetaCantidadUnidades: unidades,
      etiquetaCentavos,
    };
  });
}

// ============================================================
// Precio del litro de aceite en ARS — 0030: el aceite se carga en USD (el
// precio del litro en USD) y el dólar (ARS por USD) se carga por lote.
// Espejo de la precedencia de `aplicar_costos_lote` (0030): ARS explícito >
// USD×dólar > null (sin línea de aceite — el fallback de `v_tanque_aceite`
// es responsabilidad del caller, que ya resuelve el promedio ponderado
// contra la base antes de llegar acá, igual que hace hoy
// `precioLitroAceiteCentavos` en `calcularConsumoAceiteEtiquetaLote`/
// `construirPreviewCostosLote`).
// ============================================================

export interface CalcularCostoAceiteInput {
  /** Litros de ESTA presentación (`litrosAceitePorItem`). */
  litros: number;
  /** Precio del litro de aceite en USD, en centavos de USD (ej. USD 5,00/L
   * = 500). `null` si no se cargó. */
  usdPorLitroCentavos: number | null;
  /** Dólar del lote — ARS por USD, en centavos (ej. $1.000 = 100000).
   * `null` si no se cargó. */
  dolarCentavos: number | null;
  /** Override ARS explícito del litro de aceite, en centavos (el campo
   * `precio_litro_aceite_centavos` de siempre) — GANA sobre USD×dólar
   * cuando está presente. `null` si no se cargó. */
  arsPorLitroCentavos: number | null;
}

/**
 * Costo en ARS centavos del aceite de ESTA presentación, con la misma
 * precedencia que `aplicar_costos_lote` (0030): ARS explícito >
 * USD×dólar (cuando AMBOS `usdPorLitroCentavos`/`dolarCentavos` están
 * cargados) > `null` (nada cargado — el caller decide si cae al promedio
 * del tanque, esta función no lo sabe). Fórmula USD×dólar, en centavos ARS
 * por litro: `round(usdPorLitroCentavos * dolarCentavos / 100)` — repro
 * exacta de la planilla: USD 5,00/L (500) × dólar $1.000 (100000) =
 * round(500 * 100000 / 100) = 500.000 = $5.000,00/L; 0,25 L -> $1.250,00;
 * 0,5 L -> $2.500,00.
 */
export function calcularCostoAceite(input: CalcularCostoAceiteInput): number | null {
  if (input.arsPorLitroCentavos !== null) {
    return Math.round(input.litros * input.arsPorLitroCentavos);
  }
  if (input.usdPorLitroCentavos !== null && input.dolarCentavos !== null) {
    const precioLitroArsCentavos = Math.round(
      (input.usdPorLitroCentavos * input.dolarCentavos) / 100,
    );
    return Math.round(input.litros * precioLitroArsCentavos);
  }
  return null;
}

/** Insumo de `calcularDeudaAceiteLoteUsdCentavos`. */
export interface CalcularDeudaAceiteLoteInput {
  /** Σ `lote_costos.cantidad` (concepto 'aceite') del lote. */
  litros: number;
  /** `true` cuando la línea de aceite del lote vino de la rama USD × dólar
   * de `aplicar_costos_lote` — en la práctica, si `lote_costos.descripcion`
   * de esa línea quedó cargada (la ÚNICA rama que la setea; ARS explícito y
   * el promedio del tanque la dejan `null`). */
  usaBranchUsd: boolean;
  usdPorLitroCentavos: number | null;
}

/**
 * Espejo puro de `__SCHEMA__.sincronizar_deuda_aceite_lote`
 * (`supabase/migrations/0047_deuda_aceite_proveedor.sql`): cuántos USD se
 * le deben al proveedor de aceite por ESTE lote. `null` cuando no hay un
 * USD/L confiable del que derivar la deuda — sin litros, sin
 * `usdPorLitroCentavos`, o cuando el precio de la línea de aceite no vino
 * de la rama USD × dólar (`usaBranchUsd` en `false`: ARS explícito o
 * promedio del tanque) — mismo criterio que `calcularCostoAceite` para "no
 * inventar un USD del que no hay certeza".
 */
export function calcularDeudaAceiteLoteUsdCentavos(
  input: CalcularDeudaAceiteLoteInput,
): number | null {
  if (input.litros <= 0 || !input.usaBranchUsd || input.usdPorLitroCentavos === null) {
    return null;
  }
  return Math.round(input.litros * input.usdPorLitroCentavos);
}

// ============================================================
// Tanque de aceite (v_tanque_aceite) — promedio ponderado de compras,
// stock restante y valor restante de un insumo de materia prima.
// ============================================================

export interface CompraInsumoInput {
  cantidad: number;
  montoCentavos: number;
}

/** Σ monto / Σ cantidad de las compras (ingresos con gasto asociado) — el
 * costo por litro "real" del tanque. `null` sin ninguna compra (no hay
 * costo basis). */
export function calcularCostoPromedioPonderado(compras: CompraInsumoInput[]): number | null {
  const totalCantidad = compras.reduce((acc, c) => acc + c.cantidad, 0);
  if (totalCantidad <= 0) return null;
  const totalMonto = compras.reduce((acc, c) => acc + c.montoCentavos, 0);
  return Math.round(totalMonto / totalCantidad);
}

export interface TanqueAceiteInput {
  compras: CompraInsumoInput[];
  litrosIngresados: number;
  litrosConsumidos: number;
}

export interface TanqueAceite {
  litrosComprados: number;
  litrosConsumidos: number;
  litrosRestantes: number;
  costoPromedioCentavosPorLitro: number | null;
  valorRestanteCentavos: number | null;
}

/**
 * Espejo de `v_tanque_aceite`: litros comprados/consumidos/restantes +
 * costo promedio ponderado y valor del remanente. `litrosRestantes` usa
 * TODOS los ingresos (compras o no, mismo criterio que `v_stock_insumos`),
 * no solo los de `compras`.
 *
 * (Revisión: una versión anterior tenía acá un `precioUltimaCompraCentavos`
 * de fallback para cuando no había promedio ponderado — era código muerto,
 * porque "última compra" y "compras" comparten el mismo criterio: si existe
 * una última compra también hay al menos una fila en `compras`, así que esa
 * rama nunca se alcanzaba. Se eliminó junto con su equivalente en
 * `v_tanque_aceite`, en vez de simularlo.)
 */
export function calcularTanqueAceite(input: TanqueAceiteInput): TanqueAceite {
  const litrosComprados = input.compras.reduce((acc, c) => acc + c.cantidad, 0);
  const litrosRestantes = input.litrosIngresados - input.litrosConsumidos;

  // Espejo exacto de v_tanque_aceite: `valor_restante_centavos` usa el
  // promedio SIN redondear (Σ monto / Σ cantidad) multiplicado por los
  // litros restantes, y recién ahí redondea — NO reutiliza
  // `costo_promedio_centavos_por_litro` (que sí está redondeado, es para
  // mostrar). Encadenar el ya-redondeado acá daría un valor_restante
  // distinto al de la vista (arrastra el error de redondeo del promedio
  // multiplicado por cientos/miles de litros).
  let costoPromedioCentavosPorLitro: number | null;
  let valorRestanteCentavos: number | null;
  if (litrosComprados > 0) {
    const promedioSinRedondear =
      input.compras.reduce((acc, c) => acc + c.montoCentavos, 0) / litrosComprados;
    costoPromedioCentavosPorLitro = Math.round(promedioSinRedondear);
    valorRestanteCentavos = Math.round(litrosRestantes * promedioSinRedondear);
  } else {
    costoPromedioCentavosPorLitro = null;
    valorRestanteCentavos = null;
  }

  return {
    litrosComprados,
    litrosConsumidos: input.litrosConsumidos,
    litrosRestantes,
    costoPromedioCentavosPorLitro,
    valorRestanteCentavos,
  };
}

// ============================================================
// Prosa: "Ya comprado" — aceite (paso "Revisá el pedido").
// ============================================================

/** Una línea de aceite ya lista para mostrar en el desglose detallado
 * (`cobranza.ts` § `construirLineasCostoBotellaDetallada`). */
export interface LineaAceiteInput {
  cantidad: number;
  costoUnitarioCentavos: number;
  totalCentavos: number;
  /** Dólar (ARS por USD) y precio del litro de aceite en USD del LOTE
   * (0030 — `v_costo_lote_desglose.dolar_centavos`/
   * `.precio_litro_aceite_usd_centavos`, mismos para todas sus
   * presentaciones). Cuando AMBOS están presentes la línea muestra la
   * cuenta completa "0,25 L × USD 5,00 × $ 1.000,00 = $ 1.250,00" en vez de
   * solo el ARS/L ya resuelto — `null`/ausente: el aceite de este lote vino
   * de un override ARS explícito o del promedio del tanque, se muestra la
   * fórmula de siempre ("0,25 L × $ 5.000,00/L = ..."). */
  dolarCentavos?: number | null;
  usdPorLitroCentavos?: number | null;
}

/**
 * Nota de "Ya comprado" — aceite: litros totales del pedido × precio por
 * litro ya resuelto (ARS). `CalcularPedidoInput.precioLitroAceiteCentavos`
 * ya viene resuelto (ARS explícito > USD × dólar > tanque, ver
 * `construirEntradaPedido`) — el desglose "USD × dólar" de
 * `construirLineasCostoBotellaDetallada` no está disponible en esta
 * pantalla porque esa entrada no lleva el dólar/USD del lote por separado.
 */
export function notaAceitePedido(litrosTotales: number, precioLitroCentavos: number): string {
  return `${formatNumeroInsumo(litrosTotales)} L × ${formatCentavos(precioLitroCentavos)}/L`;
}
