"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { useAccionRapida } from "@/components/tareas/use-accion-rapida";
import { createClient } from "@/lib/supabase/client";

const ERRORES: Record<string, string> = {
  NO_AUTORIZADO: "Este pago no te toca confirmarlo a vos.",
  PAGO_NO_ENCONTRADO: "No encontramos este pago.",
  PAGO_YA_RESUELTO: "Este pago ya fue confirmado o rechazado.",
  REVENDEDOR_INVALIDO: "Esta revendedora ya no está activa.",
  MEDIO_INVALIDO: "Ese medio de pago no corresponde para este destino.",
  MOTIVO_REQUERIDO: "Contale por qué lo rechazás.",
};

/**
 * Botones Confirmar / Rechazar de `/tareas/pagos/[id]` —
 * `confirmar_pago_revendedor` / `rechazar_pago_revendedor`
 * (0040_revendedores_pagos_precios.sql). Rechazar pide motivo (la
 * revendedora lo ve en `/mi`).
 */
export function ResolverPago({ pagoId, explicacion }: { pagoId: string; explicacion: string }) {
  const router = useRouter();
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const { guardando: saving, error, setError, ejecutar } = useAccionRapida();

  function volverATareas() {
    router.push("/tareas");
    router.refresh();
  }

  async function handleConfirmar() {
    const supabase = createClient();
    await ejecutar(async () => supabase.rpc("confirmar_pago_revendedor", { p_pago_id: pagoId }), {
      erroresPorCodigo: ERRORES,
      mensajeErrorGenerico: "No se pudo guardar. Probá de nuevo.",
      onExito: volverATareas,
    });
  }

  async function handleRechazar() {
    if (motivo.trim() === "") {
      setError("Contale por qué lo rechazás.");
      return;
    }
    const supabase = createClient();
    await ejecutar(
      async () => supabase.rpc("rechazar_pago_revendedor", { p_pago_id: pagoId, p_motivo: motivo.trim() }),
      {
        erroresPorCodigo: ERRORES,
        mensajeErrorGenerico: "No se pudo guardar. Probá de nuevo.",
        onExito: volverATareas,
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-text-muted">{explicacion}</p>

      {rechazando && (
        <div>
          <label htmlFor="motivo" className="text-[10px] tracking-[0.18em] text-text-muted uppercase">
            ¿Por qué lo rechazás?
          </label>
          <textarea
            id="motivo"
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            rows={2}
            placeholder="Ej.: no me llegó la transferencia"
            className="mt-1.5 min-h-[60px] w-full border border-border bg-surface px-3 py-2 text-base text-text focus:border-primary"
          />
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-accent">
          {error}
        </p>
      )}

      {rechazando ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <BotonAccion
            cargando={saving}
            textoCargando="Guardando…"
            type="button"
            onClick={handleRechazar}
            className="flex min-h-[52px] flex-[1.6] items-center justify-center bg-accent px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase disabled:opacity-45"
          >
            Rechazar pago
          </BotonAccion>
          <button
            type="button"
            onClick={() => {
              setRechazando(false);
              setError(null);
            }}
            disabled={saving}
            className="flex min-h-[52px] flex-1 items-center justify-center border border-border px-4 text-[13px] font-medium tracking-[0.14em] text-text-muted uppercase disabled:opacity-45"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <BotonAccion
            cargando={saving}
            textoCargando="Guardando…"
            type="button"
            onClick={handleConfirmar}
            className="flex min-h-[52px] flex-[1.6] items-center justify-center bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase hover:bg-primary-hover disabled:opacity-45"
          >
            Confirmar que lo recibí
          </BotonAccion>
          <button
            type="button"
            onClick={() => setRechazando(true)}
            disabled={saving}
            className="flex min-h-[52px] flex-1 items-center justify-center border border-accent px-4 text-[13px] font-medium tracking-[0.14em] text-accent uppercase disabled:opacity-45"
          >
            Rechazar
          </button>
        </div>
      )}
    </div>
  );
}
