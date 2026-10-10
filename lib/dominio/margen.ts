/**
 * Espejo puro (sin Supabase) de `supabase/migrations/0031_margen_ventas.sql`:
 * margen de venta por unidad (Ananja / vendedor) y atribución de costo FIFO
 * para ventas sin lote elegido. El resultado neto por feria
 * (`v_resultado_feria`) no tiene mirror acá — se lee tal cual de esa vista.
 * Mismo criterio que `lib/costos-lote.ts`: estas funciones no leen la base,
 * solo reproducen la aritmética de las vistas para poder testearla con
 * fixtures. También tiene los helpers de presentación (formato, color,
 * selección del período elegido) compartidos por `components/ganancia/*`
 * (`labelDePeriodo` para los períodos vive en `lib/fechas.ts`).
 */

import { formatCentavos } from "@/lib/money";

// ============================================================
// Atribución de costo FIFO (comprobante_items sin lote + ventas_revendedor
// viejas sin lote_id; desde 0040 las ventas de revendedora traen su lote y
// cuentan como asignación directa, igual que un comprobante con lote) — ver
// el comentario de cabecera de 0031_margen_ventas.sql para el porqué de
// este pool independiente del de `v_stock_por_lote`.
// ============================================================

export interface LoteCapacidadInput {
  loteId: string;
  productoId: string;
  /** "YYYY-MM-DD", igual que lotes_produccion.fecha. */
  fecha: string;
  /** Desempate cuando dos lotes comparten fecha. */
  createdAt: string;
  /** lote_items.cantidad de esta presentación en este lote. */
  producido: number;
  /** Σ comprobante_items.cantidad + Σ ventas_revendedor.cantidad con
   * lote_id = este lote (asignación directa, no pasa por el FIFO). */
  asignadoDirecto: number;
}

export type OrigenVenta = "comprobante" | "revendedor";

export interface DemandaSinLoteInput {
  origen: OrigenVenta;
  documentoId: string;
  fecha: string;
  createdAt: string;
  /** Desempate final entre eventos con misma fecha/createdAt (ci.id / vr.id). */
  ordenId: string;
  productoId: string;
  cantidad: number;
  vendedorId: string;
  feriaId: string | null;
  precioUnitarioVentaCentavos: number | null;
  /** Solo origen 'revendedor': ventas_revendedor.precio_costo_centavos. */
  precioCostoRealCentavos: number | null;
}

export interface AtribucionFifoResultado {
  origen: OrigenVenta;
  documentoId: string;
  fecha: string;
  productoId: string;
  /** `null`: la demanda superó la capacidad conocida de lotes — no se pudo
   * estimar ningún lote para este remanente. */
  loteId: string | null;
  vendedorId: string;
  feriaId: string | null;
  cantidad: number;
  precioUnitarioVentaCentavos: number | null;
  precioCostoRealCentavos: number | null;
}

function compararPorFechaYDesempate<T extends { fecha: string; createdAt: string }>(
  a: T,
  b: T,
  desempate: (a: T, b: T) => number,
): number {
  if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
  if (a.createdAt !== b.createdAt) return a.createdAt.localeCompare(b.createdAt);
  return desempate(a, b);
}

/**
 * Espejo de las CTEs `lote_capacidad_off`/`demanda_off`/`lote_unidades`/
 * `demanda_unidades`/`unidades_asignadas` de `v_margen_ventas`: por
 * producto, ordena los lotes por (fecha, created_at, lote_id) y la demanda
 * sin lote por (fecha, created_at, orden_id), y consume la capacidad de
 * cada lote (producido − asignado a mano) en ese orden, partiendo una venta
 * en dos filas si cruza el límite de un lote. Equivalente exacto de la
 * explosión unidad por unidad de la vista (mismo resultado, sin iterar
 * botella por botella) — un two-pointer sobre los mismos intervalos
 * acumulados. El remanente que no encuentra capacidad queda con
 * `loteId: null` (no se pudo estimar, pero se sigue devolviendo la fila).
 */
