import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  FLAG_BIENVENIDA,
  FLAG_MUST_CHANGE_PASSWORD,
  flagCuentaActivo,
  RUTA_BIENVENIDA,
  RUTA_CONFIRMAR,
} from "@/lib/dominio/invitaciones";
import { NEGOCIO } from "@/lib/negocio";
import {
  obtenerVendedorPorUserId,
  tieneAccesoValido,
  type VendedorConRol,
} from "@/lib/rol-vendedor";
import {
  codificarSesionHeader,
  descartarHeaderEntrante,
  payloadSesionParaHeader,
  SESION_HEADER_NAME,
  type SesionHeaderPayload,
} from "@/lib/sesion-header";
import type { Database } from "@/lib/types";

/** Rutas accesibles sin sesión iniciada. */
const PUBLIC_PATHS = ["/login"];

/**
 * Ruta de cambio de contraseña obligatorio en el primer login (ver
 * `FLAG_MUST_CHANGE_PASSWORD` en `lib/dominio/invitaciones.ts` —
 * convención documentada en `supabase/crear-vendedor.sql`).
 */
const CAMBIAR_PASSWORD_PATH = "/cambiar-password";

/**
 * Pantalla para un usuario con sesión pero sin acceso: sin fila en
 * `vendedores` o con `activo = false` (fix de seguridad de Task 3, ver
 * `lib/rol-vendedor.ts` § `tieneAccesoValido`).
 */
const SIN_ACCESO_PATH = "/sin-acceso";

/**
 * Rutas que quedan afuera de los redirects por rol/acceso (pero siguen
 * exigiendo sesión): `/cambiar-password` porque un admin o revendedor
 * desactivado, o cualquiera de los dos roles, tiene que poder cambiar su
 * contraseña sin que el chequeo de rol/acceso lo saque de la pantalla
 *; `/sin-acceso`
 * porque es el propio destino del redirect, para no loopear.
 */
const ROLE_REDIRECT_EXEMPT_PATHS = [CAMBIAR_PASSWORD_PATH, SIN_ACCESO_PATH, RUTA_BIENVENIDA];

/**
 * Redirect forzado por flags de la cuenta — puro, para testearlo
 * (`tests/invitaciones.test.ts`):
 *  - `must_change_password` (contraseña temporal, alta a mano o "crear
 *    cuenta con contraseña temporal") → `/cambiar-password`.
 *  - flag de bienvenida (invitado por mail que todavía no eligió
 *    contraseña, ver `lib/dominio/invitaciones.ts` § FLAG_BIENVENIDA) →
 *    `/bienvenida`.
 * `null` si no corresponde (o si ya está en esa pantalla).
 *
 * Cada flag se considera activo si está en `app_metadata` (fuente de
 * verdad, solo editable con la service role) O en `user_metadata`
 * (compatibilidad con cuentas invitadas antes del fix de seguridad
 * 2026-09-21 que movió estos flags de `user_metadata` — editable por el
 * propio usuario con `supabase.auth.updateUser({ data: {...} })` desde el
 * navegador — a `app_metadata`; ver `flagCuentaActivo` y el TODO(0066) en
 * ese helper). `getUser()` en `updateSession` revalida contra el servidor
 * de Auth en cada request, así que `user.app_metadata` que llega acá
 * siempre es el valor fresco de la base, nunca uno viejo embebido en un
 * JWT sin refrescar.
 */
export function redireccionPorMetadata(
  appMetadata: Record<string, unknown> | null | undefined,
  userMetadata: Record<string, unknown> | null | undefined,
  pathname: string,
): string | null {
  if (flagCuentaActivo(appMetadata, userMetadata, FLAG_MUST_CHANGE_PASSWORD)) {
    return pathname === CAMBIAR_PASSWORD_PATH ? null : CAMBIAR_PASSWORD_PATH;
  }
  if (flagCuentaActivo(appMetadata, userMetadata, FLAG_BIENVENIDA)) {
    return pathname === RUTA_BIENVENIDA ? null : RUTA_BIENVENIDA;
  }
  return null;
}

/** Prefijo del shell exclusivo de revendedores (ver `app/(mi)/layout.tsx`). */
const MI_PREFIX = "/mi";

function esRutaMi(pathname: string): boolean {
  return pathname === MI_PREFIX || pathname.startsWith(`${MI_PREFIX}/`);
}

