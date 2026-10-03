import "server-only";

import { cache } from "react";
import { headers } from "next/headers";

import { obtenerVendedorPorUserId, type VendedorConRol } from "@/lib/rol-vendedor";
import { decodificarSesionHeader, SESION_HEADER_NAME } from "@/lib/sesion-header";
import { createClient } from "@/lib/supabase/server";

export interface SesionActual {
  userId: string | null;
  vendedor: VendedorConRol | null;
}

/**
 * `{ userId, vendedor }` de quien mira, para Server Components/páginas —
 * dedupeado por request con `cache()` de React (mismo patrón que documentan
 * las guías de Next para `getUser()`): llamarlo desde varios
 * layouts/páginas de la misma navegación lo resuelve una sola vez.
 *
 * Primero intenta el header interno que ya dejó el proxy
 * (`lib/supabase/middleware.ts`, formato en `lib/sesion-header.ts`) con el
 * usuario y el vendedor YA resueltos para este mismo request — evita
 * repetir `getUser()` + la consulta a `vendedores` que el proxy ya pagó. Si
 * el header no está (el proxy no corrió para esta ruta — p. ej.
 * `/cambiar-password` y `/bienvenida`, exentas del cálculo de rol, ver
 * `ROLE_REDIRECT_EXEMPT_PATHS`) o no parsea, cae al camino de siempre:
 * `getUser()` real + `obtenerVendedorPorUserId` — nada se rompe si el
 * proxy no corrió.
 *
 * El `vendedor` que sale del header trae solo los campos de
 * `VendedorHeaderPayload` (`lib/sesion-header.ts`) — `email`, `creado_en` y
 * `encargado_id` quedan en `null` porque ningún consumidor migrado a este
 * helper los lee hoy; si alguno los necesitara, hay que sumarlos al
 * payload del header primero (y no asumir que ya viajan).
 *
 * SOLO para UI/ruteo — nunca para autorizar una escritura o un uso de
 * service role: esas verificaciones siguen llamando a
 * `getUser()`/`obtenerVendedorPorUserId` directamente (ver
 * `lib/invitaciones-server.ts` § `exigirAdmin`).
 */
export const sesionActual = cache(async (): Promise<SesionActual> => {
  const headerValue = (await headers()).get(SESION_HEADER_NAME);
  const payload = decodificarSesionHeader(headerValue);
  if (payload) {
    return {
      userId: payload.userId,
      vendedor: payload.vendedor
        ? {
            ...payload.vendedor,
            user_id: payload.userId,
            email: null,
            creado_en: null,
            encargado_id: null,
          }
        : null,
    };
  }

  // Fallback: el proxy no pudo resolver sesión para esta request (o el
  // header no parseó) — misma consulta que antes de este helper.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { userId: null, vendedor: null };

  const vendedor = await obtenerVendedorPorUserId(supabase, user.id);
  return { userId: user.id, vendedor };
});
