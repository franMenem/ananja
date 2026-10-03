/**
 * Primitivas compartidas por el resto de `lib/dominio/costos-lote/`: IVA,
 * desglose de costo por presentación (directo/compartido) y "costo Ananja"
 * + precios sugeridos a partir del costo real — la base sobre la que se
 * arman `aceite.ts`/`etiquetas.ts`/`envasado.ts`/`transporte.ts`/
 * `cobranza.ts`/`pedido.ts`, sin depender de ninguno de ellos (para no
 * generar ciclos de imports).
 */

import { formatCentavos } from "@/lib/money";

// ============================================================
// Desglose de costo por presentación (v_costo_lote_desglose)
// ============================================================

export interface ItemPesoInput {
  productoId: string;
  presentacionMl: number;
  cantidad: number;
}

export interface CostoDirectoInput {
  productoId: string;
  concepto: "aceite" | "etiqueta" | "envase";
  totalCentavos: number;
}

export interface CostoCompartidoInput {
  concepto: "transporte" | "otro";
  totalCentavos: number;
}

/** Gasto legado (anterior a esta migración, `concepto_lote is null`)
 * asignado directo a una presentación (`productoId` no null) o compartido
 * entre todas (`productoId` null) — mismo criterio de siempre. */
export interface GastoLegacyInput {
  productoId: string | null;
  montoCentavos: number;
}

export interface DesgloseCostoItem {
  productoId: string;
  aceiteCentavos: number;
  etiquetaCentavos: number;
  envaseCentavos: number;
  transporteCentavos: number;
  otrosCentavos: number;
  totalCentavos: number;
  costoUnitarioCentavos: number;
  tieneCostos: boolean;
}

/** Espejo del CTE peso_item: volumen = presentación × cantidad. */
function pesoItem(item: ItemPesoInput): number {
  return item.presentacionMl * item.cantidad;
}

/** Reparte un monto compartido entre ítems proporcionalmente a su peso
 * (mismo criterio que `calcularCostoLoteItems` en lib/dominio/calculos.ts). */
function repartirCompartido(
  totalCompartido: number,
  items: ItemPesoInput[],
): Map<string, number> {
  const pesoTotal = items.reduce((acc, item) => acc + pesoItem(item), 0);
  const porProducto = new Map<string, number>();
  for (const item of items) {
    porProducto.set(
      item.productoId,
      pesoTotal === 0 ? 0 : Math.round((totalCompartido * pesoItem(item)) / pesoTotal),
    );
  }
  return porProducto;
}

/**
 * Espejo de `v_costo_lote_desglose`: aceite/etiqueta/envase directos por
 * presentación; transporte/otros compartidos repartidos por volumen;
 * gastos legado (sin concepto_lote) se pliegan en "otros", directos o
 * repartidos según tuvieran o no producto_id.
 */
export function calcularDesgloseLote(
  items: ItemPesoInput[],
  costosDirectos: CostoDirectoInput[],
  costosCompartidos: CostoCompartidoInput[],
  gastosLegacy: GastoLegacyInput[] = [],
): DesgloseCostoItem[] {
  const sumaDirecto = (productoId: string, concepto: CostoDirectoInput["concepto"]) =>
    costosDirectos
      .filter((c) => c.productoId === productoId && c.concepto === concepto)
      .reduce((acc, c) => acc + c.totalCentavos, 0);

  const transporteTotal = costosCompartidos
    .filter((c) => c.concepto === "transporte")
    .reduce((acc, c) => acc + c.totalCentavos, 0);
  const otroTotal = costosCompartidos
    .filter((c) => c.concepto === "otro")
    .reduce((acc, c) => acc + c.totalCentavos, 0);
  const legacyCompartidoTotal = gastosLegacy
    .filter((g) => g.productoId === null)
    .reduce((acc, g) => acc + g.montoCentavos, 0);

  const transportePorItem = repartirCompartido(transporteTotal, items);
  const otroPorItem = repartirCompartido(otroTotal, items);
  const legacyCompartidoPorItem = repartirCompartido(legacyCompartidoTotal, items);

  return items.map((item) => {
    const aceiteCentavos = sumaDirecto(item.productoId, "aceite");
    const etiquetaCentavos = sumaDirecto(item.productoId, "etiqueta");
    const envaseCentavos = sumaDirecto(item.productoId, "envase");
    const legacyDirecto = gastosLegacy
      .filter((g) => g.productoId === item.productoId)
      .reduce((acc, g) => acc + g.montoCentavos, 0);

    const transporteCentavos = transportePorItem.get(item.productoId) ?? 0;
    const otrosCentavos =
      (otroPorItem.get(item.productoId) ?? 0) +
      legacyDirecto +
      (legacyCompartidoPorItem.get(item.productoId) ?? 0);

    const totalCentavos =
      aceiteCentavos + etiquetaCentavos + envaseCentavos + transporteCentavos + otrosCentavos;
    const costoUnitarioCentavos =
      totalCentavos === 0 ? 0 : Math.round(totalCentavos / item.cantidad);

    return {
      productoId: item.productoId,
      aceiteCentavos,
      etiquetaCentavos,
      envaseCentavos,
      transporteCentavos,
      otrosCentavos,
      totalCentavos,
      costoUnitarioCentavos,
      tieneCostos: totalCentavos > 0,
    };
  });
}

