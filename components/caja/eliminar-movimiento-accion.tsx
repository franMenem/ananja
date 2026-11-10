"use client";

import { useRouter } from "next/navigation";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { useConfirmacion } from "@/components/ui/use-confirmacion";
import { eliminarCobro } from "@/lib/cobros";
import { eliminarPagoDeuda } from "@/lib/deudas";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import {
  ERROR_ELIMINAR_GENERICO,
  ERRORES_ELIMINAR_MOVIMIENTO,
  mensajeEliminarMovimiento,
  tituloEliminar,
  type AccionEliminar,
} from "@/lib/dominio/eliminar-movimientos";
import { createClient } from "@/lib/supabase/client";

/**
 * "Eliminar" para una fila de cobro, pago de deuda o transferencia entre
 * cajas en las listas de movimientos de Plata. Mismo patrón que
 * `EliminarDepositoAccion`: botón de texto en la fila + `BottomSheet` con
 * "¿estás seguro?" que cuenta qué pasa con la plata, y refresca la lista al
 * terminar. Si la RPC todavía no existe en la base (código desplegado antes
 * que la migración 0091) muestra el error genérico, no rompe la pantalla.
 */
export function EliminarMovimientoAccion({
  id,
  accion,
  className,
}: {
  id: string;
  accion: AccionEliminar;
  className?: string;
}) {
  const router = useRouter();
  const confirmacion = useConfirmacion();
  const titulo = tituloEliminar(accion);

  function handleEliminar() {
    return confirmacion.confirmar(
      async () => {
        const supabase = createClient();
        const { error } =
          accion.tipo === "cobro"
            ? await eliminarCobro(supabase, id)
            : accion.tipo === "pago_deuda"
              ? await eliminarPagoDeuda(supabase, id)
              : await supabase.rpc("eliminar_transferencia_caja", { p_transferencia_id: id });
        return error
          ? traducirErrorRpc(error.message, ERRORES_ELIMINAR_MOVIMIENTO[accion.tipo], ERROR_ELIMINAR_GENERICO)
          : null;
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

      <BottomSheet open={confirmacion.abierta} onClose={confirmacion.cancelar} ariaLabel={titulo} variant="accent">
        <span className="text-[13px] font-medium text-accent">{titulo}</span>
        <p className="mt-3 text-[16px] text-text">{mensajeEliminarMovimiento(accion)}</p>
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
