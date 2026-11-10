"use client";

import { BOTON_SECUNDARIO } from "@/components/ui/boton";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { useConfirmacion } from "@/components/ui/use-confirmacion";
import { MEDIO_PAGO_LABELS, type MedioPago } from "@/lib/dominio/caja";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { createClient } from "@/lib/supabase/client";
import { MEDIOS_DESTINO_TRANSFERENCIA } from "@/lib/dominio/transferencias";

type DestinoEfectivoButtonProps = {
  destinoActual: MedioPago;
};

const ERRORES: Record<string, string> = {
  NO_AUTORIZADO: "No tenés permiso para esto.",
  MEDIO_INVALIDO: "Elegí una cuenta distinta de Efectivo.",
};

/**
 * Link + `BottomSheet` para cambiar `cajas.destino_efectivo` — la cuenta a
 * la que se pasa el efectivo desde "Tareas". RPC `fijar_destino_efectivo`, admin.
 */
export function DestinoEfectivoButton({ destinoActual }: DestinoEfectivoButtonProps) {
  const router = useRouter();
  const confirmacion = useConfirmacion();
  // Cuál de las cuentas muestra el spinner; solo se mira mientras `enviando`.
  const [eligiendo, setEligiendo] = useState<MedioPago | null>(null);

  function handleElegir(medio: MedioPago) {
    setEligiendo(medio);
    return confirmacion.confirmar(
      async () => {
        const supabase = createClient();
        const { error: rpcError } = await supabase.rpc("fijar_destino_efectivo", {
          p_medio_pago: medio,
        });
        return rpcError
          ? traducirErrorRpc(rpcError.message, ERRORES, "No se pudo cambiar la cuenta destino. Probá de nuevo.")
          : null;
      },
      { alExito: () => router.refresh() },
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={confirmacion.abrir}
        className={`${BOTON_SECUNDARIO} flex px-4`}
      >
        Cuenta destino del efectivo
      </button>

      <BottomSheet open={confirmacion.abierta} ariaLabel="Configurar cuenta destino del efectivo" variant="mark">
        <h2 className="font-display text-[24px] text-text">Cuenta destino del efectivo</h2>
        <p className="mt-2 text-[16px] text-text-muted">
          A dónde se pasa el efectivo desde &quot;Tareas&quot;. Hoy: {MEDIO_PAGO_LABELS[destinoActual]}.
        </p>

        {confirmacion.error && (
          <p role="alert" className="mt-3 text-[16px] text-accent">
            {confirmacion.error}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2">
          {MEDIOS_DESTINO_TRANSFERENCIA.map((medio) => (
            <BotonAccion
              key={medio}
              onClick={() => void handleElegir(medio)}
              cargando={confirmacion.enviando && eligiendo === medio}
              textoCargando="Guardando…"
              disabled={confirmacion.ocupada || medio === destinoActual}
              className={`min-h-11 border px-4 text-[16px] font-medium disabled:opacity-45 ${
                medio === destinoActual
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-text"
              }`}
            >
              {MEDIO_PAGO_LABELS[medio]}
            </BotonAccion>
          ))}
          <button
            type="button"
            onClick={confirmacion.cancelar}
            disabled={confirmacion.ocupada}
            className={`${BOTON_SECUNDARIO} px-4`}
          >
            Cerrar
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
