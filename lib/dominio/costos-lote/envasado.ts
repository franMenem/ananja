/**
 * Costo del envase: cuenta en vivo del campo, costo vs. a pagar por
 * concepto (0038/0053 — el proveedor puede cobrar sin IVA y admitir un "monto
 * real"/precio-para-costo distinto del pagado) y las notas de "Revisá el
 * pedido".
 */

import { aplicarIva, notaCostoInsumo, notaSinIva } from "@/lib/dominio/costos-lote/tipos";
import { formatNumeroInsumo } from "@/lib/dominio/insumos";
import { formatCentavos } from "@/lib/money";

/**
 * Cuenta explícita del campo de envasado mientras se escribe (antes del
 * paso "Revisá el pedido"): cantidad × precio cargado [+ IVA%] = total —
 * mismo criterio de IVA que `calcularEnvasePedido`, sin comparar contra
 * ningún redondeo (eso es cosa de `notaEnvasePedido`, un paso después, con
 * el "Monto real" ya en juego). Pedido de Fran: "200 × $1.000 + IVA 21% =
 * $242.000" bien a la vista, junto al campo.
 */
export function cuentaEnvaseCampo(
  cantidad: number,
  precioUnitarioCentavos: number,
  totalCentavos: number,
  ivaPct: number,
  cobradoSinIva: boolean,
): string {
  const notaIva = cobradoSinIva ? ` + IVA ${ivaPct}%` : "";
  return `${formatNumeroInsumo(cantidad)} × ${formatCentavos(precioUnitarioCentavos)}${notaIva} = ${formatCentavos(totalCentavos)}`;
}

// ============================================================
// Pedido al proveedor: costo vs. a pagar del envase (0038_pago_por_concepto.sql,
// revierte "a pagar = costo" de 0048 — 0053_pago_vs_costo_insumo.sql).
// ============================================================

export interface CalcularEnvasePedidoInput {
  /** Precio por botella cargado en pantalla — lo que le pagás al proveedor. */
  precioUnitarioCentavos: number;
  cantidad: number;
  ivaPct: number;
  /** `precios_incluyen_iva` del pedido — SOLO cuenta en modo viejo. */
  incluyeIva: boolean;
  /** `envase_cobrado_sin_iva`. `null` = modo viejo (antes de 0038: el IVA
   * del envase lo gobierna `incluyeIva` y a pagar = costo); `true`/`false`
   * = modo nuevo (lo que siempre manda la UI desde 0038). */
  cobradoSinIva: boolean | null;
  /** "Monto real" que cobró el proveedor por el envasado de esta presentación, o
   * `null` si no hubo redondeo. Reemplaza SOLO el pago (`aPagarCentavos`) —
   * desde 0053 nunca afecta el costo (antes, en modo nuevo, si no había
   * `precioCostoUnitarioCentavos` cargado el costo terminaba derivando de
   * este monto; ver la cabecera de 0053_pago_vs_costo_insumo.sql). */
  redondeoCentavos: number | null;
  /** 0053: precio para EL COSTO de la botella, si es distinto del pagado —
   * `null` = usa `precioUnitarioCentavos`. Solo cuenta en modo nuevo (en
   * modo viejo no lo manda ningún caller, se ignora). */
  precioCostoUnitarioCentavos?: number | null;
}

export interface EnvasePedido {
  /** Pago antes del "monto real": cantidad × precio pagado — EN LA MISMA
   * UNIDAD que `aPagarCentavos` (nunca lleva IVA sumado en modo nuevo, ver
   * `precioUnitarioCentavos`). Es la referencia contra la que se
   * compara/precarga el campo "Monto real" (`redondeosDesdeMontos`/
   * `montosInicialesRevision`, `lib/lotes.ts`): sin overrides, `aPagarCentavos`
   * === este valor. */
  calculadoCentavos: number;
  /** Lo que se le paga al proveedor: el "monto real" si hubo, si no el
   * calculado. Nunca pasa por el costo (0053). */
  aPagarCentavos: number;
  /** Costo del envasado de TODA la presentación: cantidad × (precio para
   * costo, o el pagado si no se cargó uno distinto) + IVA si
   * `cobradoSinIva` — independiente de `aPagarCentavos`/el "monto real"
   * desde 0053 (antes, 0048, terminaba coincidiendo con el pago). */
  totalCentavos: number;
  costoUnitarioCentavos: number;
}

