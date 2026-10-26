/**
 * Disparo de Web Push desde el cliente (US5). Se invoca después de un
 * alta exitosa (gasto o comprobante con alertas de stock) — ver
 * contracts/database.md § crear_gasto / crear_comprobante.
 *
 * Hardening (security-audit-2026-09-02.md hallazgo #3): el cliente nunca
 * manda título/detalle en texto libre — solo el tipo y el id del registro
 * real (`gasto_id` o `producto_id`) que originó la alerta. El servidor
 * arma el mensaje consultando la base con service role.
 *
 * Regla de oro: NUNCA rompe el flujo principal. Cualquier error de red o
 * de servidor se ignora en silencio; el registro ya se guardó igual.
 */
export type TipoNotificacionPush = "stock_bajo" | "gasto_nuevo";

export async function notificarPush(
  tipo: TipoNotificacionPush,
  referenciaId: string,
): Promise<void> {
  try {
    await fetch("/api/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, referencia_id: referenciaId }),
    });
  } catch {
    // Falla de red u otro error: se ignora, el push es best-effort.
  }
}

const CLAVE_REENLACE = "ananja:push-reenlace";
/** Un reenlace exitoso de la misma suscripción vale por un día. */
const MS_ENTRE_REENLACES = 24 * 60 * 60 * 1000;

function leerMarcaReenlace(): { endpoint: string; en: number } | null {
  try {
    const crudo = window.localStorage.getItem(CLAVE_REENLACE);
    if (!crudo) return null;
    const marca = JSON.parse(crudo) as { endpoint?: unknown; en?: unknown };
    return typeof marca.endpoint === "string" && typeof marca.en === "number"
      ? { endpoint: marca.endpoint, en: marca.en }
      : null;
  } catch {
    return null;
  }
}

/** Al cerrar sesión: el próximo que entre en este dispositivo vuelve a atar
 * la suscripción a su persona sin esperar al día siguiente. */
export function olvidarReenlacePush(): void {
  try {
    window.localStorage.removeItem(CLAVE_REENLACE);
  } catch {
    // Sin localStorage: no hay marca que olvidar.
  }
}

/**
 * Reenlace silencioso (hallazgo F7, migración 0076): las suscripciones que
 * ya existían quedaron sin dueño y no reciben avisos hasta que el navegador
 * vuelva a mandarlas a `/api/push/subscribe`, que ahora las ata a quien
 * tiene la sesión abierta. Se llama una vez al abrir el shell de admin.
 *
 * Solo si el navegador soporta push, el permiso ya está concedido y hay una
 * suscripción existente: nunca pide permiso ni crea una suscripción nueva.
 * Se traga cualquier error: no tiene que molestar ni cambiar lo que se ve.
 */
export async function reenlazarSuscripcionPush(): Promise<void> {
  try {
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      Notification.permission !== "granted"
    ) {
      return;
    }

    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;

    // Una vez por día por suscripción (antes: en cada carga completa).
    const marca = leerMarcaReenlace();
    if (marca && marca.endpoint === subscription.endpoint && Date.now() - marca.en < MS_ENTRE_REENLACES) {
      return;
    }

    const respuesta = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...subscription.toJSON(), reenlazar: true }),
    });
    if (respuesta.ok) {
      try {
        window.localStorage.setItem(
          CLAVE_REENLACE,
          JSON.stringify({ endpoint: subscription.endpoint, en: Date.now() }),
        );
      } catch {
        // Sin localStorage: se reenlaza en cada carga, como antes.
      }
    }
  } catch {
    // Best-effort: sin red o sin soporte, no pasa nada.
  }
}
