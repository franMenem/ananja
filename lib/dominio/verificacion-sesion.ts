/**
 * Decisión "rápido vs. lento" de la verificación de sesión del proxy
 * (`lib/supabase/middleware.ts`). Pura, para testearla sin Supabase
 * (`tests/verificacion-sesion.test.ts`).
 *
 * El proxy primero pide `supabase.auth.getClaims()`, que verifica la firma
 * del JWT de acceso en el propio servidor (clave pública ES256 del JWKS del
 * proyecto, cacheada 10 minutos) y NO viaja a Supabase Auth. Con el resultado
 * de esa llamada esta función decide:
 *
 *  - `usar_claims`: el token es válido y no hay ningún motivo para dudar de
 *    su contenido. La identidad sale de `claims.sub` y los metadatos del
 *    propio claim.
 *  - `confirmar_con_getuser`: camino lento. El proxy pregunta a Supabase Auth
 *    con `getUser()` (como hacía antes en cada request) y usa ESA respuesta.
 *
 * Camino lento si ocurre CUALQUIERA de estas cosas:
 *  1. `getClaims` devolvió error (JWKS inaccesible, firma inválida, token
 *     vencido, sesión que no se pudo refrescar…) o lanzó una excepción.
 *  2. No hay claims (no hay sesión, o la librería no pudo armarlos).
 *  3. Al claim le falta un `sub` utilizable, o su `role` no es
 *     `authenticated`, o `exp` ya pasó.
 *  4. El claim trae en `true` alguno de los flags de cuenta (bienvenida
 *     pendiente, `must_change_password`; en `app_metadata` o `user_metadata`,
 *     ver `flagCuentaActivo`). Esos flags los apaga `guardarPasswordNueva` /
 *     el flujo de bienvenida con la Admin API, que NO emite un token nuevo:
 *     el claim seguiría diciendo `true` hasta que el token se renueve y la
 *     persona rebotaría a `/cambiar-password`. Mientras el claim diga `true`
 *     se consulta el valor fresco.
 *
 * Nunca hay un tercer resultado "dejar pasar": si no se puede afirmar la
 * identidad con el claim, se confirma con `getUser()`, y si esa tampoco da
 * usuario, el proxy trata el request como sin sesión (redirect a `/login`).
 * Un error de red del JWKS nunca rechaza una sesión válida: va al camino
 * lento y `getUser()` decide.
 */

import {
  FLAG_BIENVENIDA,
  FLAG_MUST_CHANGE_PASSWORD,
  flagCuentaActivo,
} from "@/lib/dominio/invitaciones";

/** Lo que el proxy lee del claim (subconjunto de `JwtPayload` de auth-js). */
export interface ClaimsSesion {
  sub?: unknown;
  role?: unknown;
  exp?: unknown;
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
}

/** Entrada: el resultado de `getClaims()` ya desarmado. `error` es cualquier
 * cosa truthy (error de auth, excepción atrapada). */
export interface ResultadoClaims {
  claims: ClaimsSesion | null | undefined;
  error?: unknown;
  /** Segundos desde epoch; inyectable para tests. Por defecto, ahora. */
  ahoraSegundos?: number;
}

/** La identidad que consume el resto del proxy (lo mismo que leía de `user`). */
export interface IdentidadSesion {
  id: string;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
}

export type DecisionVerificacion =
  | { via: "usar_claims"; identidad: IdentidadSesion }
  | { via: "confirmar_con_getuser" };

const CONFIRMAR: DecisionVerificacion = { via: "confirmar_con_getuser" };

export function decidirVerificacionSesion(entrada: ResultadoClaims): DecisionVerificacion {
  const { claims, error } = entrada;
  if (error || !claims) return CONFIRMAR;

  if (typeof claims.sub !== "string" || claims.sub.length === 0) return CONFIRMAR;
  if (claims.role !== "authenticated") return CONFIRMAR;

  const ahora = entrada.ahoraSegundos ?? Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp <= ahora) return CONFIRMAR;

  const app = claims.app_metadata ?? {};
  const usuario = claims.user_metadata ?? {};
  if (
    flagCuentaActivo(app, usuario, FLAG_MUST_CHANGE_PASSWORD) ||
    flagCuentaActivo(app, usuario, FLAG_BIENVENIDA)
  ) {
    return CONFIRMAR;
  }

  return { via: "usar_claims", identidad: { id: claims.sub, app_metadata: app, user_metadata: usuario } };
}
