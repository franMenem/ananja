"use client";

import { useEffect, useRef, useState } from "react";

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

async function fetchVersion(): Promise<string | null> {
  try {
    const res = await fetch("/api/version", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as {
      version?: string;
    } | null;
    return data?.version ?? null;
  } catch {
    return null;
  }
}

/**
 * Banner fijo que avisa cuando el deployment vigente (`/api/version`)
 * cambió respecto al que tiene cargado esta pestaña — el caso típico es el
 * iPhone reabriendo la PWA con un bundle viejo en memoria. No hay forma de
 * saberlo sin comparar contra el servidor: por eso el chequeo periódico +
 * el chequeo en cada `visibilitychange` a "visible".
 *
 * En dev (`/api/version` responde `"dev"`, ver la propia ruta) el banner no
 * se muestra nunca: no tiene sentido pedirle al desarrollador que recargue
 * por un "cambio de versión" que no existe como tal en local.
 */
export function UpdateBanner() {
  const initialVersionRef = useRef<string | null>(null);
  const [newVersionAvailable, setNewVersionAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const version = await fetchVersion();
      if (cancelled || !version) return;

      if (initialVersionRef.current === null) {
        initialVersionRef.current = version;
        return;
      }

      if (
        initialVersionRef.current !== "dev" &&
        version !== initialVersionRef.current
      ) {
        setNewVersionAvailable(true);
        // Si el usuario ya había descartado un aviso anterior, este es un
        // cambio de versión distinto: vuelve a mostrarse.
        setDismissed(false);
      }
    }

    void check();

    const interval = setInterval(() => void check(), CHECK_INTERVAL_MS);

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void check();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  if (!newVersionAvailable || dismissed) return null;

  return (
    <div
      role="status"
      className="order-none flex items-center justify-between gap-3 border-t-2 border-mark bg-primary px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-background lg:order-first lg:border-t-0 lg:border-b-2 lg:pb-3"
    >
      <span className="text-[12px] font-medium tracking-[0.08em] uppercase">
        Hay una versión nueva
      </span>
      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="relative min-h-9 border border-background px-3 text-[11px] font-medium tracking-[0.12em] text-background uppercase before:absolute before:inset-x-0 before:inset-y-[-7px] before:content-['']"
        >
          Actualizar
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Descartar aviso de actualización"
          className="relative flex min-h-9 min-w-9 items-center justify-center text-[16px] leading-none text-background before:absolute before:inset-[-7px] before:content-['']"
        >
          ×
        </button>
      </div>
    </div>
  );
}
