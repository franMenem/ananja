/**
 * Traducción de errores de RPC/Postgres a mensajes en español — utilidad
 * compartida para no repetir `DICCIONARIO[error.message] ?? "default"` en
 * cada formulario (antes cada uno tenía su propio `const ERRORES:
 * Record<string, string>` idéntico en forma, solo cambiaban los códigos).
 *
 * El código de negocio en este repo siempre es `error.message` tal cual:
 * cada función de Postgres hace `raise exception 'CODIGO' using errcode =
 * ...` (o el `PGRST` genérico de un `.throw()`), y supabase-js lo expone
 * sin envolver en `.message` — nunca en `.details`/`.hint` (esos campos se
 * usan para DATOS extra del error, ej. `JSON.parse(error.details)` para
 * mostrar cuánto stock queda, no para el código en sí).
 *
 * Esta utilidad es deliberadamente chica: un dominio con un traductor que
 * hace más que "código -> texto fijo" (secciones tipo "entrega:CODIGO",
 * interpolación con datos del `detail`, o una acción distinta por código en
 * vez de un mensaje) se queda con su propio traductor a mano — ver
 * `lib/dominio/carga-revendedor.ts` § `traducirErrorCarga` y
 * `lib/dominio/lotes.ts` § `mensajeErrorLote`.
 */

/** Códigos que se repiten en varios dominios CON EL MISMO TEXTO — para
 * escribirlos una sola vez al armar el diccionario de un dominio nuevo
 * (`{ ...ERRORES_RPC_COMUNES, MI_CODIGO: "..." }`). No se aplica
 * automáticamente dentro de `traducirErrorRpc`: un dominio migrado desde un
 * diccionario existente sigue mostrando EXACTAMENTE lo mismo que mostraba
 * antes, código por código, porque `traducirErrorRpc` solo mira el
 * diccionario que le pasan. */
export const ERRORES_RPC_COMUNES: Record<string, string> = {
  NO_AUTORIZADO: "No tenés permiso para esto.",
};

/**
 * Traduce un código de error de RPC (`error.message`, ver arriba) a un
 * mensaje en español: busca en `diccionario` y, si no está, devuelve
 * `porDefecto`. `codigo` puede venir `null`/`undefined` (con conexión
 * cortada, por ejemplo) — nunca hace match y cae directo al default.
 */
export function traducirErrorRpc(
  codigo: string | null | undefined,
  diccionario: Record<string, string>,
  porDefecto: string,
): string {
  if (!codigo) return porDefecto;
  return diccionario[codigo] ?? porDefecto;
}
