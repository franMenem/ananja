import type { ReactNode } from "react";

export type TonoNumero = "debe" | "ok";

const TONOS: Record<TonoNumero, string> = {
  debe: "text-accent",
  ok: "text-secondary",
};

/** Una etiqueta arriba y un número grande abajo: la respuesta de la pantalla. */
export function NumeroGrande({
  etiqueta,
  children,
  tono,
  className = "",
}: {
  etiqueta: ReactNode;
  /** El número ya formateado (puede ser un nodo). */
  children: ReactNode;
  tono?: TonoNumero;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <span className="text-[15px] text-text-muted">{etiqueta}</span>
      <span
        className={`font-display text-[clamp(28px,9vw,40px)] leading-none break-words ${tono ? TONOS[tono] : "text-text"}`}
      >
        {children}
      </span>
    </div>
  );
}
