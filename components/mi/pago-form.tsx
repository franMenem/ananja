"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { MedioPagoChips } from "@/components/medio-pago-chips";
import { MontoInput } from "@/components/monto-input";
import { SetFormHeader } from "@/components/page-header-context";
import { AccionesForm } from "@/components/ui/acciones-form";
import {
  AreaTexto,
  CLASE_CAJA_MONTO,
  CLASE_ETIQUETA,
  CLASE_INPUT_MONTO_GRANDE,
  Campo,
  Entrada,
  MensajeError,
} from "@/components/ui/campo";
import { MasDatos, SeccionForm } from "@/components/ui/seccion-form";
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
      <SetFormHeader title={`Pagarle a ${destino}`} backHref="/mi" backLabel="Volver al inicio" />

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1 text-[16px]">
          <span className="text-text">
            Le debés a {NEGOCIO.nombre}{" "}
            <span className="font-semibold tabular-nums text-accent">{formatCentavos(debeCentavos)}</span>
          </span>
          {pendienteCentavos > 0 && (
            <span className="text-text-muted">
              Ya informaste{" "}
              <span className="font-semibold tabular-nums text-text">
                {formatCentavos(pendienteCentavos)}
              </span>{" "}
              que todavía no te confirmaron.
            </span>
          )}
          <span className="text-[14px] text-text-muted">
            {encargado
              ? `Cuando ${encargado.nombre} confirme que la recibió, se descuenta de lo que le debés.`
              : `Transferí a la cuenta de ${NEGOCIO.nombre} y subí el comprobante. Cuando lo confirmen, se descuenta de lo que le debés.`}
          </span>
        </div>

        <SeccionForm titulo="Monto y comprobante">
          <MontoInput
            id="monto"
            label="Monto"
            value={monto}
            onChange={setMonto}
            required
            placeholder="$ 0,00"
            simbolo={null}
            cajaClassName={CLASE_CAJA_MONTO}
            inputClassName={CLASE_INPUT_MONTO_GRANDE}
          />

          <MedioPagoChips value={medioPago} onChange={setMedioPago} opciones={opciones} />

          <div className="flex flex-col gap-1.5">
            <span className={CLASE_ETIQUETA}>
              Comprobante
              {medioPago === "efectivo" && <span className="font-normal text-text-muted"> (opcional)</span>}
            </span>
            <input
              id="comprobante-pago"
              type="file"
              accept="image/*,.pdf,.heic"
              className="peer sr-only"
              onChange={(event) => setArchivo(event.target.files?.[0] ?? null)}
            />
            <label
              htmlFor="comprobante-pago"
              className="flex min-h-12 items-center justify-center rounded-xl border border-dashed border-[#d0cec8] px-3 text-center text-[16px] text-text hover:border-primary peer-focus-visible:border-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/30"
            >
              <span className="break-all">{archivo ? archivo.name : "Sacar foto o elegir archivo"}</span>
            </label>
            {archivo && (
              <button
                type="button"
                onClick={() => setArchivo(null)}
                className="inline-flex min-h-11 items-center self-start text-[15px] font-semibold text-text-muted"
              >
                Quitar archivo
              </button>
            )}
          </div>
        </SeccionForm>

        <MasDatos abierto={nota.trim() !== "" || (fecha !== "" && fecha !== hoyISO())}>
          <Campo id="fecha" etiqueta="Fecha del pago">
            <Entrada
              type="date"
              required
              value={fecha}
              onChange={(event) => setFecha(event.target.value)}
              className="tabular-nums"
            />
          </Campo>
          <Campo id="nota" etiqueta="Nota" opcional>
            <AreaTexto value={nota} onChange={(event) => setNota(event.target.value)} rows={2} />
          </Campo>
        </MasDatos>

        {error && <MensajeError>{error}</MensajeError>}

        <AccionesForm etiqueta="Avisar que pagué" cargando={saving} cancelarHref="/mi" />
      </form>
    </>
  );
}
