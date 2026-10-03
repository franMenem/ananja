"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { MedioPagoChips } from "@/components/medio-pago-chips";
import { MontoInput } from "@/components/monto-input";
import { useAccionRapidaMonto } from "@/components/tareas/use-accion-rapida-monto";
import type { MedioPago } from "@/lib/dominio/caja";
import { hoyISO } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";
import { NEGOCIO } from "@/lib/negocio";
import { createClient } from "@/lib/supabase/client";
import { validarMontoDeposito } from "@/lib/dominio/tareas";
import { MEDIOS_DESTINO_TRANSFERENCIA } from "@/lib/dominio/transferencias";

const ERRORES: Record<string, string> = {
  NO_AUTORIZADO: "No tenés permiso para esto.",
  MEDIO_INVALIDO: "Elegí Mercado Pago o Banco.",
  MONTO_INVALIDO: "Revisá el monto.",
  FECHA_INVALIDA: "Revisá la fecha.",
  // Un solo aviso pendiente por vez (0057, revisión adversarial): ya hay
  // uno esperando que un admin lo confirme o lo rechace.
  AVISO_PENDIENTE: "Ya avisaste un depósito y está esperando confirmación.",
};

type InformarDepositoCoordinadorProps = {
  /** Lo que tiene que pasar a la cuenta de Ananja ahora mismo
   * (`v_plata_en_manos.total_centavos` propio, ya sin su margen propio
   * desde 0058): precarga el monto y es el tope sin "Guardar igual". */
  montoCentavos: number;
};

/**
 * "Avisé que la pasé" de un coordinador (0057_coordinador_plata_stock.sql):
 * el coordinador NO carga ni ve nada de Plata (pedido de Fran, sin cambios)
 * pero puede avisar que pasó su plata en mano a la cuenta de
 * {NEGOCIO.nombre} — queda pendiente hasta que un admin lo confirma (o lo
 * rechaza) desde Tareas, mismo patrón que "informar un pago" de una
 * revendedora. Mismo hook que `DepositarRapido` (`useAccionRapidaMonto`):
 * monto precargado pero editable, con "Usar $ disponible"/"Guardar igual"
 * si escribe de más. Sin fecha editable (siempre hoy) ni nota: esta
 * pantalla es la única que ve un coordinador (`/mi` a secas, sin subrutas),
 * así que no hay un formulario más completo al que mandarlo.
 */
export function InformarDepositoCoordinador({ montoCentavos }: InformarDepositoCoordinadorProps) {
  const router = useRouter();
  const [medio, setMedio] = useState<MedioPago | null>(null);

  const {
    abierto,
    abrir,
    cerrar,
    monto,
    setMonto,
    guardando,
    error,
    setError,
    excedeCentavos,
    enviar,
    usarExcedente: usarDisponible,
    descartarExceso,
  } = useAccionRapidaMonto({
    montoInicialCentavos: montoCentavos,
    validar: (texto, tope, permitirExceso) => {
      const validacion = validarMontoDeposito(texto, tope, permitirExceso);
      return validacion.tipo === "excede"
        ? { tipo: "excede", centavos: validacion.centavos, topeCentavos: validacion.disponibleCentavos }
        : validacion;
    },
    ejecutar: async ({ centavos }) => {
      if (!medio) return { error: { message: "MEDIO_INVALIDO" } };
      const supabase = createClient();
      return await supabase.rpc("informar_deposito_cuenta", {
        p_medio_pago: medio,
        p_monto_centavos: centavos,
        p_fecha: hoyISO(),
      });
    },
    codigoExcede: "SALDO_INSUFICIENTE",
    campoTopeEnDetalle: "disponible",
    erroresPorCodigo: ERRORES,
    mensajeErrorGenerico: "No se pudo avisar el depósito. Probá de nuevo.",
    onOk: () => router.refresh(),
  });

  function guardar() {
    if (!medio) {
      setError("Elegí Mercado Pago o Banco.");
      return;
    }
    void enviar();
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="mt-1 flex min-h-11 items-center justify-center border border-primary px-4 text-[12px] font-medium tracking-[0.14em] text-primary uppercase"
      >
        Avisé que la pasé
      </button>

      <BottomSheet open={abierto} ariaLabel="Avisar depósito">
        <h2 className="font-display text-[24px] text-primary">Avisar depósito</h2>
        <p className="mt-1 text-[13px] text-text-muted">
          Registrá cuánto de lo que tenés que pasar ({formatCentavos(montoCentavos)}) ya pasaste a la
          cuenta de {NEGOCIO.nombre}. Un admin lo va a confirmar.
        </p>

        <div className="mt-4 flex flex-col gap-4">
          <MontoInput
            id="informar-deposito-monto"
            label="Monto"
            value={monto}
            onChange={setMonto}
            required
            simbolo={null}
            labelClassName="text-[10px] tracking-[0.18em] text-text-muted uppercase"
            cajaClassName="mt-1 flex border-b-2 border-primary"
            inputClassName="font-display block w-full min-w-0 bg-transparent py-1 text-[32px] text-primary tabular-nums"
          />
          <div>
            <span className="text-[10px] tracking-[0.18em] text-text-muted uppercase">Cuenta destino</span>
            <MedioPagoChips
              value={medio}
              onChange={setMedio}
              opciones={MEDIOS_DESTINO_TRANSFERENCIA}
              ocultarRotulo
              className="mt-1.5"
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-3 text-sm text-accent">
            {error}
          </p>
        )}

        {excedeCentavos !== null ? (
          // A diferencia de `DepositarRapido`, acá no hay "Guardar igual":
          // `informar_deposito_cuenta` no tiene `p_permitir_negativo` — un
          // coordinador nunca puede avisar más de lo que tiene en mano
          // (decisión a propósito, evita un aviso que después ningún admin
          // pueda confirmar sin dejarlo en negativo).
          <div className="mt-4 border-t-2 border-accent pt-3">
            <p className="text-sm text-text">
              Tenés {formatCentavos(excedeCentavos)} en mano — no podés avisar más que eso.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <BotonAccion
                cargando={guardando}
                textoCargando="Guardando…"
                onClick={() => usarDisponible()}
                className="min-h-[52px] flex-[1.6] bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase hover:bg-primary-hover disabled:opacity-45"
              >
                Usar {formatCentavos(excedeCentavos)}
              </BotonAccion>
              <button
                type="button"
                onClick={descartarExceso}
                disabled={guardando}
                className="min-h-[52px] flex-1 border border-border px-4 text-[13px] font-medium tracking-[0.14em] text-text-muted uppercase disabled:opacity-45"
              >
                Revisar
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex gap-2">
            <BotonAccion
              cargando={guardando}
              textoCargando="Guardando…"
              onClick={guardar}
              className="flex min-h-[52px] flex-[1.6] items-center justify-center bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase hover:bg-primary-hover disabled:opacity-45"
            >
              Avisar
            </BotonAccion>
            <button
              type="button"
              onClick={cerrar}
              disabled={guardando}
              className="flex min-h-[52px] flex-1 items-center justify-center border border-border px-4 text-[13px] font-medium tracking-[0.14em] text-text-muted uppercase disabled:opacity-45"
            >
              Cancelar
            </button>
          </div>
        )}
      </BottomSheet>
    </>
  );
}
