import type { ReactNode } from "react";

type BottomSheetProps = {
  open: boolean;
  ariaLabel: string;
  /**
   * Color del filete superior de la hoja: `mark` para acciones normales,
   * `accent` para destructivas (design/handoff README § Modales).
   */
  variant?: "mark" | "accent";
  children: ReactNode;
};

/**
 * Hoja inferior — el patrón de modal del rediseño (design/handoff README § Modales):
 * velo `--color-scrim`, hoja de ancho completo con grano de papel y un
 * filete superior de 2px (mark o accent, según la acción). En escritorio
 * (`sm:`) se centra, manteniendo esquinas rectas y el filete.
 *
 * Sin `max-width:sm` en mobile, sin `rounded-*`, sin `shadow-*` — ver
 * design/handoff README § Radios, bordes y sombras.
 */
export function BottomSheet({
  open,
  ariaLabel,
  variant = "mark",
  children,
}: BottomSheetProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className="fixed inset-0 z-50 flex items-end justify-center bg-scrim sm:items-center"
    >
      <div
        className={`paper-texture max-h-[85dvh] w-full overflow-y-auto overscroll-contain border-t-2 px-5 py-[22px] sm:max-w-sm ${
          variant === "accent" ? "border-accent" : "border-mark"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
