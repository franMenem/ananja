/**
 * Feria vista desde la revendedora (`app/(mi)`) — decisiones puras de pantalla.
 */

import { participacionCerrada } from "@/lib/dominio/feria-admin";

/** Qué mostrar en la tarjeta de Inicio según el estado de su participación. */
export type AccionFeriaInicio = "cerrar" | "ver" | "cerrada";

/**
 * ¿La revendedora puede cerrar su feria? Solo si todavía no cerró y la feria
 * es de hoy o ya pasó. ÚNICA regla: la usan Inicio, `/mi/feria` y
 * `/mi/feria/cerrar`. `hoy` sale de `hoyISO()` (fecha de Argentina).
 */
export function sePuedeCerrarMiFeria(
  estadoParticipante: string | null | undefined,
  fechaFeria: string,
  hoy: string,
): boolean {
  return !participacionCerrada(estadoParticipante) && fechaFeria <= hoy;
}

/**
 * - `cerrada`: ya cerró su parte (la feria sigue abierta para otras).
 * - `cerrar`: sigue pendiente y la feria es de hoy o ya pasó.
 * - `ver`: sigue pendiente pero la feria es futura (todavía no hay nada que cerrar).
 */
export function accionFeriaInicio(
  estadoParticipante: string | null | undefined,
  fechaFeria: string,
  hoy: string,
): AccionFeriaInicio {
  if (participacionCerrada(estadoParticipante)) return "cerrada";
  return sePuedeCerrarMiFeria(estadoParticipante, fechaFeria, hoy) ? "cerrar" : "ver";
}

/** Datos serializables que la página de Inicio le pasa a la tarjeta. */
export type FeriaInicio = {
  nombre: string;
  fecha: string;
  lugar: string | null;
  accion: AccionFeriaInicio;
  llevadas: number;
  vendidas: number;
  devueltas: number;
  /** Botellas que el admin le cargó para degustación (a cargo de Ananja). */
  degustadasCarga?: number;
};

/**
 * Degustación de un producto vista por la revendedora: "0", "1 de Ananja",
 * "3" (todas del cierre) o "4 (3 de Ananja · 1 en el cierre)".
 */
export function textoDegustacionMi(carga: number, cierre: number): string {
  if (carga > 0 && cierre > 0) return `${carga + cierre} (${carga} de Ananja · ${cierre} en el cierre)`;
  if (carga > 0) return `${carga} de Ananja`;
  return String(cierre);
}
