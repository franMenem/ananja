"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { listarInsumosActivos } from "@/lib/data/insumos";
import { UNIDAD_INSUMO_LABELS, type Insumo } from "@/lib/dominio/insumos";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { ajustarInsumo } from "@/lib/insumos";
import { MontoInput } from "@/components/monto-input";
import { AccionesForm } from "@/components/ui/acciones-form";
import { AreaTexto, Campo, MensajeError, Selector } from "@/components/ui/campo";
import { SeccionForm } from "@/components/ui/seccion-form";
import { Segmentos } from "@/components/ui/segmentos";
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <SeccionForm titulo="¿Qué insumo y cuánto cambia?">
        <Campo id="insumo" etiqueta="Insumo">
          <Selector
            required
            disabled={insumosLoading}
            value={insumoId}
            onChange={(event) => setInsumoId(event.target.value)}
            className="disabled:opacity-60"
          >
            <option value="" disabled>
              {insumosLoading ? "Cargando…" : "Seleccioná un insumo"}
            </option>
            {insumos.map((insumo) => (
              <option key={insumo.id} value={insumo.id}>
                {insumo.nombre}
              </option>
            ))}
          </Selector>
        </Campo>

        <Segmentos
          etiqueta="Tipo de ajuste"
          opciones={[
            { value: "suma", label: "Sumar" },
            { value: "resta", label: "Restar" },
          ]}
          valor={signo}
          onChange={setSigno}
        />

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
        />
      </SeccionForm>

      <SeccionForm titulo="¿Por qué?">
        <Campo id="nota" etiqueta="Nota (obligatoria)">
          <AreaTexto
            required
            value={nota}
            onChange={(event) => setNota(event.target.value)}
            rows={2}
            placeholder={`Ej. conteo ${proveedor.loDe}, rotura de 3 envases`}
          />
        </Campo>
      </SeccionForm>

      {!vendedorLoading && vendedor && (
        <p className="text-[14px] text-text-muted">
          Registrando como <span className="font-semibold text-text">{vendedor.nombre}</span>
        </p>
      )}
      {!vendedorLoading && !vendedor && (
        <MensajeError>
          Tu usuario no está vinculado a un vendedor. Pedile al dueño que te dé de alta desde el
          dashboard de Supabase.
        </MensajeError>
      )}

      {error && <MensajeError>{error}</MensajeError>}

      <AccionesForm etiqueta="Guardar ajuste" cargando={saving} cancelarHref="/stock/insumos" />
    </form>
  );
}
