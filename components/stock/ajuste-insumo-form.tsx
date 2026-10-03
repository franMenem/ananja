"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { BotonAccion } from "@/components/boton-accion";
import { listarInsumosActivos } from "@/lib/data/insumos";
import { UNIDAD_INSUMO_LABELS, type Insumo } from "@/lib/dominio/insumos";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { ajustarInsumo } from "@/lib/insumos";
import { MontoInput } from "@/components/monto-input";
import { useProveedor } from "@/components/stock/proveedor-context";
import { parseCantidadInput } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";
import { useVendedorActual } from "@/lib/vendedor-actual";

type Signo = "suma" | "resta";

const ERRORES: Record<string, string> = {
  VENDEDOR_NO_REGISTRADO: "Tu usuario no está vinculado a un vendedor. Pedile al dueño que te dé de alta.",
  INSUMO_INVALIDO: "Ese insumo no existe.",
  NOTA_REQUERIDA: "Explicá el ajuste en la nota.",
  CANTIDAD_INVALIDA: "Revisá la cantidad.",
};

function mensajeErrorAjuste(codigo: string | undefined): string {
  return traducirErrorRpc(codigo, ERRORES, "No se pudo guardar el ajuste. Probá de nuevo.");
}

/**
 * Formulario de "Ajustar stock" (`/stock/insumos/ajuste`, spec §
 * Pantallas): insumo, chips "Sumar"/"Restar" + cantidad, nota
 * obligatoria — mismo patrón de signo que
 * `components/caja/ajustar-saldo-button.tsx`. Llama `ajustar_insumo`, sin
 * costo asociado (a diferencia de "Registrar compra").
 */
export function AjusteInsumoForm() {
  const router = useRouter();
  const proveedor = useProveedor();
  const { vendedor, loading: vendedorLoading } = useVendedorActual();

  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [insumosLoading, setInsumosLoading] = useState(true);
  const [insumoId, setInsumoId] = useState("");
  const [signo, setSigno] = useState<Signo>("suma");
  const [cantidad, setCantidad] = useState("");
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    listarInsumosActivos(supabase).then(({ data }) => {
      if (cancelled) return;
      setInsumos(data);
      setInsumosLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const insumoSeleccionado = insumos.find((i) => i.id === insumoId) ?? null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!insumoId) {
      setError("Elegí un insumo.");
      return;
    }
    const cantidadAbs = parseCantidadInput(cantidad);
    if (cantidadAbs === null || cantidadAbs <= 0) {
      setError("Revisá la cantidad.");
      return;
    }
    if (!nota.trim()) {
      setError("Explicá el ajuste en la nota.");
      return;
    }

    const cantidadConSigno = signo === "resta" ? -cantidadAbs : cantidadAbs;

    setSaving(true);
    try {
      const supabase = createClient();
      const { error: rpcError } = await ajustarInsumo(supabase, {
        insumoId,
        cantidad: cantidadConSigno,
        nota: nota.trim(),
      });

      if (rpcError) {
        setSaving(false);
        setError(mensajeErrorAjuste(rpcError.message));
        return;
      }

      router.push("/stock/insumos");
      router.refresh();
    } catch {
      setSaving(false);
      setError(
        "No se pudo conectar. Verificá tu conexión e intentá de nuevo — no perdiste los datos cargados.",
      );
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 pb-8">
      <div>
        <label
          htmlFor="insumo"
          className="text-[10px] tracking-[0.18em] text-text-muted uppercase"
        >
          Insumo
        </label>
        <select
          id="insumo"
          required
          disabled={insumosLoading}
          value={insumoId}
          onChange={(event) => setInsumoId(event.target.value)}
          className="mt-1.5 min-h-12 w-full border border-border bg-surface px-3 text-base text-text focus:border-primary disabled:opacity-60"
        >
          <option value="" disabled>
            {insumosLoading ? "Cargando…" : "Seleccioná un insumo"}
          </option>
          {insumos.map((insumo) => (
            <option key={insumo.id} value={insumo.id}>
              {insumo.nombre}
            </option>
          ))}
        </select>
      </div>

      <div>
        <span className="text-[10px] tracking-[0.18em] text-text-muted uppercase">
          Tipo de ajuste
        </span>
        <div className="mt-1.5 flex gap-px bg-border">
          {(
            [
              { value: "suma", label: "Sumar" },
              { value: "resta", label: "Restar" },
            ] as const
          ).map((opcion) => {
            const selected = signo === opcion.value;
            return (
              <button
                key={opcion.value}
                type="button"
                onClick={() => setSigno(opcion.value)}
                aria-pressed={selected}
                className={`min-h-11 flex-1 px-3 text-sm font-semibold transition-colors ${
                  selected ? "bg-primary text-background" : "bg-surface-raised text-text"
                }`}
              >
                {opcion.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <MontoInput
          id="cantidad"
          tipo="cantidad"
          label={
            <>
              Cantidad
              {insumoSeleccionado
                ? ` (${UNIDAD_INSUMO_LABELS[insumoSeleccionado.unidad as keyof typeof UNIDAD_INSUMO_LABELS]?.toLowerCase() ?? insumoSeleccionado.unidad})`
                : ""}
            </>
          }
          value={cantidad}
          onChange={setCantidad}
          required
          placeholder="0"
          labelClassName="text-[10px] tracking-[0.18em] text-text-muted uppercase"
          cajaClassName="mt-1.5 flex border border-border bg-surface px-3 focus-within:border-primary"
          inputClassName="min-h-12 w-full min-w-0 bg-transparent text-base text-text focus:outline-none"
        />
      </div>

      {!vendedorLoading && vendedor && (
        <p className="text-xs text-text-muted">
          Registrando como <span className="font-medium">{vendedor.nombre}</span>
        </p>
      )}
      {!vendedorLoading && !vendedor && (
        <p role="alert" className="text-xs text-accent">
          Tu usuario no está vinculado a un vendedor. Pedile al dueño que te dé de
          alta desde el dashboard de Supabase.
        </p>
      )}

      <div>
        <label
          htmlFor="nota"
          className="text-[10px] tracking-[0.18em] text-text-muted uppercase"
        >
          Nota (obligatoria)
        </label>
        <textarea
          id="nota"
          required
          value={nota}
          onChange={(event) => setNota(event.target.value)}
          rows={2}
          placeholder={`Ej. conteo ${proveedor.loDe}, rotura de 3 envases`}
          className="mt-1.5 min-h-[60px] w-full border border-border bg-surface px-3 py-2 text-base text-text focus:border-primary"
        />
      </div>

      {error && (
        <p role="alert" className="text-[12px] text-accent">
          {error}
        </p>
      )}

      <BotonAccion
        cargando={saving}
        textoCargando="Guardando…"
        type="submit"
        className="min-h-14 bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase transition-colors hover:bg-primary-hover disabled:opacity-45"
      >
        Guardar ajuste
      </BotonAccion>
    </form>
  );
}