// ============================================================
// "Costo Ananja" y precios de reventa sugeridos, a partir del costo REAL
// del lote — ver v_costo_lote_desglose (supabase/migrations/0028_costos_por_lote.sql).
// ============================================================

export interface PorcentajesLote {
  gananciaPct: number;
  mayoristaPct: number;
  minoristaPct: number;
}

export interface PreciosSugeridos {
  /** El que EFECTIVAMENTE se usa (redondeado si se cargó uno, si no el
   * calculado) — mismo criterio que `v_costo_lote_desglose.costo_ananja_centavos`
   * desde `0054_costo_ananja_redondeado.sql`: `coalesce(redondeado,
   * calculado)`. Es lo que se le exige a las revendedoras y desde donde se
   * encadenan los sugeridos mayorista/minorista (decisión de Fran: A —
   * sugeridos desde el redondeado, no desde el calculado puro). */
  costoAnanjaCentavos: number;
  /** Costo Ananja calculado, SIN el redondeo — costo real × (1+ganancia%),
   * con decimales. Siempre presente, se muestre o no un redondeo. */
  costoAnanjaCalculadoCentavos: number;
  mayoristaSugeridoCentavos: number;
  minoristaSugeridoCentavos: number;
}

/**
 * Filosofía del negocio: el costo real de producción YA incluye la
 * ganancia de la empresa en el momento en que se lo cobra a un vendedor
 * (admin o revendedor) — `costoAnanjaCalculadoCentavos` = costo real × (1 +
 * ganancia%) es el punto de partida de lo que CUALQUIER vendedor le debe a
 * la empresa por botella. Desde `0054_costo_ananja_redondeado.sql`, Fran
 * puede cargar un REDONDEADO por pedido y presentación (sale con decimales
 * el calculado) — `costoAnanjaRedondeadoCentavos` cuando está presente
 * REEMPLAZA al calculado como "costo Ananja" efectivo (`costoAnanjaCentavos`
 * = `redondeado ?? calculado`, mismo `coalesce` que la vista). Márgenes
 * ENCADENADOS (planilla de costos del dueño —
 * supabase/migrations/0029_costos_reales_lote.sql): `mayoristaSugeridoCentavos`
 * = costo Ananja EFECTIVO × (1 + mayorista%); `minoristaSugeridoCentavos` =
 * MAYORISTA sugerido × (1 + minorista%) — ya NO sobre costo Ananja directo,
 * sino sobre el escalón anterior de la cadena costo → distribuidor →
 * mayorista → minorista. Cada paso redondea sobre el anterior YA
 * redondeado, igual que `calcularPrecioItem` (lib/dominio/calculos.ts).
 */