export function atribuirCostoFifo(
  lotes: LoteCapacidadInput[],
  demanda: DemandaSinLoteInput[],
): AtribucionFifoResultado[] {
  const resultado: AtribucionFifoResultado[] = [];
  const productos = new Set<string>([
    ...lotes.map((l) => l.productoId),
    ...demanda.map((d) => d.productoId),
  ]);

  for (const productoId of productos) {
    const lotesProducto = lotes
      .filter((l) => l.productoId === productoId)
      .map((l) => ({ ...l, capacidad: Math.max(l.producido - l.asignadoDirecto, 0) }))
      .filter((l) => l.capacidad > 0)
      .sort((a, b) => compararPorFechaYDesempate(a, b, (x, y) => x.loteId.localeCompare(y.loteId)));

    const demandaProducto = demanda
      .filter((d) => d.productoId === productoId)
      .sort((a, b) => compararPorFechaYDesempate(a, b, (x, y) => x.ordenId.localeCompare(y.ordenId)));

    let loteIdx = 0;
    let loteConsumido = 0;

    for (const d of demandaProducto) {
      let restante = d.cantidad;

      while (restante > 0 && loteIdx < lotesProducto.length) {
        const lote = lotesProducto[loteIdx];
        const disponible = lote.capacidad - loteConsumido;
        if (disponible <= 0) {
          loteIdx += 1;
          loteConsumido = 0;
          continue;
        }
        // Freno de fecha (BLOCKER de review): un lote nunca satisface
        // demanda fechada ANTES que su propia fecha — sin este corte, una
        // venta vieja podía "pagarse" con un lote futuro solo porque la
        // capacidad más vieja ya se había agotado (por otra demanda),
        // mostrando un costo que físicamente no existía todavía en esa
        // fecha. No avanza `loteIdx`: este lote sigue disponible para una
        // demanda POSTERIOR (fechada >= lote.fecha), solo no para esta.
        if (lote.fecha > d.fecha) break;
        const consumo = Math.min(disponible, restante);
        resultado.push({
          origen: d.origen,
          documentoId: d.documentoId,
          fecha: d.fecha,
          productoId: d.productoId,
          loteId: lote.loteId,
          vendedorId: d.vendedorId,
          feriaId: d.feriaId,
          cantidad: consumo,
          precioUnitarioVentaCentavos: d.precioUnitarioVentaCentavos,
          precioCostoRealCentavos: d.precioCostoRealCentavos,
        });
        loteConsumido += consumo;
        restante -= consumo;
        if (loteConsumido >= lote.capacidad) {
          loteIdx += 1;
          loteConsumido = 0;
        }
      }

      if (restante > 0) {
        resultado.push({
          origen: d.origen,
          documentoId: d.documentoId,
          fecha: d.fecha,
          productoId: d.productoId,
          loteId: null,
          vendedorId: d.vendedorId,
          feriaId: d.feriaId,
          cantidad: restante,
          precioUnitarioVentaCentavos: d.precioUnitarioVentaCentavos,
          precioCostoRealCentavos: d.precioCostoRealCentavos,
        });
      }
    }
  }

  return resultado;
}

// ============================================================
// Margen por fila (v_margen_ventas, columnas finales) — costo Ananja =
// costo × (1 + ganancia%), lo que CUALQUIER vendedor le debe a la empresa
// por botella; margen de Ananja = (costo Ananja − costo de producción) ×
// cantidad; margen del vendedor = (precio de venta − costo Ananja) ×
// cantidad, `null` sin precio cargado.
// ============================================================

export interface CostoLotePorProducto {
  costoProduccionUnitarioCentavos: number;
  costoAnanjaUnitarioCentavos: number;
}

/** Forma "cruda" de una fila de `v_costo_lote_desglose`: sus
 * `costo_unitario_centavos`/`costo_ananja_centavos` son 0 (NO null) cuando
 * `tiene_costos` es false (un lote sin `lote_costos` cargados todavía). */
export interface CostoLoteCrudo {
  costoUnitarioCentavos: number;
  costoAnanjaUnitarioCentavos: number;
  tieneCostos: boolean;
}

/**
 * Espejo del CTE `costo_seguro` de `v_margen_ventas` (BLOCKER corregido en
 * review): pasa por `null` el costo de un lote sin `tiene_costos` — leer el
 * 0 crudo de `v_costo_lote_desglose` tal cual convertía "no tengo costo
 * cargado" en "el costo Ananja es $0", inflando `margenVendedorCentavos` al
 * precio de venta completo en vez de dejarlo `null`. Cualquier código (SQL
 * o TS) que lea `v_costo_lote_desglose` para calcular un margen tiene que
 * pasar por acá antes de usar esos dos campos.
 */
export function costoLoteSeguro(crudo: CostoLoteCrudo | null): CostoLotePorProducto | null {
  if (crudo === null || !crudo.tieneCostos) return null;
  return {
    costoProduccionUnitarioCentavos: crudo.costoUnitarioCentavos,
    costoAnanjaUnitarioCentavos: crudo.costoAnanjaUnitarioCentavos,
  };
}

