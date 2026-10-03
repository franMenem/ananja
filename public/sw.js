/**
 * Service worker de Web Push (US5). Solo maneja push y clicks en la
 * notificación del sistema; no cachea nada (sin soporte offline por ahora).
 *
 * No puede leer `NEGOCIO` (no hay build step para este archivo estático):
 * el título y el ícono siempre vienen armados en el payload desde
 * app/api/push/send/route.ts (`icon`/`badge`, con el prefijo de
 * `NEGOCIO.iconos`); los fallbacks de acá son genéricos a propósito
 * (apuntan a los íconos de Ananja) para cuando el payload no los manda.
 *
 * `data.url` nunca viaja en el payload hoy (`app/api/push/send/route.ts`
 * no lo manda), así que el click cae siempre al fallback de acá —
 * `/tareas` desde 2026-09-16 (el bloque "Avisos" al pie de Tareas
 * reemplaza a `/notificaciones`, pantalla retirada; hay un redirect
 * permanente en `next.config.ts` para cualquier suscripción vieja que
 * todavía tuviera `/notificaciones` guardado, pero no hace falta
 * depender de él para el caso nuevo).
 */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const titulo = data.titulo || "Notificación";
  const opciones = {
    body: data.detalle || "",
    icon: data.icon || "/icons/icon-192.png",
    badge: data.badge || "/icons/icon-192.png",
    data: { url: data.url || "/tareas" },
  };

  event.waitUntil(self.registration.showNotification(titulo, opciones));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = (event.notification.data && event.notification.data.url) || "/tareas";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            if ("navigate" in client) client.navigate(url);
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      }),
  );
});
