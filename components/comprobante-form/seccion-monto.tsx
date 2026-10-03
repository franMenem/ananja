"use client";

import {
  ComprobanteCobroCampos,
} from "@/components/comprobante-cobro-campos";
import { MontoInput } from "@/components/monto-input";
import type { Enums } from "@/lib/types";

type EstadoOcr = Enums<"estado_ocr">;

type SeccionMontoProps = {
  montoInput: string;
  onMontoInputChange: (value: string) => void;
  ocrEstado: EstadoOcr;
  montoAutocompletado: boolean;
  cobradoInput: string;
  onCobradoInputChange: (value: string) => void;
  esVentaACredito: boolean;
  quedaACobrarCentavos: number | null;
};

/** Paso 2 · Monto (+ "Cobrado ahora") — extraído de
 * `components/comprobante-form.tsx`. */
export function SeccionMonto({
  montoInput,
  onMontoInputChange,
  ocrEstado,
  montoAutocompletado,
  cobradoInput,
  onCobradoInputChange,
  esVentaACredito,
  quedaACobrarCentavos,
}: SeccionMontoProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <label
            htmlFor="monto"
            className="text-[10px] tracking-[0.22em] text-text-muted uppercase"
          >
            2 · Monto
          </label>
          {montoAutocompletado && ocrEstado === "propuesto" && (
            <span className="text-[10px] font-medium tracking-[0.14em] text-accent uppercase">
              Leído de la foto
            </span>
          )}
        </div>
        {/* Rótulo propio arriba (con "Leído de la foto" al lado): el campo no lleva `label`. */}
        <MontoInput
          id="monto"
          value={montoInput}
          onChange={onMontoInputChange}
          required
          placeholder="0,00"
          cajaClassName="flex items-baseline gap-2 border-b-2 border-primary pb-1.5"
          simboloClassName="font-display text-[22px] text-text-muted"
          inputClassName="font-display w-full min-w-0 text-[50px] leading-none text-primary tabular-nums"
        />
        {montoAutocompletado && ocrEstado === "propuesto" && (
          <p className="text-[11px] text-text-muted">
            Verificalo antes de guardar — el número se leyó automáticamente.
          </p>
        )}
      </div>

      <ComprobanteCobroCampos
        cobradoInput={cobradoInput}
        onCobradoInputChange={onCobradoInputChange}
        esVentaACredito={esVentaACredito}
        quedaACobrarCentavos={quedaACobrarCentavos}
      />
    </div>
  );
}
