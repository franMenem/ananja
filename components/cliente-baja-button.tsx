"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { createClient } from "@/lib/supabase/client";

type ClienteBajaButtonProps = {
  clienteId: string;
  /** Para el texto de la confirmación. */
  nombre: string;
  activo: boolean;
};

/**
 * Baja/reactivación lógica de un cliente (US7 — igual criterio que
 * `vendedores`: nunca se borra si tiene comprobantes asociados, así que no
 * hay delete, solo el flag `activo`). Pide confirmación en una hoja
 * inferior (acento para la baja, normal para reactivar).
 */
export function ClienteBajaButton({ clienteId, nombre, activo }: ClienteBajaButtonProps) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle() {
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("clientes")
      .update({ activo: !activo })
      .eq("id", clienteId);

    setSaving(false);

    if (updateError) {
      setError("No se pudo actualizar. Probá de nuevo.");
      return;
    }

    setConfirmando(false);
    router.refresh();
  }

  const titulo = activo ? `¿Dar de baja a ${nombre}?` : `¿Reactivar a ${nombre}?`;

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => {
          setError(null);
          setConfirmando(true);
        }}
        className={`min-h-11 w-full border px-4 text-xs font-medium tracking-[0.1em] uppercase ${
          activo ? "border-accent text-accent" : "border-border text-text"
        }`}
      >
        {activo ? "Dar de baja" : "Reactivar"}
      </button>

      <BottomSheet open={confirmando} ariaLabel={titulo} variant={activo ? "accent" : "mark"}>
        <h2 className="font-display text-[24px] leading-[1.25] text-primary">{titulo}</h2>
        <p className="mt-2 text-sm text-text-muted">
          {activo
            ? "Deja de aparecer para elegirlo en ventas nuevas. Sus ventas quedan guardadas y lo podés reactivar cuando quieras."
            : "Vuelve a aparecer para elegirlo en ventas nuevas."}
        </p>

        {error && (
          <p role="alert" className="mt-3 text-sm text-accent">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <BotonAccion
            cargando={saving}
            textoCargando="Guardando…"
            onClick={() => void handleToggle()}
            className={`min-h-11 flex-[1.6] px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase disabled:opacity-45 ${
              activo ? "bg-accent" : "bg-primary hover:bg-primary-hover"
            }`}
          >
            {activo ? "Sí, dar de baja" : "Sí, reactivar"}
          </BotonAccion>
          <button
            type="button"
            onClick={() => !saving && setConfirmando(false)}
            disabled={saving}
            className="min-h-11 flex-1 border border-border px-4 text-[13px] font-medium tracking-[0.14em] text-text-muted uppercase disabled:opacity-45"
          >
            Volver
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