export interface FilaMargenInput {
  origen: OrigenVenta;
  documentoId: string;
  fecha: string;
  vendedorId: string;
  feriaId: string | null;
  productoId: string;
  loteId: string | null;
  cantidad: number;
  precioUnitarioVentaCentavos: number | null;
  /** Solo origen 'revendedor': el monto REAL que el revendedor le debe a
   * Ananja por esta venta (ventas_revendedor.precio_costo_centavos: el costo
   * aprobado en la entrega, o el precio revendedor manual en ventas viejas)
   * — puede diferir del costo Ananja teórico del lote. Desde 0040 se usa
   * para las tres columnas de plata (ingreso, margen de Ananja y margen del
   * vendedor), no solo para el ingreso. */
  precioCostoRealCentavos: number | null;
  /** Origen 'revendedor' (0044_diferencia_encargado.sql, generalizado por
   * 0052): foto del costo del lote al entregar, si el lote estaba completo.
   * Ananja ya no reparte nada con un encargado por esto — se sigue
   * guardando solo como dato informativo de qué costo tenía el lote en ese
   * momento (columna de salida `costoAnanjaUnitarioCentavos`). Sin
   * definir/null = sin foto (lote incompleto al entregar).
   *
   * Origen 'comprobante' (0052_costo_vigente_lote.sql § Parte A): la foto
   * congelada al vender (`comprobante_items.costo_lote_unitario_centavos`)
   * — cuando está presente, GANA sobre el costo Ananja EN VIVO (`costo`,
   * abajo) para ingreso/margen de Ananja y margen del vendedor, así una
   * venta ya hecha no se mueve retroactivamente cuando el costo del lote
   * cambia después (costo original editado, o "actualizar costos del
   * depósito"). `null`/ausente: sin foto (comprobante sin lote, o lote que
   * todavía no estaba completo al vender) — se sigue usando el costo Ananja
   * en vivo, como antes de 0052. */
  costoLoteUnitarioCentavos?: number | null;
  /** Foto de costo de PRODUCCIÓN (BLOCKER + BUG2 de la revisión adversarial
   * de 0052): `entrega_items.costo_produccion_unitario_centavos` (ya
   * resuelto foto-o-vigente en `v_costo_lote_venta`, para revendedor) o
   * `comprobante_items.costo_produccion_unitario_centavos` (para
   * comprobante). Gana sobre el costo de producción EN VIVO (`costo`,
   * abajo) TANTO para `margenAnanjaCentavos` (el BLOCKER: restar la
   * producción en vivo seguía moviendo la ganancia de ventas viejas)
   * COMO para la columna de salida `costoProduccionUnitarioCentavos` (el
   * BUG2: esa columna mostraba siempre el costo en vivo, así que varias
   * ventas con fotos DISTINTAS pasaban a mostrar todas el mismo número
   * después de una actualización, aunque `margenAnanjaCentavos` ya
   * estuviera bien). `null`/ausente: sin foto, se sigue usando el costo de
   * producción en vivo — mismo criterio que `costoLoteUnitarioCentavos`. */
  costoProduccionFotoCentavos?: number | null;
  /** `true`: el lote se resolvió vía `atribuirCostoFifo` (o no se pudo
   * resolver ninguno); `false`: comprobante_items.lote_id venía cargado a
   * mano. */
  costoEstimado: boolean;
}

export interface FilaMargen {
  origen: OrigenVenta;
  documentoId: string;
  fecha: string;
  vendedorId: string;
  feriaId: string | null;
  productoId: string;
  loteId: string | null;
  cantidad: number;
  costoProduccionUnitarioCentavos: number | null;
  costoAnanjaUnitarioCentavos: number | null;
  precioUnitarioVentaCentavos: number | null;
  costoEstimado: boolean;
  ingresoAnanjaCentavos: number | null;
  margenAnanjaCentavos: number | null;
  margenVendedorCentavos: number | null;
}

