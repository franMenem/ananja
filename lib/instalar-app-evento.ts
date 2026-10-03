/**
 * Store externo (mismo patrón que `lib/sidebar-colapsado.ts`) para el
 * evento `beforeinstallprompt` de Chrome/Edge/Android: el navegador lo
 * dispara una única vez apenas la página cumple los criterios de
 * instalación, y si no se captura ahí con `preventDefault()` se pierde
 * para siempre (no se puede volver a pedir). `escucharEventoInstalarApp`
 * engancha ese listener lo antes posible (`components/sw-register.tsx`,
 * montado al tope de ambos shells autenticados); `InstalarAppBanner` lo lee
 * más tarde vía `useSyncExternalStore` para mostrar su botón "Instalar" y
 * llamar a `prompt()` cuando el usuario lo toca.
 */

/** Subconjunto de `BeforeInstallPromptEvent` que se usa acá — el tipo
 * completo todavía no está en `lib.dom.d.ts`. */
export interface EventoInstalarApp extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type Listener = () => void;

const listeners = new Set<Listener>();
let evento: EventoInstalarApp | null = null;
let escuchando = false;

function notificar(): void {
  listeners.forEach((listener) => listener());
}

/**
 * Engancha los listeners globales. Seguro de llamar más de una vez (ej. si
 * `ServiceWorkerRegister` se remonta en dev) — solo el primer llamado se
 * suscribe de verdad.
 */
export function escucharEventoInstalarApp(): void {
  if (escuchando || typeof window === "undefined") return;
  escuchando = true;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    evento = e as EventoInstalarApp;
    notificar();
  });

  // El navegador ya instaló la app (por este banner o por el menú nativo):
  // el evento guardado ya no sirve — `prompt()` en un evento consumido/viejo
  // tira error — así que se limpia para que el banner se oculte.
  window.addEventListener("appinstalled", () => {
    evento = null;
    notificar();
  });
}

/** `getSnapshot` de `useSyncExternalStore`. */
export function leerEventoInstalarApp(): EventoInstalarApp | null {
  return evento;
}

/** `subscribe` de `useSyncExternalStore`. */
export function suscribirseEventoInstalarApp(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Consume el evento guardado — el navegador solo permite llamar a
 * `prompt()` una vez por evento — y notifica para que el banner se oculte. */
export function limpiarEventoInstalarApp(): void {
  evento = null;
  notificar();
}
