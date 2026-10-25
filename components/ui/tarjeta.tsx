import type { ElementType, HTMLAttributes } from "react";

type TarjetaProps = HTMLAttributes<HTMLElement> & {
  /** Etiqueta HTML; por defecto `div`. */
  como?: ElementType;
};

/**
 * Tarjeta blanca con borde fino: la base de toda la app. Se distingue del
 * fondo por el borde, no por el color. Las esquinas son redondeadas.
 */
export function Tarjeta({ como: Etiqueta = "div", className = "", ...rest }: TarjetaProps) {
  return (
    <Etiqueta
      {...rest}
      className={`rounded-2xl border border-border bg-surface p-4 lg:p-5 ${className}`}
    />
  );
}
