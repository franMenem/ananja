"use client";

import type { ReactNode } from "react";

import { CLASE_ETIQUETA } from "@/components/ui/campo";

/**
 * Botones pegados para elegir UNA opción entre pocas (Sumar/Restar, tipo de
 * insumo, tamaño…): 48px de alto, texto 15px, la elegida en color principal.
 * Con `columnas` fijas cuando son pocas; si no, se reparten parejo. No
 * guarda nada: el formulario maneja el valor.
 */
export function Segmentos<T extends string>({
  etiqueta,
  opciones,
  valor,
  onChange,
  columnas,
  className = "",
}: {
  etiqueta?: ReactNode;
  opciones: readonly { value: T; label: ReactNode }[];
  valor: T | null;
  onChange: (valor: T) => void;
  /** Columnas fijas (default: una por opción). */
  columnas?: number;
  className?: string;
}) {
  const n = columnas ?? opciones.length;
  return (
    <div role="group" aria-label={typeof etiqueta === "string" ? etiqueta : undefined} className={className}>
      {etiqueta && <span className={CLASE_ETIQUETA}>{etiqueta}</span>}
      <div
        className={`grid gap-px overflow-hidden rounded-xl border border-[#d0cec8] bg-border ${etiqueta ? "mt-1.5" : ""}`}
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
      >
        {opciones.map((opcion) => {
          const elegida = valor === opcion.value;
          return (
            <button
              key={opcion.value}
              type="button"
              onClick={() => onChange(opcion.value)}
              aria-pressed={elegida}
              className={`min-h-12 break-words px-2 py-1 text-[15px] font-semibold leading-tight transition-colors ${
                elegida ? "bg-primary text-primary-foreground" : "bg-surface-raised text-text"
              }`}
            >
              {opcion.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
