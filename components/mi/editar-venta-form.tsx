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
  CLASE_INPUT_MONTO_GRANDE,
  Campo,
  Entrada,
  MensajeError,
} from "@/components/ui/campo";
import { MasDatos, SeccionForm } from "@/components/ui/seccion-form";
import { mensajeErrorVentaPropia } from "@/lib/dominio/venta-directa";
import { hoyISO } from "@/lib/fechas";
import { formatMontoDisplay, parseMontoInput } from "@/lib/money";
import { envase } from "@/lib/negocio";
import { editarVentaRevendedor } from "@/lib/revendedores";
import { createClient } from "@/lib/supabase/client";
import type { Enums } from "@/lib/types";

type MedioPago = Enums<"medio_pago">;

/**
 * "Editar venta" (`/mi/ventas/[id]/editar`) — medio de pago, precio por
 * unidad, fecha y nota de una venta ya cargada (`editar_venta_revendedor`,
 * 0077). El producto y la cantidad se muestran pero no se editan: cambiarlos
 * mueve el stock, para eso se borra la venta y se vuelve a cargar.
 */
export function EditarVentaForm({
  ventaId,
  grupoId,
  producto,
  cantidad,
  medioPago: medioInicial,
  precioVentaCentavos,
  fecha: fechaInicial,
  nota: notaInicial,
}: {
  ventaId: string;
  grupoId: string;
  producto: string;
  cantidad: number;
  medioPago: MedioPago | null;
  precioVentaCentavos: number | null;
  fecha: string;
  nota: string | null;
}) {
  const router = useRouter();
  const [medioPago, setMedioPago] = useState<MedioPago | null>(medioInicial);
  const [precio, setPrecio] = useState(
    precioVentaCentavos !== null && precioVentaCentavos > 0 ? formatMontoDisplay(precioVentaCentavos) : "",
  );
  const [fecha, setFecha] = useState(fechaInicial);
  const [nota, setNota] = useState(notaInicial ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const centavos = parseMontoInput(precio);
    // Una venta sin precio (la cargó un admin) puede seguir sin precio; una
    // con precio no puede perderlo.
    const sinPrecioOk = precioVentaCentavos === null && precio.trim() === "";
    if (!sinPrecioOk && (centavos === null || centavos <= 0)) {
      setError("Ingresá a cuánto la vendiste.");
      return;
    }
    if (!medioPago) {
      setError("Elegí un medio de pago.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error: rpcError } = await editarVentaRevendedor(supabase, {
      grupoId,
      medioPago,
      precioVentaCentavos: sinPrecioOk ? null : centavos,
      fecha,
      nota: nota.trim() || null,
    });

    if (rpcError) {
      setError(
        mensajeErrorVentaPropia(rpcError.message, (rpcError as { details?: string }).details),
      );
      setSaving(false);
      return;
    }

    setSaving(false);
    router.push(`/mi/ventas/${ventaId}`);
    router.refresh();
  }

  return (
    <>
      <SetFormHeader title="Editar venta" backHref={`/mi/ventas/${ventaId}`} backLabel="Volver a la venta" />

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <SeccionForm titulo="¿Cómo fue la venta?">
          <p className="text-[16px] text-text">
            <span className="font-semibold tabular-nums">{cantidad}</span> × {producto}
          </p>

          <MontoInput
            id="precio-venta"
            label={`¿A cuánto la vendiste? (por ${envase(1)})`}
            value={precio}
            onChange={setPrecio}
            required={precioVentaCentavos !== null}
            placeholder="$ 0,00"
            simbolo={null}
            cajaClassName={CLASE_CAJA_MONTO}
            inputClassName={CLASE_INPUT_MONTO_GRANDE}
          />
        </SeccionForm>

        <SeccionForm titulo="¿Cómo te pagaron?">
          <MedioPagoChips value={medioPago} onChange={setMedioPago} ocultarRotulo />
        </SeccionForm>

        <MasDatos abierto={nota.trim() !== "" || fecha !== fechaInicial}>
          <Campo id="fecha" etiqueta="Fecha de la venta">
            <Entrada
              type="date"
              required
              max={hoyISO()}
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

        <AccionesForm
          etiqueta="Guardar cambios"
          cargando={saving}
          cancelarHref={`/mi/ventas/${ventaId}`}
          nota="Para cambiar la cantidad, borrá la venta y cargala de nuevo."
        />
      </form>
    </>
  );
}
