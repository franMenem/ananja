"use client";

import { MedioPagoChips } from "@/components/medio-pago-chips";
import { SeccionForm } from "@/components/ui/seccion-form";
import type { Enums } from "@/lib/types";

type MedioPago = Enums<"medio_pago">;

type SeccionMedioProps = {
  medioPago: MedioPago | null;
  onMedioPagoChange: (medio: MedioPago) => void;
};

/** Paso 3 · Medio de pago — extraído de `components/comprobante-form.tsx`. */
export function SeccionMedio({ medioPago, onMedioPagoChange }: SeccionMedioProps) {
  return (
    <SeccionForm titulo="¿Cómo te pagaron?">
      <MedioPagoChips value={medioPago} onChange={onMedioPagoChange} ocultarRotulo />
    </SeccionForm>
  );
}
