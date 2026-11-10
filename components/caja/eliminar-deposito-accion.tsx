"use client";

import { useRouter } from "next/navigation";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { useConfirmacion } from "@/components/ui/use-confirmacion";
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
  const confirmacion = useConfirmacion();

  function handleEliminar() {
    return confirmacion.confirmar(
      async () => {
        const supabase = createClient();
        const { error: rpcError } = await supabase.rpc("eliminar_deposito_cuenta", {
          p_deposito_id: depositoId,
        });
        return rpcError ? traducirErrorRpc(rpcError.message, ERRORES_ELIMINAR, "No se pudo eliminar. Probá de nuevo.") : null;
      },
      { alExito: () => router.refresh() },
    );
  }

  return (
    <>
      <div className={className ?? "flex gap-3"}>
        <button
          type="button"
          onClick={confirmacion.abrir}
          className="inline-flex min-h-11 items-center text-[14px] text-text-muted hover:text-accent"
        >
          Eliminar
        </button>
      </div>

      <BottomSheet open={confirmacion.abierta} ariaLabel="Eliminar depósito" variant="accent">
        <span className="text-[13px] font-medium text-accent">
          Eliminar depósito
        </span>
        <p className="mt-3 text-[16px] text-text">
          {mensajeEliminarDeposito(tenedor, medioPago, montoCentavos)}
        </p>
        {confirmacion.error && (
          <p role="alert" className="mt-2 text-[14px] text-accent">
            {confirmacion.error}
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={confirmacion.cancelar}
            disabled={confirmacion.ocupada}
            className="min-h-11 flex-1 border border-primary px-4 text-[16px] font-medium text-primary disabled:opacity-45 rounded-xl"
          >
            Cancelar
          </button>
          <BotonAccion
            cargando={confirmacion.ocupada}
            textoCargando="Eliminando…"
            type="button"
            onClick={() => void handleEliminar()}
            className="min-h-11 flex-1 bg-accent px-4 text-[16px] font-medium text-primary-foreground disabled:opacity-45"
          >
            Eliminar
          </BotonAccion>
        </div>
      </BottomSheet>
    </>
  );
}
