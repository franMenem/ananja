import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

/**
 * Proxy de la app (sucesor de `middleware.ts` en Next.js 16, mismo runtime
 * Node.js). Refresca la sesión de Supabase y protege las rutas de la app.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Excluye assets estáticos, el manifest de la PWA, los íconos, el
    // service worker (debe poder registrarse/actualizarse sin sesión),
    // /api/version (sin auth a propósito: components/update-banner.tsx la
    // consulta sin sesión — o con una vencida — para detectar deployments
    // nuevos, y no puede recibir un redirect a /login en vez de JSON) y
    // /api/cron (Vercel Cron y el GitHub Action de keepalive le pegan sin
    // cookie de sesión — con auth propia por CRON_SECRET, ver
    // docs/ops/supabase-keepalive.md — y necesitan un 401 real del
    // handler, no un redirect a /login).
    "/((?!_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|sw\\.js|icons/|api/version|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