/**
 * Espejo de la sección de envase de `calcular_costos_lote`
 * (`0053_pago_vs_costo_insumo.sql`, revierte el "a pagar = costo" de 0048 —
 * 2026-09-17, regla del dueño). Modo nuevo (`cobradoSinIva` no `null`, el
 * único que usa la UI hoy): PAGO = cantidad × precio pagado, sin IVA nunca
 * (si el proveedor lo cobra sin IVA se le paga sin IVA; si lo cobra con IVA el
 * precio pagado ya lo incluye) — el "monto real" lo reemplaza tal cual.
 * COSTO = cantidad × (precio para costo, o el pagado si no se cargó uno
 * distinto) + IVA 21% si `cobradoSinIva` — el "monto real" del pago NUNCA
 * entra acá, son dos cuentas independientes. Modo viejo (`cobradoSinIva
 * === null`, anterior a 0038, hoy inalcanzable desde la UI): SIN CAMBIOS —
 * el precio se gross-ea por unidad según `incluyeIva` y a pagar = costo,
 * exacto como 0030 (`precioCostoUnitarioCentavos` no tiene efecto ahí).
 */
export function calcularEnvasePedido(input: CalcularEnvasePedidoInput): EnvasePedido {
  const modoNuevo = input.cobradoSinIva !== null;

  if (modoNuevo) {
    const calculadoCentavos = input.precioUnitarioCentavos * input.cantidad;
    const aPagarCentavos = input.redondeoCentavos ?? calculadoCentavos;

    const base = input.precioCostoUnitarioCentavos ?? input.precioUnitarioCentavos;
    let totalCentavos = base * input.cantidad;
    if (input.cobradoSinIva) {
      totalCentavos = Math.round((totalCentavos * (100 + input.ivaPct)) / 100);
    }
    return {
      calculadoCentavos,
      aPagarCentavos,
      totalCentavos,
      costoUnitarioCentavos: Math.round(totalCentavos / input.cantidad),
    };
  }

  const unitario = aplicarIva(input.precioUnitarioCentavos, input.ivaPct, input.incluyeIva);
  const precioCalculadoCentavos = unitario * input.cantidad;
  const aPagarCentavos = input.redondeoCentavos ?? precioCalculadoCentavos;
  const totalCentavos = aPagarCentavos;
  const costoUnitarioCentavos =
    input.redondeoCentavos === null ? unitario : Math.round(totalCentavos / input.cantidad);
  return {
    calculadoCentavos: precioCalculadoCentavos,
    aPagarCentavos,
    totalCentavos,
    costoUnitarioCentavos,
  };
}

export interface EnvaseConcepto extends EnvasePedido {
  productoId: string;
  presentacionMl: number;
  cantidad: number;
}

/** Una línea de envase ya lista para mostrar en el desglose detallado
 * (`cobranza.ts` § `construirLineasCostoBotellaDetallada`). */
export interface LineaEnvaseInput {
  cantidad: number;
  netoCentavos: number | null;
  costoUnitarioCentavos: number;
  totalCentavos: number;
  /** `lote_costos.a_pagar_centavos` (0038) — ya NO se usa para inferir si
   * el envase se cobró sin IVA (ver el comentario de `notaEnvase`): desde
   * 0053 el pago puede ser menor al costo por dos motivos independientes
   * (sin IVA, precio para costo más alto), así que esa comparación por sí
   * sola ya no alcanza. Se conserva por si hace falta mostrar lo pagado
   * más adelante. */
  aPagarCentavos?: number | null;
  /** `lote_costos.costo_neto_centavos` (0053_pago_vs_costo_insumo.sql):
   * precio para EL COSTO, si se cargó uno distinto del pagado
   * (`netoCentavos`) — `null`/ausente = se usó `netoCentavos` tal cual. */
  costoNetoCentavos?: number | null;
}