/** Prefijo de las rutas de API (ver `proxy.ts` — `/api/version` queda fuera
 * del matcher, así que nunca llega acá). */
const API_PREFIX = "/api/";

function esRutaApi(pathname: string): boolean {
  return pathname.startsWith(API_PREFIX);
}

/**
 * Decisión pura de redirect por rol/acceso — extraída de `updateSession`
 * para poder testearla sin un `NextRequest` real (`tests/decidir-redireccion.test.ts`).
 * Devuelve el `pathname` de destino, o `null` si no corresponde redirigir.
 * No decide nada sobre sesión ausente, `must_change_password`, rutas de
 * API ni el redirect de "/login" con sesión ya iniciada — eso lo resuelve
 * `updateSession` antes/después de llamar a esta función.
 *
 * Reglas (decisiones de negocio de `0026_roles_pendiente_espacio_revendedor.sql`):
 *  - Sin fila, `activo = false`, o `rol = 'pendiente'` (`tieneAccesoValido`
 *    ya cubre las tres) → `/sin-acceso`.
 *  - `revendedor` fuera de `/mi` (y no en ruta pública) → `/mi`.
 *  - `admin` SIN espacio de revendedor (`revende = false`) dentro de `/mi`
 *    → `/`.
 *  - `admin` CON espacio de revendedor (`revende = true`) puede navegar
 *    tanto `/mi` como el resto de la app — sin redirect en ningún sentido
 *    (usa "Ver como revendedor"/"Ver como admin" para moverse a
 *    voluntad).
 *  - `coordinador` (0055_coordinador.sql) SIEMPRE en `/mi` a secas: fuera
 *    de `/mi` → `/mi`; dentro de `/mi` pero en una subruta de revendedor
 *    (`/mi/ventas`, `/mi/pagar`, `/mi/material`, `/mi/ganancia` — no le
 *    corresponde nada de eso, "solo mirar y entregar") → `/mi`. Nunca
 *    entra a `(app)`.
 */
export function decidirRedireccion(
  vendedor: VendedorConRol | null,
  pathname: string,
): string | null {
  if (!tieneAccesoValido(vendedor)) {
    return SIN_ACCESO_PATH;
  }

  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));
  const enRutaMi = esRutaMi(pathname);

  if (vendedor.rol === "revendedor" && !isPublicPath && !enRutaMi) {
    return "/mi";
  }

  if (vendedor.rol === "admin" && enRutaMi && !vendedor.revende) {
    return "/";
  }

  if (vendedor.rol === "coordinador" && !isPublicPath && pathname !== MI_PREFIX) {
    return MI_PREFIX;
  }

  return null;
}

/**
 * Headers del request que siguen camino al render, sin el header de sesión
 * que haya mandado el cliente (anti-spoofing, ver `lib/sesion-header.ts`).
 *
 * Se recalcula EN CADA LLAMADA a partir de `request.headers` — nunca a
 * partir de una copia guardada de antes — porque `request.cookies.set(...)`
 * (dentro del `setAll` de Supabase, cuando refresca el token) escribe
 * directo sobre `request.headers`: confirmado en
 * `node_modules/next/dist/compiled/@edge-runtime/cookies/index.js`,
 * `RequestCookies.set` hace `this._headers.set("cookie", ...)` sobre el
 * MISMO objeto `Headers` que le pasaron al construirlo (que es
 * `request.headers`, no una copia). Una copia tomada ANTES de esa mutación
 * quedaría con la cookie vieja (el refresh token ya usado) y el cliente
 * Supabase del render intentaría refrescar de nuevo con un token quemado —
 * por eso el patrón oficial de `@supabase/ssr` pasa siempre el `request`
 * posta a `NextResponse.next({ request })` en vez de una copia de sus
 * headers. Acá hacemos lo mismo, sumando el descarte anti-spoofing en cada
 * llamada en vez de una vez sola.
 */
function headersParaRender(request: NextRequest): Headers {
  return descartarHeaderEntrante(request.headers);
}

