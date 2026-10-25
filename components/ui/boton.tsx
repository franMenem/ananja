import type { ButtonHTMLAttributes } from "react";

/** Base de los botones grandes: 48px de alto, esquinas redondeadas, 16px/600.
 * No fija `display` ni `padding`: cada uso conserva el suyo. */
const BASE =
  "min-h-12 items-center justify-center rounded-xl text-center text-[16px] font-semibold transition-colors disabled:opacity-45";

/** Botón principal: una sola acción por pantalla. */
export const BOTON_PRIMARIO = `${BASE} bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active`;

/** Botón secundario: borde gris, fondo blanco. */
export const BOTON_SECUNDARIO = `${BASE} border border-[#d0cec8] bg-surface text-text hover:bg-background`;

/** Botón secundario chico de una tarea ("Confirmar", "Pasar a la cuenta"…):
 * 44px de alto, ancho completo en celular y a su tamaño desde `sm`. */
export const BOTON_ACCION_TAREA =
  "inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-xl border border-[#d0cec8] bg-surface px-4 text-center text-[15px] font-semibold text-text transition-colors hover:bg-background disabled:opacity-45 sm:w-auto";

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
