"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { eliminarVentaRevendedor } from "@/lib/revendedores";
import { createClient } from "@/lib/supabase/client";

const ERRORES: Record<string, string> = {
  VENTA_NO_ENCONTRADA: "No encontramos esta venta.",
  NO_AUTORIZADO: "No tenés permiso para borrar esta venta.",
};

/**
 * Botón + confirmación para borrar una venta entera (`eliminar_venta_revendedor`)
 * — usado en `/mi/ventas/[id]` (la revendedora, solo ventas que cargó ella)
 * y en `/revendedores/[id]` (un admin, cualquier venta). Mismo patrón de
 * `BottomSheet` de confirmación que `AsignarRolButton`/`PrecioRevendedorRow`,
 * variante `accent` por ser destructiva (design/handoff README § Modales).
 */
export function EliminarVentaButton({
  ventaId,
  redirectHref = "/mi/ventas",
}: {
  ventaId: string;
  /** Adónde ir después de borrar; `null` = quedarse y refrescar. */
  redirectHref?: string | null;
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
      setError(traducirErrorRpc(rpcError.message, ERRORES, "No se pudo borrar la venta. Probá de nuevo."));
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
        className="text-[11px] tracking-[0.14em] text-accent uppercase"
      >
        Borrar venta
      </button>

      <BottomSheet open={open} ariaLabel="Borrar esta venta" variant="accent">
        <h2 className="font-display text-[24px] text-primary">¿Borrar esta venta?</h2>
        <p className="mt-2 text-sm text-text-muted">No se puede deshacer.</p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-accent">
            {error}
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <BotonAccion
            cargando={saving}
            textoCargando="Borrando…"
            type="button"
            onClick={handleConfirmar}
            className="min-h-11 flex-[1.6] bg-accent px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase disabled:opacity-45"
          >
            Sí, borrar
          </BotonAccion>
          <button
            type="button"
            onClick={() => !saving && setOpen(false)}
            disabled={saving}
            className="min-h-11 flex-1 border border-border px-4 text-[13px] font-medium tracking-[0.14em] text-text-muted uppercase disabled:opacity-45"
          >
            Cancelar
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
