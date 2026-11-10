"use client";

import { BOTON_SECUNDARIO } from "@/components/ui/boton";
import { useRouter } from "next/navigation";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { useConfirmacion } from "@/components/ui/use-confirmacion";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { ERRORES_ELIMINAR_VENTA, textoEliminarVentaCoordinadora } from "@/lib/dominio/venta-coordinador";
import { eliminarVentaRevendedor } from "@/lib/revendedores";
import { createClient } from "@/lib/supabase/client";

/**
 * Botón + confirmación para borrar una venta entera (`eliminar_venta_revendedor`)
 * — usado en `/mi/ventas/[id]` (la revendedora, solo ventas que cargó ella)
 * y en `/revendedores/[id]` (un admin, cualquier venta). Mismo patrón de
 * `BottomSheet` de confirmación que `AsignarRolButton`/`PrecioRevendedorRow`,
 * variante `accent` por ser destructiva (design/handoff README § Modales).
 *
 * `ventaCoordinadora` (0073): la venta propia de una coordinadora ("vendió N
 * botellas") — al borrarla las botellas vuelven al depósito y se le descuenta
 * de lo que tiene que pasar a Ananja; si esa plata ya se pasó (o está
 * avisada) el servidor responde `YA_PASO_LA_PLATA` y no se borra nada.
 */
export function EliminarVentaButton({
  ventaId,
  redirectHref = "/mi/ventas",
  ventaCoordinadora,
}: {
  ventaId: string;
  /** Adónde ir después de borrar; `null` = quedarse y refrescar. */
  redirectHref?: string | null;
  /** Es la venta propia de una coordinadora (nombre para el texto de la
   * confirmación); sin esto, una venta de revendedora de siempre. */
  ventaCoordinadora?: { nombre: string };
}) {
  const router = useRouter();
  const confirmacion = useConfirmacion();

  function handleConfirmar() {
    return confirmacion.confirmar(
      async () => {
        const supabase = createClient();
        const { error: rpcError } = await eliminarVentaRevendedor(supabase, ventaId);
        return rpcError
          ? traducirErrorRpc(rpcError.message, ERRORES_ELIMINAR_VENTA, "No se pudo borrar la venta. Probá de nuevo.")
          : null;
      },
      {
        // Con redirect navega afuera: queda ocupado hasta que la navegación tome el relevo.
        seguirOcupada: Boolean(redirectHref),
        alExito: () => {
          if (redirectHref) router.push(redirectHref);
          router.refresh();
        },
      },
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={confirmacion.abrir}
        className="inline-flex min-h-11 items-center text-[14px] text-accent"
      >
        Borrar venta
      </button>

      <BottomSheet open={confirmacion.abierta} ariaLabel="Borrar esta venta" variant="accent">
        <h2 className="font-display text-[24px] text-text">¿Borrar esta venta?</h2>
        <p className="mt-2 text-[16px] text-text-muted">
          {ventaCoordinadora ? textoEliminarVentaCoordinadora(ventaCoordinadora.nombre) : "No se puede deshacer."}
        </p>
        {confirmacion.error && (
          <p role="alert" className="mt-3 text-[16px] text-accent">
            {confirmacion.error}
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <BotonAccion
            cargando={confirmacion.ocupada}
            textoCargando="Borrando…"
            type="button"
            onClick={() => void handleConfirmar()}
            className="min-h-11 flex-[1.6] bg-accent px-4 text-[16px] font-medium text-primary-foreground disabled:opacity-45"
          >
            Sí, borrar
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
