/**
 * Validación del `endpoint` de una suscripción de Web Push (SSRF, auditoría
 * de seguridad 2026-09-20).
 *
 * `app/api/push/subscribe/route.ts` guarda el `endpoint` que manda el
 * cliente sin validar, y más tarde `app/api/push/send/route.ts` hace un
 * POST server-side a esa URL exacta (`webpush.sendNotification`) — sin
 * esto, cualquier sesión admin podría guardar una URL interna (o
 * arbitraria) y usar el servidor como proxy para pegarle a esa URL.
 *
 * Lista blanca de hosts de servicios de push reales (los cuatro
 * navegadores que importan acá): `fcm.googleapis.com` (Chrome/Android,
 * SIN subdominios — así lo publica Google) y, con subdominios incluidos,
 * `push.services.mozilla.com` (Firefox, incluye
 * `updates.push.services.mozilla.com`), `notify.windows.com` (Edge) y
 * `push.apple.com` (Safari, incluye `web.push.apple.com`).
 */

const DOMINIO_EXACTO = ["fcm.googleapis.com"];

const DOMINIOS_CON_SUBDOMINIOS = [
  "push.services.mozilla.com",
  "notify.windows.com",
  "push.apple.com",
];

function esOSubdominioDe(hostname: string, dominio: string): boolean {
  return hostname === dominio || hostname.endsWith(`.${dominio}`);
}

/**
 * `true` si `url` es un endpoint de push legítimo: `https:` sin
 * credenciales embebidas (`user:pass@`), sin puerto explícito (ningún
 * servicio real necesita uno) y con el hostname en la lista blanca de
 * arriba con match de SUFIJO correcto — `evilpush.apple.com.atacante.com`
 * o `xfcm.googleapis.com` no matchean (el sufijo se compara con `===` o
 * `.dominio` al final, nunca con un `includes`/`startsWith` que un
 * atacante pueda rodear agregando texto antes o después).
 */
export function esEndpointPushPermitido(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;
  if (parsed.port !== "") return false;

  const hostname = parsed.hostname.toLowerCase();

  if (DOMINIO_EXACTO.includes(hostname)) return true;
  return DOMINIOS_CON_SUBDOMINIOS.some((dominio) => esOSubdominioDe(hostname, dominio));
}
