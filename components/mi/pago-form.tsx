"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { MedioPagoChips } from "@/components/medio-pago-chips";
import { MontoInput } from "@/components/monto-input";
import { SetFormHeader } from "@/components/page-header-context";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { hoyISO } from "@/lib/fechas";
import { formatCentavos, formatMontoDisplay, parseMontoInput } from "@/lib/money";
import { NEGOCIO } from "@/lib/negocio";
import {
  comprobanteObligatorio,
  mediosPermitidosPago,
  type EncargadoPago,
  type MedioPago,
} from "@/lib/dominio/pagos-revendedor";
import { informarPagoRevendedor } from "@/lib/revendedores";
import { ArchivoInvalidoError, subirComprobantePagoRevendedor } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";

type PagoFormProps = {
  vendedorId: string;
  /** Su encargado (admin activo), o `null` = paga directo a la Cuenta Ananja. */
  encargado: EncargadoPago | null;
  debeCentavos: number;
  pendienteCentavos: number;
  sugeridoCentavos: number;
};

const ERRORES: Record<string, string> = {
  NO_AUTORIZADO: "No tenés permiso para esto.",
  MONTO_INVALIDO: "Revisá el monto.",
  MEDIO_INVALIDO: `A la cuenta de ${NEGOCIO.nombre} no se puede pagar en efectivo. Elegí Mercado Pago o Banco.`,
  FECHA_INVALIDA: "Revisá la fecha.",
  COMPROBANTE_REQUERIDO: "Subí el comprobante de la transferencia.",
  COMPROBANTE_INVALIDO: "No se pudo usar ese comprobante. Subilo de nuevo.",
};

/**
 * "Pagar a {encargado}" / "Pagar a Ananja" (`/mi/pagar`) — la revendedora
 * informa un pago (`informar_pago_revendedor`). Queda pendiente hasta que el
 * encargado (o un admin, si fue a la Cuenta Ananja) lo confirma; recién ahí
 * baja lo que le debe a Ananja. El comprobante se sube a
 * `revendedores/<vendedorId>/…` al guardar; es obligatorio salvo en efectivo.
 */
