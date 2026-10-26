"use client";

import { AccionesForm } from "@/components/ui/acciones-form";
import { MensajeError } from "@/components/ui/campo";

type AccionesGuardarProps = {
  submitting: boolean;
  uploading: boolean;
  formError: string | null;
  showRetry: boolean;
  onRetry: () => void;
  resumenDescuento: string;
  /** "Guardar venta" al crear, "Guardar cambios" al editar. */
  etiqueta: string;
  cancelarHref: string;
};

/** Error del formulario (con "Reintentar" si fue de conexión), botón de
 * guardar y resumen de lo que se descuenta del depósito — extraído de
 * `components/comprobante-form.tsx`. */
export function AccionesGuardar({
  submitting,
  uploading,
  formError,
  showRetry,
  onRetry,
  resumenDescuento,
  etiqueta,
  cancelarHref,
}: AccionesGuardarProps) {
  return (
    <>
      {formError && (
        <div className="flex flex-col gap-2">
          <MensajeError>{formError}</MensajeError>
          {showRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="min-h-12 self-start rounded-xl border border-accent px-4 text-[15px] font-semibold text-accent"
            >
              Reintentar
            </button>
          )}
        </div>
      )}

      <AccionesForm
        etiqueta={etiqueta}
        cargando={submitting}
        disabled={uploading}
        cancelarHref={cancelarHref}
        fija
        nota={resumenDescuento ? `Descuenta ${resumenDescuento} del depósito.` : undefined}
      />
    </>
  );
}
