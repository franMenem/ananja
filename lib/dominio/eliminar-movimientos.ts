/**
 * "Eliminar" desde la lista de movimientos de Plata: qué se puede borrar de
 * cada fila, qué dice el cartel de confirmación y cómo se traducen los
 * errores. Funciones puras, sin Supabase.
 *
 * Los ajustes de saldo y los depósitos ya tienen su propia acción
 * (`AjusteCajaAcciones`, `EliminarDepositoAccion`); acá van los que se
 * agregaron después: cobro, pago de deuda y transferencia entre cajas. Las
 * RPC son `eliminar_cobro` (0025), `eliminar_pago_deuda` (0027) y
 * `eliminar_transferencia_caja` (0091).
 */

import { MEDIO_PAGO_LABELS, type MedioPago } from "@/lib/dominio/caja";
import { formatCentavos, formatMonto } from "@/lib/money";

/** Datos serializables que necesita el botón "Eliminar" de una fila. `lugar`
 * es dónde figuraba la plata, ya dicho en palabras ("Mercado Pago", "la
 * plata en manos de Laura"). */
export type AccionEliminar =
  | { tipo: "cobro"; montoCentavos: number; lugar: string }
  | {
      tipo: "pago_deuda";
      moneda: "USD" | "ARS";
      /** Monto del pago en la moneda de la deuda. */
      montoCentavos: number;
      /** Pesos que habían salido de la caja. */
      montoCajaCentavos: number;
      lugar: string;
    }
  | {
      tipo: "transferencia";
      montoCentavos: number;
      origenLugar: string;
      destino: MedioPago;
    };

/** Dónde queda la plata en efectivo / cuenta, dicho en palabras. */
export function lugarEnPalabras(medio: MedioPago, tenedor: string): string {
  return medio === "efectivo" ? `la plata en manos de ${tenedor}` : MEDIO_PAGO_LABELS[medio];
}

export function tituloEliminar(a: AccionEliminar): string {
  switch (a.tipo) {
    case "cobro":
      return "Eliminar cobro";
    case "pago_deuda":
      return "Eliminar pago de deuda";
    case "transferencia":
      return "Eliminar transferencia";
  }
}

/** Texto del cartel "¿estás seguro?": dice qué pasa con la plata. */
export function mensajeEliminarMovimiento(a: AccionEliminar): string {
  switch (a.tipo) {
    case "cobro":
      return `Se va a borrar este cobro de ${formatCentavos(a.montoCentavos)}: esa plata deja de figurar en ${a.lugar}. La deuda de la venta vuelve a subir por ese monto.`;
    case "pago_deuda":
      return `Se va a borrar este pago de ${formatMonto(a.moneda, a.montoCentavos)}: ${formatCentavos(a.montoCajaCentavos)} vuelven a figurar en ${a.lugar}. Si este pago saldaba la deuda, la deuda vuelve a quedar pendiente.`;
    case "transferencia":
      return `Se va a borrar esta transferencia de ${formatCentavos(a.montoCentavos)}: esa plata vuelve a figurar en ${a.origenLugar} y deja de figurar en ${MEDIO_PAGO_LABELS[a.destino]}.`;
  }
}

export const ERRORES_ELIMINAR_MOVIMIENTO: Record<AccionEliminar["tipo"], Record<string, string>> = {
  cobro: {
    COBRO_NO_ENCONTRADO: "Este cobro ya no existe.",
    NO_AUTORIZADO: "No tenés permiso para esto.",
  },
  pago_deuda: {
    PAGO_NO_ENCONTRADO: "Este pago ya no existe.",
    NO_AUTORIZADO: "No tenés permiso para esto.",
  },
  transferencia: {
    TRANSFERENCIA_NO_ENCONTRADA: "Esta transferencia ya no existe.",
    SALDO_INSUFICIENTE:
      "No se puede eliminar: la plata que recibió la cuenta de destino ya se usó y quedaría en negativo.",
    NO_AUTORIZADO: "No tenés permiso para esto.",
  },
};

export const ERROR_ELIMINAR_GENERICO = "No se pudo eliminar. Probá de nuevo.";

/** Indicación discreta para una fila que NO se elimina desde la lista. */
export interface CorregirEn {
  texto: string;
  href: string;
}