/**
 * Arma la respuesta final agregando el header de sesión
 * (`lib/sesion-header.ts`, leído después por `lib/sesion-actual.ts`) —
 * `payload` es lo que decidió `payloadSesionParaHeader`: `null` (el proxy no
 * consultó `vendedores` para este request, ver ese helper) hace que esta
 * función NO agregue ningún header, sin ambigüedad con "se consultó y no
 * tiene fila".
 *
 * Reconstruye `NextResponse.next()` con los headers ya actualizados (es la
 * única forma de que Next los propague al render, ver la sección "Setting
 * Headers" de la doc de `proxy.ts`) y copia a mano las cookies que
 * `supabaseResponse` ya traiga (el refresco de sesión de Supabase, en el
 * `setAll` de más abajo) — si no se copian, reconstruir la respuesta las
 * pierde.
 */
function construirRespuestaConSesion(
  request: NextRequest,
  supabaseResponse: NextResponse,
  payload: SesionHeaderPayload | null,
): NextResponse {
  const headers = headersParaRender(request);
  if (payload) {
    headers.set(SESION_HEADER_NAME, codificarSesionHeader(payload));
  }
  const respuesta = NextResponse.next({ request: { headers } });
  supabaseResponse.cookies.getAll().forEach((cookie) => respuesta.cookies.set(cookie));
  return respuesta;
}

/**
 * Refresca la sesión de Supabase en cada request y aplica las reglas de
 * acceso: sin sesión → /login; con sesión en /login → / o /mi según rol;
 * con sesión y `must_change_password: true` → /cambiar-password (sin
 * excepción de ruta); con sesión, sin fila en `vendedores` o `activo =
 * false` → /sin-acceso (`/cambiar-password` y `/sin-acceso` exentas, ver
 * `ROLE_REDIRECT_EXEMPT_PATHS`); con sesión, rol resuelto y fuera del
 * shell que le corresponde → redirect al shell propio.
 *
 * Ninguna de esas reglas redirige para `/api/*` (fix de la revisión de
 * Task 5: un `NextResponse.redirect` sobre una ruta de API le llega al
 * `fetch()` del cliente como una respuesta que no es el JSON que espera,
 * en vez del 403 del handler): con sesión, un `/api/*` solo se bloquea acá
 * si el vendedor no tiene acceso válido (sin fila o `activo = false`),
 * devolviendo `{ error: "NO_AUTORIZADO" }` en JSON directamente — el resto
 * de las reglas (rol, `must_change_password`) las resuelve cada handler
 * (`lib/rol-vendedor.ts` § `esRevendedorAutenticado`) o no le aplican. Sin
 * sesión, `/api/*` sigue el mismo camino que cualquier otra ruta privada
 * (redirect a `/login`) — comportamiento preexistente, sin cambios.
 *
 * Patrón oficial de `@supabase/ssr` para Next.js (adaptado a `proxy.ts`,
 * el sucesor de `middleware.ts` en Next.js 16).
 */
