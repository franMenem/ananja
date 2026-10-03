"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { MontoInput } from "@/components/monto-input";
import { BottomSheet } from "@/components/bottom-sheet";
import { MEDIO_PAGO_LABELS, MEDIOS_CAJA, type MedioPago } from "@/lib/dominio/caja";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { hoyISO } from "@/lib/fechas";
import { createClient } from "@/lib/supabase/client";
import { parseMontoInput } from "@/lib/money";
import { useVendedorActual } from "@/lib/vendedor-actual";

type Signo = "suma" | "resta";

const ERRORES: Record<string, string> = {
  NOTA_REQUERIDA: "La nota es obligatoria: contá por qué ajustás el saldo.",
  MONTO_INVALIDO: "Ingresá un monto válido, distinto de cero.",
  VENDEDOR_NO_REGISTRADO: "Tu usuario no está vinculado a un vendedor. Pedile al dueño que te dé de alta.",
};

type AjustarSaldoButtonProps = {
  /** Preselecciona la caja destino (ej. al abrir desde /plata/cuenta/[medio]). */
  medioInicial?: MedioPago;
  className?: string;
  /** Texto del botón disparador. Default: "Ajustar saldo". */
  label?: string;
};

/**
 * Botón + modal para registrar un ajuste de caja (T026). Inserta vía RPC
 * `crear_ajuste_caja` (única vía permitida — ver contracts/database.md):
 * el monto se arma con signo a partir de un toggle sumar/restar + un monto
 * siempre positivo, para que el usuario nunca tenga que escribir "-".
 *
 * `fecha` (default hoy, editable — `supabase/migrations/0033_fecha_ajuste_caja.sql`):
 * antes el ajuste quedaba fechado siempre a `created_at` (hoy), sin forma
 * de cargar, por ejemplo, el saldo inicial real del negocio en la fecha en
 * que arrancó en vez de en la fecha en que se lo termina cargando al
 * sistema.
 *
 * `supabase/migrations/0034_editar_ajuste_caja.sql` habilitó editar
 * (solo fecha/nota) y eliminar un ajuste ya cargado — ver
 * `components/caja/ajuste-caja-acciones.tsx`, que ofrece esas acciones
 * desde cada fila del historial en `/plata` y `/plata/cuenta/[medio]`.
 * Este componente sigue siendo solo para el ALTA.
 */
