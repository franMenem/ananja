"use client";

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
          <p role="alert" className="text-xs text-accent">
            {formError}
          </p>
          {showRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="min-h-11 self-start border border-accent px-4 text-xs font-medium tracking-[0.1em] text-accent uppercase"
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
          className="min-h-14 bg-primary text-[13px] font-medium tracking-[0.14em] text-background uppercase transition-colors hover:bg-primary-hover disabled:opacity-45"
        >
          Guardar comprobante
        </BotonAccion>
        {resumenDescuento && (
          <p className="text-center text-[11px] text-text-muted">
            Descuenta {resumenDescuento} del depósito.
          </p>
        )}
      </div>
    </>
  );
}
