"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { MontoInput } from "@/components/monto-input";
import { BottomSheet } from "@/components/bottom-sheet";
import { MedioPagoChips } from "@/components/medio-pago-chips";
import { SetFormHeader } from "@/components/page-header-context";
import { type MedioPago } from "@/lib/dominio/caja";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { hoyISO } from "@/lib/fechas";
import { formatCentavos, formatMontoDisplay, parseMontoInput } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";
import { MEDIOS_DESTINO_TRANSFERENCIA } from "@/lib/dominio/transferencias";

type Persona = { id: string; nombre: string };

type DepositarFormProps = {
  personas: Persona[];
  /** Cuánto tiene cada persona en mano ahora mismo
   * (`v_plata_en_manos.total_centavos`) — se usa para precargar el monto
   * cada vez que se cambia de persona en el selector. */
  montosPorPersona: Record<string, number>;
  tenedorInicial: string | null;
};

const ERRORES: Record<string, string> = {
  NO_AUTORIZADO: "No tenés permiso para esto.",
  TENEDOR_INVALIDO: "Esa persona no es un admin ni un coordinador activo.",
  MEDIO_INVALIDO: "Elegí Mercado Pago o Banco.",
  MONTO_INVALIDO: "Revisá el monto.",
};

/**
 * Formulario "Pasar a la cuenta" (`/plata/depositar`) — RPC
 * `registrar_deposito_cuenta` (`supabase/migrations/0037_plata_en_manos.sql`):
 * una persona (normalmente el propio admin, pero cualquier admin puede
 * cargar el depósito de otro) deposita lo que tiene en mano en la Cuenta
 * Ananja real (Mercado Pago o Banco — nunca "Efectivo": `medio_pago <>
 * 'efectivo'` es un CHECK de `depositos_cuenta`). `SALDO_INSUFICIENTE` no
 * es un error terminal: se resuelve con un `BottomSheet` "Guardar igual"
 * (reintenta con `p_permitir_negativo: true`), mismo patrón que
 * `TransferirForm`/`ComprobanteForm`.
 */