export function calcularPreciosSugeridos(
  costoUnitarioCentavos: number,
  pcts: PorcentajesLote,
  costoAnanjaRedondeadoCentavos?: number | null,
): PreciosSugeridos {
  const costoAnanjaCalculadoCentavos = Math.round(
    (costoUnitarioCentavos * (100 + pcts.gananciaPct)) / 100,
  );
  const costoAnanjaCentavos = costoAnanjaRedondeadoCentavos ?? costoAnanjaCalculadoCentavos;
  const mayoristaSugeridoCentavos = Math.round(
    (costoAnanjaCentavos * (100 + pcts.mayoristaPct)) / 100,
  );
  const minoristaSugeridoCentavos = Math.round(
    (mayoristaSugeridoCentavos * (100 + pcts.minoristaPct)) / 100,
  );
  return {
    costoAnanjaCentavos,
    costoAnanjaCalculadoCentavos,
    mayoristaSugeridoCentavos,
    minoristaSugeridoCentavos,
  };
}

// ============================================================
// IVA — Ananja es MONOTRIBUTO: el IVA de envase/etiqueta NO es recuperable,
// es parte del costo (el aceite no tiene factura/IVA, nunca se le aplica).
// Espejo de `aplicar_costos_lote` § IVA (0029_costos_reales_lote.sql).
// ============================================================

/**
 * Suma el IVA a un precio neto — o lo devuelve tal cual si `incluyeIva` es
 * `true` (el precio de `p_costos` ya venía con IVA). Redondeo estándar,
 * igual que el resto de la app.
 */
export function aplicarIva(
  precioCentavos: number,
  ivaPct: number,
  incluyeIva: boolean,
): number {
  if (incluyeIva) return precioCentavos;
  return Math.round((precioCentavos * (100 + ivaPct)) / 100);
}

// ============================================================
// Notas de IVA/precio-para-costo compartidas por envase y etiqueta —
// "sin IVA $X + IVA 21%" (`notaSinIva`) y, desde 0053, el precio para el
// costo si es distinto del pagado (`notaCostoInsumo`).
// ============================================================

/** "" sin nota (incluye IVA, o sin el neto guardado); si no, " (sin IVA $X
 * + IVA 21%)" para que la cuenta muestre de dónde sale el con-IVA. */
export function notaSinIva(
  netoCentavos: number | null,
  ivaPct: number,
  incluyeIva: boolean,
): string {
  if (incluyeIva || netoCentavos === null) return "";
  return ` (sin IVA ${formatCentavos(netoCentavos)} + IVA ${ivaPct}%)`;
}

/**
 * Nota de IVA/precio-para-costo de un renglón (envase o etiqueta) cuyo
 * costo puede usar un precio distinto del pagado/ya comprado (0053: precio
 * para el costo, `costoNetoCentavos`) y/o sumarle IVA (`sinIva`) — las dos
 * cosas son independientes desde 0053, así que se muestran juntas SOLO
 * cuando corresponde cada una, nunca se infiere una de la otra:
 *  - las dos: " (pagado $X · para el costo $Y + IVA 21%)".
 *  - solo precio para costo distinto (el proveedor cobra CON IVA): " (pagado $X ·
 *    para el costo $Y)" — SIN mencionar IVA, que es justo el bug que
 *    corrige esta función (antes se mostraba "sin IVA" solo porque el pago
 *    daba menor al costo, aunque la causa fuera esta).
 *  - solo sin IVA (mismo precio para costo, o sin cargar): " (sin IVA $X +
 *    IVA 21%)", igual que `notaSinIva`.
 *  - ninguna de las dos: "".
 */
export function notaCostoInsumo(
  netoCentavos: number | null,
  costoNetoCentavos: number | null | undefined,
  ivaPct: number,
  sinIva: boolean,
): string {
  const costoDistinto =
    costoNetoCentavos != null && netoCentavos !== null && costoNetoCentavos !== netoCentavos;
  if (costoDistinto) {
    const notaIva = sinIva ? ` + IVA ${ivaPct}%` : "";
    return ` (pagado ${formatCentavos(netoCentavos!)} · para el costo ${formatCentavos(costoNetoCentavos!)}${notaIva})`;
  }
  if (sinIva) {
    return notaSinIva(netoCentavos, ivaPct, false);
  }
  return "";
}
