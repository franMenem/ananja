"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { InstruccionesInstalarIOS } from "@/components/instrucciones-instalar-ios";
import {
  decidirVarianteInstalarApp,
  esDispositivoTactil,
  esIOS,
  esPointerCoarse,
  esStandalone,
  guardarInstalarAppDescartado,
  leerInstalarAppDescartadoHasta,
  type VarianteInstalarApp,
} from "@/lib/instalar-app";
import {
  leerEventoInstalarApp,
  limpiarEventoInstalarApp,
  suscribirseEventoInstalarApp,
} from "@/lib/instalar-app-evento";
import { NEGOCIO } from "@/lib/negocio";

/** `getServerSnapshot` de `useSyncExternalStore` — no hay evento capturado
 * en el servidor. */
function leerEventoInstalarAppServer() {
  return null;
}

/**
 * Aviso "Instalá la app" — vive cerca de `UpdateBanner` en ambos shells
 * autenticados (`app/(app)/layout.tsx`, `components/mi/mi-shell.tsx`).
 *
 * Qué variante mostrar es una decisión pura (`lib/instalar-app.ts` §
 * `decidirVarianteInstalarApp`): Android/Chrome/Edge con el evento
 * `beforeinstallprompt` ya capturado (`lib/instalar-app-evento.ts`) ofrece
 * un botón que dispara `prompt()`; iOS Safari (que nunca dispara ese
 * evento) ofrece un botón que despliega las instrucciones de "Compartir →
 * Agregar a inicio" (compartidas con `NotificacionesBanner`); cualquier
 * otro caso (ya instalada, descartada hace menos de 30 días, u otro
 * navegador de escritorio sin el evento) no muestra nada.
 *
 * El texto ("en tu celular" / "en tu compu") es una decisión aparte
 * (`esDispositivoTactil`): Chrome/Edge de escritorio también disparan
 * `beforeinstallprompt` (los admins de Ananja usan la app ahí), así que la
 * variante "android" sola no alcanza para saber qué texto mostrar.
 *
 * No se muestra en `/tareas`: ahí `NotificacionesBanner` ya ofrece las
 * mismas instrucciones dentro de su propio flujo (bloque "Avisos" al pie,
 * 2026-09-16) — mostrar las dos sería duplicar el mismo aviso en la misma
 * pantalla.
 *
 * Se monta con estado inicial "oculto" y decide recién en un efecto (igual
 * que `NotificacionesBanner`) para no depender de `window`/`localStorage`
 * durante el render de servidor y evitar un mismatch de hidratación.
 */
export function InstalarAppBanner() {
  const pathname = usePathname();
  const eventoGuardado = useSyncExternalStore(
    suscribirseEventoInstalarApp,
    leerEventoInstalarApp,
    leerEventoInstalarAppServer,
  );

  const [variante, setVariante] = useState<VarianteInstalarApp | null>(null);
  const [esTactil, setEsTactil] = useState(true);
  const [mostrarInstruccionesIOS, setMostrarInstruccionesIOS] = useState(false);
  const [instalando, setInstalando] = useState(false);

  useEffect(() => {
    const iOS = esIOS();
    /* eslint-disable react-hooks/set-state-in-effect */
    setVariante(
      decidirVarianteInstalarApp({
        standalone: esStandalone(),
        hayEventoGuardado: eventoGuardado !== null,
        esIOS: iOS,
        descartadoHasta: leerInstalarAppDescartadoHasta(),
        ahora: Date.now(),
      }),
    );
    setEsTactil(esDispositivoTactil({ pointerCoarse: esPointerCoarse(), esIOS: iOS }));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [eventoGuardado]);

  if (variante === null || pathname === "/tareas") return null;

  function descartar() {
    guardarInstalarAppDescartado();
    setVariante(null);
  }

  async function handleInstalar() {
    if (!eventoGuardado) return;
    setInstalando(true);
    try {
      await eventoGuardado.prompt();
      await eventoGuardado.userChoice;
    } finally {
      // El evento solo se puede usar una vez (haya aceptado o no) — se
      // limpia siempre, lo que dispara el efecto de arriba y termina
      // ocultando el banner (ya no hay evento guardado ni es iOS).
      limpiarEventoInstalarApp();
      setInstalando(false);
    }
  }

  return (
    <div className="order-none flex flex-col gap-2.5 border-y border-border bg-surface-raised px-5 py-3.5 lg:order-first">
      <p className="text-[13px] leading-[1.55] text-text-muted">
        Instalá {NEGOCIO.nombre} en tu {esTactil ? "celular" : "compu"}.
      </p>

      {variante === "ios" && mostrarInstruccionesIOS && (
        <InstruccionesInstalarIOS proposito="instalarla" />
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {variante === "android" && (
          <BotonAccion
            onClick={handleInstalar}
            cargando={instalando}
            textoCargando="Instalando…"
            className="flex min-h-11 shrink-0 items-center bg-primary px-4 text-xs font-medium tracking-[0.12em] text-background uppercase transition-colors hover:bg-primary-hover disabled:opacity-45"
          >
            Instalar
          </BotonAccion>
        )}

        {variante === "ios" && !mostrarInstruccionesIOS && (
          <button
            type="button"
            onClick={() => setMostrarInstruccionesIOS(true)}
            className="flex min-h-11 shrink-0 items-center border border-primary px-[18px] text-xs font-medium tracking-[0.12em] text-primary uppercase transition-colors hover:bg-primary/[.06]"
          >
            Cómo instalar
          </button>
        )}

        <button
          type="button"
          onClick={descartar}
          className="text-xs font-medium tracking-[0.12em] text-text-muted uppercase underline-offset-2 hover:text-text hover:underline"
        >
          Ahora no
        </button>
      </div>
    </div>
  );
}
