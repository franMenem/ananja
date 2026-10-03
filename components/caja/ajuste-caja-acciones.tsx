"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { MEDIO_PAGO_LABELS, mensajeEliminarAjuste, type MedioPago } from "@/lib/dominio/caja";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { formatCentavos } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";

type AjusteCajaAccionesProps = {
  ajusteId: string;
  medioPago: MedioPago;
  montoCentavos: number;
  nota: string;
  fecha: string;
  className?: string;
};

const ERRORES_EDITAR: Record<string, string> = {
  NOTA_REQUERIDA: "La nota es obligatoria: contá por qué cambiás el ajuste.",
  AJUSTE_INVALIDO: "Este ajuste ya no existe.",
  NO_AUTORIZADO: "No tenés permiso para esto.",
};

const ERRORES_ELIMINAR: Record<string, string> = {
  AJUSTE_INVALIDO: "Este ajuste ya no existe.",
  NO_AUTORIZADO: "No tenés permiso para esto.",
};

/**
 * "Editar"/"Eliminar" para una fila de `ajustes_caja` — mismo patrón de
 * botón + `BottomSheet` de confirmación que `PagoDeudaDeleteButton`
 * (`components/deudas/pago-deuda-delete-button.tsx`).
 *
 * `supabase/migrations/0034_editar_ajuste_caja.sql` habilita editar SOLO
 * fecha/nota (nunca monto ni medio de pago, para que el saldo no se pueda
 * reescribir en silencio) y eliminar la fila entera (única vía para
 * corregir un monto/medio mal cargado). Ambas RPCs son admin-only —
 * `AJUSTE_INVALIDO`/`NOTA_REQUERIDA`/`NO_AUTORIZADO` se traducen acá a
 * mensajes en español.
 *
 * Componente cliente autocontenido (un Server Component no
 * puede pasarle funciones como props a un Client Component) — recibe solo
 * datos serializables del ajuste y arma sus propios sheets/estado.
 */
