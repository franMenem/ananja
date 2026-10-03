import { NextResponse } from "next/server";

/**
 * Versión del deployment vigente — usada por `components/update-banner.tsx`
 * para detectar cuándo hay una versión nueva desplegada (el caso típico: el
 * usuario reabre la PWA en el iPhone y quedó en un bundle viejo).
 *
 * Sin auth (no expone nada sensible) y sin caché: tiene que responder
 * siempre la versión del deployment que está sirviendo la request, nunca
 * una copia vieja cacheada por el navegador o un edge cache. `force-dynamic`
 * + `Cache-Control: no-store` cubren ambos casos.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  // OR (no `??`) a propósito: en deployments sin metadata de git (este
  // proyecto no está conectado a un repo remoto en Vercel) las variables
  // de sistema pueden llegar como string vacío en vez de `undefined` — con
  // `??` eso "gana" y deja la respuesta en `""` en vez de caer al
  // siguiente fallback.
  const version =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    "dev";

  return NextResponse.json(
    { version },
    { headers: { "Cache-Control": "no-store" } },
  );
}
