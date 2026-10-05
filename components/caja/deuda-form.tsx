"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { MontoInput } from "@/components/monto-input";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { hoyISO } from "@/lib/fechas";
import { parseMontoInput } from "@/lib/money";
import { crearDeuda } from "@/lib/precios";
import { createClient } from "@/lib/supabase/client";

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
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 pb-8">
      <div className="flex flex-col gap-2.5">
        <label
          htmlFor="descripcion"
          className="text-[10px] tracking-[0.22em] text-text-muted uppercase"
        >
          Descripción
        </label>
        <input
          id="descripcion"
          type="text"
          required
          value={descripcion}
          onChange={(event) => setDescripcion(event.target.value)}
          className="min-h-12 border border-border bg-surface px-3.5 text-base text-text focus:border-primary"
        />
      </div>

      <div>
        <span className="text-[10px] tracking-[0.18em] text-text-muted uppercase">
          Moneda
        </span>
        <div className="mt-1.5 flex gap-px bg-border">
          {(["ARS", "USD"] as const).map((opcion) => {
            const selected = moneda === opcion;
            return (
              <button
                key={opcion}
                type="button"
                onClick={() => setMoneda(opcion)}
                aria-pressed={selected}
                className={`min-h-11 flex-1 px-3 text-sm font-semibold transition-colors ${
                  selected
                    ? "bg-primary text-background"
                    : "bg-surface-raised text-text"
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
        className="flex flex-col gap-2.5"
        labelClassName="text-[10px] tracking-[0.22em] text-text-muted uppercase"
        cajaClassName="flex items-baseline gap-2 border-b-2 border-primary pb-1"
        simboloClassName="font-display text-[18px] text-text-muted"
        inputClassName="font-display w-full min-w-0 bg-transparent text-[28px] text-primary tabular-nums"
      />

      <div className="flex flex-col gap-2.5">
        <label
          htmlFor="fecha"
          className="text-[10px] tracking-[0.22em] text-text-muted uppercase"
        >
          Fecha
        </label>
        <input
          id="fecha"
          type="date"
          required
          value={fecha}
          onChange={(event) => setFecha(event.target.value)}
          className="min-h-12 min-w-0 border border-border bg-surface px-3.5 text-base text-text tabular-nums focus:border-primary"
        />
      </div>

      <div className="flex flex-col gap-2.5">
        <label
          htmlFor="nota"
          className="text-[10px] tracking-[0.22em] text-text-muted uppercase"
        >
          Nota (opcional)
        </label>
        <textarea
          id="nota"
          value={nota}
          onChange={(event) => setNota(event.target.value)}
          rows={2}
          className="min-h-[60px] border border-border bg-surface px-3.5 py-3 text-base text-text placeholder:text-text-muted focus:border-primary"
        />
      </div>

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
        Guardar deuda
      </BotonAccion>
    </form>
  );
}
