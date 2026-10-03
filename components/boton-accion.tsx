import type { ButtonHTMLAttributes, ReactNode } from "react";

import { Spinner } from "@/components/spinner";

type BotonAccionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Mientras es `true`: el botón queda deshabilitado, con `aria-busy`, y en
   * vez del texto muestra el spinner + `textoCargando`. */
  cargando: boolean;
  /** Texto mientras trabaja ("Guardando…"). Si falta, solo el spinner. */
  textoCargando?: ReactNode;
};

/**
 * Botón que dispara una acción que tarda (guardar, confirmar, borrar) — el
 * ÚNICO indicador de carga de los botones de la app, para que todos se vean
 * y se comporten igual. No trae estilos propios: cada pantalla sigue
 * pasando su `className` de siempre.
 *
 * El texto normal y el de carga se apilan en la misma celda de una grilla
 * (el que no corresponde queda `invisible`), así el botón mide siempre lo
 * que mide el más largo de los dos y no "salta" de ancho al empezar a
 * guardar. `disabled` se suma a `cargando`: pasar solo las OTRAS razones
 * para deshabilitarlo (ej. `disabled={hayProblemas}`).
 */
export function BotonAccion({
  cargando,
  textoCargando,
  disabled,
  type = "button",
  children,
  ...rest
}: BotonAccionProps) {
  return (
    <button {...rest} type={type} disabled={disabled || cargando} aria-busy={cargando || undefined}>
      <span className="inline-grid items-center justify-items-center">
        <span className={`col-start-1 row-start-1 ${cargando ? "invisible" : ""}`}>{children}</span>
        <span
          className={`col-start-1 row-start-1 inline-flex items-center gap-2 ${cargando ? "" : "invisible"}`}
        >
          <Spinner />
          {textoCargando}
        </span>
      </span>
    </button>
  );
}
