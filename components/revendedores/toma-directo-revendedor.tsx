"use client";

import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "@/components/ui/boton";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Pastilla } from "@/components/ui/pastilla";
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
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[16px] font-semibold text-text">Agarra directo del depósito</span>
        <Pastilla variante={tomaDirecto ? "ok" : "neutra"}>{tomaDirecto ? "Sí" : "No"}</Pastilla>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-11 items-center px-1 text-[15px] font-semibold text-primary hover:underline"
        >
          {tomaDirecto ? "Apagar" : "Prender"}
        </button>
      </div>
      <p className="text-[14px] text-text-muted">
        Puede cargar ventas aunque no tenga botellas entregadas: lo que le falte se saca solo del depósito y
        queda anotado como entrega automática.
      </p>

      <BottomSheet open={open} ariaLabel={titulo} variant="mark">
        <h2 className="font-display text-[24px] leading-[1.25] text-text">{titulo}</h2>
        <p className="mt-2 text-[16px] text-text-muted">
          {habilitar
            ? `${nombre} va a poder cargar ventas aunque no tenga botellas entregadas. Lo que le falte se saca del depósito (del pedido más viejo con stock) y queda anotado como entrega automática.`
            : `Desde ahora ${nombre} solo va a poder vender las botellas que tenga entregadas. Lo que ya se anotó no cambia.`}
        </p>

        {error && (
          <p role="alert" className="mt-3 text-[16px] text-accent">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <BotonAccion
            cargando={saving}
            textoCargando="Guardando…"
            onClick={() => void confirmar()}
            className={`${BOTON_PRIMARIO} flex-[1.6] px-4`}
          >
            {habilitar ? "Sí, prender" : "Sí, apagar"}
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
    </div>
  );
}
