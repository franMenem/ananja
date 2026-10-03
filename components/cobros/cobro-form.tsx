"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { BotonAccion } from "@/components/boton-accion";
import { CamposPagoCaja } from "@/components/pagos/campos-pago-caja";
import { registrarCobro } from "@/lib/cobros";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { hoyISO } from "@/lib/fechas";
import { formatCentavos, formatMontoDisplay, parseMontoInput } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";
import type { Enums } from "@/lib/types";

type MedioPago = Enums<"medio_pago">;

const ERRORES: Record<string, string> = {
  MONTO_INVALIDO: "Ingresá un monto válido.",
  COBRO_EXCEDE_DEUDA: "El cobro supera lo que debe.",
  COMPROBANTE_NO_ENCONTRADO: "Este comprobante ya no existe.",
  NO_AUTORIZADO: "No tenés permiso para esto.",
};

type CobroFormProps = {
  comprobanteId: string;
  deudaCentavos: number;
  /** A dónde volver tras guardar — el detalle del comprobante que originó
   * este cobro (US Ventas a crédito: siempre se llega acá desde ahí). */
  volverA: string;
};

/**
 * Formulario de un cobro posterior a una venta a crédito
 *: monto precargado con la deuda actual,
 * medio de pago propio (no heredado de la venta — decisión 2 del spec),
 * fecha, nota. Reutiliza `MedioPagoChips`, `hoyISO`,
 * `parseMontoInput`/`formatCentavos`/`formatMontoDisplay` — mismo criterio
 * de reuso que la sección Pago de `components/revendedores/carga-form.tsx`.
 */
export function CobroForm({ comprobanteId, deudaCentavos, volverA }: CobroFormProps) {
  const router = useRouter();
  const [montoInput, setMontoInput] = useState(formatMontoDisplay(deudaCentavos));
  const [medioPago, setMedioPago] = useState<MedioPago | null>(null);
  const [fecha, setFecha] = useState(hoyISO());
  const [nota, setNota] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function handleRpcError(error: { message?: string }) {
    setFormError(traducirErrorRpc(error.message, ERRORES, "No se pudo registrar el cobro. Probá de nuevo."));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const montoCentavos = parseMontoInput(montoInput);
    if (montoCentavos === null || montoCentavos <= 0) {
      setFormError("Ingresá un monto válido.");
      return;
    }
    if (montoCentavos > deudaCentavos) {
      setFormError("El cobro supera lo que debe.");
      return;
    }
    if (!medioPago) {
      setFormError("Elegí un medio de pago.");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const { error } = await registrarCobro(supabase, {
      comprobanteId,
      montoCentavos,
      medioPago,
      fecha,
      nota: nota.trim() || undefined,
    });

    if (error) {
      handleRpcError(error);
      setSubmitting(false);
      return;
    }

    router.push(volverA);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 pb-8">
      <CamposPagoCaja
        idPrefix="cobro"
        montoLabel="Monto"
        montoValue={montoInput}
        onMontoChange={setMontoInput}
        captionMonto={`Debe ${formatCentavos(deudaCentavos)}.`}
        medioLabel="Medio de pago"
        medioValue={medioPago}
        onMedioChange={setMedioPago}
        fecha={fecha}
        onFechaChange={setFecha}
        nota={nota}
        onNotaChange={setNota}
      />

      {formError && (
        <p role="alert" className="text-xs text-accent">
          {formError}
        </p>
      )}

      <BotonAccion
        cargando={submitting}
        textoCargando="Guardando…"
        type="submit"
        className="min-h-14 bg-primary text-[13px] font-medium tracking-[0.14em] text-background uppercase transition-colors hover:bg-primary-hover disabled:opacity-45"
      >
        Registrar cobro
      </BotonAccion>
    </form>
  );
}
