"use client";

import {
  ComprobanteCobroCampos,
} from "@/components/comprobante-cobro-campos";
import { MontoInput } from "@/components/monto-input";
import {
  CLASE_CAJA_MONTO,
  CLASE_ETIQUETA,
  CLASE_INPUT_MONTO_GRANDE,
  CLASE_SIMBOLO_MONTO_GRANDE,
} from "@/components/ui/campo";
import { SeccionForm } from "@/components/ui/seccion-form";
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
    <SeccionForm titulo="¿Cuánto fue?">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="monto" className={CLASE_ETIQUETA}>
            Monto de la venta
          </label>
          {montoAutocompletado && ocrEstado === "propuesto" && (
            <span className="text-[14px] font-semibold text-accent">
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
          cajaClassName={CLASE_CAJA_MONTO}
          simboloClassName={CLASE_SIMBOLO_MONTO_GRANDE}
          inputClassName={CLASE_INPUT_MONTO_GRANDE}
        />
        {montoAutocompletado && ocrEstado === "propuesto" && (
          <p className="text-[14px] text-text-muted">
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
    </SeccionForm>
  );
}
