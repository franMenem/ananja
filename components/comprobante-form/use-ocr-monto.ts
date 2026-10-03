"use client";

import { useRef, useState } from "react";

import { formatMontoDisplay } from "@/lib/money";
import type { Enums } from "@/lib/types";

type EstadoOcr = Enums<"estado_ocr">;

export type UseOcrMontoResult = {
  montoInput: string;
  handleMontoInputChange: (value: string) => void;
  ocrEstado: EstadoOcr;
  ocrMontoCentavos: number | null;
  montoAutocompletado: boolean;
  /** Resetea el estado de OCR para un archivo recién elegido y devuelve el
   * número de secuencia a pasarle a `runOcr` — llamar SIEMPRE antes de
   * `runOcr` para el mismo archivo (ver `useComprobanteFoto.handleFileChange`). */
  prepararNuevoArchivo: () => number;
  /** Lectura automática del monto (OCR, US6). El OCR propone, nunca
   * bloquea: cualquier fallo de /api/ocr-monto se traduce en estado
   * "fallido" sin ningún mensaje de error visible. Ver
   * contracts/api-routes.md § POST /api/ocr-monto. */
  runOcr: (file: File, seq: number) => Promise<void>;
};

/**
 * Estado y lógica de "Monto" + lectura automática por OCR de
 * `ComprobanteForm`. Viven juntos porque comparten `montoTocadoRef` (si el
 * usuario ya escribió algo o tocó el campo mientras esperábamos la
 * respuesta del OCR, no se pisa nada) y porque el OCR escribe directo en
 * `montoInput` cuando propone un valor. Extraído de
 * `components/comprobante-form.tsx` (subía las 1200 líneas).
 */
export function useOcrMonto(montoCentavosInicial: number | undefined): UseOcrMontoResult {
  const [ocrEstado, setOcrEstado] = useState<EstadoOcr>("no_intentado");
  const [ocrMontoCentavos, setOcrMontoCentavos] = useState<number | null>(null);
  const [montoAutocompletado, setMontoAutocompletado] = useState(false);
  const montoTocadoRef = useRef(false);
  const ocrRequestSeqRef = useRef(0);

  const [montoInput, setMontoInput] = useState(
    montoCentavosInicial !== undefined ? formatMontoDisplay(montoCentavosInicial) : "",
  );

  async function runOcr(file: File, seq: number) {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/ocr-monto", {
        method: "POST",
        body: formData,
      });

      // Si mientras tanto se eligió otro archivo, esta respuesta es vieja.
      if (seq !== ocrRequestSeqRef.current) return;

      if (!res.ok) {
        setOcrEstado("fallido");
        return;
      }

      const data = (await res.json().catch(() => null)) as {
        monto_centavos: number | null;
        confianza: "alta" | "baja" | null;
      } | null;

      if (seq !== ocrRequestSeqRef.current) return;

      if (!data || data.monto_centavos === null) {
        setOcrEstado("fallido");
        return;
      }

      const puedeAutocompletar =
        !montoTocadoRef.current && montoInput.trim() === "";

      if (puedeAutocompletar) {
        setOcrMontoCentavos(data.monto_centavos);
        setMontoInput(formatMontoDisplay(data.monto_centavos));
        setMontoAutocompletado(true);
        setOcrEstado("propuesto");
      }
      // Si el campo ya tenía un valor o el usuario lo tocó mientras
      // esperábamos la respuesta, no se pisa nada: el usuario ya resolvió
      // el monto por su cuenta.
    } catch (err) {
      if (seq !== ocrRequestSeqRef.current) return;
      console.error("[comprobante-form] fallo al leer el monto (OCR):", err);
      setOcrEstado("fallido");
    }
  }

  function handleMontoInputChange(value: string) {
    montoTocadoRef.current = true;
    setMontoInput(value);
    setMontoAutocompletado(false);
    if (ocrEstado === "propuesto") {
      setOcrEstado("corregido");
    }
  }

  function prepararNuevoArchivo(): number {
    // Nuevo archivo: cualquier lectura OCR previa queda obsoleta.
    montoTocadoRef.current = false;
    setMontoAutocompletado(false);
    setOcrEstado("no_intentado");
    setOcrMontoCentavos(null);
    return ++ocrRequestSeqRef.current;
  }

  return {
    montoInput,
    handleMontoInputChange,
    ocrEstado,
    ocrMontoCentavos,
    montoAutocompletado,
    prepararNuevoArchivo,
    runOcr,
  };
}
