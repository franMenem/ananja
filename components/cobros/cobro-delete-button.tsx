"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { eliminarCobro } from "@/lib/cobros";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { formatCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";

type CobroDeleteButtonProps = {
  cobroId: string;
  montoCentavos: number;
};

const ERRORES: Record<string, string> = {
  COBRO_NO_ENCONTRADO: "Este cobro ya no existe.",
  NO_AUTORIZADO: "No tenés permiso para esto.",
};

/**
 * Botón + hoja inferior de confirmación para borrar un cobro — mismo
 * patrón que `ComprobanteDeleteButton` (design/handoff README § Modales): la deuda de la
 * venta que lo originó vuelve a subir por el monto eliminado.
 */
export function CobroDeleteButton({ cobroId, montoCentavos }: CobroDeleteButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);

    const supabase = createClient();
    const { error: rpcError } = await eliminarCobro(supabase, cobroId);

    if (rpcError) {
      setDeleting(false);
      setError(traducirErrorRpc(rpcError.message, ERRORES, "No se pudo eliminar el cobro. Probá de nuevo."));
      return;
    }

    setOpen(false);
    setDeleting(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative text-[13px] text-text-muted before:absolute before:inset-x-[-8px] before:inset-y-[-14px] before:content-[''] hover:text-accent"
      >
        Eliminar
      </button>

      <BottomSheet open={open} ariaLabel="Eliminar cobro" variant="accent">
        <span className="text-[13px] font-medium text-accent">
          Eliminar cobro
        </span>
        <p className="mt-3 text-[16px] text-text">
          Se elimina el cobro de {formatCentavos(montoCentavos)}. La deuda de la
          venta vuelve a subir por ese monto.
        </p>
        {error && (
          <p role="alert" className="mt-2 text-[14px] text-accent">
            {error}
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={deleting}
            className="min-h-11 flex-1 border border-primary px-4 text-[16px] font-medium text-primary disabled:opacity-45 rounded-xl"
          >
            Cancelar
          </button>
          <BotonAccion
            cargando={deleting}
            textoCargando="Eliminando…"
            type="button"
            onClick={() => void handleDelete()}
            className="min-h-11 flex-1 bg-accent px-4 text-[16px] font-medium text-primary-foreground disabled:opacity-45"
          >
            Eliminar
          </BotonAccion>
        </div>
      </BottomSheet>
    </>
  );
}