/**
 * Espejo del `select` final de `v_margen_ventas`: junta una fila de venta
 * (ya con su `loteId`, directo o estimado por `atribuirCostoFifo`) con el
 * costo VIGENTE en vivo de ESE lote/presentación (`v_costo_lote_vigente`
 * desde 0052, `costo === null` cuando no hay lote o el lote no tiene costos
 * cargados) y calcula las tres columnas de plata — usando la foto congelada
 * (`input.costoLoteUnitarioCentavos`/`input.costoProduccionFotoCentavos`) en
 * vez del costo en vivo cuando existe (revendedor: siempre la tuvo, 0044;
 * comprobante: desde 0052). BUG2 de la revisión adversarial (corregido
 * acá): las columnas de salida `costoAnanjaUnitarioCentavos`/
 * `costoProduccionUnitarioCentavos` también usan la foto cuando existe —
 * antes mostraban SIEMPRE el costo en vivo, así que ventas con fotos
 * DISTINTAS pasaban a mostrar todas el mismo número después de actualizar
 * el lote, aunque `ingresoAnanjaCentavos`/`margenAnanjaCentavos` ya
 * estuvieran congelados correctamente.
 *
 * Decisión de Fran (0058_plata_coordinador_costo.sql, corrección de la
 * revisión adversarial 2026-09-19 — reemplaza la decisión anterior "rama
 * sin-diferencia-encargado" de 0044, que había sacado el recorte por
 * completo): Ananja NUNCA gana más que su costo Ananja en una venta de
 * revendedora, tenga o no encargado con margen propio — si un coordinador
 * le cobra de más a su revendedora sobre el costo Ananja del lote (su
 * margen), ESE margen no es ganancia de Ananja. `ingresoAnanjaCentavos`/
 * `margenAnanjaCentavos` usan `min(cobrado, costo Ananja de la foto)`
 * cuando hay foto (`costoLoteUnitarioCentavos` no nulo); sin foto (lote
 * incompleto al entregar, o venta sin lote), se sigue usando lo cobrado
 * tal cual — no hay nada contra qué clampear. Sin mirar el rol del
 * encargado (simplificación adrede: para una venta sin margen — el caso
 * de un admin, que históricamente siempre cobra a costo — `cobrado <=
 * costo`, así que el `min` no cambia nada; para ventas directas por
 * comprobante, sin `encargado_id` de por medio, tampoco aplica). NO hay
 * `margenEncargadoCentavos` — su ganancia no se muestra en ningún lado
 * (mismo criterio que Plata, 0057/0058). `margenVendedorCentavos` (la
 * ganancia de LA REVENDEDORA, precio de venta menos lo que pagó) sigue
 * SIEMPRE con lo cobrado sin clampear — así "Ganancia de los vendedores"
 * coincide con "Tu ganancia" de `/mi`, y no se pierde el margen del
 * coordinador de ahí (es plata real que él ganó, solo que no es de
 * Ananja).
 */
export function calcularFilaMargen(input: FilaMargenInput, costo: CostoLotePorProducto | null): FilaMargen {
  const costoProduccion = costo?.costoProduccionUnitarioCentavos ?? null;
  const costoAnanja = costo?.costoAnanjaUnitarioCentavos ?? null;

  const esRevendedor = input.origen === "revendedor";
  // Comprobante con foto (0052 § Parte A): gana sobre el costo Ananja EN
  // VIVO — mismo criterio que ya usa la revendedora, ver el comentario de
  // `FilaMargenInput.costoLoteUnitarioCentavos`.
  const costoLoteFotoComprobante =
    !esRevendedor && input.costoLoteUnitarioCentavos != null ? input.costoLoteUnitarioCentavos : null;
  // Lo que le cobró SU encargado (a costo, o con margen si es un
  // coordinador) — SIEMPRE sin clampear: es lo que usa `margenVendedorCentavos`
  // (la ganancia de la revendedora), nunca `ingresoAnanjaCentavos`.
  const costoCobrado = esRevendedor
    ? input.precioCostoRealCentavos
    : (costoLoteFotoComprobante ?? costoAnanja);

  // Ingreso de ANANJA: clampeado a su costo real cuando hay foto (ver el
  // comentario de la función) — nunca más que `min(cobrado, costo Ananja
  // de la foto)`. Sin foto de revendedora (o venta por comprobante, ya
  // resuelta en `costoCobrado`), no hay nada que clampear.
  const costoAnanjaRevendedor =
    esRevendedor && input.precioCostoRealCentavos !== null && input.costoLoteUnitarioCentavos != null
      ? Math.min(input.precioCostoRealCentavos, input.costoLoteUnitarioCentavos)
      : costoCobrado;

  const ingresoAnanjaCentavos = costoAnanjaRevendedor !== null ? costoAnanjaRevendedor * input.cantidad : null;

  // BLOCKER (rev. 2 de 0052) — el subtrahendo del margen de Ananja también
  // tiene que ser la foto de PRODUCCIÓN cuando existe, no la vigente en vivo.
  const costoProduccionEfectivo = input.costoProduccionFotoCentavos ?? costoProduccion;

  const margenAnanjaCentavos =
    costoAnanjaRevendedor !== null && costoProduccionEfectivo !== null
      ? (costoAnanjaRevendedor - costoProduccionEfectivo) * input.cantidad
      : null;

  const margenVendedorCentavos =
    input.precioUnitarioVentaCentavos !== null && costoCobrado !== null
      ? (input.precioUnitarioVentaCentavos - costoCobrado) * input.cantidad
      : null;

  // BUG2 (revisión adversarial) — columnas de salida "costo unitario":
  // muestran la foto de ESTA venta cuando existe, con fallback al costo en
  // vivo del lote solo cuando esta venta nunca tuvo foto (sin lote, o lote
  // incompleto al momento de vender/entregar).
  const costoAnanjaUnitarioMostrado = esRevendedor
    ? (input.costoLoteUnitarioCentavos ?? costoAnanja)
    : (costoLoteFotoComprobante ?? costoAnanja);
  const costoProduccionUnitarioMostrado = costoProduccionEfectivo;

  return {
    origen: input.origen,
    documentoId: input.documentoId,
    fecha: input.fecha,
    vendedorId: input.vendedorId,
    feriaId: input.feriaId,
    productoId: input.productoId,
    loteId: input.loteId,
    cantidad: input.cantidad,
    costoProduccionUnitarioCentavos: costoProduccionUnitarioMostrado,
    costoAnanjaUnitarioCentavos: costoAnanjaUnitarioMostrado,
    precioUnitarioVentaCentavos: input.precioUnitarioVentaCentavos,
    costoEstimado: input.costoEstimado,
    ingresoAnanjaCentavos,
    margenAnanjaCentavos,
    margenVendedorCentavos,
  };
}

