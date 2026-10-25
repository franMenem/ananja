import type { ReactNode } from "react";

/** Fila de lista: título y detalle a la izquierda, valor a la derecha. Va
 * dentro de un contenedor con `divide-y divide-line` (ver `ListaTarjeta`). */
export function Fila({
  titulo,
  detalle,
  valor,
  className = "",
}: {
  titulo: ReactNode;
  detalle?: ReactNode;
  valor?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-h-14 items-center justify-between gap-3 py-2 ${className}`}>
      <div className="flex min-w-0 flex-col">
        <span className="text-[16px] font-semibold text-text">{titulo}</span>
        {detalle && <span className="text-[14px] text-text-muted">{detalle}</span>}
      </div>
      {valor !== undefined && valor !== null && (
        <div className="shrink-0 text-right text-[16px] font-semibold text-text tabular-nums">{valor}</div>
      )}
    </div>
  );
}

/** Contenedor de filas: tarjeta blanca con separadores finos. */
export function ListaTarjeta({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`divide-y divide-line overflow-hidden rounded-2xl border border-border bg-surface ${className}`}
    >
      {children}
    </div>
  );
}
