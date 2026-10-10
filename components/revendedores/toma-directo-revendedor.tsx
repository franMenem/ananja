"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { createClient } from "@/lib/supabase/client";

type TomaDirectoRevendedorProps = {
  vendedorId: string;
  /** Nombre de la persona, para los textos de la confirmación. */
  nombre: string;
  /** Valor actual de `vendedores.toma_directo`. */
  tomaDirecto: boolean;
};

const ERRORES: Record<string, string> = {
  NO_AUTORIZADO: "No tenés permiso para esto.",
  REVENDEDOR_INVALIDO: "Esta persona ya no puede revender.",
};

/**
 * Interruptor "Agarra directo del depósito" de la ficha de una persona que
 * revende (`/revendedores/[id]`) — RPC `fijar_toma_directo`
 * (supabase/migrations/0073_venta_directa_y_venta_coordinador.sql, solo
 * admins). Con el interruptor prendido puede cargar ventas aunque no tenga
 * botellas entregadas: lo que le falte se saca solo del depósito y queda
 * anotado como entrega automática. Prender o apagar pide confirmación (mismo
 * patrón que `EspacioRevendedorButton` y `EncargadoRevendedor`): no cambia
 * nada de lo ya cargado, solo cómo se comportan las ventas de acá en
 * adelante.
 */
export function TomaDirectoRevendedor({ vendedorId, nombre, tomaDirecto }: TomaDirectoRevendedorProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const habilitar = !tomaDirecto;
  const titulo = habilitar
    ? `¿Dejar que ${nombre} agarre directo del depósito?`
    : `¿Dejar de permitirle a ${nombre} agarrar directo del depósito?`;

  async function confirmar() {
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("fijar_toma_directo", {
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
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[10px] tracking-[0.14em] text-text-muted uppercase">
          Agarra directo del depósito
        </span>
        <span
          className={`border px-1.5 py-px text-[9px] tracking-[0.1em] uppercase ${
            tomaDirecto ? "border-primary text-primary" : "border-border text-text-muted"
          }`}
        >
          {tomaDirecto ? "Sí" : "No"}
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-9 text-[11px] font-medium tracking-[0.1em] text-primary uppercase underline-offset-2 hover:underline"
        >
          {tomaDirecto ? "Apagar" : "Prender"}
        </button>
      </div>
      <p className="text-[12px] text-text-muted">
        Puede cargar ventas aunque no tenga botellas entregadas: lo que le falte se saca solo del depósito y
        queda anotado como entrega automática.
      </p>

      <BottomSheet open={open} ariaLabel={titulo} variant="mark">
        <h2 className="font-display text-[24px] leading-[1.25] text-primary">{titulo}</h2>
        <p className="mt-2 text-sm text-text-muted">
          {habilitar
            ? `${nombre} va a poder cargar ventas aunque no tenga botellas entregadas. Lo que le falte se saca del depósito (del lote más viejo con stock) y queda anotado como entrega automática.`
            : `Desde ahora ${nombre} solo va a poder vender las botellas que tenga entregadas. Lo que ya se anotó no cambia.`}
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
            onClick={() => void confirmar()}
            className="min-h-11 flex-[1.6] bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase transition-colors hover:bg-primary-hover disabled:opacity-45"
          >
            {habilitar ? "Sí, prender" : "Sí, apagar"}
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
    </div>
  );
}