// ============================================================
// Nota: el resultado por feria (margen de Ananja − gastos OPERATIVOS,
// gastos de producción, unidades sin costo) ya viene agregado directo de
// `v_resultado_feria` (0031_margen_ventas.sql § 5) — se lee tal cual, sin
// recalcular nada acá.
// ============================================================

// ============================================================
// Agregación por período (`/ganancia`) — Ganancia de Ananja (margen de las
// botellas vendidas menos los gastos OPERATIVOS, ver
// `categorias_gasto.es_costo_produccion` en el comentario de cabecera de
// 0031_margen_ventas.sql) y Ganancia de los vendedores (Σ margen_vendedor,
// una fila por vendedor). Estas funciones no leen `v_margen_ventas`
// directamente: el caller ya trajo las filas con `select` y arma este shape
// reducido — mismo criterio que `calcularGananciaPorPeriodo` (lib/calculos.ts),
// que resuelve el mismo problema para el modelo de "ventas" viejo (sin
// margen).
// ============================================================

/**
 * IMPORTANTE (revisión adversarial de 0031): `margen_ananja_centavos`,
 * `margen_vendedor_centavos` (y los costos que los componen) vienen `null`
 * — NUNCA 0 — para cualquier venta cuyo lote todavía no tiene costos
 * cargados (el estado de TODAS las ventas apenas se resetea la base). Un
 * `null` significa "no sabemos", no "no hay ganancia": sumarlo como 0
 * mentiría (un período con 40 botellas sin costear mostraría "$0 de
 * margen" en vez de "no tenemos con qué calcularlo"). Por eso ninguna
 * función de acá abajo trata `null` como 0 — lo cuenta aparte (`cantidad`
 * de esas filas, "unidades sin costo") para que la UI SIEMPRE pueda avisar
 * en vez de mostrar un monto engañoso.
 */
export interface FilaMargenPeriodo {
  /** `v_margen_ventas.origen` — opcional para no romper callers viejos;
   * solo lo usa {@link unidadesSinPrecioRevendedorDePeriodo}. */
  origen?: OrigenVenta;
  fecha: string;
  vendedorId: string;
  /** `comprobante_items.cantidad`/`ventas_revendedor.cantidad` de esta fila
   * — cuántas botellas representa, para poder contar "unidades sin costo"
   * cuando el margen da `null`. */
  cantidad: number;
  margenAnanjaCentavos: number | null;
  margenVendedorCentavos: number | null;
  /** `v_margen_ventas.precio_unitario_venta_centavos` — distingue, cuando
   * `margenVendedorCentavos` es `null`, entre "no se cargó precio de venta"
   * (normal, no es una fila con costo faltante) y "hay precio pero el lote
   * no tiene costo cargado" (sí es una unidad sin costo, hay que avisar). */
  precioUnitarioVentaCentavos: number | null;
  costoEstimado: boolean;
}

export interface GastoOperativo {
  fecha: string;
  montoCentavos: number;
}

/** Resumen de un conjunto de filas de margen (un período, una feria, lo que
 * sea) — separa lo que SÍ se pudo calcular de lo que no, en vez de
 * mezclarlos en una sola suma. */
export interface ResumenMargenAnanja {
  /** Σ `margenAnanjaCentavos` de las filas CON costo cargado — puede ser
   * `0` tanto porque no hay ninguna fila costeada como porque el margen
   * costeado real dio 0; usar `algunCostoCargado` para distinguir. */
  margenAnanjaCentavos: number;
  /** `false` = ninguna fila de este conjunto tiene costo cargado todavía —
   * `margenAnanjaCentavos` es `0` por falta de datos, no un margen real, la
   * UI tiene que mostrar "Sin costos cargados" en vez de "$ 0". */
  algunCostoCargado: boolean;
  /** Σ `cantidad` de las filas SIN costo cargado (`margenAnanjaCentavos:
   * null`) — "botellas sin costo cargado, no contadas". */
  unidadesSinCosto: number;
  /** `true` si alguna fila que SÍ aportó margen vino de `atribuirCostoFifo`
   * (costo estimado, sin lote elegido a mano). */
  algunCostoEstimado: boolean;
}

