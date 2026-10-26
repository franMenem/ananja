"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AccionesForm } from "@/components/ui/acciones-form";
import { MasDatos, SeccionForm } from "@/components/ui/seccion-form";
import { MontoInput } from "@/components/monto-input";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { hoyISO } from "@/lib/fechas";
import { parseMontoInput } from "@/lib/money";
import { crearDeuda } from "@/lib/precios";
import { createClient } from "@/lib/supabase/client";
import {
  AreaTexto,
  CLASE_CAJA_MONTO,
  CLASE_ETIQUETA,
  CLASE_INPUT_MONTO_GRANDE,
  CLASE_SIMBOLO_MONTO_GRANDE,
  Campo,
  Entrada,
  MensajeError,
} from "@/components/ui/campo";

type Moneda = "USD" | "ARS";

const ERRORES: Record<string, string> = {
  VENDEDOR_NO_REGISTRADO: "Tu usuario no está vinculado a un vendedor. Pedile al dueño que te dé de alta.",
};

/**
 * Formulario de alta de una deuda (`/plata/deudas/nueva`). Chips de moneda
 * ARS/USD con el mismo lenguaje visual que `MedioPagoChips`
 * (`components/medio-pago-chips.tsx`) pero sin reusar ese componente —
 * está tipado a `MedioPago`, no a moneda (spec § Caja, bloque "Deudas").
 */
export function DeudaForm() {
  const router = useRouter();

  const [descripcion, setDescripcion] = useState("");
  const [moneda, setMoneda] = useState<Moneda>("ARS");
  const [montoInput, setMontoInput] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [nota, setNota] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!descripcion.trim()) {
      setFormError("Poné una descripción para la deuda.");
      return;
    }

    const montoCentavos = parseMontoInput(montoInput);
    if (montoCentavos === null || montoCentavos <= 0) {
      setFormError("Ingresá un monto válido, mayor a cero.");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await crearDeuda(supabase, {
        descripcion: descripcion.trim(),
        moneda,
        montoCentavos,
        fecha,
        nota: nota.trim() || null,
      });

      if (error) {
        setFormError(traducirErrorRpc(error.message, ERRORES, "No se pudo guardar. Probá de nuevo."));
        setSubmitting(false);
        return;
      }

      router.push("/plata");
      router.refresh();
    } catch {
      setFormError(
        "No se pudo guardar por un problema de conexión. Los datos quedaron cargados: revisá tu conexión e intentá de nuevo.",
      );
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 pb-8">
      <SeccionForm titulo="¿Qué se debe y cuánto?">
        <Campo id="descripcion" etiqueta="Descripción">
          <Entrada
            type="text"
            required
            value={descripcion}
            onChange={(event) => setDescripcion(event.target.value)}
          />
        </Campo>

        <div>
          <span className={CLASE_ETIQUETA}>Moneda</span>
          <div
            role="group"
            aria-label="Moneda"
            className="mt-1.5 flex gap-px overflow-hidden rounded-xl border border-[#d0cec8] bg-border"
          >
            {(["ARS", "USD"] as const).map((opcion) => {
              const selected = moneda === opcion;
              return (
                <button
                  key={opcion}
                  type="button"
                  onClick={() => setMoneda(opcion)}
                  aria-pressed={selected}
                  className={`min-h-12 flex-1 px-3 text-[16px] font-semibold transition-colors ${
                    selected ? "bg-primary text-primary-foreground" : "bg-surface-raised text-text"
                  }`}
                >
                  {opcion}
                </button>
              );
            })}
          </div>
        </div>

        <MontoInput
          id="monto"
          label={`Monto (${moneda})`}
          value={montoInput}
          onChange={setMontoInput}
          required
          placeholder="0,00"
          simbolo={moneda === "USD" ? "USD" : "$"}
          cajaClassName={CLASE_CAJA_MONTO}
          simboloClassName={CLASE_SIMBOLO_MONTO_GRANDE}
          inputClassName={CLASE_INPUT_MONTO_GRANDE}
        />
      </SeccionForm>

      <MasDatos abierto={nota.trim() !== "" || (fecha !== "" && fecha !== hoyISO())}>
        <Campo id="fecha" etiqueta="Fecha">
          <Entrada type="date" required value={fecha} onChange={(event) => setFecha(event.target.value)} className="tabular-nums" />
        </Campo>
        <Campo id="nota" etiqueta="Nota" opcional>
          <AreaTexto value={nota} onChange={(event) => setNota(event.target.value)} rows={2} />
        </Campo>
      </MasDatos>

      {formError && <MensajeError>{formError}</MensajeError>}

      <AccionesForm etiqueta="Guardar deuda" cargando={submitting} cancelarHref="/plata" />
    </form>
  );
}
