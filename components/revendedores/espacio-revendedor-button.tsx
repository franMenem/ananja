"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { createClient } from "@/lib/supabase/client";

type EspacioRevendedorButtonProps = {
  vendedorId: string;
  nombre: string;
  /** `true` para habilitar el espacio, `false` para deshabilitarlo. */
  habilitar: boolean;
  className?: string;
};

const ERRORES: Record<string, string> = {
  NO_AUTORIZADO: "No tenés permiso para esto.",
  ADMIN_INVALIDO: "Ese usuario no es un admin activo.",
};

const COPY = {
  true: {
    boton: "Habilitar",
    cuerpo:
      "Va a poder entrar a /mi con \"Ver como revendedor\" y operar con sus propios datos: entregas, ventas y rendiciones.",
    confirmar: "Sí, habilitar",
  },
  false: {
    boton: "Deshabilitar",
    cuerpo: "Ya no va a poder entrar a /mi.",
    confirmar: "Sí, deshabilitar",
  },
} as const;

/**
 * Botón + confirmación para `fijar_espacio_revendedor`
 * (0026_roles_pendiente_espacio_revendedor.sql) — usado en la tabla
 * "Admins" de `/revendedores` (y en el detalle de un admin con espacio
 * propio, para deshabilitarlo). Un admin puede habilitárselo a sí mismo.
 */
export function EspacioRevendedorButton({
  vendedorId,
  nombre,
  habilitar,
  className,
}: EspacioRevendedorButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[habilitar ? "true" : "false"];
  const titulo = `¿${copy.boton} el espacio de revendedor de ${nombre}?`;

  async function handleConfirmar() {
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("fijar_espacio_revendedor", {
      p_vendedor_id: vendedorId,
      p_habilitar: habilitar,
    });

    if (rpcError) {
      setError(traducirErrorRpc(rpcError.message, ERRORES, "No se pudo guardar. Probá de nuevo."));
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
          "flex min-h-11 items-center justify-center border border-border px-4 text-[13px] font-medium tracking-[0.12em] text-text uppercase hover:border-primary hover:text-primary"
        }
      >
        {copy.boton}
      </button>

      <BottomSheet open={open} ariaLabel={titulo} variant="mark">
        <h2 className="font-display text-[24px] text-primary">{titulo}</h2>
        <p className="mt-2 text-sm text-text-muted">{copy.cuerpo}</p>

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
            className="min-h-11 flex-[1.6] bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase transition-colors hover:bg-primary-hover disabled:opacity-45"
          >
            {copy.confirmar}
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
