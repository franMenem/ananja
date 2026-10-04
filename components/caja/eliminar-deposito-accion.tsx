"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { mensajeEliminarDeposito, type MedioPago } from "@/lib/dominio/caja";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { createClient } from "@/lib/supabase/client";

type EliminarDepositoAccionProps = {
  depositoId: string;
  medioPago: MedioPago;
  montoCentavos: number;
  /** Nombre de quien tenía la plata (a quien le vuelve al borrar). */
  tenedor: string;
  className?: string;
};

const ERRORES_ELIMINAR: Record<string, string> = {
  DEPOSITO_INVALIDO: "Este depósito ya no existe.",
  DEPOSITO_CON_AVISO:
    "Este depósito viene de un aviso confirmado de un coordinador, no se puede eliminar.",
  NO_AUTORIZADO: "No tenés permiso para esto.",
};

/**
 * "Eliminar" para una fila de `depositos_cuenta` ("pasó a la cuenta") —
 * mismo patrón de botón + `BottomSheet` de confirmación que
 * `AjusteCajaAcciones`, sin "Editar": un depósito mal cargado se elimina y
 * se vuelve a cargar. RPC admin-only
 * (`supabase/migrations/0070_eliminar_deposito_cuenta.sql`).
 */
export function EliminarDepositoAccion({
  depositoId,
  medioPago,
  montoCentavos,
  tenedor,
  className,
}: EliminarDepositoAccionProps) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function abrir() {
    setError(null);
    setAbierto(true);
  }

  function cerrar() {
    if (saving) return;
    setAbierto(false);
    setError(null);
  }

  async function handleEliminar() {
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc("eliminar_deposito_cuenta", {
        p_deposito_id: depositoId,
      });

      if (rpcError) {
        setError(traducirErrorRpc(rpcError.message, ERRORES_ELIMINAR, "No se pudo eliminar. Probá de nuevo."));
        setSaving(false);
        return;
      }

      setSaving(false);
      setAbierto(false);
      router.refresh();
    } catch {
      setSaving(false);
      setError("No se pudo conectar. Verificá tu conexión e intentá de nuevo.");
    }
  }

  return (
    <>
      <div className={className ?? "flex gap-3"}>
        <button
          type="button"
          onClick={abrir}
          className="text-[11px] tracking-[0.12em] text-text-muted uppercase hover:text-accent"
        >
          Eliminar
        </button>
      </div>

      <BottomSheet open={abierto} ariaLabel="Eliminar depósito" variant="accent">
        <span className="text-[10px] font-medium tracking-[0.18em] text-accent uppercase">
          Eliminar depósito
        </span>
        <p className="mt-3 text-[15px] text-text">
          {mensajeEliminarDeposito(tenedor, medioPago, montoCentavos)}
        </p>
        {error && (
          <p role="alert" className="mt-2 text-xs text-accent">
            {error}
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={cerrar}
            disabled={saving}
            className="min-h-11 flex-1 border border-primary px-4 text-[13px] font-medium tracking-[0.14em] text-primary uppercase disabled:opacity-45"
          >
            Cancelar
          </button>
          <BotonAccion
            cargando={saving}
            textoCargando="Eliminando…"
            type="button"
            onClick={() => void handleEliminar()}
            className="min-h-11 flex-1 bg-accent px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase disabled:opacity-45"
          >
            Eliminar
          </BotonAccion>
        </div>
      </BottomSheet>
    </>
  );
}