/**
 * Nota de IVA/precio-para-costo de la línea de envase — `notaCostoInsumo`
 * con el toggle propio del envase (`envaseSinIva`, desde 0038) en vez del
 * `incluyeIva` genérico del pedido. Sin nada que mostrar por ahí (ni "sin
 * IVA" ni un precio para costo distinto), cae al criterio LEGADO (anterior
 * a 0038, sin el toggle propio): el precio se gross-eaba por unidad según
 * `precios_incluyen_iva` del pedido — se detecta comparando el costo
 * unitario guardado contra el neto con IVA aplicado.
 */
export function notaEnvase(
  envase: LineaEnvaseInput,
  ivaPct: number,
  incluyeIva: boolean,
  envaseSinIva: boolean,
): string {
  const nota = notaCostoInsumo(envase.netoCentavos, envase.costoNetoCentavos, ivaPct, envaseSinIva);
  if (nota) return nota;
  if (
    !incluyeIva &&
    envase.netoCentavos !== null &&
    envase.costoUnitarioCentavos !== envase.netoCentavos &&
    envase.costoUnitarioCentavos === aplicarIva(envase.netoCentavos, ivaPct, false)
  ) {
    return notaSinIva(envase.netoCentavos, ivaPct, false);
  }
  return "";
}

// ============================================================
// Notas chicas de "Revisá el pedido" — de dónde sale la cuenta de PAGO/COSTO
// de envase que arma `calcularEnvasePedido` (`pedido.ts` § `calcularPedido`).
// ============================================================

/**
 * Nota del renglón de PAGO de envasado: `cantidad × precio pagado` — desde
 * 0053 el pago nunca lleva IVA sumado en modo nuevo (revierte 0048, ver
 * `calcularEnvasePedido`), así que ya no hace falta la nota "+ IVA%" ahí;
 * modo viejo (anterior a 0038, hoy inalcanzable) sigue grosseando el precio
 * por unidad (`notaSinIva`), sin cambios. Si hay un "Monto real" cargado
 * que difiere del calculado, se prioriza mostrar la comparación calculado
 * vs. cobrado (el caso que más confunde) en vez de la nota de IVA.
 */
export function notaEnvasePedido(
  envase: Pick<EnvaseConcepto, "cantidad" | "calculadoCentavos" | "aPagarCentavos">,
  precioUnitarioCentavos: number,
  ivaPct: number,
  incluyeIva: boolean,
  cobradoSinIva: boolean | null,
): string {
  const modoNuevo = cobradoSinIva !== null;
  const unitario = modoNuevo
    ? precioUnitarioCentavos
    : aplicarIva(precioUnitarioCentavos, ivaPct, incluyeIva);
  const base = `${formatNumeroInsumo(envase.cantidad)} × ${formatCentavos(unitario)}`;

  if (envase.aPagarCentavos !== envase.calculadoCentavos) {
    return `${base} = ${formatCentavos(envase.calculadoCentavos)} · Cobrado ${formatCentavos(envase.aPagarCentavos)}`;
  }

  const notaIva = modoNuevo ? "" : notaSinIva(precioUnitarioCentavos, ivaPct, incluyeIva);
  return `${base}${notaIva}`;
}

/**
 * Nota del renglón de COSTO de envasado (0053 — antes de esta migración
 * coincidía siempre con el pago, `notaEnvasePedido`): `cantidad × precio
 * para costo (o el pagado, si no se cargó uno distinto)` + IVA 21% si
 * `cobradoSinIva` — espejo exacto de la sección "costo" de
 * `calcularEnvasePedido`, independiente del "Monto real" del pago.
 */
export function notaCostoEnvasePedido(
  envase: Pick<EnvaseConcepto, "cantidad" | "totalCentavos">,
  precioCostoUnitarioCentavos: number,
  ivaPct: number,
  cobradoSinIva: boolean | null,
): string {
  const base = `${formatNumeroInsumo(envase.cantidad)} × ${formatCentavos(precioCostoUnitarioCentavos)}`;
  const notaIva = cobradoSinIva ? ` + IVA ${ivaPct}%` : "";
  return `${base}${notaIva} = ${formatCentavos(envase.totalCentavos)}`;
}
