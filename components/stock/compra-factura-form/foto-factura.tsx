"use client";

import { useRef } from "react";

import { IconExpense } from "@/components/icons";
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
    <div>
      <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
        Foto de la factura (opcional)
      </span>
      <div className="mt-1.5 flex min-h-[120px] flex-col items-center justify-center gap-2 border border-border bg-surface-raised px-4 text-center">
        <IconExpense className="h-[30px] w-[30px] text-text-muted" />
        <span className="max-w-full break-words text-[12px] tracking-[0.1em] text-text-muted uppercase">
          {foto ? foto.name : "Ningún comprobante elegido"}
        </span>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-px bg-border">
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          className="flex min-h-12 items-center justify-center bg-surface-raised px-2 text-[11px] font-medium tracking-[0.12em] text-primary uppercase"
        >
          Sacar foto
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex min-h-12 items-center justify-center bg-surface-raised px-2 text-[11px] font-medium tracking-[0.12em] text-primary uppercase"
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
      {error && (
        <p role="alert" className="mt-1 text-sm text-accent">
          {error}
        </p>
      )}
    </div>
  );
}
