"use client";

import { useRouter } from "next/navigation";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { useConfirmacion } from "@/components/ui/use-confirmacion";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { mensajeEliminarMovimientoStock } from "@/lib/dominio/movimientos-stock";
import { createClient } from "@/lib/supabase/client";

type EliminarMovimientoStockAccionProps = {
  movimientoId: string;
  cantidad: number;
  /** Nombre del producto ("Botella 250 ml"). */
  producto: string;
  /** Fecha ("yyyy-mm-dd") del lote del que salió, o `null` sin lote. */
  fechaLote: string | null;
};

const ERRORES_ELIMINAR: Record<string, string> = {
  MOVIMIENTO_INVALIDO: "Este movimiento ya no existe.",
  MOVIMIENTO_NO_MANUAL:
    "Este movimiento viene de una venta, una entrega o un pedido: se corrige desde ahí, no se puede eliminar acá.",
  NO_AUTORIZADO: "No tenés permiso para esto.",
};

/**
 * "Eliminar" para un egreso manual de stock (`/stock/movimientos`) — mismo
 * patrón de botón + `BottomSheet` de confirmación que
 * `components/caja/eliminar-deposito-accion.tsx`. RPC admin-only
 * (`supabase/migrations/0072_eliminar_movimiento_stock.sql`); la fila se
 * guarda en `movimientos_stock_borrados` antes de borrarse.
 */
export function EliminarMovimientoStockAccion({
  movimientoId,
  cantidad,
  producto,
  fechaLote,
}: EliminarMovimientoStockAccionProps) {
  const router = useRouter();
  const confirmacion = useConfirmacion();

  function handleEliminar() {
    return confirmacion.confirmar(
      async () => {
        const supabase = createClient();
        const { error: rpcError } = await supabase.rpc("eliminar_movimiento_stock", {
          p_movimiento_id: movimientoId,
        });
        return rpcError ? traducirErrorRpc(rpcError.message, ERRORES_ELIMINAR, "No se pudo eliminar. Probá de nuevo.") : null;
      },
      { alExito: () => router.refresh() },
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={confirmacion.abrir}
        className="text-[13px] text-text-muted hover:text-accent"
      >
        Eliminar
      </button>

      <BottomSheet open={confirmacion.abierta} onClose={confirmacion.cancelar} ariaLabel="Eliminar movimiento de stock" variant="accent">
        <span className="text-[13px] font-medium text-accent">
          Eliminar movimiento
        </span>
        <p className="mt-3 text-[16px] text-text">
          {mensajeEliminarMovimientoStock(cantidad, producto, fechaLote)}
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