export function AjustarSaldoButton({
  medioInicial,
  className,
  label = "Ajustar saldo",
}: AjustarSaldoButtonProps) {
  const router = useRouter();
  const { vendedor, loading: vendedorLoading } = useVendedorActual();

  const [open, setOpen] = useState(false);
  const [medioPago, setMedioPago] = useState<MedioPago>(
    medioInicial ?? "efectivo",
  );
  const [signo, setSigno] = useState<Signo>("suma");
  const [montoInput, setMontoInput] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setMedioPago(medioInicial ?? "efectivo");
    setSigno("suma");
    setMontoInput("");
    setFecha(hoyISO());
    setNota("");
    setError(null);
  }

  function handleClose() {
    if (saving) return;
    setOpen(false);
    resetForm();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const montoAbs = parseMontoInput(montoInput);
    if (montoAbs === null || montoAbs <= 0) {
      setError("Ingresá un monto válido, mayor a cero.");
      return;
    }
    if (!nota.trim()) {
      setError("La nota es obligatoria: contá por qué ajustás el saldo.");
      return;
    }

    const montoCentavos = signo === "resta" ? -montoAbs : montoAbs;

    setSaving(true);
    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc("crear_ajuste_caja", {
        p_medio_pago: medioPago,
        p_monto_centavos: montoCentavos,
        p_nota: nota.trim(),
        p_fecha: fecha,
      });

      if (rpcError) {
        setError(traducirErrorRpc(rpcError.message, ERRORES, "No se pudo guardar el ajuste. Probá de nuevo."));
        setSaving(false);
        return;
      }

      setSaving(false);
      setOpen(false);
      resetForm();
      router.refresh();
    } catch {
      setSaving(false);
      setError(
        "No se pudo conectar. Verificá tu conexión e intentá de nuevo.",
      );
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "flex min-h-11 items-center justify-center border border-primary px-4 text-base font-semibold text-primary"
        }
      >
        {label}
      </button>

      <BottomSheet open={open} ariaLabel="Ajustar saldo" variant="mark">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-[26px] text-primary">
            Ajustar saldo
          </h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            className="text-[11px] tracking-[0.12em] text-text-muted uppercase"
          >
            Cerrar
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-5">
          <div>
            <span className="text-[10px] tracking-[0.18em] text-text-muted uppercase">
              Caja
            </span>
            <div className="mt-1.5 flex gap-px bg-border">
              {MEDIOS_CAJA.map((medio) => {
                const selected = medioPago === medio;
                return (
                  <button
                    key={medio}
                    type="button"
                    onClick={() => setMedioPago(medio)}
                    aria-pressed={selected}
                    className={`min-h-11 flex-1 px-2 text-xs font-medium transition-colors ${
                      selected
                        ? "bg-primary text-background"
                        : "bg-surface-raised text-text"
                    }`}
                  >
                    {MEDIO_PAGO_LABELS[medio]}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="text-[10px] tracking-[0.18em] text-text-muted uppercase">
              Tipo de ajuste
            </span>
            <div className="mt-1.5 flex gap-px bg-border">
              <button
                type="button"
                onClick={() => setSigno("suma")}
                aria-pressed={signo === "suma"}
                className={`min-h-11 flex-1 px-3 text-sm font-semibold transition-colors ${
                  signo === "suma"
                    ? "bg-primary text-background"
                    : "bg-surface-raised text-text"
                }`}
              >
                + Sumar
              </button>
              <button
                type="button"
                onClick={() => setSigno("resta")}
                aria-pressed={signo === "resta"}
                className={`min-h-11 flex-1 px-3 text-sm font-semibold transition-colors ${
                  signo === "resta"
                    ? "bg-surface-raised text-accent"
                    : "bg-surface-raised text-text"
                }`}
              >
                − Restar
              </button>
            </div>
          </div>

          <MontoInput
            id="ajuste-monto"
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
            <label
              htmlFor="ajuste-fecha"
              className="text-[10px] tracking-[0.18em] text-text-muted uppercase"
            >
              Fecha
            </label>
            <input
              id="ajuste-fecha"
              type="date"
              required
              value={fecha}
              onChange={(event) => setFecha(event.target.value)}
              className="mt-1.5 min-h-11 w-full border border-border bg-surface px-3.5 text-base text-text tabular-nums focus:border-primary"
            />
          </div>

          <div>
            <label
              htmlFor="ajuste-nota"
              className="text-[10px] tracking-[0.18em] text-text-muted uppercase"
            >
              Nota (obligatoria)
            </label>
            <textarea
              id="ajuste-nota"
              required
              value={nota}
              onChange={(event) => setNota(event.target.value)}
              rows={2}
              placeholder="Ej. conteo inicial demo"
              className="mt-1.5 min-h-[60px] w-full border border-border bg-surface px-3 py-2 text-base text-text focus:border-primary"
            />
          </div>

          {!vendedorLoading && vendedor && (
            <p className="text-xs text-text-muted">
              Registrando como{" "}
              <span className="font-medium">{vendedor.nombre}</span>
            </p>
          )}
          {!vendedorLoading && !vendedor && (
            <p role="alert" className="text-xs text-accent">
              Tu usuario no está vinculado a un vendedor. Pedile al dueño
              que te dé de alta desde el dashboard de Supabase.
            </p>
          )}

          {error && (
            <p role="alert" className="text-sm text-accent">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <BotonAccion
              cargando={saving}
              textoCargando="Guardando…"
              type="submit"
              className="min-h-11 flex-[1.6] bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase transition-colors hover:bg-primary-hover disabled:opacity-45"
            >
              Guardar ajuste
            </BotonAccion>
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className="min-h-11 flex-1 border border-border px-4 text-[13px] font-medium tracking-[0.14em] text-text-muted uppercase disabled:opacity-45"
            >
              Cancelar
            </button>
          </div>

          <p className="text-center text-[11px] text-text-muted">
            Después de guardarlo podés editar la fecha/nota o eliminarlo
            desde el historial de Caja.
          </p>
        </form>
      </BottomSheet>
    </>
  );
}
