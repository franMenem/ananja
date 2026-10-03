"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { MontoInput } from "@/components/monto-input";
import { CamposPagoCaja } from "@/components/pagos/campos-pago-caja";
import { convertirUsdAPesos } from "@/lib/dominio/calculos";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { registrarPagoDeuda } from "@/lib/deudas";
import { hoyISO } from "@/lib/fechas";
import { formatMonto, formatMontoDisplay, parseMontoInput } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";
import type { Enums } from "@/lib/types";

type MedioPago = Enums<"medio_pago">;
type Moneda = "USD" | "ARS";

const ERRORES_PAGO_DEUDA: Record<string, string> = {
  MONTO_INVALIDO: "Ingresá un monto válido.",
  MONTO_CAJA_INVALIDO: "Ingresá cuántos pesos salen de la caja.",
  PAGO_EXCEDE_SALDO: "El pago supera lo que resta de la deuda.",
  DEUDA_NO_ENCONTRADA: "Esta deuda ya no existe.",
  DEUDA_YA_SALDADA: "Esta deuda ya está saldada.",
  NO_AUTORIZADO: "No tenés permiso para esto.",
};

type PagoDeudaFormProps = {
  deudaId: string;
  moneda: Moneda;
  /** Restante en la moneda de la deuda — precarga el monto para que pagar
   * todo de una sea un solo tap. */
  restanteCentavos: number;
  /** Dólar de la versión de precios vigente, para prefijar "Pesos que salen
   * de la caja" en una deuda USD — `null` sin versión cargada (el campo
   * queda vacío, editable a mano). */
  dolarCentavos: number | null;
};

/**
 * Formulario de un pago sobre una deuda del negocio
 * (`supabase/migrations/0027_pagos_deuda.sql`): monto precargado con el
 * restante (pagarlo todo de una es un solo tap), fecha, caja (mismo
 * selector que `/comprobantes/[id]/cobro`), nota. Una deuda en USD agrega
 * un segundo campo — "Pesos que salen de la caja" — porque lo que se paga
 * (USD) y lo que sale de la caja (pesos) son montos distintos; para ARS el
 * RPC fuerza que sean el mismo monto, así que no hace falta pedirlo.
 */
export function PagoDeudaForm({
  deudaId,
  moneda,
  restanteCentavos,
  dolarCentavos,
}: PagoDeudaFormProps) {
  const router = useRouter();
  const [montoInput, setMontoInput] = useState(formatMontoDisplay(restanteCentavos));
  const [montoCajaInput, setMontoCajaInput] = useState(() =>
    moneda === "USD" && dolarCentavos !== null
      ? formatMontoDisplay(convertirUsdAPesos(restanteCentavos, dolarCentavos))
      : "",
  );
  const [montoCajaTocado, setMontoCajaTocado] = useState(false);
  const [medioPago, setMedioPago] = useState<MedioPago | null>(null);
  const [fecha, setFecha] = useState(hoyISO());
  const [nota, setNota] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function handleMontoChange(value: string) {
    setMontoInput(value);

    // Recalcula "Pesos que salen de la caja" mientras el usuario no la haya
    // tocado a mano — apenas la edita, deja de seguir al monto en USD.
    if (moneda === "USD" && !montoCajaTocado && dolarCentavos !== null) {
      const montoUsd = parseMontoInput(value);
      setMontoCajaInput(
        montoUsd !== null && montoUsd > 0
          ? formatMontoDisplay(convertirUsdAPesos(montoUsd, dolarCentavos))
          : "",
      );
    }
  }

  function handleRpcError(error: { message?: string }) {
    setFormError(
      traducirErrorRpc(error.message, ERRORES_PAGO_DEUDA, "No se pudo registrar el pago. Probá de nuevo."),
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const montoCentavos = parseMontoInput(montoInput);
    if (montoCentavos === null || montoCentavos <= 0) {
      setFormError("Ingresá un monto válido.");
      return;
    }
    if (montoCentavos > restanteCentavos) {
      setFormError("El pago supera lo que resta de la deuda.");
      return;
    }
    if (!medioPago) {
      setFormError("Elegí una caja.");
      return;
    }

    let montoCajaCentavos: number | undefined;
    if (moneda === "USD") {
      const parsed = parseMontoInput(montoCajaInput);
      if (parsed === null || parsed <= 0) {
        setFormError("Ingresá cuántos pesos salen de la caja.");
        return;
      }
      montoCajaCentavos = parsed;
    }

    setSubmitting(true);
    const supabase = createClient();
    const { error } = await registrarPagoDeuda(supabase, {
      deudaId,
      montoCentavos,
      medioPago,
      fecha,
      montoCajaCentavos,
      nota: nota.trim() || undefined,
    });

    if (error) {
      handleRpcError(error);
      setSubmitting(false);
      return;
    }

    router.push("/plata/deudas");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 pb-8">
      <CamposPagoCaja
        idPrefix="pago"
        montoLabel={moneda === "USD" ? "USD que pagás" : "Monto"}
        montoValue={montoInput}
        onMontoChange={handleMontoChange}
        montoSimbolo={moneda === "USD" ? "USD" : "$"}
        captionMonto={`Resta ${formatMonto(moneda, restanteCentavos)}.`}
        medioLabel="Caja"
        medioValue={medioPago}
        onMedioChange={setMedioPago}
        fecha={fecha}
        onFechaChange={setFecha}
        nota={nota}
        onNotaChange={setNota}
        extra={
          moneda === "USD" && (
            <div className="flex flex-col gap-2">
              <MontoInput
                id="pago-monto-caja"
                label="Pesos que salen de la caja"
                value={montoCajaInput}
                onChange={(valor) => {
                  setMontoCajaTocado(true);
                  setMontoCajaInput(valor);
                }}
                required
                placeholder="0,00"
                labelClassName="block text-[10px] tracking-[0.22em] text-text-muted uppercase"
                cajaClassName="mt-2 flex items-baseline gap-2 border-b-2 border-border pb-1.5"
                simboloClassName="font-display text-[18px] text-text-muted"
                inputClassName="font-display w-full min-w-0 text-[28px] leading-none text-text tabular-nums"
              />
              {dolarCentavos === null && (
                <p className="text-[11px] text-text-muted">
                  Sin dólar de referencia cargado — completá el monto a mano.
                </p>
              )}
            </div>
          )
        }
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
        Registrar pago
      </BotonAccion>
    </form>
  );
}
