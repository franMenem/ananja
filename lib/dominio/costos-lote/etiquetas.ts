/**
 * Costo de las etiquetas: unidades por botella (según receta), costo
 * unitario de un insumo de etiqueta (precio + envío, con IVA si
 * corresponde) y el campo unificado frente + reverso ("costos del pedido
 * simple").
 */

import { aplicarIva, notaSinIva } from "@/lib/dominio/costos-lote/tipos";
import { formatCentavos } from "@/lib/money";

/** Insumo tipo 'etiqueta' de una receta — lo único que importa acá es
 * cuánto suma por presentación (frente + retro, etc.). */
export interface RecetaEtiquetaInput {
  productoId: string;
  insumoTipo: "materia_prima" | "envase" | "etiqueta";
  cantidad: number;
}

/** Unidades de etiqueta por botella de un producto: Σ recetas.cantidad de
 * sus insumos tipo 'etiqueta' — sin receta, 1 por botella (mismo fallback
 * defensivo que la función SQL). */
export function etiquetasPorBotella(
  productoId: string,
  recetas: RecetaEtiquetaInput[],
): number {
  const total = recetas
    .filter((r) => r.productoId === productoId && r.insumoTipo === "etiqueta")
    .reduce((acc, r) => acc + r.cantidad, 0);
  return total > 0 ? total : 1;
}

// ============================================================
// Etiquetas frente + reverso — 0029: cada insumo de etiqueta (frente,
// reverso) tiene su propio precio + envío; el envío NUNCA lleva IVA.
// ============================================================

export interface CostoEtiquetaInput {
  precioUnitarioCentavos: number;
  envioUnitarioCentavos: number;
  /** 0053_pago_vs_costo_insumo.sql: precio a usar para EL COSTO de la
   * botella, si es distinto de lo pagado/cargado — `null`/ausente = usa
   * `precioUnitarioCentavos`. El envío nunca tiene una versión "para
   * costo" separada (sigue siendo un único monto, sin IVA). Ausente en
   * `fusionarPrecioEtiquetaGrupo`/`precioNetoEquivalenteEtiqueta` (esas
   * funciones son sobre lo CARGADO en el campo unificado, no sobre el
   * costo) — no afecta esos cálculos. */
  precioCostoUnitarioCentavos?: number | null;
}

/** Costo unitario final de UN insumo de etiqueta (frente o reverso): precio
 * para costo (o el pagado, si no se cargó uno distinto — 0053) grossed-up
 * por IVA (si corresponde) + envío sin IVA. Espejo del cálculo por insumo
 * dentro del loop de etiquetas de `aplicar_costos_lote`/`calcular_costos_lote`. */
export function calcularCostoUnitarioEtiqueta(
  input: CostoEtiquetaInput,
  ivaPct: number,
  incluyeIva: boolean,
): number {
  const base = input.precioCostoUnitarioCentavos ?? input.precioUnitarioCentavos;
  return aplicarIva(base, ivaPct, incluyeIva) + input.envioUnitarioCentavos;
}

// ============================================================
// Un solo campo por tamaño de etiqueta (build "costos del pedido simple",
// INVERTIDO por el build "etiquetas suma" — 2026-09-15): Fran pidió sacar
// el input de envío y unificar frente + reverso en un campo. Al principio
// ese campo mostraba el precio de UNA etiqueta (promedio ponderado de los
// dos lados, aplicado a AMBOS por igual al guardar). Fran compra los
// insumos por separado y pidió que el campo sea la SUMA de los dos lados
// ("frente grande + reverso grande") — lo que salen las DOS etiquetas de
// UNA botella. Estas funciones son el fold que hace que ese único campo (a)
// MUESTRE la suma de los netos equivalentes de los lados cargados
// (`fusionarPrecioEtiquetaGrupo`) y (b) reparta ese total entre los
// insumos del grupo al guardar, mitad y mitad
// (`repartirPrecioEtiquetaGrupo`). `CostosLoteCampos` las usa solo para lo
// que se MUESTRA/REPARTE en el campo unificado — el guardado sigue
// mandando una fila por insumo (frente y reverso), sin tocar `p_costos` ni
// la base: un lote viejo con precios distintos por lado sigue guardado tal
// cual hasta que el campo se edite.
// ============================================================

