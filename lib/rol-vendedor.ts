import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Tables } from "@/lib/types";

export type VendedorConRol = Tables<"vendedores">;

/**
 * Único punto del proyecto que consulta `vendedores` por `user_id` de
 * Supabase Auth (`vendedores.user_id`, ver `0007_vendedores_auth.sql`) —
 * la resolución de rol vive acá para que nadie más repita la query.
 * Consumido por `lib/supabase/middleware.ts` (redirect por rol, solo
 * necesita `.rol`), `lib/revendedores.ts` (`obtenerMiRevendedor`, usado
 * por `app/(mi)/layout.tsx`) y `lib/vendedor-actual.ts` (hook cliente del
 * shell admin). `null` si el usuario no tiene fila (caso
 * VENDEDOR_NO_REGISTRADO) o si la consulta falla.
 */
export async function obtenerVendedorPorUserId(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<VendedorConRol | null> {
  const { data, error } = await supabase
    .from("vendedores")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("obtenerVendedorPorUserId", error);
    return null;
  }

  return data ?? null;
}

/**
 * `true` solo si hay fila en `vendedores`, está `activo` Y su rol ya fue
 * aprobado (no `pendiente`). Un vendedor con `activo = false` se trata
 * igual que "sin fila" en toda la app (fix de seguridad de una revisión): antes solo
 * bloqueaba en escritura (RLS/RPCs, `es_admin()`/`es_revendedor()` ya
 * exigían `activo`) pero no en lectura de rutas. Un vendedor `pendiente`
 * (alta automática sin aprobar todavía, ver `0026_roles_pendiente_espacio_revendedor.sql`)
 * se suma al mismo criterio: sin acceso hasta que un admin lo pase a
 * `admin` o `revendedor` desde `/revendedores`. `lib/supabase/middleware.ts`
 * y `app/(mi)/layout.tsx` lo usan para decidir el redirect a
 * `/sin-acceso`.
 */
export function tieneAccesoValido(
  vendedor: VendedorConRol | null,
): vendedor is VendedorConRol {
  return vendedor !== null && vendedor.activo && vendedor.rol !== "pendiente";
}

/**
 * `true` si el vendedor puede operar el shell de revendedor (`/mi`) con
 * sus propios datos: un revendedor propiamente dicho, o un admin con su
 * propio espacio de revendedor habilitado (`revende`, decisión de negocio
 * "un admin nunca pasa a revendedor, pero puede tener su espacio propio",
 * ver `0026_roles_pendiente_espacio_revendedor.sql` § `puede_revender()`
 * — mismo criterio, del lado del cliente). No reemplaza la RLS/RPCs
 * (`puede_revender()` server-side sigue siendo la capa real de
 * seguridad): esto es solo para decidir qué mostrar en la UI (p.ej.
 * `VerComoRevendedor`).
 */
export function puedeRevender(vendedor: VendedorConRol | null): boolean {
  if (!vendedor || !vendedor.activo) return false;
  return vendedor.rol === "revendedor" || (vendedor.rol === "admin" && vendedor.revende);
}

/**
 * `true` si el vendedor es un coordinador activo (0055_coordinador.sql):
 * reparte botellas a un grupo de revendedoras y les cobra por Ananja, pero
 * no es una revendedora (sin stock propio, no vende) ni necesariamente un
 * admin — un admin que coordina (ej. Tere) sigue siendo `rol = 'admin'`,
 * no pasa por acá.
 */
export function esCoordinador(vendedor: VendedorConRol | null): boolean {
  return vendedor !== null && vendedor.activo && vendedor.rol === "coordinador";
}

/**
 * `true` si el vendedor entra al shell `(mi)` con SU PROPIA pantalla: un
 * revendedor de verdad, un admin con espacio propio (`puedeRevender`), o
 * un coordinador (0055) — cada uno ve algo distinto ahí adentro
 * (`app/(mi)/mi/page.tsx` decide qué renderizar según el rol), pero los
 * tres comparten el mismo layout/shell.
 */
export function puedeUsarShellMi(vendedor: VendedorConRol | null): boolean {
  return puedeRevender(vendedor) || esCoordinador(vendedor);
}

/**
 * `true` si el usuario autenticado es un revendedor activo. Usado por las
 * rutas `/api/*` (salvo `/api/version`, fuera del matcher de `proxy.ts`)
 * para responder `403` en vez de ejecutar la ruta: push (`/api/push/*`) y
 * OCR (`/api/ocr-monto`) son funcionalidad exclusiva de admin — un
 * revendedor no manda comprobantes ni recibe notificaciones de gastos —
 * quedan fuera del alcance de este plan.
 *
 * OJO: esto es una lista NEGRA (bloquea solo `revendedor`), no una lista
 * blanca de admin — un `coordinador` (0055_coordinador.sql, un rol que no
 * existía cuando se escribió esta función) la pasa igual, aunque el
 * comentario de arriba diga "exclusivo de admin". Los tres handlers de
 * `/api/*` la reemplazaron por {@link esAdminAutenticado} (auditoría de
 * seguridad 2026-09-20, ver `app/api/ocr-monto/route.ts` y
 * `app/api/push/*`); queda acá solo por si algún consumidor futuro
 * necesitara de verdad "es revendedor" (hoy ninguno la usa).
 */
export async function esRevendedorAutenticado(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const vendedor = await obtenerVendedorPorUserId(supabase, userId);
  return tieneAccesoValido(vendedor) && vendedor.rol === "revendedor";
}

/**
 * `true` si el usuario autenticado es un admin activo (acceso válido) —
 * lista BLANCA para las rutas de `/api/*` exclusivas de admin (OCR, push):
 * antes bloqueaban con lista negra ({@link esRevendedorAutenticado}), que
 * no contemplaba el rol `coordinador` (0055_coordinador.sql) y lo dejaba
 * pasar igual que a un admin — ningún flujo de coordinador (shell `/mi` a
 * secas, sin las pantallas que llaman a estos endpoints, ver
 * `lib/navegacion-mi.ts`/`decidirRedireccion`) llama a estas rutas
 * legítimamente, así que la lista blanca no rompe nada (auditoría de
 * seguridad 2026-09-20).
 */
export async function esAdminAutenticado(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const vendedor = await obtenerVendedorPorUserId(supabase, userId);
  return tieneAccesoValido(vendedor) && vendedor.rol === "admin";
}
