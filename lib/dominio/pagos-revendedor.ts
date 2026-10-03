/**
 * Pagos de una revendedora a su encargado o a Ananja
 * (supabase/migrations/0040_revendedores_pagos_precios.sql § 3): cuánto
 * debe, cuánto informó y todavía no le confirmaron, cuánto le sugerimos
 * pagar, y el historial que ve en `/mi`. Funciones puras, sin Supabase.
 */

import { diasEntre, fechaArgentinaDeTimestamp } from "@/lib/fechas";
import { NEGOCIO } from "@/lib/negocio";
import type { Enums } from "@/lib/types";

export type MedioPago = Enums<"medio_pago">;
export type EstadoPago = "pendiente" | "confirmado" | "rechazado";

export interface PagoMonto {
  montoCentavos: number;
  estado: EstadoPago;
}

export interface DeudaConPendientes {
  /** `v_deuda_vendedor.saldo_centavos` tal cual (puede ser negativo). */
  debeCentavos: number;
  /** Suma de pagos informados que el encargado (o un admin) todavía no confirmó. */
  pendienteCentavos: number;
  /** Precarga del monto en "Pagar a…": lo que debe menos lo pendiente, nunca negativo. */
  aPagarSugeridoCentavos: number;
}

/**
 * Los pagos pendientes NO bajan la deuda (`v_deuda_vendedor` solo cuenta
 * rendiciones, y un pago recién se vuelve rendición al confirmarse) — se
 * muestran aparte y se descuentan solo de la precarga, para que no pague
 * dos veces lo mismo mientras espera la confirmación.
 */
export function calcularDeudaConPendientes(
  saldoCentavos: number,
  pagos: PagoMonto[],
): DeudaConPendientes {
  const pendienteCentavos = pagos
    .filter((p) => p.estado === "pendiente")
    .reduce((acc, p) => acc + p.montoCentavos, 0);
  return {
    debeCentavos: saldoCentavos,
    pendienteCentavos,
    aPagarSugeridoCentavos: Math.max(saldoCentavos - pendienteCentavos, 0),
  };
}

export interface PagoHistorial {
  id: string;
  montoCentavos: number;
  medioPago: MedioPago;
  fecha: string;
  createdAt: string;
  estado: EstadoPago;
  motivoRechazo: string | null;
  rendicionId: string | null;
}

export interface RendicionHistorial {
  id: string;
  montoCentavos: number;
  medioPago: MedioPago;
  fecha: string;
  createdAt: string;
}

export interface MovimientoPago {
  id: string;
  /** "pago": lo informó ella desde `/mi`. "rendicion": lo registró un admin directo. */
  origen: "pago" | "rendicion";
  montoCentavos: number;
  medioPago: MedioPago;
  fecha: string;
  estado: EstadoPago;
  motivoRechazo: string | null;
}

/**
 * Historial de pagos para la revendedora: sus pagos informados (con su
 * estado) más las rendiciones que un admin cargó directo (esas ya cuentan
 * como confirmadas). Una rendición creada al confirmar un pago no se repite
 * — ya aparece como ese pago. Más reciente primero.
 */
export function historialPagos(
  pagos: PagoHistorial[],
  rendiciones: RendicionHistorial[],
): MovimientoPago[] {
  const rendicionesDePagos = new Set(
    pagos.map((p) => p.rendicionId).filter((id): id is string => id !== null),
  );

  const movimientos: (MovimientoPago & { createdAt: string })[] = [
    ...pagos.map((p) => ({
      id: p.id,
      origen: "pago" as const,
      montoCentavos: p.montoCentavos,
      medioPago: p.medioPago,
      fecha: p.fecha,
      createdAt: p.createdAt,
      estado: p.estado,
      motivoRechazo: p.motivoRechazo,
    })),
    ...rendiciones
      .filter((r) => !rendicionesDePagos.has(r.id))
      .map((r) => ({
        id: r.id,
        origen: "rendicion" as const,
        montoCentavos: r.montoCentavos,
        medioPago: r.medioPago,
        fecha: r.fecha,
        createdAt: r.createdAt,
        estado: "confirmado" as const,
        motivoRechazo: null,
      })),
  ];

  movimientos.sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    return 0;
  });

  return movimientos.map((m) => ({
    id: m.id,
    origen: m.origen,
    montoCentavos: m.montoCentavos,
    medioPago: m.medioPago,
    fecha: m.fecha,
    estado: m.estado,
    motivoRechazo: m.motivoRechazo,
  }));
}