export function AjusteCajaAcciones({
  ajusteId,
  medioPago,
  montoCentavos,
  nota,
  fecha,
  className,
}: AjusteCajaAccionesProps) {
  const router = useRouter();
  const [sheet, setSheet] = useState<"editar" | "eliminar" | null>(null);
  const [fechaInput, setFechaInput] = useState(fecha);
  const [notaInput, setNotaInput] = useState(nota);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function abrirEditar() {
    setFechaInput(fecha);
    setNotaInput(nota);
    setError(null);
    setSheet("editar");
  }

  function abrirEliminar() {
    setError(null);
    setSheet("eliminar");
  }

  function cerrar() {
    if (saving) return;
    setSheet(null);
    setError(null);
  }

  async function handleGuardar(event: React.FormEvent) {
    event.preventDefault();
    if (!notaInput.trim()) {
      setError("La nota es obligatoria: contá por qué cambiás el ajuste.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc("editar_ajuste_caja", {
        p_ajuste_id: ajusteId,
        p_fecha: fechaInput,
        p_nota: notaInput.trim(),
      });

      if (rpcError) {
        setError(traducirErrorRpc(rpcError.message, ERRORES_EDITAR, "No se pudo guardar. Probá de nuevo."));
        setSaving(false);
        return;
      }

      setSaving(false);
      setSheet(null);
      router.refresh();
    } catch {
      setSaving(false);
      setError("No se pudo conectar. Verificá tu conexión e intentá de nuevo.");
    }
  }

  async function handleEliminar() {
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: rpcError } = await supabase.rpc("eliminar_ajuste_caja", {
        p_ajuste_id: ajusteId,
      });

      if (rpcError) {
        setError(traducirErrorRpc(rpcError.message, ERRORES_ELIMINAR, "No se pudo eliminar. Probá de nuevo."));
        setSaving(false);
        return;
      }

      setSaving(false);
      setSheet(null);
      router.refresh();
    } catch {
      setSaving(false);
      setError("No se pudo conectar. Verificá tu conexión e intentá de nuevo.");
    }
  }

  return (
    <>
      <div className={className ?? "flex gap-3"}>
        <button
          type="button"
          onClick={abrirEditar}
          className="text-[11px] tracking-[0.12em] text-text-muted uppercase hover:text-primary"
        >
          Editar
        </button>
        <button
          type="button"
          onClick={abrirEliminar}
          className="text-[11px] tracking-[0.12em] text-text-muted uppercase hover:text-accent"
        >
          Eliminar
        </button>
      </div>

      <BottomSheet open={sheet === "editar"} ariaLabel="Editar ajuste" variant="mark">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-[26px] text-primary">Editar ajuste</h2>
          <button
            type="button"
            onClick={cerrar}
            disabled={saving}
            className="text-[11px] tracking-[0.12em] text-text-muted uppercase"
          >
            Cerrar
          </button>
        </div>
        <p className="mt-2 text-sm text-text-muted">
          {formatCentavos(Math.abs(montoCentavos))} en {MEDIO_PAGO_LABELS[medioPago]} — el
          monto y la caja no se pueden cambiar acá; si están mal, eliminá este
          ajuste y cargá uno nuevo.
        </p>

        <form onSubmit={handleGuardar} className="mt-5 flex flex-col gap-5">
          <div>
            <label
              htmlFor="ajuste-editar-fecha"
              className="text-[10px] tracking-[0.18em] text-text-muted uppercase"
            >
              Fecha
            </label>
            <input
              id="ajuste-editar-fecha"
              type="date"
              required
              value={fechaInput}
              onChange={(event) => setFechaInput(event.target.value)}
              className="mt-1.5 min-h-11 w-full border border-border bg-surface px-3.5 text-base text-text tabular-nums focus:border-primary"
            />
          </div>

          <div>
            <label
              htmlFor="ajuste-editar-nota"
              className="text-[10px] tracking-[0.18em] text-text-muted uppercase"
            >
              Nota (obligatoria)
            </label>
            <textarea
              id="ajuste-editar-nota"
              required
              value={notaInput}
              onChange={(event) => setNotaInput(event.target.value)}
              rows={2}
              className="mt-1.5 min-h-[60px] w-full border border-border bg-surface px-3 py-2 text-base text-text focus:border-primary"
            />
          </div>

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
              Guardar cambios
            </BotonAccion>
            <button
              type="button"
              onClick={cerrar}
              disabled={saving}
              className="min-h-11 flex-1 border border-border px-4 text-[13px] font-medium tracking-[0.14em] text-text-muted uppercase disabled:opacity-45"
            >
              Cancelar
            </button>
          </div>
        </form>
      </BottomSheet>

      <BottomSheet open={sheet === "eliminar"} ariaLabel="Eliminar ajuste" variant="accent">
        <span className="text-[10px] font-medium tracking-[0.18em] text-accent uppercase">
          Eliminar ajuste
        </span>
        <p className="mt-3 text-[15px] text-text">
          {mensajeEliminarAjuste(medioPago, montoCentavos)}
        </p>
        {nota && <p className="mt-2 text-sm text-text-muted">{nota}</p>}
        {error && (
          <p role="alert" className="mt-2 text-xs text-accent">
            {error}
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={cerrar}
            disabled={saving}
            className="min-h-11 flex-1 border border-primary px-4 text-[13px] font-medium tracking-[0.14em] text-primary uppercase disabled:opacity-45"
          >
            Cancelar
          </button>
          <BotonAccion
            cargando={saving}
            textoCargando="Eliminando…"
            type="button"
            onClick={() => void handleEliminar()}
            className="min-h-11 flex-1 bg-accent px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase disabled:opacity-45"
          >
            Eliminar
          </BotonAccion>
        </div>
      </BottomSheet>
    </>
  );
}