/**
 * Reduce cualquier lista de filas de margen a un {@link ResumenMargenAnanja}
 * — núcleo compartido por {@link calcularGananciaAnanjaPorPeriodo} (una
 * llamada por período) y cualquier otro resumen puntual (una sola llamada
 * con un subconjunto de filas), para no reimplementar el criterio "null no
 * es 0" en cada lugar.
 */
export function resumirMargenAnanja(
  filas: Pick<FilaMargenPeriodo, "cantidad" | "margenAnanjaCentavos" | "costoEstimado">[],
): ResumenMargenAnanja {
  let margenAnanjaCentavos = 0;
  let algunCostoCargado = false;
  let unidadesSinCosto = 0;
  let algunCostoEstimado = false;

  for (const fila of filas) {
    if (fila.margenAnanjaCentavos !== null) {
      margenAnanjaCentavos += fila.margenAnanjaCentavos;
      algunCostoCargado = true;
      if (fila.costoEstimado) algunCostoEstimado = true;
    } else {
      unidadesSinCosto += fila.cantidad;
    }
  }

  return { margenAnanjaCentavos, algunCostoCargado, unidadesSinCosto, algunCostoEstimado };
}

export interface FilaGananciaAnanjaPeriodo extends ResumenMargenAnanja {
  periodo: string;
  gastosOperativosCentavos: number;
  /** `margenAnanjaCentavos − gastosOperativosCentavos` — SIEMPRE un número
   * (nunca `null`): un período sin ningún costo cargado todavía da `0 −
   * gastos`, y la UI lo etiqueta como estimación parcial vía
   * `algunCostoCargado`/`unidadesSinCosto`, no lo esconde. */
  gananciaAnanjaCentavos: number;
}

/**
 * Espejo de la agregación de `/ganancia` § Ganancia de Ananja: por mes o por
 * año, `Σ margen_ananja_centavos (solo filas costeadas) − Σ gastos
 * operativos` (el caller ya filtró los gastos por
 * `categorias_gasto.es_costo_produccion = false` antes de pasarlos acá —
 * esta función no conoce categorías, solo suma; NUNCA hay que pasarle los
 * gastos de producción, ya están adentro de `margen_ananja_centavos` — ver
 * el comentario de {@link resumirMargenAnanja} sobre por qué `null` no se
 * trata como 0). Un período que solo tiene margen o solo gastos igual
 * aparece (el otro lado en 0), orden descendente (más reciente primero) —
 * mismo criterio que `calcularGananciaPorPeriodo`.
 */
export function calcularGananciaAnanjaPorPeriodo(
  filas: FilaMargenPeriodo[],
  gastosOperativos: GastoOperativo[],
  granularidad: "mes" | "anio",
): FilaGananciaAnanjaPeriodo[] {
  const largoPeriodo = granularidad === "mes" ? 7 : 4;

  const filasPorPeriodo = new Map<string, FilaMargenPeriodo[]>();
  for (const fila of filas) {
    const periodo = fila.fecha.slice(0, largoPeriodo);
    const grupo = filasPorPeriodo.get(periodo) ?? [];
    grupo.push(fila);
    filasPorPeriodo.set(periodo, grupo);
  }

  const gastosPorPeriodo = new Map<string, number>();
  for (const gasto of gastosOperativos) {
    const periodo = gasto.fecha.slice(0, largoPeriodo);
    gastosPorPeriodo.set(periodo, (gastosPorPeriodo.get(periodo) ?? 0) + gasto.montoCentavos);
  }

  const periodos = new Set([...filasPorPeriodo.keys(), ...gastosPorPeriodo.keys()]);

  return Array.from(periodos)
    .map((periodo) => {
      const resumen = resumirMargenAnanja(filasPorPeriodo.get(periodo) ?? []);
      const gastosOperativosCentavos = gastosPorPeriodo.get(periodo) ?? 0;
      return {
        periodo,
        ...resumen,
        gastosOperativosCentavos,
        gananciaAnanjaCentavos: resumen.margenAnanjaCentavos - gastosOperativosCentavos,
      };
    })
    .sort((a, b) => (a.periodo < b.periodo ? 1 : a.periodo > b.periodo ? -1 : 0));
}

/** Resumen de la ganancia de UN vendedor — mismo criterio "null no es 0"
 * que {@link ResumenMargenAnanja}, pero distinguiendo además "no se cargó
 * precio de venta" (normal, no cuenta como unidad sin costo) de "hay precio
 * pero el lote no tiene costo cargado" (sí es una unidad sin costo). */
export interface ResumenMargenVendedor {
  vendedorId: string;
  margenVendedorCentavos: number;
  algunCostoCargado: boolean;
  unidadesSinCosto: number;
  algunCostoEstimado: boolean;
}

