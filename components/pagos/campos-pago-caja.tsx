import type { ReactNode } from "react";

import { MedioPagoChips } from "@/components/medio-pago-chips";
import { MontoInput } from "@/components/monto-input";
import type { Enums } from "@/lib/types";

type MedioPago = Enums<"medio_pago">;

type CamposPagoCajaProps = {
  /** Prefijo de los `id`/`htmlFor` ("pago" en PagoDeudaForm, "cobro" en
   * CobroForm) — cada instancia necesita ids propios. */
  idPrefix: string;
  montoLabel: ReactNode;
  montoValue: string;
  onMontoChange: (value: string) => void;
  /** Símbolo del monto principal — `undefined` deja el default de
   * `MontoInput` ("$"), igual que ya hacía CobroForm sin pasar la prop. */
  montoSimbolo?: string | null;
  /** "Resta $X." / "Debe $X." bajo el monto. */
  captionMonto: ReactNode;
  medioLabel: ReactNode;
  medioValue: MedioPago | null;
  onMedioChange: (medio: MedioPago) => void;
  fecha: string;
  onFechaChange: (value: string) => void;
  nota: string;
  onNotaChange: (value: string) => void;
  /** Slot entre el monto y la caja/medio — "Pesos que salen de la caja" de
   * PagoDeudaForm en una deuda USD; `CobroForm` no lo usa. */
  extra?: ReactNode;
};

/**
 * Campos compartidos de `PagoDeudaForm` y `CobroForm`:
 * los dos son casi byte-idénticos — mismo `MontoInput` grande, mismo bloque
 * fecha+nota, mismo `MedioPagoChips`, mismo `BotonAccion` (que sigue
 * quedando en cada form, junto con su propia validación y llamada al RPC —
 * este componente es solo los campos, no el `<form>` entero). Cada form
 * conserva su propia lógica de guardado/errores; esto es puro chrome
 * compartido, sin ningún `useState` propio.
 */
export function CamposPagoCaja({
  idPrefix,
  montoLabel,
  montoValue,
  onMontoChange,
  montoSimbolo,
  captionMonto,
  medioLabel,
  medioValue,
  onMedioChange,
  fecha,
  onFechaChange,
  nota,
  onNotaChange,
  extra,
}: CamposPagoCajaProps) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <MontoInput
          id={`${idPrefix}-monto`}
          label={montoLabel}
          value={montoValue}
          onChange={onMontoChange}
          required
          placeholder="0,00"
          simbolo={montoSimbolo}
          labelClassName="block text-[10px] tracking-[0.22em] text-text-muted uppercase"
          cajaClassName="mt-2 flex items-baseline gap-2 border-b-2 border-primary pb-1.5"
          simboloClassName="font-display text-[22px] text-text-muted"
          inputClassName="font-display w-full min-w-0 text-[50px] leading-none text-primary tabular-nums"
        />
        <p className="text-[11px] text-text-muted">{captionMonto}</p>
      </div>

      {extra}

      <div className="flex flex-col gap-2.5">
        <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">{medioLabel}</span>
        <MedioPagoChips value={medioValue} onChange={onMedioChange} ocultarRotulo />
      </div>

      <div className="flex flex-col gap-2.5">
        <input
          id={`${idPrefix}-fecha`}
          type="date"
          required
          aria-label="Fecha"
          value={fecha}
          onChange={(event) => onFechaChange(event.target.value)}
          className="min-h-12 border border-border bg-surface px-3.5 text-base text-text tabular-nums focus:border-primary"
        />
        <textarea
          id={`${idPrefix}-nota`}
          value={nota}
          onChange={(event) => onNotaChange(event.target.value)}
          rows={2}
          placeholder="Nota (opcional)"
          className="min-h-[60px] border border-border bg-surface px-3.5 py-3 text-base text-text placeholder:text-text-muted focus:border-primary"
        />
      </div>
    </>
  );
}
