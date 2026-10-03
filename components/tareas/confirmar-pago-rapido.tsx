"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { BotonAccion } from "@/components/boton-accion";
import { useRefrescarTareas } from "@/components/tareas-badge";
import { AccionRapida } from "@/components/tareas/accion-rapida";
import { useAccionRapida } from "@/components/tareas/use-accion-rapida";
import { MEDIO_PAGO_LABELS, type MedioPago } from "@/lib/dominio/caja";
import { formatFecha } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";

const ERRORES: Record<string, string> = {
  NO_AUTORIZADO: "Este pago no te toca confirmarlo a vos.",
  PAGO_NO_ENCONTRADO: "No encontramos este pago.",
  PAGO_YA_RESUELTO: "Este pago ya fue confirmado o rechazado.",
  REVENDEDOR_INVALIDO: "Esta revendedora ya no está activa.",
  MEDIO_INVALIDO: "Ese medio de pago no corresponde para este destino.",
};

type ConfirmarPagoRapidoProps = {
  pagoId: string;
  montoCentavos: number;
  medioPago: MedioPago;
  fecha: string;
  vendedorNombre: string;
  destino: string;
  comprobanteUrl: string | null;
  tieneComprobante: boolean;
};

/**
 * "Confirmar" de un toque desde la lista de tareas: abre una hoja con el
 * monto, medio, fecha, quién pagó, a quién y el link al comprobante, y llama
 * a `confirmar_pago_revendedor` (mismo RPC que `/tareas/pagos/[id]`, que
 * vuelve a chequear que le toque a quien confirma). Rechazar pide motivo, así
 * que queda en la pantalla del pago.
 */
export function ConfirmarPagoRapido(props: ConfirmarPagoRapidoProps) {
  const router = useRouter();
  const refrescarTareas = useRefrescarTareas();
  const { abierto, abrir, cerrar, guardando, error, ejecutar } = useAccionRapida();

  async function confirmar() {
    const supabase = createClient();
    await ejecutar(async () => supabase.rpc("confirmar_pago_revendedor", { p_pago_id: props.pagoId }), {
      erroresPorCodigo: ERRORES,
      mensajeErrorGenerico: "No se pudo confirmar. Probá de nuevo.",
      // Ya lo resolvió otra persona: la tarea sobra, se refresca la lista.
      codigosSilenciosos: ["PAGO_YA_RESUELTO"],
      onExito: () => {
        cerrar();
        refrescarTareas();
        router.refresh();
      },
    });
  }

  return (
    <AccionRapida triggerLabel="Confirmar" ariaLabel="Confirmar pago" abierto={abierto} onAbrir={abrir}>
      <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
        Pago de {props.vendedorNombre}
      </span>
      <p className="font-display mt-1 text-[36px] leading-none text-primary tabular-nums">
        {formatCentavos(props.montoCentavos)}
      </p>
      <div className="mt-4 flex flex-col gap-1.5 border-y border-border py-3 text-sm text-text">
        <p>Medio: {MEDIO_PAGO_LABELS[props.medioPago]}</p>
        <p>Fecha: {formatFecha(props.fecha)}</p>
        <p>{props.destino}</p>
        {props.comprobanteUrl ? (
          <a
            href={props.comprobanteUrl}
            target="_blank"
            rel="noreferrer"
            className="self-start border-b border-mark text-[12px] tracking-[0.12em] uppercase"
          >
            Ver comprobante
          </a>
        ) : (
          <p className="text-text-muted">
            {props.tieneComprobante ? "No se pudo abrir el comprobante." : "Sin comprobante (efectivo)."}
          </p>
        )}
      </div>
      <p className="mt-3 text-[13px] text-text-muted">
        Confirmalo solo si la plata llegó. Al confirmar, se descuenta de lo que debe.
      </p>

      {error && (
        <p role="alert" className="mt-3 text-sm text-accent">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <BotonAccion
          cargando={guardando}
          textoCargando="Guardando…"
          onClick={confirmar}
          className="flex min-h-[52px] flex-[1.6] items-center justify-center bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase hover:bg-primary-hover disabled:opacity-45"
        >
          Lo recibí
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
      <Link
        href={`/tareas/pagos/${props.pagoId}`}
        className="mt-4 inline-block border-b border-mark text-[11px] tracking-[0.12em] text-text uppercase"
      >
        Rechazar o ver detalle →
      </Link>
    </AccionRapida>
  );
}
