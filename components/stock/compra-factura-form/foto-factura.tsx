"use client";

import { useRef } from "react";

import { IconExpense } from "@/components/icons";
import { CLASE_ETIQUETA, MensajeError } from "@/components/ui/campo";
import { validarFotoCompra } from "@/lib/foto-compra";

type FotoFacturaCamposProps = {
  foto: File | null;
  error: string | null;
  /** `null, null` limpia el error/la foto (archivo deseleccionado o
   * inválido — ver `validarFotoCompra`, `lib/foto-compra.ts`). */
  onChange: (foto: File | null, error: string | null) => void;
};

/** Bloque "Foto de la factura" de `CompraFacturaForm`: sacar foto o subir
 * archivo (comprobante), con la validación de `validarFotoCompra`. */
export function FotoFacturaCampos({ foto, error, onChange }: FotoFacturaCamposProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      onChange(null, null);
      return;
    }
    const validationError = validarFotoCompra(file);
    if (validationError) {
      onChange(null, validationError);
      event.target.value = "";
      return;
    }
    onChange(file, null);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className={CLASE_ETIQUETA}>
        Foto de la factura <span className="font-normal text-text-muted">(opcional)</span>
      </span>
      <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-xl border border-[#d0cec8] bg-surface-raised px-4 text-center">
        <IconExpense className="h-[30px] w-[30px] text-text-muted" />
        <span className="max-w-full break-words text-[14px] text-text-muted">
          {foto ? foto.name : "Ningún comprobante elegido"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[#d0cec8] bg-border">
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          className="flex min-h-12 items-center justify-center bg-surface-raised px-2 text-[15px] font-semibold text-primary"
        >
          Sacar foto
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex min-h-12 items-center justify-center bg-surface-raised px-2 text-[15px] font-semibold text-primary"
        >
          Subir archivo
        </button>
      </div>
      <input
        ref={cameraInputRef}
        id="factura-foto-camara"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFotoChange}
        className="sr-only"
      />
      <input
        ref={fileInputRef}
        id="factura-foto-archivo"
        type="file"
        accept="image/heic,image/jpeg,image/png,image/webp,application/pdf,.heic,.pdf"
        onChange={handleFotoChange}
        className="sr-only"
      />
      {error && <MensajeError>{error}</MensajeError>}
    </div>
  );
}
