"use client";

import { useEffect, useRef, useState } from "react";

import { getSignedUrl, subirComprobante } from "@/lib/storage";

function isPdfPath(path: string): boolean {
  return path.toLowerCase().endsWith(".pdf");
}

export type UseComprobanteFotoResult = {
  cameraInputRef: React.RefObject<HTMLInputElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  imagenPath: string | null;
  previewUrl: string | null;
  previewIsPdf: boolean;
  fileName: string | null;
  uploading: boolean;
  uploadError: string | null;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleRetryUpload: () => void;
};

type OcrParaFoto = {
  prepararNuevoArchivo: () => number;
  runOcr: (file: File, seq: number) => Promise<void>;
};

/**
 * Foto/archivo del comprobante: elegir, subir a Storage y mostrar preview.
 * Dos inputs separados en vez de uno solo con `capture="environment"`: en
 * iOS Safari ese atributo fuerza la cámara y no deja elegir de la
 * fototeca ni de Archivos (bug reportado — design/handoff README § /comprobantes/nuevo).
 * "Sacar foto" mantiene `capture` para abrir la cámara directo; "Subir
 * archivo" no lo lleva, así el sistema operativo ofrece el selector
 * completo (fototeca, Archivos, etc). Mismo `handleFileChange` para ambos.
 *
 * Recibe `ocr` (`useOcrMonto`) para disparar la lectura automática del
 * monto en cuanto se elige un archivo nuevo — mismo orden que antes:
 * primero se resetea el estado de OCR (`prepararNuevoArchivo`), después se
 * sube el archivo y se lanza la lectura.
 */
export function useComprobanteFoto(
  imagenPathInicial: string | null,
  ocr: OcrParaFoto,
): UseComprobanteFotoResult {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentFileRef = useRef<File | null>(null);
  const [imagenPath, setImagenPath] = useState<string | null>(imagenPathInicial);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewIsPdf, setPreviewIsPdf] = useState(
    imagenPathInicial ? isPdfPath(imagenPathInicial) : false,
  );
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Carga la signed URL de la imagen ya existente al editar (si el usuario
  // no eligió un archivo nuevo todavía).
  useEffect(() => {
    if (!imagenPathInicial) return;
    let cancelled = false;

    getSignedUrl(imagenPathInicial).then((url) => {
      if (!cancelled) setPreviewUrl(url);
    });

    return () => {
      cancelled = true;
    };
    // Solo al montar: si el usuario elige un archivo nuevo, el preview se
    // reemplaza directamente en handleFileChange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function uploadFile(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const path = await subirComprobante(file);
      setImagenPath(path);
    } catch (err) {
      setImagenPath(null);
      setUploadError(
        err instanceof Error
          ? err.message
          : "No se pudo subir el archivo. Probá de nuevo.",
      );
    } finally {
      setUploading(false);
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    currentFileRef.current = file;
    setFileName(file.name);
    setImagenPath(null);

    const isPdf = file.type === "application/pdf";
    setPreviewIsPdf(isPdf);
    setPreviewUrl((prev) => {
      if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return isPdf ? null : URL.createObjectURL(file);
    });

    const seq = ocr.prepararNuevoArchivo();
    void uploadFile(file);
    void ocr.runOcr(file, seq);
  }

  function handleRetryUpload() {
    if (currentFileRef.current) void uploadFile(currentFileRef.current);
  }

  return {
    cameraInputRef,
    fileInputRef,
    imagenPath,
    previewUrl,
    previewIsPdf,
    fileName,
    uploading,
    uploadError,
    handleFileChange,
    handleRetryUpload,
  };
}
