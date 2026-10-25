"use client";

import { BOTON_PRIMARIO } from "@/components/ui/boton";
import { BotonAccion } from "@/components/boton-accion";

type AccionesGuardarProps = {
  submitting: boolean;
  uploading: boolean;
  formError: string | null;
  showRetry: boolean;
  onRetry: () => void;
  resumenDescuento: string;
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
}: AccionesGuardarProps) {
  return (
    <>
      {formError && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-[14px] text-accent">
            {formError}
          </p>
          {showRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="min-h-11 self-start border border-accent px-4 text-[14px] font-medium text-accent rounded-xl"
            >
              Reintentar
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        <BotonAccion
          cargando={submitting}
          textoCargando="Guardando…"
          type="submit"
          disabled={uploading}
          className={BOTON_PRIMARIO}
        >
          Guardar comprobante
        </BotonAccion>
        {resumenDescuento && (
          <p className="text-center text-[13px] text-text-muted">
            Descuenta {resumenDescuento} del depósito.
          </p>
        )}
      </div>
    </>
  );
}
