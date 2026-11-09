/**
 * Feria vista desde la revendedora (`app/(mi)`) — decisiones puras de pantalla.
 */

/** Qué mostrar en la tarjeta de Inicio según el estado de su participación. */
export type AccionFeriaInicio = "cerrar" | "ver" | "cerrada";

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
  if (estadoParticipante === "cerrada") return "cerrada";
  return fechaFeria <= hoy ? "cerrar" : "ver";
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
};
