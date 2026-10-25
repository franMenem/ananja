"use client";

import { MedioPagoChips } from "@/components/medio-pago-chips";
import type { Enums } from "@/lib/types";

type MedioPago = Enums<"medio_pago">;

type SeccionMedioProps = {
  medioPago: MedioPago | null;
  onMedioPagoChange: (medio: MedioPago) => void;
};

/** Paso 3 · Medio de pago — extraído de `components/comprobante-form.tsx`. */
export function SeccionMedio({ medioPago, onMedioPagoChange }: SeccionMedioProps) {
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-[13px] text-text-muted">
        3 · Medio de pago
      </span>
      <MedioPagoChips value={medioPago} onChange={onMedioPagoChange} ocultarRotulo />
    </div>
  );
}
