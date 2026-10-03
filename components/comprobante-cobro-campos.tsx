"use client";

import { useEffect, useRef, useState } from "react";

import { MontoInput } from "@/components/monto-input";
import { formatCentavos, formatMontoDisplay, parseMontoInput } from "@/lib/money";

export type UseCobradoAhoraResult = {
  cobradoInput: string;
  handleCobradoInputChange: (value: string) => void;
  cobradoCentavos: number | null;
  quedaACobrarCentavos: number | null;
  esVentaACredito: boolean;
};

/**
 * Decide si "Cobrado ahora" debe seguir al monto tras un cambio de éste.
 * Pura — sin estado — para poder testearla sin montar el hook.
 *
 * En modo "crear" sigue al monto mientras el usuario no lo haya tocado a
 * mano (comportamiento por default: venta cobrada al contado). En modo
 * "editar" el `cobradoInput` precargado (con el `cobradoCentavos`
 * guardado, que puede ser menor al monto — venta a crédito) se conserva
 * siempre, incluso en el primer cambio de monto: resincronizarlo pisaría
 * silenciosamente un cobro parcial ya guardado (fix de revisión).
 */
export function calcularCobradoSincronizado(
  mode: "crear" | "editar",
  montoInput: string,
  cobradoInputActual: string,
  cobradoTocado: boolean,
): string {
  if (mode === "editar" || cobradoTocado) return cobradoInputActual;
  return montoInput;
}

/**
 * Estado y recálculo automático de "Cobrado ahora" (Ventas a crédito). Extraído
 * de `components/comprobante-form.tsx` (que ya supera las 400 líneas) junto
 * con `ComprobanteCobroCampos`, el bloque de UI que lo consume.
 *
 * Mismo patrón que `montoTocadoRef`/OCR en `ComprobanteForm`, gateado
 * además por `mode` (ver `calcularCobradoSincronizado`).
 */
export function useCobradoAhora(
  mode: "crear" | "editar",
  montoInput: string,
  initialCobradoCentavos: number | undefined,
): UseCobradoAhoraResult {
  const cobradoTocadoRef = useRef(false);
  const [cobradoInput, setCobradoInput] = useState(
    initialCobradoCentavos !== undefined
      ? formatMontoDisplay(initialCobradoCentavos)
      : "",
  );

  useEffect(() => {
    setCobradoInput((actual) =>
      calcularCobradoSincronizado(mode, montoInput, actual, cobradoTocadoRef.current),
    );
  }, [mode, montoInput]);

  function handleCobradoInputChange(value: string) {
    cobradoTocadoRef.current = true;
    setCobradoInput(value);
  }

  const montoCentavosParaResumen = parseMontoInput(montoInput);
  const cobradoCentavos = parseMontoInput(cobradoInput);
  const quedaACobrarCentavos =
    montoCentavosParaResumen !== null && cobradoCentavos !== null
      ? montoCentavosParaResumen - cobradoCentavos
      : null;
  const esVentaACredito = (quedaACobrarCentavos ?? 0) > 0;

  return {
    cobradoInput,
    handleCobradoInputChange,
    cobradoCentavos,
    quedaACobrarCentavos,
    esVentaACredito,
  };
}

type ComprobanteCobroCamposProps = {
  cobradoInput: string;
  onCobradoInputChange: (value: string) => void;
  esVentaACredito: boolean;
  quedaACobrarCentavos: number | null;
};

/**
 * Input "Cobrado ahora", con el aviso "Queda a cobrar $X" cuando lo
 * cobrado es menor al monto. Se renderiza dentro del bloque de Monto de
 * `ComprobanteForm` (mismo paso — no tiene numeración propia).
 */
export function ComprobanteCobroCampos({
  cobradoInput,
  onCobradoInputChange,
  esVentaACredito,
  quedaACobrarCentavos,
}: ComprobanteCobroCamposProps) {
  return (
    <div className="flex flex-col gap-2">
      <MontoInput
        id="cobrado"
        label="Cobrado ahora"
        value={cobradoInput}
        onChange={onCobradoInputChange}
        required
        placeholder="0,00"
        labelClassName="block text-[10px] tracking-[0.22em] text-text-muted uppercase"
        cajaClassName="mt-2 flex items-baseline gap-2 border-b border-border pb-1.5"
        simboloClassName="text-[15px] text-text-muted"
        inputClassName="w-full min-w-0 text-[22px] leading-none text-text tabular-nums"
      />
      {esVentaACredito && quedaACobrarCentavos !== null && (
        <p className="text-[11px] text-accent">
          Queda a cobrar {formatCentavos(quedaACobrarCentavos)}.
        </p>
      )}
    </div>
  );
}
