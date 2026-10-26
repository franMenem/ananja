"use client";

import { BOTON_SECUNDARIO } from "@/components/ui/boton";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
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
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirmar() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await eliminarVentaRevendedor(supabase, ventaId);

    if (rpcError) {
      setError(traducirErrorRpc(rpcError.message, ERRORES_ELIMINAR_VENTA, "No se pudo borrar la venta. Probá de nuevo."));
      setSaving(false);
      return;
    }

    setSaving(false);
    setOpen(false);
    if (redirectHref) router.push(redirectHref);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center text-[14px] text-accent"
      >
        Borrar venta
      </button>

      <BottomSheet open={open} ariaLabel="Borrar esta venta" variant="accent">
        <h2 className="font-display text-[24px] text-text">¿Borrar esta venta?</h2>
        <p className="mt-2 text-[16px] text-text-muted">
          {ventaCoordinadora ? textoEliminarVentaCoordinadora(ventaCoordinadora.nombre) : "No se puede deshacer."}
        </p>
        {error && (
          <p role="alert" className="mt-3 text-[16px] text-accent">
            {error}
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <BotonAccion
            cargando={saving}
            textoCargando="Borrando…"
            type="button"
            onClick={handleConfirmar}
            className="min-h-11 flex-[1.6] bg-accent px-4 text-[16px] font-medium text-primary-foreground disabled:opacity-45"
          >
            Sí, borrar
          </BotonAccion>
          <button
            type="button"
            onClick={() => !saving && setOpen(false)}
            disabled={saving}
            className={`${BOTON_SECUNDARIO} flex-1 px-4`}
          >
            Cancelar
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