export interface EncargadoPago {
  id: string;
  nombre: string;
}

/** Medios que acepta un pago según a quién va: a un encargado, cualquiera
 * (efectivo en mano, o transferencia a su cuenta personal); directo a la
 * Cuenta Ananja, solo banco o Mercado Pago (no hay caja física donde dejar
 * efectivo) — misma regla que `MEDIO_INVALIDO` del RPC. */
export function mediosPermitidosPago(encargado: EncargadoPago | null): MedioPago[] {
  return encargado ? ["efectivo", "mercado_pago", "banco"] : ["mercado_pago", "banco"];
}

/** El comprobante es obligatorio salvo en efectivo (no hay nada que fotografiar). */
export function comprobanteObligatorio(medio: MedioPago | null): boolean {
  return medio !== null && medio !== "efectivo";
}

/** `pagos_revendedor.estado` llega como `string` en los tipos generados (es
 * un `check`, no un enum de Postgres) — lo acota a los tres valores
 * posibles; cualquier otro valor se trata como pendiente. */
export function pagoEstado(valor: string): EstadoPago {
  return valor === "confirmado" || valor === "rechazado" ? valor : "pendiente";
}

export const ESTADO_PAGO_LABELS: Record<EstadoPago, string> = {
  pendiente: "Pendiente de confirmar",
  confirmado: "Confirmado",
  rechazado: "Rechazado",
};

/** Días que se sigue mostrando en `/mi` el aviso de un pago rechazado. */
export const DIAS_AVISO_PAGO_RECHAZADO = 15;

export interface PagoParaAviso {
  estado: EstadoPago;
  createdAt: string;
  resueltoEn: string | null;
  montoCentavos: number;
  fecha: string;
  motivoRechazo: string | null;
}

/**
 * El pago rechazado sobre el que avisar en `/mi`, o `null`. Se avisa por el
 * rechazado más reciente solo si: todavía debe (`debeCentavos > 0`), se
 * rechazó en los últimos 15 días (Argentina) y después de informarlo no
 * hubo otro pago (pendiente o confirmado) ni una rendición.
 */
export function pagoRechazadoParaAvisar(
  pagos: PagoParaAviso[],
  rendiciones: { createdAt: string }[],
  debeCentavos: number,
  hoy: string,
): PagoParaAviso | null {
  if (debeCentavos <= 0) return null;
  const momento = (p: PagoParaAviso) => Date.parse(p.resueltoEn ?? p.createdAt);
  const rechazado = pagos
    .filter((p) => p.estado === "rechazado")
    .sort((a, b) => momento(b) - momento(a))[0];
  if (!rechazado) return null;

  const diaRechazo = fechaArgentinaDeTimestamp(rechazado.resueltoEn ?? rechazado.createdAt);
  if (diasEntre(diaRechazo, hoy) > DIAS_AVISO_PAGO_RECHAZADO) return null;

  const informado = Date.parse(rechazado.createdAt);
  const huboPagoDespues = pagos.some((p) => p.estado !== "rechazado" && Date.parse(p.createdAt) > informado);
  const huboRendicionDespues = rendiciones.some((r) => Date.parse(r.createdAt) > informado);
  return huboPagoDespues || huboRendicionDespues ? null : rechazado;
}

