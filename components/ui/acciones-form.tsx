"use client";

import type { ReactNode } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "@/components/ui/boton";
import { LinkBoton } from "@/components/ui/link-boton";

/**
 * Pie de un formulario: botón principal con un verbo claro, ancho completo
 * en celular, y "Cancelar" que vuelve. Con `fija` (formularios largos) el
 * botón principal queda pegado abajo del área de contenido en celular —
 * justo arriba de la barra de pestañas, que ya respeta el área segura —, sin
 * tapar campos: es el último elemento del formulario y solo "flota" mientras
 * no llegaste al final.
 */
export function AccionesForm({
  etiqueta,
  cargando = false,
  textoCargando = "Guardando…",
  disabled = false,
  type = "submit",
  onClick,
  cancelarHref,
  onCancelar,
  etiquetaCancelar = "Cancelar",
  fija = false,
  nota,
}: {
  etiqueta: ReactNode;
  cargando?: boolean;
  textoCargando?: ReactNode;
  disabled?: boolean;
  type?: "submit" | "button";
  onClick?: () => void;
  /** A dónde vuelve "Cancelar". Sin esto no se muestra. */
  cancelarHref?: string;
  /** Alternativa a `cancelarHref` cuando "Cancelar" no cambia de ruta (ej. salir del modo edición). */
  onCancelar?: () => void;
  etiquetaCancelar?: string;
  fija?: boolean;
  /** Una línea chica debajo del botón (ej. "Descuenta 12 botellas…"). */
  nota?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:gap-x-3">
      <div
        className={`${
          fija
            ? "sticky bottom-0 z-[5] rounded-2xl border border-border bg-surface p-2 shadow-[0_-4px_14px_rgba(26,26,26,0.08)] lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"
            : ""
        } lg:min-w-0 lg:flex-[1.6]`}
      >
        <BotonAccion
          cargando={cargando}
          textoCargando={textoCargando}
          type={type}
          onClick={onClick}
          disabled={disabled}
          className={`${BOTON_PRIMARIO} flex w-full px-4`}
        >
          {etiqueta}
        </BotonAccion>
      </div>
      {nota && (
        <p className="text-center text-[14px] text-text-muted lg:order-last lg:basis-full lg:text-left">{nota}</p>
      )}
      {!cancelarHref && onCancelar && (
        <button
          type="button"
          onClick={onCancelar}
          disabled={cargando}
          className={`${BOTON_SECUNDARIO} flex w-full px-4 lg:min-w-0 lg:flex-1`}
        >
          {etiquetaCancelar}
        </button>
      )}
      {cancelarHref && (
        <LinkBoton href={cancelarHref} className={`${BOTON_SECUNDARIO} flex w-full px-4 lg:min-w-0 lg:flex-1`}>
          {etiquetaCancelar}
        </LinkBoton>
      )}
    </div>
  );
}
