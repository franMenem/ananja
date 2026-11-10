"use client";

import { useRouter } from "next/navigation";

import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "@/components/ui/boton";
import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { useConfirmacion } from "@/components/ui/use-confirmacion";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { formatMonto } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";

const ERRORES: Record<string, string> = {
  DEUDA_NO_ENCONTRADA: "Esta deuda ya no existe.",
  DEUDA_DE_PEDIDO: "Esta deuda sale de un pedido: se corrige desde el pedido.",
  DEUDA_NO_SALDADA: "Esta deuda ya no está saldada.",
  DEUDA_PAGADA_COMPLETA: "Esta deuda quedó saldada por sus pagos: para reabrirla eliminá un pago.",
  NO_AUTORIZADO: "No tenés permiso para esto.",
};

/**
 * "Volver a deber" de una deuda marcada saldada SIN pago (RPC
 * `reabrir_deuda`, 0091): deshace `MarcarSaldadaButton`. La pantalla solo lo
 * ofrece si `puedeReabrirDeuda`; la RPC lo vuelve a chequear.
 */
export function ReabrirDeudaButton({
  deudaId,
  descripcion,
  moneda,
  restanteCentavos,
}: {
  deudaId: string;
  descripcion: string;
  moneda: "USD" | "ARS";
  restanteCentavos: number;
}) {
  const router = useRouter();
  const confirmacion = useConfirmacion();

  function handleReabrir() {
    return confirmacion.confirmar(
      async () => {
        const supabase = createClient();
        const { error } = await supabase.rpc("reabrir_deuda", { p_deuda_id: deudaId });
        return error ? traducirErrorRpc(error.message, ERRORES, "No se pudo reabrir la deuda. Probá de nuevo.") : null;
      },
      { alExito: () => router.refresh() },
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={confirmacion.abrir}
        className="inline-flex min-h-11 items-center text-[14px] text-text-muted hover:text-primary"
      >
        Volver a deber
      </button>

      <BottomSheet open={confirmacion.abierta} onClose={confirmacion.cancelar} ariaLabel="Reabrir deuda" variant="mark">
        <h2 className="font-display text-[26px] text-text">¿Volver a deber?</h2>
        <p className="mt-2 text-[16px] text-text">
          La deuda «{descripcion}» vuelve a quedar pendiente: resta {formatMonto(moneda, restanteCentavos)}. No mueve
          plata de ninguna cuenta.
        </p>
        <p className="mt-2 text-[16px] text-text-muted">¿Estás seguro?</p>
        {confirmacion.error && (
          <p role="alert" className="mt-3 text-[16px] text-accent">
            {confirmacion.error}
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <BotonAccion
            cargando={confirmacion.ocupada}
            textoCargando="Guardando…"
            type="button"
            onClick={() => void handleReabrir()}
            className={`${BOTON_PRIMARIO} flex-1 px-4`}
          >
            Confirmar
          </BotonAccion>
          <button
            type="button"
            onClick={confirmacion.cancelar}
            disabled={confirmacion.ocupada}
            className={`${BOTON_SECUNDARIO} flex-1 px-4`}
          >
            Cancelar
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