// --- Lista admin de pagos informados (`/comprobantes?tab=pagos`) ----------

/** Destino que se muestra cuando `destinatario_id` es null: el pago fue
 * directo a la Cuenta Ananja, sin pasar por un encargado. */
export const DESTINO_CUENTA = `Cuenta ${NEGOCIO.nombre}`;

/**
 * Fila cruda de `pagos_revendedor` con los nombres ya traídos por embed —
 * la forma que arma `lib/data/pagos-revendedor.ts`. Se declara acá (y no se
 * importa de `lib/data`) para que el dominio siga sin depender de I/O.
 */
export interface PagoRevendedorFuente {
  id: string;
  monto_centavos: number;
  medio_pago: MedioPago;
  fecha: string;
  created_at: string;
  nota: string | null;
  estado: string;
  resuelto_en: string | null;
  motivo_rechazo: string | null;
  imagen_path: string | null;
  vendedor: { nombre: string } | null;
  destinatario: { nombre: string } | null;
  resolvio: { nombre: string } | null;
  destinatario_id: string | null;
}

/** Una fila de la lista de pagos, lista para mostrar. */
export interface PagoRevendedorFila {
  id: string;
  quienPago: string;
  /** "Laura", o `DESTINO_CUENTA` si el pago fue directo a la Cuenta Ananja. */
  destino: string;
  montoCentavos: number;
  medioPago: MedioPago;
  /** Cuándo pagó ("yyyy-mm-dd"). */
  fecha: string;
  /** Cuándo lo informó (timestamp). */
  informadoEn: string;
  estado: EstadoPago;
  estadoLabel: string;
  resueltoPor: string | null;
  resueltoEn: string | null;
  motivoRechazo: string | null;
  nota: string | null;
  imagenPath: string | null;
}

/**
 * Fila cruda -> fila de presentación. Si el nombre de quien pagó o del
 * destinatario no se pudo resolver (persona dada de baja, política de
 * acceso), cae a un texto genérico en vez de dejar el hueco vacío.
 */
export function pagoRevendedorFila(p: PagoRevendedorFuente): PagoRevendedorFila {
  const estado = pagoEstado(p.estado);
  return {
    id: p.id,
    quienPago: p.vendedor?.nombre ?? "Una revendedora",
    destino:
      p.destinatario_id === null ? DESTINO_CUENTA : (p.destinatario?.nombre ?? "Su encargado"),
    montoCentavos: p.monto_centavos,
    medioPago: p.medio_pago,
    fecha: p.fecha,
    informadoEn: p.created_at,
    estado,
    estadoLabel: ESTADO_PAGO_LABELS[estado],
    resueltoPor: p.resolvio?.nombre ?? null,
    resueltoEn: p.resuelto_en,
    motivoRechazo: p.motivo_rechazo,
    nota: p.nota,
    imagenPath: p.imagen_path,
  };
}

export type FiltroEstadoPago = "todos" | EstadoPago;

/** Filtra la lista por estado; "todos" la devuelve entera. Conserva el orden. */
export function filtrarPagosPorEstado<T extends Pick<PagoRevendedorFila, "estado">>(
  filas: T[],
  filtro: FiltroEstadoPago,
): T[] {
  return filtro === "todos" ? filas : filas.filter((f) => f.estado === filtro);
}

/**
 * Texto de estado de una fila: "Pendiente de confirmar", "Confirmado por
 * Fran" o "Rechazado por Fran" (sin "por …" si no se sabe quién lo
 * resolvió). El motivo del rechazo va aparte (`motivoRechazo`).
 */
export function textoEstadoPago(f: Pick<PagoRevendedorFila, "estado" | "estadoLabel" | "resueltoPor">): string {
  if (f.estado === "pendiente" || !f.resueltoPor) return f.estadoLabel;
  return `${f.estadoLabel} por ${f.resueltoPor}`;
}
