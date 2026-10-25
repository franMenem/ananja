"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { eliminarPagoDeuda } from "@/lib/deudas";
import { formatMonto } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";

type PagoDeudaDeleteButtonProps = {
  pagoId: string;
  moneda: "USD" | "ARS";
  montoCentavos: number;
};

const ERRORES: Record<string, string> = {
  PAGO_NO_ENCONTRADO: "Este pago ya no existe.",
  NO_AUTORIZADO: "No tenés permiso para esto.",
};

/**
 * Botón + hoja inferior de confirmación para borrar un pago de deuda —
 * mismo patrón que `CobroDeleteButton` (`components/cobros/cobro-delete-button.tsx`):
 * si el pago borrado era el que saldaba la deuda, vuelve a quedar pendiente.
 */
export function PagoDeudaDeleteButton({
  pagoId,
  moneda,
  montoCentavos,
}: PagoDeudaDeleteButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);

    const supabase = createClient();
    const { error: rpcError } = await eliminarPagoDeuda(supabase, pagoId);

    if (rpcError) {
      setDeleting(false);
      setError(traducirErrorRpc(rpcError.message, ERRORES, "No se pudo eliminar el pago. Probá de nuevo."));
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

      <BottomSheet open={open} ariaLabel="Eliminar pago" variant="accent">
        <span className="text-[13px] font-medium text-accent">
          Eliminar pago
        </span>
        <p className="mt-3 text-[16px] text-text">
          Se elimina el pago de {formatMonto(moneda, montoCentavos)}. Si la
          deuda quedaba saldada por este pago, vuelve a quedar pendiente.
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
            className="min-h-11 flex-1 bg-accent px-4 text-[16px] font-medium text-background disabled:opacity-45"
          >
            Eliminar
          </BotonAccion>
        </div>
      </BottomSheet>
    </>
  );
}
