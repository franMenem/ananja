/**
 * "Agarra directo del depósito" (`vendedores.toma_directo`,
 * supabase/migrations/0073_venta_directa_y_venta_coordinador.sql): reglas de
 * pantalla de la venta de una persona con el interruptor prendido.
 *
 * Con el interruptor, `insertar_venta_revendedor` ya no falla cuando la
 * persona no tiene tantas botellas en su poder: primero usa lo que tiene
 * entregado (FIFO, como siempre) y lo que falta lo saca del depósito, con
 * una entrega automática. Esto es el espejo en pantalla de esa regla: el
 * reparto lo sigue haciendo `atribuirVenta` (`revendedor-stock.ts`), acá solo
 * se decide qué se muestra y qué se deja pasar.
 *
 * La revendedora NO puede leer el stock ni los costos del depósito (RLS):
 * por eso la parte que sale del depósito no tiene costo ni ganancia en
 * pantalla — solo se muestra lo que sí se puede calcular con lo que ella
 * tiene entregado, y se aclara que el resto lo fija el negocio.
 *
 * Sin el interruptor (`tomaDirecto = false`) todo da EXACTAMENTE lo mismo
 * que antes de esta feature.
 */

import {
  costoTotalVenta,
  gananciaVenta,
  vendeBajoCosto,
  type AtribucionVenta,
} from "@/lib/dominio/revendedor-stock";
import { ERRORES_RPC_COMUNES, traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { NEGOCIO } from "@/lib/negocio";

/** `true` si la cantidad pedida es una venta posible: entera, de al menos
 * una botella y — salvo que agarre directo del depósito — no más de lo que
 * tiene en su poder. */
export function cantidadDeVentaValida(
  cantidad: number,
  enPoder: number,
  tomaDirecto: boolean,
): boolean {
  if (!Number.isInteger(cantidad) || cantidad < 1) return false;
  return tomaDirecto || cantidad <= enPoder;
}

/** Tope del stepper de cantidad: lo que tiene en poder, o `undefined` (sin
 * tope) si agarra directo del depósito. */
export function topeCantidadVenta(enPoder: number, tomaDirecto: boolean): number | undefined {
  return tomaDirecto ? undefined : enPoder;
}

export interface ResumenVentaPropia {
  /** Botellas que salen de lo que ya tiene entregado. */
  propias: number;
  /** Botellas que se van a agarrar del depósito (siempre 0 sin el
   * interruptor). */
  delDeposito: number;
  /** Lo que le va a deber a Ananja por las botellas que ya tiene
   * entregadas; `null` si no hay ninguna o alguna no tiene costo. */
  costoPropioCentavos: number | null;
  /** Costo de TODA la venta: solo se conoce cuando nada sale del depósito. */
  costoTotalCentavos: number | null;
  /** Ganancia de la venta: solo se conoce cuando nada sale del depósito. */
  gananciaCentavos: number | null;
  /** Hay botellas propias pero ninguna fuente de costo (entrega vieja sin
   * precio) — "todavía no te asignó precio". */
  sinPrecioAsignado: boolean;
  /** Vende por debajo de lo que debe, mirando solo las botellas propias. */
  bajoCosto: boolean;
}

/**
 * Qué mostrarle a quien carga su propia venta, a partir del reparto que
 * hace `atribuirVenta`. `tomaDirecto = false` se comporta como antes: el
 * faltante (que el formulario ya impide) no se interpreta como depósito.
 */
export function resumirVentaPropia(
  atribucion: AtribucionVenta,
  precioVentaCentavos: number | null,
  tomaDirecto: boolean,
): ResumenVentaPropia {
  const propias = atribucion.tramos.reduce((acc, t) => acc + t.cantidad, 0);
  const delDeposito = tomaDirecto ? atribucion.faltante : 0;
  const costoPropio = propias > 0 ? costoTotalVenta(atribucion.tramos) : null;
  const completa = delDeposito === 0;
  return {
    propias,
    delDeposito,
    costoPropioCentavos: costoPropio,
    costoTotalCentavos: completa ? costoTotalVenta(atribucion.tramos) : null,
    gananciaCentavos:
      completa && precioVentaCentavos !== null
        ? gananciaVenta(atribucion.tramos, precioVentaCentavos)
        : null,
    sinPrecioAsignado: propias > 0 && costoPropio === null,
    bajoCosto: precioVentaCentavos !== null && vendeBajoCosto(atribucion.tramos, precioVentaCentavos),
  };
}

/** Lee el `detail` JSON que algunos errores de Postgres traen (`error.details`
 * en supabase-js). Nunca tira: sin detalle parseable devuelve `{}`. */
export function leerDetalleError(crudo: string | null | undefined): Record<string, unknown> {
  if (!crudo) return {};
  try {
    const valor: unknown = JSON.parse(crudo);
    return valor !== null && typeof valor === "object" && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Cuántas botellas quedan en el depósito según el `detail` de
 * `DEPOSITO_INSUFICIENTE`; `null` si el detalle no lo trae. */
export function disponibleEnDeposito(detalle: Record<string, unknown>): number | null {
  const d = detalle.disponible;
  return typeof d === "number" && Number.isFinite(d) ? Math.max(0, Math.floor(d)) : null;
}

/** Mensaje para la revendedora cuando el depósito no alcanza. */
export function mensajeDepositoInsuficiente(disponible: number | null): string {
  // No afirma que el depósito está vacío: un lote sin todos sus costos
  // cargados no se puede usar y "disponible" solo cuenta lo que sí se puede.
  if (disponible === null) {
    return `En el depósito no hay tantas ${NEGOCIO.envase.plural} disponibles para vender. Cargá menos o avisale a ${NEGOCIO.nombre}.`;
  }
  return `En el depósito hay ${disponible} disponibles para vender. Cargá hasta esa cantidad o avisale a ${NEGOCIO.nombre}.`;
}

/** Errores de `registrar_venta_revendedor` que no necesitan el `detail`.
 * `STOCK_REVENDEDOR_INSUFICIENTE` y `DEPOSITO_INSUFICIENTE` se resuelven
 * aparte (llevan datos). */
const ERRORES_VENTA_PROPIA: Record<string, string> = {
  ...ERRORES_RPC_COMUNES,
  PRECIO_NO_ASIGNADO: `${NEGOCIO.nombre} todavía no te asignó precio para este producto.`,
  CANTIDAD_INVALIDA: "Revisá la cantidad.",
  PRECIO_INVALIDO: "Ingresá a cuánto la vendiste.",
  FECHA_FUTURA: "La fecha de la venta no puede ser posterior a hoy.",
  FECHA_ANTERIOR_A_ENTREGA:
    "La fecha de la venta es anterior a la entrega de esas botellas. Revisá la fecha.",
  COSTO_FALTANTE: `Ese lote todavía no tiene precio cargado. Avisale a ${NEGOCIO.nombre} para que lo cargue.`,
  GRUPO_INVALIDO: "No se pudo guardar. Cerrá y volvé a intentar.",
  LOTE_INVALIDO: `No se pudo elegir de dónde sacar las botellas. Avisale a ${NEGOCIO.nombre}.`,
};

/** Mensaje para el error de una venta cargada por la propia persona (todos
 * menos `STOCK_REVENDEDOR_INSUFICIENTE`, que abre una hoja aparte). */
export function mensajeErrorVentaPropia(
  codigo: string | null | undefined,
  detalleCrudo: string | null | undefined,
): string {
  if (codigo === "DEPOSITO_INSUFICIENTE") {
    return mensajeDepositoInsuficiente(disponibleEnDeposito(leerDetalleError(detalleCrudo)));
  }
  return traducirErrorRpc(codigo, ERRORES_VENTA_PROPIA, "No se pudo guardar la venta. Probá de nuevo.");
}

/** Etiqueta de una entrega que generó el sistema (`entregas_revendedor.
 * automatica`, 0073) para los hilos donde se listan entregas: la entrega que
 * se anota sola cuando alguien que "agarra directo" vende botellas que no
 * tenía, y la devolución con la que se compensa al eliminar esa venta. `null`
 * si la entrega la cargó una persona. */
export function etiquetaEntregaAutomatica(
  tipo: "entrega" | "devolucion",
  automatica: boolean,
): string | null {
  if (!automatica) return null;
  return tipo === "devolucion"
    ? "Devolución automática · se eliminó la venta"
    : "Entrega automática · agarró del depósito";
}