/**
 * Espejo de la agregación de `/ganancia` § Ganancia de los vendedores:
 * `periodo -> vendedorId -> ResumenMargenVendedor`. Una fila con
 * `margenVendedorCentavos: null` y SIN precio de venta cargado no aporta
 * nada (ni margen ni "unidad sin costo" — no hay nada raro en no haber
 * cargado el precio todavía); una fila con precio cargado pero
 * `margenVendedorCentavos: null` sí es una unidad sin costo (el precio
 * estaba, pero el lote no tiene costo Ananja cargado). Un `Map` anidado en
 * vez de una lista plana porque el caller necesita ambas claves para armar
 * la tabla de un período puntual — {@link margenVendedoresDePeriodo} arma
 * esa lista ya ordenada.
 */
export function agruparMargenVendedorPorPeriodo(
  filas: FilaMargenPeriodo[],
  granularidad: "mes" | "anio",
): Map<string, Map<string, ResumenMargenVendedor>> {
  const largoPeriodo = granularidad === "mes" ? 7 : 4;
  const resultado = new Map<string, Map<string, ResumenMargenVendedor>>();

  for (const fila of filas) {
    const tieneAlgoQueAportar =
      fila.margenVendedorCentavos !== null || fila.precioUnitarioVentaCentavos !== null;
    if (!tieneAlgoQueAportar) continue;

    const periodo = fila.fecha.slice(0, largoPeriodo);
    const porVendedor = resultado.get(periodo) ?? new Map<string, ResumenMargenVendedor>();
    const actual = porVendedor.get(fila.vendedorId) ?? {
      vendedorId: fila.vendedorId,
      margenVendedorCentavos: 0,
      algunCostoCargado: false,
      unidadesSinCosto: 0,
      algunCostoEstimado: false,
    };

    if (fila.margenVendedorCentavos !== null) {
      actual.margenVendedorCentavos += fila.margenVendedorCentavos;
      actual.algunCostoCargado = true;
      if (fila.costoEstimado) actual.algunCostoEstimado = true;
    } else {
      // precioUnitarioVentaCentavos !== null (si no, ya se descartó arriba):
      // había precio de venta, el margen dio null por costo de lote faltante.
      actual.unidadesSinCosto += fila.cantidad;
    }

    porVendedor.set(fila.vendedorId, actual);
    resultado.set(periodo, porVendedor);
  }

  return resultado;
}

/** Filas de un período puntual de {@link agruparMargenVendedorPorPeriodo},
 * ordenadas de mayor a menor margen — `[]` si ese período no tiene ningún
 * vendedor con algo que mostrar todavía.
 *
 * `excluir`: ids que NO van en la tabla — las coordinadoras (0073): las
 * botellas que vende una coordinadora entran al margen de Ananja, pero ella
 * vende a precio = costo, así que aparecería con $0 como si fuera una
 * revendedora más. */
export function margenVendedoresDePeriodo(
  porPeriodo: Map<string, Map<string, ResumenMargenVendedor>>,
  periodo: string,
  excluir?: ReadonlySet<string>,
): ResumenMargenVendedor[] {
  const porVendedor = porPeriodo.get(periodo) ?? new Map<string, ResumenMargenVendedor>();
  return Array.from(porVendedor.values())
    .filter((v) => !excluir?.has(v.vendedorId))
    .sort((a, b) => b.margenVendedorCentavos - a.margenVendedorCentavos);
}

/**
 * Botellas de ventas de REVENDEDORA sin precio de venta en un período (las
 * cargó un admin sin saber a cuánto se vendieron,
 * 0040_revendedores_pagos_precios.sql § 5). `agruparMargenVendedorPorPeriodo`
 * las descarta sin avisar — un comprobante sin precio unitario es normal,
 * pero una venta de revendedora sin precio es un dato pendiente de cargar —,
 * así que "Ganancia de los vendedores" las muestra aparte con este conteo.
 */
export function unidadesSinPrecioRevendedorDePeriodo(
  filas: FilaMargenPeriodo[],
  granularidad: "mes" | "anio",
  periodo: string,
): number {
  const largoPeriodo = granularidad === "mes" ? 7 : 4;
  return filas
    .filter(
      (f) =>
        f.origen === "revendedor" &&
        f.precioUnitarioVentaCentavos === null &&
        f.fecha.slice(0, largoPeriodo) === periodo,
    )
    .reduce((acc, f) => acc + f.cantidad, 0);
}

// ============================================================
// Filas crudas de Supabase -> los shapes de arriba (`FilaMargenPeriodo`,
// `GastoOperativo`) — la carga de `/ganancia`
// (`app/(app)/ganancia/page.tsx`) hace el `select` y pasa las filas tal
// cual, esta parte (filtrar nulos, pasar de snake_case a camelCase) es la
// única transformación de datos que hacía falta sacar de la página.
// ============================================================

