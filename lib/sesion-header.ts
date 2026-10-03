import type { VendedorConRol } from "@/lib/rol-vendedor";

/**
 * Header interno que el proxy (`lib/supabase/middleware.ts`) usa para
 * pasarle a los Server Components el usuario y el vendedor que YA resolvió
 * (`lib/sesion-actual.ts` lo lee) — evita que cada layout/página repita
 * `getUser()` + la consulta a `vendedores` que el proxy ya hizo.
 *
 * Puro "UI/ruteo": los datos siguen protegidos por RLS (cada cliente
 * Supabase usa el JWT real de la cookie) y ninguna escritura ni uso de
 * service role puede confiar en este header — esas verificaciones siguen
 * llamando a `getUser()`/`obtenerVendedorPorUserId` directamente (ver
 * `lib/invitaciones-server.ts` § `exigirAdmin`).
 */
export const SESION_HEADER_NAME = "x-ananja-sesion";

/**
 * Subconjunto de `vendedores` que de verdad leen los consumidores migrados a
 * `sesionActual()` (`id`, `nombre`, `activo`, `rol`, `revende` — ver
 * `tieneAccesoValido`/`puedeRevender`/`esCoordinador` en
 * `lib/rol-vendedor.ts`). Mantenerlo chico importa: viaja en un header en
 * TODAS las requests autenticadas.
 */
export type VendedorHeaderPayload = Pick<
  VendedorConRol,
  "id" | "nombre" | "activo" | "rol" | "revende"
>;

export interface SesionHeaderPayload {
  userId: string;
  vendedor: VendedorHeaderPayload | null;
}

function esVendedorHeaderValido(data: unknown): data is VendedorHeaderPayload {
  if (typeof data !== "object" || data === null) return false;
  const v = data as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.nombre === "string" &&
    typeof v.activo === "boolean" &&
    typeof v.rol === "string" &&
    typeof v.revende === "boolean"
  );
}

function esPayloadValido(data: unknown): data is SesionHeaderPayload {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  if (typeof d.userId !== "string") return false;
  return d.vendedor === null || esVendedorHeaderValido(d.vendedor);
}

/**
 * JSON → base64url. `nombre` puede traer tildes/ñ (headers HTTP exigen
 * Latin-1), y base64url además evita el padding `=` que rompería si algo lo
 * recorta al pasar por una query string en el medio.
 */
export function codificarSesionHeader(payload: SesionHeaderPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/**
 * `null` si el valor está ausente, no es base64url válido, no es JSON, o no
 * tiene la forma esperada — cualquiera de estos casos hace que
 * `sesionActual()` (`lib/sesion-actual.ts`) caiga al fallback real
 * (`getUser()` + consulta a `vendedores`).
 */
export function decodificarSesionHeader(
  valor: string | null | undefined,
): SesionHeaderPayload | null {
  if (!valor) return null;
  try {
    const json = Buffer.from(valor, "base64url").toString("utf8");
    const data: unknown = JSON.parse(json);
    return esPayloadValido(data) ? data : null;
  } catch {
    return null;
  }
}

/**
 * Headers del request que sigue camino al render, sin el header de sesión
 * que haya mandado el cliente — anti-spoofing: nadie fuera del proxy puede
 * hacerse pasar por un vendedor ya resuelto. Se aplica SIEMPRE, exista o no
 * sesión, antes de decidir si el proxy pudo resolverla para esta request.
 */
export function descartarHeaderEntrante(headersEntrantes: Headers): Headers {
  const headers = new Headers(headersEntrantes);
  headers.delete(SESION_HEADER_NAME);
  return headers;
}

/**
 * Decide si `updateSession` (`lib/supabase/middleware.ts`) debe emitir el
 * header de sesión para este request, y con qué payload.
 *
 * `vendedorResuelto` en `false` (rutas exentas del cálculo de rol —
 * `/cambiar-password`, `/sin-acceso`, `/bienvenida` — o con
 * `mustChangePassword`) tiene que dar `null` SIEMPRE, sin mirar `vendedor`:
 * el proxy no llegó a consultar `vendedores` para este request, así que no
 * hay nada que informar. Emitir ahí un payload con `vendedor: null` sería
 * ambiguo con el otro caso en el que sí importa — `vendedorResuelto: true`
 * pero sin fila válida (`decidirRedireccion` ya manda a `/sin-acceso` antes
 * de llegar hasta acá en la práctica, así que este caso casi no ocurre, pero
 * la función lo distingue igual) — y `sesionActual()` (`lib/sesion-actual.ts`)
 * tomaría ese `null` como "se consultó y no tiene fila" en vez de caer al
 * fallback real, que es lo que hay que hacer cuando el proxy no consultó
 * nada.
 *
 * `null` de retorno = no emitir el header (la respuesta sigue con el header
 * entrante ya descartado, nada más).
 */
export function payloadSesionParaHeader(
  userId: string,
  vendedorResuelto: boolean,
  vendedor: VendedorConRol | null,
): SesionHeaderPayload | null {
  if (!vendedorResuelto) return null;
  return {
    userId,
    vendedor: vendedor
      ? {
          id: vendedor.id,
          nombre: vendedor.nombre,
          activo: vendedor.activo,
          rol: vendedor.rol,
          revende: vendedor.revende,
        }
      : null,
  };
}
