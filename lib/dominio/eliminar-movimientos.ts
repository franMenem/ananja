/**
 * "Eliminar" desde la lista de movimientos de Plata: qué se puede borrar de
 * cada fila, qué dice el cartel de confirmación y cómo se traducen los
 * errores. Funciones puras, sin Supabase.
 *
 * Los ajustes de saldo y los depósitos ya tienen su propia acción
 * (`AjusteCajaAcciones`, `EliminarDepositoAccion`); acá van los que se
 * agregaron después: cobro, pago de deuda, transferencia entre cajas y pago de
 * revendedora. Las RPC son `eliminar_cobro` (0025), `eliminar_pago_deuda`
 * (0027), `eliminar_transferencia_caja` (0091) y
 * `eliminar_rendicion_revendedor` (0092).
 */

import { MEDIO_PAGO_LABELS, type MedioPago } from "@/lib/dominio/caja";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
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
    }
  /** Pago de una revendedora ya registrado (rendición): `eliminar_rendicion_revendedor` (0092). */
  | { tipo: "rendicion"; revendedora: string; montoCentavos: number; lugar: string };

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
    case "rendicion":
      return "Eliminar pago";
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
    case "rendicion":
      return `${a.revendedora} vuelve a deber ${formatCentavos(a.montoCentavos)} y esa plata deja de figurar en ${a.lugar}.`;
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
  rendicion: {
    RENDICION_NO_ENCONTRADA: "Este pago ya no existe. Actualizá la pantalla.",
    RENDICION_DE_VENTA: "Este pago salió de una venta de coordinadora: se corrige borrando esa venta.",
    PLATA_YA_DEPOSITADA: "No se puede eliminar: esa plata ya se pasó a la Cuenta Ananja o se gastó.",
    CAJA_SIN_SALDO: "No se puede eliminar: esa plata ya se usó y la cuenta quedaría en negativo.",
    DIFERENCIA_YA_PAGADA: "No se puede eliminar: ya se le pagó al encargado la diferencia de este cobro.",
    NO_AUTORIZADO: "No tenés permiso para esto.",
  },
};

export const ERROR_ELIMINAR_GENERICO = "No se pudo eliminar. Probá de nuevo.";

function parsearDetalle(details: string | null | undefined): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(details ?? "");
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Traduce el error de `eliminar_rendicion_revendedor` a un mensaje que dice
 * QUÉ eliminar primero, usando el `detail` (JSON) que manda la RPC. Si el
 * detalle no viene o no se entiende, cae al texto fijo del diccionario.
 */
export function mensajeErrorEliminarRendicion(
  codigo: string | null | undefined,
  details: string | null | undefined,
): string {
  const d = parsearDetalle(details);
  const num = (k: string) => (typeof d[k] === "number" ? (d[k] as number) : null);
  const txt = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : null);

  if (codigo === "PLATA_YA_DEPOSITADA") {
    const tenedor = txt("tenedor");
    if (tenedor) {
      const enMano = num("en_mano_centavos");
      const pendiente = num("pendiente_centavos") ?? 0;
      const resultado =
        enMano !== null && enMano >= 0 && pendiente > 0
          ? `tiene avisado un depósito de ${formatCentavos(pendiente)} y le quedarían ${formatCentavos(enMano)} en mano`
          : "le quedaría la plata en mano en negativo";
      return `No se puede eliminar: ${tenedor} ya pasó a la Cuenta Ananja (o gastó) esa plata y ${resultado}. Primero eliminá el depósito o el gasto que la usó.`;
    }
  }
  if (codigo === "CAJA_SIN_SALDO") {
    const medio = txt("medio");
    if (medio && medio in MEDIO_PAGO_LABELS) {
      return `No se puede eliminar: ${MEDIO_PAGO_LABELS[medio as MedioPago]} quedaría en negativo porque esa plata ya se usó. Primero eliminá el gasto, pago o transferencia que la usó.`;
    }
  }
  if (codigo === "DIFERENCIA_YA_PAGADA") {
    const encargado = txt("encargado");
    if (encargado) {
      return `No se puede eliminar: a ${encargado} ya se le pagó la diferencia que le correspondía por este cobro. Primero eliminá ese pago (gasto "Diferencias de encargados").`;
    }
  }
  return traducirErrorRpc(codigo, ERRORES_ELIMINAR_MOVIMIENTO.rendicion, ERROR_ELIMINAR_GENERICO);
}

/** Qué se puede hacer con un pago registrado (rendición), decidido de antemano. */
export type OpcionEliminarRendicion =
  | { puede: true; accion: AccionEliminar }
  | { puede: false; motivo: string };

/**
 * Regla espejo de la RPC que se conoce sin consultar: la rendición de una
 * venta de coordinadora (`venta_grupo_id`) no se elimina acá, se borra la
 * venta. Lo demás (plata ya depositada, cajas, diferencias) solo se sabe al
 * intentar.
 */
export function opcionEliminarRendicion(r: {
  ventaGrupoId: string | null;
  revendedora: string;
  montoCentavos: number;
  via: "encargado" | "directo_cuenta" | "cliente_directo";
  medioPago: MedioPago;
  tenedor: string;
}): OpcionEliminarRendicion {
  if (r.ventaGrupoId) {
    return { puede: false, motivo: `Se corrige borrando la venta de ${r.revendedora}` };
  }
  return {
    puede: true,
    accion: {
      tipo: "rendicion",
      revendedora: r.revendedora,
      montoCentavos: r.montoCentavos,
      lugar: lugarEnPalabras(r.via === "encargado" ? "efectivo" : r.medioPago, r.tenedor),
    },
  };
}

/** Indicación discreta para una fila que NO se elimina desde la lista. */
export interface CorregirEn {
  texto: string;
  href: string;
}