export interface FilaMargenVentasCruda {
  origen: string | null;
  fecha: string | null;
  vendedor_id: string | null;
  cantidad: number | null;
  margen_ananja_centavos: number | null;
  margen_vendedor_centavos: number | null;
  precio_unitario_venta_centavos: number | null;
  costo_estimado: boolean | null;
}

/** Filas de `v_margen_ventas` -> {@link FilaMargenPeriodo}[] — descarta las
 * que no tienen `fecha`/`vendedor_id`/`cantidad` (no deberían faltar, son
 * NOT NULL en la vista, pero el tipo generado los da nullable). */
export function mapearFilasMargenVentas(filas: FilaMargenVentasCruda[]): FilaMargenPeriodo[] {
  return filas
    .filter(
      (f): f is FilaMargenVentasCruda & { fecha: string; vendedor_id: string; cantidad: number } =>
        f.fecha !== null && f.vendedor_id !== null && f.cantidad !== null,
    )
    .map((f) => ({
      origen: f.origen === "revendedor" ? ("revendedor" as const) : ("comprobante" as const),
      fecha: f.fecha,
      vendedorId: f.vendedor_id,
      cantidad: f.cantidad,
      margenAnanjaCentavos: f.margen_ananja_centavos,
      margenVendedorCentavos: f.margen_vendedor_centavos,
      precioUnitarioVentaCentavos: f.precio_unitario_venta_centavos,
      costoEstimado: f.costo_estimado ?? false,
    }));
}

export interface GastoConCategoriaCrudo {
  fecha: string;
  monto_centavos: number;
  categorias_gasto: { es_costo_produccion: boolean | null } | null;
}

/**
 * Solo gastos OPERATIVOS: los de `es_costo_produccion = true` (Insumos,
 * Envases y etiquetas, Pedidos de producción) ya están adentro del costo
 * de la botella (vía `margen_ananja_centavos`) — restarlos acá otra vez
 * los contaría dos veces (supabase/migrations/0031_margen_ventas.sql §
 * build).
 */
export function filtrarGastosOperativos(gastos: GastoConCategoriaCrudo[]): GastoOperativo[] {
  return gastos
    .filter((g) => g.categorias_gasto?.es_costo_produccion !== true)
    .map((g) => ({ fecha: g.fecha, montoCentavos: g.monto_centavos }));
}

// ============================================================
// Presentación de un período puntual (`/ganancia`) — seleccionar la fila
// del período elegido (mes o año actual) con un default en cero, sumar un
// total acotado a ese período, y formatear los montos — compartido por
// `components/ganancia/{ganancia-header,tabla-por-mes,ganancia-vendedores}.tsx`.
// ============================================================

/**
 * Fila de un período puntual (el mes o año actual) de
 * {@link calcularGananciaAnanjaPorPeriodo} — con un default en cero si ese
 * período todavía no tiene ninguna fila (negocio nuevo, o sin ventas
 * todavía este mes/año). Usada por el bloque oliva de `/ganancia`
 * (`components/ganancia/ganancia-header.tsx`).
 */
export function filaGananciaDelPeriodo(
  filas: FilaGananciaAnanjaPeriodo[],
  periodo: string,
): FilaGananciaAnanjaPeriodo {
  return (
    filas.find((f) => f.periodo === periodo) ?? {
      periodo,
      margenAnanjaCentavos: 0,
      algunCostoCargado: false,
      unidadesSinCosto: 0,
      algunCostoEstimado: false,
      gastosOperativosCentavos: 0,
      gananciaAnanjaCentavos: 0,
    }
  );
}

/** Clase de color Tailwind de un monto de ganancia: bordó (`text-accent`)
 * si es negativo, texto normal si no. */
export function colorGanancia(centavos: number): string {
  return centavos < 0 ? "text-accent" : "text-text";
}

/** "$X" si hay al menos un costo cargado; si no, no hay ningún monto real
 * que mostrar — "Sin costos cargados" en vez de un "$ 0" engañoso. */
export function formatMargen(centavos: number, algunCostoCargado: boolean): string {
  return algunCostoCargado ? formatCentavos(centavos) : "Sin costos cargados";
}

/** Nota de unidades excluidas del margen — `null` si no hace falta (todo lo
 * vendido en el período tenía costo cargado). */
export function notaUnidadesSinCosto(unidadesSinCosto: number): string | null {
  if (unidadesSinCosto <= 0) return null;
  const plural = unidadesSinCosto === 1 ? "botella" : "botellas";
  return `${unidadesSinCosto} ${plural} sin costo cargado, no contada${unidadesSinCosto === 1 ? "" : "s"}`;
}
