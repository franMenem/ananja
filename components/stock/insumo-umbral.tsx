"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { BotonAccion } from "@/components/boton-accion";
import { MontoInput } from "@/components/monto-input";
import { textoInicialCampoNumerico } from "@/lib/dominio/campo-numerico";
import { formatNumeroInsumo } from "@/lib/dominio/insumos";
import { actualizarUmbralInsumo } from "@/lib/insumos";
import { parseCantidadInput } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";

type InsumoUmbralProps = {
  insumoId: string;
  umbralMinimo: number;
};

/**
 * Edición inline del umbral mínimo de un insumo (`/stock/insumos/[id]`) —
 * mismo patrón de campo + "Ok"/"Cancelar" con subrayado punteado que
 * `components/stock/stock-card.tsx` § umbral. El campo es un `MontoInput`
 * de cantidad (hasta 3 decimales, acepta cuentas): se precarga con
 * `textoInicialCampoNumerico` y no con `String(umbral)`, porque "1.125" se
 * leería como mil ciento veinticinco.
 */
export function InsumoUmbral({ insumoId, umbralMinimo }: InsumoUmbralProps) {
  const router = useRouter();

  const textoInicial = textoInicialCampoNumerico(umbralMinimo, "cantidad");
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(textoInicial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    // `null` si está vacío, es negativo o es una cuenta sin terminar.
    const valor = parseCantidadInput(input);
    if (valor === null) {
      setError("Umbral inválido.");
      return;
    }

    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await actualizarUmbralInsumo(
      supabase,
      insumoId,
      valor,
    );
    setSaving(false);

    if (updateError) {
      setError("No se pudo guardar el umbral.");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <div className={`flex flex-wrap gap-1.5 text-[13px] ${editing ? "items-start" : "items-center"}`}>
      <span className={`text-text-muted ${editing ? "flex min-h-11 items-center" : ""}`}>
        Umbral mínimo
      </span>
      {editing ? (
        <span className="flex items-start gap-1.5">
          <MontoInput
            ariaLabel="Umbral mínimo"
            tipo="cantidad"
            autoFocus
            value={input}
            onChange={setInput}
            className="w-44"
            cajaClassName="flex items-center border border-border bg-surface px-1.5 focus-within:border-primary"
            inputClassName="min-h-11 w-full min-w-0 bg-transparent text-right text-base text-text tabular-nums focus:outline-none"
          />
          <BotonAccion
            onClick={guardar}
            cargando={saving}
            className="min-h-11 bg-primary px-2 text-[10px] font-medium tracking-[0.06em] text-background uppercase disabled:opacity-45"
          >
            Ok
          </BotonAccion>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setInput(textoInicial);
              setError(null);
            }}
            className="min-h-11 px-1 text-[10px] text-text-muted uppercase"
          >
            Cancelar
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => {
            setInput(textoInicial);
            setEditing(true);
          }}
          className="border-b border-dotted border-text-muted text-text tabular-nums"
        >
          {formatNumeroInsumo(umbralMinimo)}
        </button>
      )}
      {error && (
        <span role="alert" className="text-accent">
          {error}
        </span>
      )}
    </div>
  );
}
