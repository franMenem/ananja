import type { ReactNode } from "react";

import { BottomSheet } from "@/components/bottom-sheet";
import { BOTON_ACCION_TAREA } from "@/components/ui/boton";

const TRIGGER_CLASSNAME_DEFAULT = BOTON_ACCION_TAREA;

type AccionRapidaProps = {
  /** Texto del botón que dispara la hoja. */
  triggerLabel: ReactNode;
  /** Solo si el trigger necesita otro estilo que el botón secundario de
   * siempre (`BOTON_ACCION_TAREA`). */
  triggerClassName?: string;
  triggerAriaLabel?: string;
  /** `aria-label` de la hoja (`BottomSheet`). */
  ariaLabel: string;
  abierto: boolean;
  onAbrir: () => void;
  children: ReactNode;
};

/**
 * Envoltorio visual de una acción rápida de Tareas: botón que abre una
 * `BottomSheet` con el contenido que le pase cada caso
 * (`ConfirmarPagoRapido`, `ConfirmarDepositoRapido`, `DepositarRapido`) —
 * el "qué hay adentro" (resumen, campos, botones de confirmar/cancelar,
 * error) sigue siendo de cada componente, este solo abre y cierra.
 * `ResolverPago` no lo usa: vive en su propia página, sin hoja.
 */
export function AccionRapida({
  triggerLabel,
  triggerClassName,
  triggerAriaLabel,
  ariaLabel,
  abierto,
  onAbrir,
  children,
}: AccionRapidaProps) {
  return (
    <>
      <button
        type="button"
        onClick={onAbrir}
        aria-label={triggerAriaLabel}
        className={triggerClassName ?? TRIGGER_CLASSNAME_DEFAULT}
      >
        {triggerLabel}
      </button>

      <BottomSheet open={abierto} ariaLabel={ariaLabel}>
        {children}
      </BottomSheet>
    </>
  );
}
