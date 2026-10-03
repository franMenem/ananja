"use client";

import { ETIQUETA_MEDIO_PAGO, type MedioPago } from "@/lib/etiquetas/medio-pago";

const OPTIONS: { value: MedioPago; label: string }[] = (
  ["banco", "mercado_pago", "efectivo"] as const
).map((value) => ({ value, label: ETIQUETA_MEDIO_PAGO[value] }));

type MedioPagoChipsProps = {
  value: MedioPago | null;
  onChange: (medio: MedioPago) => void;
  className?: string;
  /**
   * Restringe qué medios se muestran (ej. una transferencia a destino:
   * solo Banco y Mercado Pago — el enum `medio_pago` no cambia). Default:
   * los tres medios, en el orden de siempre.
   */
  opciones?: MedioPago[];
  /**
   * Oculta el rótulo interno "Medio de pago" cuando el formulario que lo
   * usa ya dibuja su propio encabezado numerado (ver
   * `components/comprobante-form.tsx`, sección "3 · Medio de pago").
   * Default: false (lo muestra, como en /gastos).
   */
  ocultarRotulo?: boolean;
};

/**
 * Selector de medio de pago como chips táctiles — compartido entre el alta
 * y edición de gastos (`app/(app)/gastos/nuevo`, `app/(app)/gastos/[id]`),
 * `ComprobanteForm` y varias pantallas de transferencias, que restringen
 * las opciones vía `opciones`. Antes era una copia local en cada lugar
 * (`app/(app)/gastos/medio-pago-chips.tsx`).
 */
export function MedioPagoChips({
  value,
  onChange,
  className,
  opciones,
  ocultarRotulo = false,
}: MedioPagoChipsProps) {
  const options = opciones
    ? OPTIONS.filter((o) => opciones.includes(o.value))
    : OPTIONS;

  return (
    <div className={className}>
      {!ocultarRotulo && (
        <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
          Medio de pago
        </span>
      )}
      <div
        className={`grid gap-px bg-border ${ocultarRotulo ? "" : "mt-1.5"}`}
        style={{
          gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
        }}
      >
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={selected}
              className={`min-h-[52px] px-2 text-[13px] font-medium transition-colors ${
                selected
                  ? "bg-primary text-background"
                  : "bg-surface-raised text-text"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
