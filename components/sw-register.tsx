"use client";

import { useEffect } from "react";

import { escucharEventoInstalarApp } from "@/lib/instalar-app-evento";

/**
 * Registra el service worker (`public/sw.js`) para Web Push (US5) y engancha
 * el listener global de `beforeinstallprompt` (`lib/instalar-app-evento.ts`)
 * lo antes posible — este componente se monta al tope de ambos shells
 * autenticados (`app/(app)/layout.tsx`, `components/mi/mi-shell.tsx`), antes
 * que cualquier otro contenido. No renderiza nada; falla en silencio si el
 * navegador no soporta service workers.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    escucharEventoInstalarApp();

    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registro del SW falló (ej. entorno de desarrollo sin HTTPS/localhost
      // soportado) — no bloquea el resto de la app.
    });
  }, []);

  return null;
}
