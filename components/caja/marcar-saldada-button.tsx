"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
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
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const montoLabel = formatMonto(moneda as "USD" | "ARS", montoCentavos);

  async function handleConfirmar() {
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: updateError } = await marcarDeudaSaldada(supabase, deudaId);
      if (updateError) {
        setError("No se pudo guardar. Probá de nuevo.");
        setSaving(false);
        return;
      }
      setSaving(false);
      setOpen(false);
      router.refresh();
    } catch {
      setSaving(false);
      setError("No se pudo conectar. Verificá tu conexión e intentá de nuevo.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] tracking-[0.12em] text-text-muted uppercase hover:text-primary"
      >
        Marcar saldada sin pago
      </button>

      <BottomSheet open={open} ariaLabel="Marcar deuda como saldada sin pago" variant="mark">
        <h2 className="font-display text-[26px] text-primary">
          ¿Marcar saldada sin pago?
        </h2>
        <p className="mt-2 text-sm text-text">
          {descripcion} · {montoLabel}
        </p>
        <p className="mt-3 text-sm text-accent">
          Esto marca la deuda como saldada SIN descontar plata de ninguna
          caja. Si la pagaste, usá «Registrar pago» para que se descuente
          de la caja.
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
            className="min-h-11 flex-1 bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase disabled:opacity-45"
          >
            Confirmar
          </BotonAccion>
          <button
            type="button"
            onClick={() => setOpen(false)}
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