/**
 * Precio neto "equivalente" de un insumo de etiqueta: sin envío por
 * separado, aplicarle IVA (`aplicarIva`) da el mismo costo unitario que
 * `calcularCostoUnitarioEtiqueta` con el precio + envío originales. Con
 * `incluyeIva` (el precio ya trae el IVA puesto), el envío se suma directo
 * — ninguno de los dos lleva IVA de por sí. Sin `incluyeIva` (precio neto,
 * el RPC le suma el IVA al guardar), el envío hay que "desgrosearlo" antes
 * de sumarlo: si no, al volver a aplicarle el IVA al campo unificado se le
 * cobraría un 21% de más a una plata que nunca lo tuvo (el envío nunca
 * lleva IVA). Aproximado a la hora de redondear — para el campo mostrado
 * en pantalla, no para lo que efectivamente se guarda.
 */
export function precioNetoEquivalenteEtiqueta(
  input: CostoEtiquetaInput,
  ivaPct: number,
  incluyeIva: boolean,
): number {
  if (incluyeIva || input.envioUnitarioCentavos === 0) {
    return input.precioUnitarioCentavos + input.envioUnitarioCentavos;
  }
  return Math.round(
    input.precioUnitarioCentavos + (input.envioUnitarioCentavos * 100) / (100 + ivaPct),
  );
}

export interface EtiquetaGrupoMiembro extends CostoEtiquetaInput {
  /** `> 0`: este miembro está CARGADO (tiene precio) y entra en la suma de
   * `fusionarPrecioEtiquetaGrupo` — `0` lo saca (sin cargar). Ya no pondera
   * nada (el campo unificado pasó de "promedio ponderado" a "suma" — ver
   * el comentario de arriba): el valor real (normalmente 1, las unidades de
   * `recetas.cantidad`) no importa, solo si es mayor a 0. */
  cantidad: number;
}

/**
 * Precio único para un grupo de insumos de etiqueta (frente + reverso de la
 * misma presentación): la SUMA de `precioNetoEquivalenteEtiqueta` de cada
 * miembro CARGADO (con `cantidad > 0`) — lo que se muestra en el campo
 * unificado es "lo que salen las DOS etiquetas de una botella", no el
 * precio de una sola (antes de este build era un promedio ponderado).
 * `null` sin ningún miembro cargado (grupo vacío en pantalla). Es la
 * inversa de `repartirPrecioEtiquetaGrupo`: sumar los dos repartos de un
 * mismo total devuelve ese total exacto, sin perder ni ganar centavos.
 */
export function fusionarPrecioEtiquetaGrupo(
  miembros: EtiquetaGrupoMiembro[],
  ivaPct: number,
  incluyeIva: boolean,
): number | null {
  const cargados = miembros.filter((m) => m.cantidad > 0);
  if (cargados.length === 0) return null;
  return cargados.reduce(
    (acc, m) => acc + precioNetoEquivalenteEtiqueta(m, ivaPct, incluyeIva),
    0,
  );
}

/**
 * Reparte el total escrito en el campo unificado (frente + reverso) entre
 * los insumos del grupo, al guardar — mitad y mitad: cada insumo recibe
 * `floor(totalCentavos / cantidadInsumos)`, y el resto de la división
 * entera (con dos insumos, 0 o 1 centavo) va TODO al PRIMER insumo del
 * grupo (posición 0 del array — en la práctica "frente", el primero en
 * `agruparEtiquetasPorLado`) — mismo criterio de "todo el resto a una sola
 * punta" que `reescalarTransporte`. Con un solo insumo en el grupo, el
 * total entero va ahí (no hay nada que repartir). `cantidadInsumos <= 0`:
 * array vacío. El resultado tiene el mismo largo que `cantidadInsumos`, en
 * ese mismo orden, y su suma es EXACTAMENTE `totalCentavos` — el costo
 * total por botella queda igual al que cargó Fran, sin perder centavos en
 * el reparto.
 */
