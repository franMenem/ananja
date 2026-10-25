import type { ButtonHTMLAttributes } from "react";

/** Base de los botones grandes: 48px de alto, esquinas redondeadas, 16px/600.
 * No fija `display` ni `padding`: cada uso conserva el suyo. */
const BASE =
  "min-h-12 items-center justify-center rounded-xl text-center text-[16px] font-semibold transition-colors disabled:opacity-45";

/** Botón principal: una sola acción por pantalla. */
export const BOTON_PRIMARIO = `${BASE} bg-primary text-background hover:bg-primary-hover active:bg-primary-active`;

/** Botón secundario: borde gris, fondo blanco. */
export const BOTON_SECUNDARIO = `${BASE} border border-[#d0cec8] bg-surface text-text hover:bg-background`;

type BotonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: "primario" | "secundario";
};

export function Boton({ variante = "primario", className = "", type = "button", ...rest }: BotonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={`inline-flex px-4 ${variante === "primario" ? BOTON_PRIMARIO : BOTON_SECUNDARIO} ${className}`}
    />
  );
}
