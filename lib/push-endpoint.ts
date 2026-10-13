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

// `parse` de `node:url` es el mismo parser (legacy, deprecado) que usa
// `web-push` para armar la request; se importa acá a propósito para validar
// con el parser que realmente envía, no para usarlo como API nueva.
import { parse as parseUrlLegacy } from "node:url";

const DOMINIO_EXACTO = ["fcm.googleapis.com"];

const DOMINIOS_CON_SUBDOMINIOS = [
  "push.services.mozilla.com",
  "notify.windows.com",
  "push.apple.com",
];

// Solo ASCII imprimible (0x21-0x7e) y sin `\`: sin espacios, tab, saltos de
// línea ni controles (el parser WHATWG los descarta en silencio; el legacy
// no necesariamente) y sin la barra invertida (WHATWG la lee como `/`).
const CARACTERES_PERMITIDOS = /^[\x21-\x5b\x5d-\x7e]+$/;

const HOSTNAME_DNS = /^[a-z0-9.-]+$/;

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
 *
 * Diferencial de parsers (auditoría de seguridad 2026-10-11): el chequeo de
 * arriba usa el parser WHATWG (`new URL`), pero `web-push` abre la conexión
 * con el hostname del parser legacy `url.parse` sobre el string crudo — y
 * los dos discrepan con caracteres como `;` `'` `"` `{` `}` `\` o tab/salto
 * de línea en la autoridad (`https://atacante.com;.push.apple.com/x` es
 * `atacante.com;.push.apple.com` para uno y `atacante.com` para el otro). Por
 * eso, sobre el MISMO string que se guarda y se envía, además se exige:
 * solo ASCII imprimible sin `\` (los endpoints reales vienen
 * percent-encoded), un hostname con charset DNS estricto y que `url.parse`
 * devuelva el mismo protocolo, hostname y puerto que `new URL`.
 */
export function esEndpointPushPermitido(url: string): boolean {
  if (!CARACTERES_PERMITIDOS.test(url)) return false;

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
  if (!HOSTNAME_DNS.test(hostname)) return false;

  // Mismo parser que usa `web-push` (`url.parse`, legacy): si no coincide con
  // el WHATWG en protocolo, hostname y puerto, el host al que se conectaría
  // no es el que se validó acá. `url.parse` puede tirar con entradas raras.
  let legacy: ReturnType<typeof parseUrlLegacy>;
  try {
    legacy = parseUrlLegacy(url);
  } catch {
    return false;
  }
  if (legacy.protocol !== parsed.protocol) return false;
  if ((legacy.hostname ?? "").toLowerCase() !== hostname) return false;
  // `new URL` descarta el puerto por defecto (`:443` -> ""), `url.parse` no:
  // con protocolo https ya verificado, "443" y vacío son el mismo destino.
  if ((legacy.port ?? "") !== parsed.port && legacy.port !== "443") return false;

  if (DOMINIO_EXACTO.includes(hostname)) return true;
  return DOMINIOS_CON_SUBDOMINIOS.some((dominio) => esOSubdominioDe(hostname, dominio));
}
