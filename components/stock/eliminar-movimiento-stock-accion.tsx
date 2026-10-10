"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
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
    "Este movimiento viene de una venta, una entrega o un lote: se corrige desde ahí, no se puede eliminar acá.",
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
      const { error: rpcError } = await supabase.rpc("eliminar_movimiento_stock", {
        p_movimiento_id: movimientoId,
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
      <button
        type="button"
        onClick={abrir}
        className="text-[11px] tracking-[0.12em] text-text-muted uppercase hover:text-accent"
      >
        Eliminar
      </button>

      <BottomSheet open={abierto} ariaLabel="Eliminar movimiento de stock" variant="accent">
        <span className="text-[10px] font-medium tracking-[0.18em] text-accent uppercase">
          Eliminar movimiento
        </span>
        <p className="mt-3 text-[15px] text-text">
          {mensajeEliminarMovimientoStock(cantidad, producto, fechaLote)}
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