export function PagoForm({
  vendedorId,
  encargado,
  debeCentavos,
  pendienteCentavos,
  sugeridoCentavos,
}: PagoFormProps) {
  const router = useRouter();
  const opciones = mediosPermitidosPago(encargado);
  const destino = encargado?.nombre ?? NEGOCIO.nombre;

  const [monto, setMonto] = useState(sugeridoCentavos > 0 ? formatMontoDisplay(sugeridoCentavos) : "");
  const [medioPago, setMedioPago] = useState<MedioPago | null>(null);
  const [fecha, setFecha] = useState(hoyISO());
  const [archivo, setArchivo] = useState<File | null>(null);
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const centavos = parseMontoInput(monto);
    if (centavos === null || centavos <= 0) {
      setError("Ingresá un monto válido.");
      return;
    }
    if (!medioPago) {
      setError("Elegí cómo pagaste.");
      return;
    }
    if (comprobanteObligatorio(medioPago) && !archivo) {
      setError("Subí el comprobante de la transferencia.");
      return;
    }

    setSaving(true);

    let imagenPath: string | null = null;
    if (archivo) {
      try {
        imagenPath = await subirComprobantePagoRevendedor(archivo, vendedorId);
      } catch (err) {
        setError(
          err instanceof ArchivoInvalidoError || err instanceof Error
            ? err.message
            : "No se pudo subir el comprobante. Probá de nuevo.",
        );
        setSaving(false);
        return;
      }
    }

    const supabase = createClient();
    const { error: rpcError } = await informarPagoRevendedor(supabase, {
      montoCentavos: centavos,
      medioPago,
      fecha,
      imagenPath,
      nota: nota.trim() || null,
    });

    if (rpcError) {
      setError(traducirErrorRpc(rpcError.message, ERRORES, "No se pudo guardar el pago. Probá de nuevo."));
      setSaving(false);
      return;
    }

    setSaving(false);
    router.push("/mi");
    router.refresh();
  }

  return (
    <>
      <SetFormHeader title={`Pagar a ${destino}`} backHref="/mi" backLabel="Volver al inicio" />

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-text">
            Le debés a {NEGOCIO.nombre}{" "}
            <span className="font-medium tabular-nums text-accent">{formatCentavos(debeCentavos)}</span>
          </span>
          {pendienteCentavos > 0 && (
            <span className="text-text-muted">
              Ya informaste{" "}
              <span className="font-medium tabular-nums text-text">
                {formatCentavos(pendienteCentavos)}
              </span>{" "}
              que todavía no te confirmaron.
            </span>
          )}
          <span className="text-[13px] text-text-muted">
            {encargado
              ? `Cuando ${encargado.nombre} confirme que la recibió, se descuenta de lo que le debés.`
              : `Transferí a la cuenta de ${NEGOCIO.nombre} y subí el comprobante. Cuando lo confirmen, se descuenta de lo que le debés.`}
          </span>
        </div>

        <MontoInput
          id="monto"
          label="Monto"
          value={monto}
          onChange={setMonto}
          required
          placeholder="$ 0,00"
          simbolo={null}
          labelClassName="text-[10px] tracking-[0.18em] text-text-muted uppercase"
          cajaClassName="mt-1 flex border-b-2 border-primary"
          inputClassName="font-display block w-full min-w-0 bg-transparent py-1 text-[40px] text-primary tabular-nums focus:outline-none"
        />

        <MedioPagoChips value={medioPago} onChange={setMedioPago} opciones={opciones} />

        <div>
          <label htmlFor="fecha" className="text-[10px] tracking-[0.18em] text-text-muted uppercase">
            Fecha
          </label>
          <input
            id="fecha"
            type="date"
            required
            value={fecha}
            onChange={(event) => setFecha(event.target.value)}
            className="mt-1.5 min-h-12 w-full border border-border bg-surface px-3 text-base text-text focus:border-primary"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] tracking-[0.18em] text-text-muted uppercase">
            Comprobante{medioPago === "efectivo" ? " (opcional)" : ""}
          </span>
          <label
            htmlFor="comprobante-pago"
            className="flex min-h-12 items-center justify-center border border-dashed border-border px-3 text-center text-sm text-text hover:border-primary"
          >
            {archivo ? archivo.name : "Sacar foto o elegir archivo"}
          </label>
          <input
            id="comprobante-pago"
            type="file"
            accept="image/*,.pdf,.heic"
            className="sr-only"
            onChange={(event) => setArchivo(event.target.files?.[0] ?? null)}
          />
          {archivo && (
            <button
              type="button"
              onClick={() => setArchivo(null)}
              className="self-start text-[11px] tracking-[0.12em] text-text-muted uppercase"
            >
              Quitar archivo
            </button>
          )}
        </div>

        <div>
          <label htmlFor="nota" className="text-[10px] tracking-[0.18em] text-text-muted uppercase">
            Nota (opcional)
          </label>
          <textarea
            id="nota"
            value={nota}
            onChange={(event) => setNota(event.target.value)}
            rows={2}
            className="mt-1.5 min-h-[60px] w-full border border-border bg-surface px-3 py-2 text-base text-text focus:border-primary"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-accent">
            {error}
          </p>
        )}

        <BotonAccion
          cargando={saving}
          textoCargando="Guardando…"
          type="submit"
          className="mt-1 flex min-h-[54px] items-center justify-center bg-primary text-[13px] font-medium tracking-[0.16em] text-background uppercase transition-colors hover:bg-primary-hover disabled:opacity-45"
        >
          Avisar que pagué
        </BotonAccion>
      </form>
    </>
  );
}
