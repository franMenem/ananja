import type { ReactNode } from "react";

import { MedioPagoChips } from "@/components/medio-pago-chips";
import { MontoInput } from "@/components/monto-input";
import type { Enums } from "@/lib/types";
import {
  AreaTexto,
  CLASE_CAJA_MONTO,
  CLASE_ETIQUETA,
  CLASE_INPUT_MONTO_GRANDE,
  CLASE_SIMBOLO_MONTO_GRANDE,
  Campo,
  Entrada,
} from "@/components/ui/campo";
import { MasDatos, SeccionForm } from "@/components/ui/seccion-form";
import { hoyISO } from "@/lib/fechas";

type MedioPago = Enums<"medio_pago">;

type CamposPagoCajaProps = {
  /** Prefijo de los `id`/`htmlFor` ("pago" en PagoDeudaForm, "cobro" en
   * CobroForm) — cada instancia necesita ids propios. */
  idPrefix: string;
  /** Título de la tarjeta principal ("¿Cuánto pagás?", "¿Cuánto cobraste?"). */
  tituloSeccion: string;
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
  tituloSeccion,
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
      <SeccionForm titulo={tituloSeccion}>
        <div className="flex flex-col gap-1.5">
          <MontoInput
            id={`${idPrefix}-monto`}
            label={montoLabel}
            value={montoValue}
            onChange={onMontoChange}
            required
            placeholder="0,00"
            simbolo={montoSimbolo}
            cajaClassName={CLASE_CAJA_MONTO}
            simboloClassName={CLASE_SIMBOLO_MONTO_GRANDE}
            inputClassName={CLASE_INPUT_MONTO_GRANDE}
          />
          <p className="text-[14px] text-text-muted">{captionMonto}</p>
        </div>

        {extra}

        <div className="flex flex-col gap-1.5">
          <span className={CLASE_ETIQUETA}>{medioLabel}</span>
          <MedioPagoChips value={medioValue} onChange={onMedioChange} ocultarRotulo />
        </div>
      </SeccionForm>

      <MasDatos abierto={nota.trim() !== "" || (fecha !== "" && fecha !== hoyISO())}>
        <Campo id={`${idPrefix}-fecha`} etiqueta="Fecha">
          <Entrada
            type="date"
            required
            value={fecha}
            onChange={(event) => onFechaChange(event.target.value)}
            className="tabular-nums"
          />
        </Campo>
        <Campo id={`${idPrefix}-nota`} etiqueta="Nota" opcional>
          <AreaTexto value={nota} onChange={(event) => onNotaChange(event.target.value)} rows={2} />
        </Campo>
      </MasDatos>
    </>
  );
}
