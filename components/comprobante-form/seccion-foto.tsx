"use client";

import { IconReceipt } from "@/components/icons";

type SeccionFotoProps = {
  cameraInputRef: React.RefObject<HTMLInputElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  previewUrl: string | null;
  previewIsPdf: boolean;
  fileName: string | null;
  uploading: boolean;
  uploadError: string | null;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRetryUpload: () => void;
};

/** Paso 1 · Foto del comprobante (opcional) — extraído de
 * `components/comprobante-form.tsx`. */
export function SeccionFoto({
  cameraInputRef,
  fileInputRef,
  previewUrl,
  previewIsPdf,
  fileName,
  uploading,
  uploadError,
  onFileChange,
  onRetryUpload,
}: SeccionFotoProps) {
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
        1 · Foto del comprobante (opcional)
      </span>

      <div className="flex min-h-[150px] flex-col items-center justify-center gap-2.5 overflow-hidden border border-border bg-surface-raised text-center">
        {previewUrl && !previewIsPdf ? (
          // previewUrl es un blob: URL local del archivo recién elegido
          // (aún no subido a Storage), no una URL remota: next/image no
          // puede optimizarla ni tiene sentido hacerlo para una miniatura
          // efímera del propio dispositivo.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Vista previa del comprobante"
            className="h-[150px] w-full object-contain"
          />
        ) : previewIsPdf ? (
          <div className="flex flex-col items-center gap-2.5 p-4 text-text-muted">
            <IconReceipt className="h-[30px] w-[30px]" />
            <span className="text-xs tracking-[0.1em] uppercase">
              {fileName ?? "Archivo PDF"}
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2.5 p-4 text-text-muted">
            <IconReceipt className="h-[30px] w-[30px]" />
            <span className="text-xs tracking-[0.1em] uppercase">
              Ningún comprobante elegido
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-px bg-border">
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

      {/* `capture="environment"` abre la cámara directo — solo en este
          input. El de "Subir archivo" no lo lleva para no forzar la
          cámara en iOS Safari (ver comentario junto a `cameraInputRef`). */}
      <input
        ref={cameraInputRef}
        id="comprobante-foto-camara"
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFileChange}
      />
      <input
        ref={fileInputRef}
        id="comprobante-foto-archivo"
        type="file"
        accept="image/*,.pdf,.heic"
        className="hidden"
        onChange={onFileChange}
      />

      {uploading && (
        <p className="text-[11px] text-text-muted">Subiendo comprobante…</p>
      )}
      {uploadError && (
        <div className="flex items-center justify-between gap-2">
          <p role="alert" className="text-xs text-accent">
            {uploadError}
          </p>
          <button
            type="button"
            onClick={onRetryUpload}
            className="min-h-11 shrink-0 border border-border px-3 text-xs font-medium tracking-[0.1em] text-text uppercase"
          >
            Reintentar
          </button>
        </div>
      )}
    </div>
  );
}
