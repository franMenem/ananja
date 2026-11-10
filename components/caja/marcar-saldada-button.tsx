"use client";

import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "@/components/ui/boton";
import { useRouter } from "next/navigation";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { useConfirmacion } from "@/components/ui/use-confirmacion";
import { formatMonto } from "@/lib/money";
import { marcarDeudaSaldada } from "@/lib/precios";
import { createClient } from "@/lib/supabase/client";

type MarcarSaldadaButtonProps = {
  deudaId: string;
  descripcion: string;
  moneda: string;
  montoCentavos: number;
};

/**
 * Botón + confirmación en `BottomSheet` para marcar una deuda como
 * saldada — mismo patrón que `AjustarSaldoButton`
 * (`components/caja/ajustar-saldo-button.tsx`): `update` directo vía
 * `marcarDeudaSaldada` (RLS solo permite tocar `saldada_en`), sin RPC.
 *
 * A propósito NO toca ninguna caja (solo el `update` sobre `saldada_en`
 * de arriba) — existe para deudas saldadas fuera de las cajas (ej. en
 * especie, o ya cobradas por otro medio no registrado acá). Por eso el
 * label y la confirmación son explícitos ("sin pago"/"SIN descontar
 * plata"): si la deuda se pagó con plata de alguna caja, corresponde
 * "Registrar pago" (`/plata/deudas/[id]/pago`), que sí la descuenta.
 */
export function MarcarSaldadaButton({
  deudaId,
  descripcion,
  moneda,
  montoCentavos,
}: MarcarSaldadaButtonProps) {
  const router = useRouter();
  const confirmacion = useConfirmacion();

  const montoLabel = formatMonto(moneda as "USD" | "ARS", montoCentavos);

  function handleConfirmar() {
    return confirmacion.confirmar(
      async () => {
        const supabase = createClient();
        const { error: updateError } = await marcarDeudaSaldada(supabase, deudaId);
        return updateError ? "No se pudo guardar. Probá de nuevo." : null;
      },
      { alExito: () => router.refresh() },
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={confirmacion.abrir}
        className="inline-flex min-h-11 items-center text-[14px] text-text-muted hover:text-primary"
      >
        Marcar saldada sin pago
      </button>

      <BottomSheet open={confirmacion.abierta} ariaLabel="Marcar deuda como saldada sin pago" variant="mark">
        <h2 className="font-display text-[26px] text-text">
          ¿Marcar saldada sin pago?
        </h2>
        <p className="mt-2 text-[16px] text-text">
          {descripcion} · {montoLabel}
        </p>
        <p className="mt-3 text-[16px] text-accent">
          Esto marca la deuda como saldada SIN descontar plata de ninguna
          cuenta. Si la pagaste, usá «Registrar pago» para que se descuente.
        </p>
        {confirmacion.error && (
          <p role="alert" className="mt-3 text-[16px] text-accent">
            {confirmacion.error}
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <BotonAccion
            cargando={confirmacion.ocupada}
            textoCargando="Guardando…"
            type="button"
            onClick={() => void handleConfirmar()}
            className={`${BOTON_PRIMARIO} flex-1 px-4`}
          >
            Confirmar
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
