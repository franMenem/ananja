"use client";

import { useRouter } from "next/navigation";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { useConfirmacion } from "@/components/ui/use-confirmacion";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { formatMonto } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";

const ERRORES: Record<string, string> = {
  DEUDA_NO_ENCONTRADA: "Esta deuda ya no existe.",
  DEUDA_DE_PEDIDO: "Esta deuda sale de un pedido: se corrige desde el pedido.",
  DEUDA_CON_PAGOS: "Esta deuda tiene pagos: primero eliminá sus pagos.",
  NO_AUTORIZADO: "No tenés permiso para esto.",
};

/**
 * "Eliminar deuda" de `/plata/deudas`, para una deuda cargada a mano y sin
 * pagos (RPC `eliminar_deuda`, 0091). La pantalla solo lo ofrece si
 * `puedeEliminarDeuda`; la RPC lo vuelve a chequear. Mismo patrón de botón +
 * `BottomSheet` que `EliminarDepositoAccion`.
 */
export function EliminarDeudaButton({
  deudaId,
  descripcion,
  moneda,
  montoCentavos,
}: {
  deudaId: string;
  descripcion: string;
  moneda: "USD" | "ARS";
  montoCentavos: number;
}) {
  const router = useRouter();
  const confirmacion = useConfirmacion();

  function handleEliminar() {
    return confirmacion.confirmar(
      async () => {
        const supabase = createClient();
        const { error } = await supabase.rpc("eliminar_deuda", { p_deuda_id: deudaId });
        return error ? traducirErrorRpc(error.message, ERRORES, "No se pudo eliminar la deuda. Probá de nuevo.") : null;
      },
      { alExito: () => router.refresh() },
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={confirmacion.abrir}
        className="inline-flex min-h-11 items-center text-[14px] text-text-muted hover:text-accent"
      >
        Eliminar deuda
      </button>

      <BottomSheet open={confirmacion.abierta} onClose={confirmacion.cancelar} ariaLabel="Eliminar deuda" variant="accent">
        <span className="text-[13px] font-medium text-accent">Eliminar deuda</span>
        <p className="mt-3 text-[16px] text-text">
          Se va a borrar la deuda «{descripcion}» de {formatMonto(moneda, montoCentavos)}. Deja de figurar como algo
          que Ananja debe. No mueve plata de ninguna cuenta.
        </p>
        <p className="mt-2 text-[16px] text-text-muted">¿Estás seguro?</p>
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
