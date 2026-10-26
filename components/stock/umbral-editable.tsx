"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { MontoInput } from "@/components/monto-input";
import { BOTON_PRIMARIO } from "@/components/ui/boton";
import { parseEnteroInput } from "@/lib/dominio/calculo-monto";
import { textoInicialCampoNumerico } from "@/lib/dominio/campo-numerico";
import { createClient } from "@/lib/supabase/client";

/**
 * Mínimo de botellas de una presentación, editable en el lugar (única
 * columna de `productos` que RLS deja actualizar al cliente). Es la edición
 * que antes vivía en la tarjeta de stock; no cambia la lógica, solo dónde se ve.
 */
export function UmbralEditable({ productoId, umbralMinimo }: { productoId: string; umbralMinimo: number }) {
  const router = useRouter();

  const [editando, setEditando] = useState(false);
  const [umbralInput, setUmbralInput] = useState(textoInicialCampoNumerico(umbralMinimo, "entero"));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    // `null` también para una cuenta sin terminar ("10+") o texto que no se
    // entiende: nunca se guarda como si estuviera vacío.
    const umbral = parseEnteroInput(umbralInput);
    if (umbral === null || umbral < 0) {
      setError("Umbral inválido.");
      return;
    }

    setGuardando(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase.from("productos").update({ umbral_minimo: umbral }).eq("id", productoId);
    setGuardando(false);

    if (updateError) {
      setError("No se pudo guardar el umbral.");
      return;
    }
    setEditando(false);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px]">
      <span className={editando ? "flex min-h-11 items-center text-text-muted" : "text-text-muted"}>
        Avisar cuando queden menos de
      </span>
      {editando ? (
        <span className="flex flex-wrap items-start gap-1.5">
          <MontoInput
            ariaLabel="Umbral mínimo"
            tipo="entero"
            simbolo={null}
            autoFocus
            value={umbralInput}
            onChange={setUmbralInput}
            className="w-44"
            cajaClassName="flex items-center border border-border bg-surface px-1.5 focus-within:border-primary"
            inputClassName="min-h-11 w-full min-w-0 bg-transparent text-right text-base text-text tabular-nums focus:outline-none"
          />
          <BotonAccion onClick={guardar} cargando={guardando} className={`${BOTON_PRIMARIO} px-3`}>
            Guardar
          </BotonAccion>
          <button
            type="button"
            onClick={() => {
              setEditando(false);
              setUmbralInput(textoInicialCampoNumerico(umbralMinimo, "entero"));
              setError(null);
            }}
            className="min-h-11 px-2 text-[14px] text-text-muted"
          >
            Cancelar
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="inline-flex min-h-11 items-center whitespace-nowrap border-b border-dotted border-text-muted text-text tabular-nums"
        >
          {umbralMinimo}
        </button>
      )}
      {error && (
        <p role="alert" className="w-full text-accent">
          {error}
        </p>
      )}
    </div>
  );
}
