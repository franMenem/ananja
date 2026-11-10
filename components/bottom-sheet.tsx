"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { bloqueoScroll } from "@/lib/bloqueo-scroll";

type BottomSheetProps = {
  open: boolean;
  ariaLabel: string;
  /**
   * Color del filete superior de la hoja: `mark` para acciones normales,
   * `accent` para destructivas (design/handoff README § Modales).
   */
  variant?: "mark" | "accent";
  /** Tope de ancho en escritorio (clase de Tailwind); por defecto `sm:max-w-sm`. */
  anchoMaximo?: string;
  /**
   * Qué hacer cuando se pide cerrar con Escape. Es el mismo cierre que ya
   * usa el botón "Cancelar" de la hoja: con `useConfirmacion` es
   * `confirmacion.cancelar`, que además ignora el pedido mientras envía.
   * Sin `onClose`, Escape no hace nada.
   */
  onClose?: () => void;
  /**
   * La acción de la hoja está en curso: Escape no la cierra. Solo hace falta
   * cuando `onClose` no se protege solo (un `setOpen(false)` directo).
   */
  bloqueada?: boolean;
  children: ReactNode;
};

const FOCUSABLES =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Hojas abiertas, en orden de apertura: solo la última atiende teclado. */
const pila: symbol[] = [];

/**
 * Hoja inferior — el patrón de modal del rediseño (design/handoff README § Modales):
 * velo `--color-scrim`, hoja de ancho completo con grano de papel y un
 * filete superior de 2px (mark o accent, según la acción). En escritorio
 * (`sm:`) se centra, manteniendo esquinas rectas y el filete.
 *
 * Sin `max-width:sm` en mobile, sin `rounded-*`, sin `shadow-*` — ver
 * design/handoff README § Radios, bordes y sombras.
 *
 * Mientras está abierta: el foco entra a la hoja y Tab queda adentro; Escape
 * pide cerrar (salvo `bloqueada`); al cerrar el foco vuelve a quien la abrió.
 *
 * Scroll del fondo: bloqueado con `overflow: hidden` en `<html>` y `<body>`
 * mientras haya alguna hoja abierta (`lib/bloqueo-scroll.ts`, con contador y
 * compensación del ancho de la barra de scroll), y `overscroll-contain` en el
 * panel para que su propio scroll no se encadene al fondo. No se usa
 * `position: fixed` en el body ni `touchmove`: tienen más efectos secundarios.
 * Probado con Chromium emulando iPhone y escritorio, NO en un iPhone real:
 * falta confirmarlo en Safari y en la PWA instalada.
 */
export function BottomSheet(props: BottomSheetProps) {
  if (!props.open) return null;
  return <HojaAbierta {...props} />;
}

function HojaAbierta({
  ariaLabel,
  variant = "mark",
  anchoMaximo = "sm:max-w-sm",
  onClose,
  bloqueada = false,
  children,
}: BottomSheetProps) {
  const panel = useRef<HTMLDivElement>(null);
  // Se lee en el render, antes de que el contenido (autoFocus) mueva el foco.
  const [disparador] = useState<Element | null>(() =>
    typeof document === "undefined" ? null : document.activeElement,
  );

  // Siempre la última versión, sin reenganchar el listener en cada render.
  const ultimo = useRef({ onClose, bloqueada });
  useEffect(() => {
    ultimo.current = { onClose, bloqueada };
  });

  useEffect(() => {
    const id = Symbol("hoja");
    pila.push(id);
    const soltarScroll = bloqueoScroll.bloquear();

    // Si el contenido no tomó el foco (autoFocus), entra al panel mismo, no a
    // un botón: así un Enter de más no activa una acción (p. ej. "Eliminar").
    // Un campo de texto tampoco se enfoca solo: abriría el teclado del
    // celular. Tab desde el panel entra al primer enfocable.
    const el = panel.current;
    if (el && !el.contains(document.activeElement)) {
      el.focus({ preventScroll: true });
    }

    function onKey(e: KeyboardEvent) {
      if (pila[pila.length - 1] !== id) return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (!ultimo.current.bloqueada) ultimo.current.onClose?.();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const nodos = panel.current.querySelectorAll<HTMLElement>(FOCUSABLES);
      if (nodos.length === 0) {
        e.preventDefault();
        return;
      }
      const primero = nodos[0];
      const final = nodos[nodos.length - 1];
      const activo = document.activeElement;
      // El panel mismo (foco inicial) cuenta como "afuera" de la lista: Tab
      // entra al primero y Shift+Tab al último.
      const adentro = activo !== panel.current && panel.current.contains(activo);
      if (e.shiftKey && (!adentro || activo === primero)) {
        e.preventDefault();
        final.focus();
      } else if (!e.shiftKey && (!adentro || activo === final)) {
        e.preventDefault();
        primero.focus();
      }
    }
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      const i = pila.indexOf(id);
      if (i >= 0) pila.splice(i, 1);
      soltarScroll();
      if (disparador instanceof HTMLElement && disparador.isConnected) {
        disparador.focus({ preventScroll: true });
      }
    };
  }, [disparador]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className="fixed inset-0 z-50 flex items-end justify-center bg-scrim sm:items-center"
    >
      <div
        ref={panel}
        tabIndex={-1}
        className={`outline-none rounded-t-2xl bg-surface sm:rounded-2xl max-h-[85dvh] w-full overflow-y-auto overscroll-contain border-t-2 px-5 py-[22px] ${anchoMaximo} ${
          variant === "accent" ? "border-accent" : "border-mark"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
