"use client";

import { useRouter } from "next/navigation";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { useConfirmacion } from "@/components/ui/use-confirmacion";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { mensajeEliminarAjusteInsumo } from "@/lib/dominio/insumos";
import { createClient } from "@/lib/supabase/client";

const ERRORES: Record<string, string> = {
  MOVIMIENTO_INVALIDO: "Este ajuste ya no existe.",
  MOVIMIENTO_NO_MANUAL: "Este movimiento viene de una compra o de un pedido: se corrige desde ahí.",
  STOCK_INSUFICIENTE: "No se puede eliminar: el stock quedaría en negativo.",
  NO_AUTORIZADO: "No tenés permiso para esto.",
};

/**
 * "Eliminar" de un ajuste manual en el historial de `/stock/insumos/[id]`
 * (RPC `eliminar_ajuste_insumo`, 0091). La pantalla solo lo ofrece para
 * movimientos sin compra ni pedido (`esAjusteInsumoEliminable`); la RPC lo
 * vuelve a chequear y rechaza si el stock quedaría negativo.
 */
export function EliminarAjusteInsumoAccion({
  movimientoId,
  tipo,
  cantidad,
  unidad,
  nombreInsumo,
}: {
  movimientoId: string;
  tipo: "ingreso" | "egreso";
  cantidad: number;
  unidad: string;
  nombreInsumo: string;
}) {
  const router = useRouter();
  const confirmacion = useConfirmacion();

  function handleEliminar() {
    return confirmacion.confirmar(
      async () => {
        const supabase = createClient();
        const { error } = await supabase.rpc("eliminar_ajuste_insumo", { p_movimiento_id: movimientoId });
        return error ? traducirErrorRpc(error.message, ERRORES, "No se pudo eliminar el ajuste. Probá de nuevo.") : null;
      },
      { alExito: () => router.refresh() },
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={confirmacion.abrir}
        className="inline-flex min-h-11 items-center self-start text-[14px] text-text-muted hover:text-accent"
      >
        Eliminar
      </button>

      <BottomSheet open={confirmacion.abierta} onClose={confirmacion.cancelar} ariaLabel="Eliminar ajuste" variant="accent">
        <span className="text-[13px] font-medium text-accent">Eliminar ajuste</span>
        <p className="mt-3 text-[16px] text-text">{mensajeEliminarAjusteInsumo(tipo, cantidad, unidad, nombreInsumo)}</p>
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