export function DepositarForm({
  personas,
  montosPorPersona,
  tenedorInicial,
}: DepositarFormProps) {
  const router = useRouter();

  const [tenedorId, setTenedorId] = useState<string | null>(
    tenedorInicial ?? personas[0]?.id ?? null,
  );
  const [medioPago, setMedioPago] = useState<MedioPago | null>(null);
  const [montoInput, setMontoInput] = useState(() => {
    const inicial = tenedorInicial ? montosPorPersona[tenedorInicial] : undefined;
    // Nunca se precarga un monto <= 0: en 0 no hay nada que depositar, y
    // uno negativo (`v_plata_en_manos.total_centavos < 0`, ver
    // `app/(app)/plata/page.tsx`) es un dato roto que un admin no debería
    // depositar "tal cual" — se deja el campo vacío para que lo complete
    // a mano si igual quiere registrar algo.
    return inicial && inicial > 0 ? formatMontoDisplay(inicial) : "";
  });
  const [fecha, setFecha] = useState(hoyISO());
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saldoInsuficiente, setSaldoInsuficiente] = useState<{
    disponibleCentavos: number;
  } | null>(null);

  function handlePersonaChange(id: string) {
    setTenedorId(id);
    const disponible = montosPorPersona[id];
    // Mismo criterio que el estado inicial: nunca precargar <= 0.
    setMontoInput(disponible && disponible > 0 ? formatMontoDisplay(disponible) : "");
  }

  async function enviar(montoCentavos: number, permitirNegativo: boolean) {
    if (!tenedorId || !medioPago) return;

    setSaving(true);
    setError(null);

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("registrar_deposito_cuenta", {
      p_tenedor_id: tenedorId,
      p_medio_pago: medioPago,
      p_monto_centavos: montoCentavos,
      p_fecha: fecha,
      p_nota: nota.trim() || undefined,
      p_permitir_negativo: permitirNegativo,
    });

    if (rpcError) {
      if (rpcError.message === "SALDO_INSUFICIENTE") {
        let disponibleCentavos = 0;
        try {
          const detalle = JSON.parse(rpcError.details ?? "{}") as { disponible?: number };
          disponibleCentavos = detalle.disponible ?? 0;
        } catch {
          disponibleCentavos = 0;
        }
        setSaldoInsuficiente({ disponibleCentavos });
      } else {
        setError(traducirErrorRpc(rpcError.message, ERRORES, "No se pudo guardar el depósito. Probá de nuevo."));
      }
      setSaving(false);
      return;
    }

    setSaving(false);
    router.push("/plata");
    router.refresh();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!tenedorId) {
      setError("Elegí de quién es la plata.");
      return;
    }
    if (!medioPago) {
      setError("Elegí Mercado Pago o Banco.");
      return;
    }

    const montoCentavos = parseMontoInput(montoInput);
    if (montoCentavos === null || montoCentavos <= 0) {
      setError("Revisá el monto.");
      return;
    }

    await enviar(montoCentavos, false);
  }

  async function handleGuardarIgual() {
    const montoCentavos = parseMontoInput(montoInput);
    if (montoCentavos === null || montoCentavos <= 0) return;
    setSaldoInsuficiente(null);
    await enviar(montoCentavos, true);
  }

  return (
    <>
      <SetFormHeader title="Pasar a la cuenta" backHref="/plata" backLabel="Volver a Plata" />

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <label
            htmlFor="deposito-persona"
            className="text-[10px] tracking-[0.18em] text-text-muted uppercase"
          >
            Quién tenía la plata
          </label>
          <select
            id="deposito-persona"
            value={tenedorId ?? ""}
            onChange={(event) => handlePersonaChange(event.target.value)}
            className="mt-1.5 min-h-12 w-full border border-border bg-surface px-3 text-base text-text focus:border-primary"
          >
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
                {montosPorPersona[p.id] > 0 ? ` · ${formatCentavos(montosPorPersona[p.id])} en mano` : ""}
              </option>
            ))}
          </select>
        </div>

        <MontoInput
          id="deposito-monto"
          label="Monto"
          value={montoInput}
          onChange={setMontoInput}
          required
          placeholder="$ 0,00"
          simbolo={null}
          labelClassName="text-[10px] tracking-[0.18em] text-text-muted uppercase"
          cajaClassName="mt-1 flex border-b-2 border-primary"
          inputClassName="font-display block w-full min-w-0 bg-transparent py-1 text-[40px] text-primary tabular-nums"
        />

        <div>
          <span className="text-[10px] tracking-[0.18em] text-text-muted uppercase">
            Cuenta destino
          </span>
          <MedioPagoChips
            value={medioPago}
            onChange={setMedioPago}
            opciones={MEDIOS_DESTINO_TRANSFERENCIA}
            ocultarRotulo
            className="mt-1.5"
          />
        </div>

        <div>
          <label
            htmlFor="deposito-fecha"
            className="text-[10px] tracking-[0.18em] text-text-muted uppercase"
          >
            Fecha
          </label>
          <input
            id="deposito-fecha"
            type="date"
            required
            value={fecha}
            onChange={(event) => setFecha(event.target.value)}
            className="mt-1.5 min-h-12 w-full border border-border bg-surface px-3 text-base text-text focus:border-primary"
          />
        </div>

        <div>
          <label
            htmlFor="deposito-nota"
            className="text-[10px] tracking-[0.18em] text-text-muted uppercase"
          >
            Nota (opcional)
          </label>
          <textarea
            id="deposito-nota"
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
          Guardar depósito
        </BotonAccion>
      </form>

      <BottomSheet
        open={saldoInsuficiente !== null}
        ariaLabel="Saldo insuficiente"
        variant="accent"
      >
        <h2 className="font-display text-[24px] text-primary">
          Tiene{" "}
          {saldoInsuficiente ? formatCentavos(saldoInsuficiente.disponibleCentavos) : "$ 0,00"}
          {" "}en mano
        </h2>
        <p className="mt-2 text-sm text-text-muted">Si guardás igual, queda negativo.</p>
        <div className="mt-5 flex gap-2">
          <BotonAccion
            cargando={saving}
            textoCargando="Guardando…"
            type="button"
            onClick={handleGuardarIgual}
            className="min-h-11 flex-[1.6] bg-accent px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase disabled:opacity-45"
          >
            Guardar igual
          </BotonAccion>
          <button
            type="button"
            onClick={() => !saving && setSaldoInsuficiente(null)}
            disabled={saving}
            className="min-h-11 flex-1 border border-border px-4 text-[13px] font-medium tracking-[0.14em] text-text-muted uppercase disabled:opacity-45"
          >
            Cancelar
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
