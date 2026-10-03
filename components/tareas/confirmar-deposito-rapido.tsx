"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { useRefrescarTareas } from "@/components/tareas-badge";
import { AccionRapida } from "@/components/tareas/accion-rapida";
import { useAccionRapida } from "@/components/tareas/use-accion-rapida";
import { MEDIO_PAGO_LABELS, type MedioPago } from "@/lib/dominio/caja";
import { formatCentavos } from "@/lib/money";
import { NEGOCIO } from "@/lib/negocio";
import { createClient } from "@/lib/supabase/client";

const ERRORES: Record<string, string> = {
  NO_AUTORIZADO: "No tenés permiso para esto.",
  DEPOSITO_NO_ENCONTRADO: "No encontramos este depósito.",
  DEPOSITO_YA_RESUELTO: "Este depósito ya fue confirmado o rechazado.",
  TENEDOR_INVALIDO: "Esta persona ya no es un coordinador o admin activo.",
  MEDIO_INVALIDO: "Ese medio de pago no corresponde.",
  MONTO_INVALIDO: "Revisá el monto.",
  // "Probá de nuevo" inducía al error (0057, revisión adversarial):
  // reintentar da el mismo error siempre, la plata real ya no alcanza —
  // la única salida es rechazarlo.
  SALDO_INSUFICIENTE: "Este aviso ya no se puede confirmar: la plata en mano cambió. Rechazalo.",
  MOTIVO_REQUERIDO: "Contá por qué lo rechazás.",
};

type ConfirmarDepositoRapidoProps = {
  depositoInformadoId: string;
  montoCentavos: number;
  medioPago: MedioPago;
  /** El coordinador que avisó — el depósito real, al confirmar, queda a
   * su nombre (nunca al del admin que confirma). */
  tenedorNombre: string;
};

/**
 * "Confirmar" de un depósito que un coordinador avisó
 * (0057_coordinador_plata_stock.sql, `informar_deposito_cuenta`): a
 * diferencia de `ConfirmarPagoRapido` no hay una pantalla de detalle
 * aparte (un coordinador vive solo en `/mi`, sin subrutas, así que nunca
 * hubo necesidad de una) — "Rechazar" se resuelve acá mismo, con un motivo
 * corto. Confirmar llama a `confirmar_deposito_informado`, que reusa
 * `registrar_deposito_cuenta` — mismo efecto que si un admin lo hubiera
 * cargado directo desde "Registrar que lo pasó".
 */
export function ConfirmarDepositoRapido(props: ConfirmarDepositoRapidoProps) {
  const router = useRouter();
  const refrescarTareas = useRefrescarTareas();
  const { abierto, abrir, cerrar, guardando, error, setError, ejecutar } = useAccionRapida();
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");

  function cerrarYRefrescar() {
    cerrar();
    setRechazando(false);
    setMotivo("");
    refrescarTareas();
    router.refresh();
  }

  async function confirmar() {
    const supabase = createClient();
    await ejecutar(
      async () =>
        supabase.rpc("confirmar_deposito_informado", { p_deposito_informado_id: props.depositoInformadoId }),
      {
        erroresPorCodigo: ERRORES,
        mensajeErrorGenerico: "No se pudo confirmar. Probá de nuevo.",
        // Ya lo resolvió otro admin: la tarea sobra, se refresca la lista.
        codigosSilenciosos: ["DEPOSITO_YA_RESUELTO"],
        onExito: cerrarYRefrescar,
      },
    );
  }

  async function rechazar() {
    const motivoLimpio = motivo.trim();
    if (!motivoLimpio) {
      setError("Contá por qué lo rechazás.");
      return;
    }
    const supabase = createClient();
    await ejecutar(
      async () =>
        supabase.rpc("rechazar_deposito_informado", {
          p_deposito_informado_id: props.depositoInformadoId,
          p_motivo: motivoLimpio,
        }),
      {
        erroresPorCodigo: ERRORES,
        mensajeErrorGenerico: "No se pudo rechazar. Probá de nuevo.",
        codigosSilenciosos: ["DEPOSITO_YA_RESUELTO"],
        onExito: cerrarYRefrescar,
      },
    );
  }

  return (
    <AccionRapida triggerLabel="Confirmar" ariaLabel="Confirmar depósito" abierto={abierto} onAbrir={abrir}>
      <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
        Depósito de {props.tenedorNombre}
      </span>
      <p className="font-display mt-1 text-[36px] leading-none text-primary tabular-nums">
        {formatCentavos(props.montoCentavos)}
      </p>
      <div className="mt-4 flex flex-col gap-1.5 border-y border-border py-3 text-sm text-text">
        <p>Medio: {MEDIO_PAGO_LABELS[props.medioPago]}</p>
        <p>A la cuenta de {NEGOCIO.nombre}</p>
      </div>
      <p className="mt-3 text-[13px] text-text-muted">
        Confirmalo solo si la plata llegó a la cuenta de {NEGOCIO.nombre}.
      </p>

      {error && (
        <p role="alert" className="mt-3 text-sm text-accent">
          {error}
        </p>
      )}

      {rechazando ? (
        <div className="mt-4 flex flex-col gap-2">
          <label htmlFor="motivo-rechazo-deposito" className="text-[10px] tracking-[0.18em] text-text-muted uppercase">
            Motivo
          </label>
          <textarea
            id="motivo-rechazo-deposito"
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            rows={2}
            className="min-h-[60px] w-full border border-border bg-surface px-3 py-2 text-base text-text focus:border-primary"
          />
          <div className="mt-1 flex gap-2">
            <BotonAccion
              cargando={guardando}
              textoCargando="Guardando…"
              onClick={rechazar}
              className="flex min-h-[52px] flex-[1.6] items-center justify-center bg-accent px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase disabled:opacity-45"
            >
              Rechazar
            </BotonAccion>
            <button
              type="button"
              onClick={() => {
                setRechazando(false);
                setError(null);
              }}
              disabled={guardando}
              className="flex min-h-[52px] flex-1 items-center justify-center border border-border px-4 text-[13px] font-medium tracking-[0.14em] text-text-muted uppercase disabled:opacity-45"
            >
              Volver
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex gap-2">
          <BotonAccion
            cargando={guardando}
            textoCargando="Guardando…"
            onClick={confirmar}
            className="flex min-h-[52px] flex-[1.6] items-center justify-center bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase hover:bg-primary-hover disabled:opacity-45"
          >
            Llegó
          </BotonAccion>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setRechazando(true);
            }}
            disabled={guardando}
            className="flex min-h-[52px] flex-1 items-center justify-center border border-border px-4 text-[13px] font-medium tracking-[0.14em] text-text-muted uppercase disabled:opacity-45"
          >
            Rechazar
          </button>
        </div>
      )}
    </AccionRapida>
  );
}
