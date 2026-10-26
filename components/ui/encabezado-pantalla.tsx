import type { ReactNode } from "react";

/** Título de pantalla (28px/700) y, debajo, la pregunta que responde la
 * pantalla (15px, gris). `acciones` va a la derecha del título. */
export function EncabezadoPantalla({
  titulo,
  pregunta,
  acciones,
  className = "",
}: {
  titulo: ReactNode;
  pregunta: ReactNode;
  acciones?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`flex flex-wrap items-end justify-between gap-x-4 gap-y-3 ${className}`}>
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="font-display text-[28px] leading-[1.1] font-bold break-words text-text">{titulo}</h1>
        <p className="text-[15px] text-text-muted">{pregunta}</p>
      </div>
      {acciones}
    </header>
  );
}
