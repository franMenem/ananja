"use client";

import { MontoInput } from "@/components/monto-input";

export function MoneyField({
  id,
  label,
  value,
  onChange,
  hint,
  symbol = "$",
  small = false,
  onBlur,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  /** Símbolo mostrado antes del monto — "$" (default, ARS) o "USD" para el
   * precio del litro de aceite en dólares (0030). */
  symbol?: string;
  /** Campo secundario (más chico) — usado para el override ARS puntual del
   * litro de aceite, que queda por debajo de dólar + USD/L en jerarquía
   * visual. */
  small?: boolean;
  /** Al perder el foco — usado por el campo unificado de etiquetas para
   * recién ahí repartir el total escrito entre sus insumos (`confirmarEtiquetaGrupo`). */
  onBlur?: () => void;
}) {
  return (
    <MontoInput
      id={id}
      label={label}
      value={value}
      onChange={onChange}
      hint={hint}
      simbolo={symbol}
      small={small}
      placeholder="0,00"
      onBlur={onBlur}
    />
  );
}

export function PctField({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <MontoInput
      id={id}
      label={label}
      value={value}
      onChange={onChange}
      hint={hint}
      tipo="porcentaje"
      sufijo="%"
      placeholder="0"
    />
  );
}
