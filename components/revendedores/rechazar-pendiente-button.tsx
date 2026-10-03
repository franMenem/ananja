"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { createClient } from "@/lib/supabase/client";

type RechazarPendienteButtonProps = {
  vendedorId: string;
  nombre: string;
  className?: string;
};

const ERRORES: Record<string, string> = {
  NO_AUTORIZADO: "No tenés permiso para esto.",
  VENDEDOR_INVALIDO: "No encontramos a esa persona.",
  NO_PENDIENTE: "Esa persona ya no está pendiente de aprobación.",
};

/**
 * Botón + confirmación para `rechazar_pendiente`
 * (0026_roles_pendiente_espacio_revendedor.sql) — usado en la tabla
 * "Pendientes de aprobación" de `/revendedores`. Deja al usuario
 * `activo = false` (mismo criterio que cualquier baja de vendedor, sin
 * autoservicio de reactivación): variante `accent` del `BottomSheet` por
 * ser una acción destructiva, mismo patrón que `EliminarVentaButton`.
 */
export function RechazarPendienteButton({
  vendedorId,
  nombre,
  className,
}: RechazarPendienteButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titulo = `¿Rechazar a ${nombre}?`;

  async function handleConfirmar() {
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("rechazar_pendiente", {
      p_vendedor_id: vendedorId,
    });

    if (rpcError) {
      setError(traducirErrorRpc(rpcError.message, ERRORES, "No se pudo rechazar. Probá de nuevo."));
      setSaving(false);
      return;
    }

    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "flex min-h-11 items-center justify-center border border-border px-4 text-[13px] font-medium tracking-[0.12em] text-text-muted uppercase hover:border-accent hover:text-accent"
        }
      >
        Rechazar
      </button>

      <BottomSheet open={open} ariaLabel={titulo} variant="accent">
        <h2 className="font-display text-[24px] text-primary">{titulo}</h2>
        <p className="mt-2 text-sm text-text-muted">
          Va a quedar desactivado, sin acceso a la app.
        </p>

        {error && (
          <p role="alert" className="mt-3 text-sm text-accent">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <BotonAccion
            cargando={saving}
            textoCargando="Guardando…"
            type="button"
            onClick={handleConfirmar}
            className="min-h-11 flex-[1.6] bg-accent px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase disabled:opacity-45"
          >
            Sí, rechazar
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
