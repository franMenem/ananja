/**
 * Lógica pura de las suscripciones de Web Push con dueño (hallazgo de
 * seguridad F7, `supabase/migrations/0076_push_subscriptions_dueno.sql`).
 *
 * Hasta 0076 `push_subscriptions` no guardaba de quién era cada
 * suscripción, y `/api/push/send` mandaba el aviso a todas: un admin al que
 * se le quitó el rol seguía recibiendo los avisos internos. Ahora cada fila
 * tiene `vendedor_id` y el envío se filtra a los admins activos.
 *
 * `filtrarSuscripcionesDeAdmins` tolera filas sin la columna `vendedor_id`
 * (base anterior a la 0076).
 */

type FilaConDueno = { vendedor_id?: string | null };

/**
 * `true` si las filas leídas de `push_subscriptions` traen la clave
 * `vendedor_id` (aunque sea `null`): la base ya tiene la migración 0076.
 * Sin filas no hay nada que decidir y se devuelve `false`.
 */
export function tieneColumnaDueno(filas: readonly object[]): boolean {
  return filas.some((fila) => "vendedor_id" in fila);
}

/**
 * Deja solo las suscripciones cuyo dueño es un admin activo (`adminIds`).
 * Las filas sin dueño (`vendedor_id = null`, todavía sin reenlazar) no
 * reciben avisos. Si la base no está migrada (las filas no traen la clave
 * `vendedor_id`), devuelve todas, como antes de 0076.
 */
export function filtrarSuscripcionesDeAdmins<T extends object>(
  filas: readonly T[],
  adminIds: ReadonlySet<string>,
): T[] {
  if (!tieneColumnaDueno(filas)) return [...filas];

  return filas.filter((fila) => {
    const dueno = (fila as FilaConDueno).vendedor_id;
    return dueno != null && adminIds.has(dueno);
  });
}
