/**
 * Cómo se muestra la deuda de una revendedora en el héroe de `/mi` y de la
 * ficha admin. El rojo es solo para lo que falta pagar de verdad: si los pagos
 * informados (todavía sin confirmar) cubren toda la deuda, el número no es rojo.
 */
export type EstadoDeudaHero =
  | { tipo: "al-dia" }
  /** Debe y no hay pagos por confirmar. */
  | { tipo: "debe"; rojo: true }
  /** Hay pagos por confirmar que cubren solo una parte. */
  | { tipo: "parcial"; rojo: true; pendienteCentavos: number; quedaCentavos: number }
  /** Los pagos por confirmar cubren toda la deuda. */
  | { tipo: "todo-pagado"; rojo: false; pendienteCentavos: number };

export function estadoDeudaHero(deudaCentavos: number, pendienteCentavos: number): EstadoDeudaHero {
  const pendiente = Math.max(pendienteCentavos, 0);
  if (deudaCentavos <= 0) return { tipo: "al-dia" };
  if (pendiente <= 0) return { tipo: "debe", rojo: true };
  if (pendiente >= deudaCentavos) return { tipo: "todo-pagado", rojo: false, pendienteCentavos: pendiente };
  return { tipo: "parcial", rojo: true, pendienteCentavos: pendiente, quedaCentavos: deudaCentavos - pendiente };
}
