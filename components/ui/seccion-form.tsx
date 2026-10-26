import type { ReactNode } from "react";

import { Tarjeta } from "@/components/ui/tarjeta";

/**
 * Una parte de un formulario dentro de una Tarjeta, con título de sección
 * (17px/600) y, si hace falta, una línea de explicación.
 */
export function SeccionForm({
  titulo,
  descripcion,
  derecha,
  children,
  className = "",
}: {
  titulo: ReactNode;
  descripcion?: ReactNode;
  /** Algo a la derecha del título (un botón "Sacar", una pastilla…). */
  derecha?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Tarjeta como="section" className={`flex flex-col gap-4 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-[17px] font-semibold leading-snug text-text">{titulo}</h2>
          {descripcion && <p className="text-[14px] leading-snug text-text-muted">{descripcion}</p>}
        </div>
        {derecha}
      </div>
      {children}
    </Tarjeta>
  );
}

/**
 * Campos opcionales agrupados al final: un `<details>` cerrado. Los campos
 * quedan en el DOM aunque esté cerrado, así que se envían igual. `abierto`
 * lo abre de entrada (cuando ya hay algo cargado ahí).
 */
export function MasDatos({
  children,
  abierto = false,
  titulo = "Más datos (opcional)",
}: {
  children: ReactNode;
  abierto?: boolean;
  titulo?: string;
}) {
  return (
    <details open={abierto || undefined} className="group rounded-2xl border border-border bg-surface">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 text-[15px] font-semibold text-text [&::-webkit-details-marker]:hidden">
        {titulo}
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 shrink-0 text-text-muted transition-transform group-open:rotate-180"
        >
          <path d="m5 8 5 5 5-5" />
        </svg>
      </summary>
      <div className="flex flex-col gap-4 border-t border-border px-4 py-4">{children}</div>
    </details>
  );
}