export async function updateSession(request: NextRequest) {
  // `/auth/confirm` (links de los mails de Supabase Auth) pasa sin ningún
  // chequeo ni redirect: tiene que funcionar sin sesión, y también con una
  // sesión vieja (de otra persona, pendiente, desactivada o con
  // `must_change_password`) que si no la mandaría a otra pantalla ANTES
  // de verificar el link. La server action de esa pantalla (POST, botón
  // "Continuar") crea la sesión nueva ella misma.
  if (request.nextUrl.pathname === RUTA_CONFIRMAR) {
    return NextResponse.next({ request: { headers: headersParaRender(request) } });
  }

  let supabaseResponse = NextResponse.next({ request: { headers: headersParaRender(request) } });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: NEGOCIO.schema as "public" },
      // Ver security-audit-2026-09-02.md hallazgo #2 — `secure` solo en
      // producción para no romper cookies en `localhost` HTTP (dev).
      cookieOptions: {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          // `headersParaRender(request)` se recalcula ACÁ, después de los
          // `request.cookies.set(...)` de arriba — ya con la cookie
          // refrescada adentro (ver el comentario de `headersParaRender`).
          supabaseResponse = NextResponse.next({
            request: { headers: headersParaRender(request) },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANTE: no quitar. `getUser()` revalida el token contra el servidor
  // de Supabase (a diferencia de `getSession()`, que solo lee la cookie).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url, 302);
  }

  if (user && esRutaApi(pathname)) {
    // `/api/*` nunca redirige (ver el comentario de `updateSession` más
    // arriba) — el único chequeo que hace acá es el de acceso válido,
    // porque los tres handlers que pasan por este matcher (`ocr-monto`,
    // `push/send`, `push/subscribe`) no lo hacen ellos mismos: solo
    // verifican `esRevendedorAutenticado` (rol), no `tieneAccesoValido`
    // (fila/activo) — sin este chequeo acá, un vendedor sin fila o
    // desactivado pasaría esa verificación (un no-revendedor "vacío" no es
    // revendedor) y llegaría a ejecutar el handler.
    const vendedor = await obtenerVendedorPorUserId(supabase, user.id);
    if (!tieneAccesoValido(vendedor)) {
      return NextResponse.json({ error: "NO_AUTORIZADO" }, { status: 403 });
    }
    return construirRespuestaConSesion(
      request,
      supabaseResponse,
      payloadSesionParaHeader(user.id, true, vendedor),
    );
  }

  if (user) {
    // Con `must_change_password` o el flag de bienvenida activos, cualquier
    // ruta que no sea su pantalla (/cambiar-password o /bienvenida) redirige
    // ahí (ver `redireccionPorMetadata`; `PUBLIC_PATHS`/assets ya filtrados
    // por el matcher). Con los flags en false/ausentes, /cambiar-password
    // queda accesible con normalidad — no hay redirección forzada de
    // salida — para que el link discreto al pie de /tareas (antes en
    // /notificaciones) y el link de recuperación sirvan para cambiarla por
    // voluntad propia. El redirect tras un cambio exitoso lo hace la propia
    // pantalla luego de que la server action `guardarPasswordNueva`
    // (`app/(auth)/cambiar-password/actions.ts`) guarde la contraseña y
    // apague los flags.
    const destinoCuenta = redireccionPorMetadata(user.app_metadata, user.user_metadata, pathname);
    if (destinoCuenta !== null) {
      const url = request.nextUrl.clone();
      url.pathname = destinoCuenta;
      url.search = "";
      return NextResponse.redirect(url, 302);
    }
    const mustChangePassword =
      flagCuentaActivo(user.app_metadata, user.user_metadata, FLAG_MUST_CHANGE_PASSWORD) ||
      flagCuentaActivo(user.app_metadata, user.user_metadata, FLAG_BIENVENIDA);

    // Rol del vendedor logueado: una consulta liviana más por request, sobre
    // una tabla indexada por `user_id` — el patrón ya existente en este
    // archivo no cachea nada más allá de la cookie de sesión (cada request
    // ya revalida contra el servidor con `getUser()`, la llamada cara),
    // así que agregar esta no cambia el orden de magnitud.
    //
    // `/cambiar-password` y `/sin-acceso` quedan exentas de este bloque
    // (`ROLE_REDIRECT_EXEMPT_PATHS`, fix de seguridad de Task 3): un
    // admin o revendedor desactivado tiene que poder llegar a
    // `/cambiar-password`, y `/sin-acceso` es el propio destino del
    // redirect de abajo (evita el loop).
    //
    // `vendedorResuelto`/`vendedorParaHeader` alimentan el header de sesión
    // del return final de este bloque (`payloadSesionParaHeader`, más
    // abajo) con la MISMA consulta que ya hace falta acá para
    // `decidirRedireccion` — sin repetirla. En una ruta exenta o con
    // `mustChangePassword`, esta consulta NO se hace (`vendedorResuelto`
    // queda en `false`): esas páginas siguen resolviendo el vendedor por su
    // cuenta (`lib/sesion-actual.ts` cae al fallback real cuando no hay
    // header), sin regresión de comportamiento — y sin emitir un header
    // ambiguo (`payloadSesionParaHeader` distingue "no se consultó" de
    // "se consultó y no tiene fila").
    let vendedorResuelto = false;
    let vendedorParaHeader: VendedorConRol | null = null;
    if (!mustChangePassword && !ROLE_REDIRECT_EXEMPT_PATHS.includes(pathname)) {
      const vendedor = await obtenerVendedorPorUserId(supabase, user.id);
      vendedorResuelto = true;
      vendedorParaHeader = vendedor;
      const destino = decidirRedireccion(vendedor, pathname);

      if (destino !== null) {
        const url = request.nextUrl.clone();
        url.pathname = destino;
        return NextResponse.redirect(url, 302);
      }
    }

    if (pathname === "/login") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url, 302);
    }

    return construirRespuestaConSesion(
      request,
      supabaseResponse,
      payloadSesionParaHeader(user.id, vendedorResuelto, vendedorParaHeader),
    );
  }

  return supabaseResponse;
}
