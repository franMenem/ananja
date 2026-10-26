import type { ReactNode } from "react";

import { Tarjeta } from "@/components/ui/tarjeta";

/** Mini-tarjeta con una etiqueta (15px, gris) y un dato (24px). */
export function Dato({
  etiqueta,
  children,
  detalle,
  className = "",
}: {
  etiqueta: ReactNode;
  children: ReactNode;
  detalle?: ReactNode;
  className?: string;
}) {
  return (
    <Tarjeta className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <span className="text-[15px] text-text-muted">{etiqueta}</span>
      <span className="font-display text-[24px] leading-tight font-bold break-words text-text tabular-nums">
        {children}
      </span>
      {detalle && <span className="text-[14px] text-text-muted">{detalle}</span>}
    </Tarjeta>
  );
}
