import type { ReactNode } from "react";

export type VariantePastilla = "debe" | "ok" | "confirmar" | "aviso" | "neutra";

/** Colores por significado: rojo = debe, verde = ok, azul = esperando
 * confirmación, ámbar = aviso, gris = neutro. */
const CLASES: Record<VariantePastilla, string> = {
  debe: "bg-accent-tint text-accent",
  ok: "bg-success-tint text-secondary",
  confirmar: "bg-info-tint text-info",
  aviso: "bg-warning-tint text-warning",
  neutra: "bg-line text-text",
};

/** Etiqueta de estado corta ("Falta pagar", "Pagado"...). */
export function Pastilla({
  variante,
  className = "",
  children,
}: {
  variante: VariantePastilla;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[14px] leading-none font-semibold whitespace-nowrap ${CLASES[variante]} ${className}`}
    >
      {children}
    </span>
  );
}
