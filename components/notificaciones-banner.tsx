"use client";

import { BOTON_PRIMARIO } from "@/components/ui/boton";
import { useEffect, useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { InstruccionesInstalarIOS } from "@/components/instrucciones-instalar-ios";
import { esStandalone } from "@/lib/instalar-app";
import { urlBase64ToUint8Array } from "@/lib/vapid";

type EstadoBanner =
  | "cargando"
  | "no_soportado"
  | "no_instalada"
  | "activar"
  | "activando"
  | "activado"
  | "denegado"
  | "error";

/**
 * Banner contextual de /notificaciones (US5 — contracts/screens.md § 7):
 * si la PWA está instalada (modo standalone) y todavía no hay permiso de
 * push, ofrece el CTA "Activar avisos"; si no está instalada, muestra
 * instrucciones breves para agregarla a la pantalla de inicio.
 *
 * `compact`: variante de escritorio (design/handoff README § 8) — un botón de contorno
 * suelto en la fila del título, en vez del bloque con caja de celular.
 * Solo cubre el caso "activar/activando" (en escritorio ya está instalada
 * la PWA en la inmensa mayoría de los casos); el resto de los estados
 * (no instalada, denegado, error) se resuelven con la variante completa.
 */
export function NotificacionesBanner({ compact = false }: { compact?: boolean }) {
  const [estado, setEstado] = useState<EstadoBanner>("cargando");

  useEffect(() => {
    // Detección de capacidades del navegador (Notification/SW/PushManager,
    // modo standalone, permiso ya otorgado): solo existe en el cliente, así
    // que se resuelve acá después del montaje para evitar un mismatch de
    // hidratación contra el render inicial de servidor.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      setEstado("no_soportado");
      return;
    }

    if (!esStandalone()) {
      setEstado("no_instalada");
      return;
    }

    if (Notification.permission === "granted") {
      setEstado("activado");
      return;
    }
    if (Notification.permission === "denied") {
      setEstado("denegado");
      return;
    }
    setEstado("activar");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  async function handleActivar() {
    setEstado("activando");

    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado(permiso === "denied" ? "denegado" : "activar");
        return;
      }

      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        setEstado("error");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          vapidPublicKey,
        ) as BufferSource,
      });

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (!response.ok) {
        setEstado("error");
        return;
      }

      setEstado("activado");
    } catch {
      setEstado("error");
    }
  }

  if (estado === "cargando" || estado === "no_soportado" || estado === "activado") {
    return null;
  }

  if (compact) {
    if (estado !== "activar" && estado !== "activando") return null;
    return (
      <BotonAccion
        onClick={handleActivar}
        cargando={estado === "activando"}
        textoCargando="Activando…"
        className="flex min-h-11 shrink-0 items-center border border-primary px-[18px] text-[14px] font-medium text-primary transition-colors hover:bg-primary/[.06] disabled:opacity-45 rounded-xl"
      >
        Activar avisos
      </BotonAccion>
    );
  }

  if (estado === "no_instalada") {
    return (
      <div className="flex flex-col gap-1.5 border border-border bg-surface-raised px-4 py-3.5 rounded-xl">
        <span className="text-[13px] font-medium text-accent">
          Instalá la app
        </span>
        <InstruccionesInstalarIOS proposito="recibir los avisos en el celular" />
      </div>
    );
  }

  if (estado === "denegado") {
    return (
      <div className="border border-border bg-surface-raised px-4 py-3.5 text-[16px] leading-[1.55] text-text-muted rounded-xl">
        Los avisos están bloqueados para la app. Para activarlos, habilitá las
        notificaciones desde los ajustes del sistema.
      </div>
    );
  }

  if (estado === "error") {
    return (
      <div className="flex items-center justify-between gap-3 border border-border bg-surface-raised px-4 py-3.5 rounded-xl">
        <p role="alert" className="text-[16px] text-accent">
          No se pudo activar los avisos. Probá de nuevo.
        </p>
        <button
          type="button"
          onClick={handleActivar}
          className="flex min-h-11 shrink-0 items-center border border-border px-3 text-[14px] font-medium text-text"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 border border-border bg-surface-raised px-4 py-3.5 rounded-xl">
      <p className="text-[16px] leading-[1.55] text-text-muted">
        Activá los avisos para no perderte novedades.
      </p>
      <BotonAccion
        onClick={handleActivar}
        cargando={estado === "activando"}
        textoCargando="Activando…"
        className={`${BOTON_PRIMARIO} flex shrink-0 px-4`}
      >
        Activar avisos
      </BotonAccion>
    </div>
  );
}