export function repartirPrecioEtiquetaGrupo(
  totalCentavos: number,
  cantidadInsumos: number,
): number[] {
  if (cantidadInsumos <= 0) return [];
  const base = Math.floor(totalCentavos / cantidadInsumos);
  const resto = totalCentavos - base * cantidadInsumos;
  return Array.from({ length: cantidadInsumos }, (_, i) => (i === 0 ? base + resto : base));
}

// ============================================================
// Pedido al proveedor: preview por insumo (0038_pago_por_concepto.sql).
// ============================================================

/** Una fila de receta de un insumo de etiqueta puntual (frente O reverso son
 * insumos DISTINTOS, cada uno con su propia receta por producto — ver
 * `supabase/negocios/*.seed.sql` / `0017_insumos.sql`: "Etiqueta chica
 * frente" y "Etiqueta chica retro" son dos insumos separados, cada uno con
 * receta propia hacia el producto de 250 ml). */
export interface RecetaEtiquetaConInsumo {
  productoId: string;
  insumoId: string;
  /** Unidades de ESTE insumo por botella (normalmente 1). */
  cantidad: number;
}

/** Un precio de etiqueta cargado en pantalla para un insumo puntual — mismo
 * shape que `CostoEtiquetaInput` pero con el insumo al que corresponde. */
export interface PreviewEtiquetaInput extends CostoEtiquetaInput {
  insumoId: string;
}

/** Una línea de etiqueta ya lista para mostrar en el desglose detallado
 * (`cobranza.ts` § `construirLineasCostoBotellaDetallada`). */
export interface LineaEtiquetaInput {
  nombreInsumo: string;
  cantidad: number;
  /** Precio unitario NETO cargado (antes del IVA) — `null` en lotes legado
   * sin este dato (0028), no se muestra la nota "sin IVA + IVA%". */
  netoCentavos: number | null;
  envioCentavos: number | null;
  costoUnitarioCentavos: number;
  totalCentavos: number;
  /** `lote_costos.costo_neto_centavos` (0053_pago_vs_costo_insumo.sql):
   * precio para EL COSTO, si se cargó uno distinto del pagado/ya comprado
   * (`netoCentavos`) — `null`/ausente = se usó `netoCentavos` tal cual. */
  costoNetoCentavos?: number | null;
}

/**
 * Nota de una etiqueta en "Ya comprado": precio para costo (o el pagado, si
 * no se cargó uno distinto — 0053) con IVA si corresponde + envío, con la
 * misma nota "sin IVA + IVA%" que `construirLineasCostoBotellaDetallada` —
 * pero sin la cantidad, porque acá el renglón ya suma TODAS las
 * presentaciones (`calculo.etiquetas` solo trae el total por insumo, no
 * cuánto se usó de cada una).
 */
export function notaEtiquetaPedido(
  etiqueta: CostoEtiquetaInput,
  ivaPct: number,
  incluyeIva: boolean,
): string {
  const costoUnitario = calcularCostoUnitarioEtiqueta(etiqueta, ivaPct, incluyeIva);
  const base = etiqueta.precioCostoUnitarioCentavos ?? etiqueta.precioUnitarioCentavos;
  const envio =
    etiqueta.envioUnitarioCentavos > 0 ? `, envío ${formatCentavos(etiqueta.envioUnitarioCentavos)}` : "";
  return `${formatCentavos(costoUnitario)}${notaSinIva(base, ivaPct, incluyeIva)}${envio}`;
}
