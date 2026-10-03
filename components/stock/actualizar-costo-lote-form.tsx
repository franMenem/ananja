"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormHeaderDesktop } from "@/components/app/form-header-desktop";
import { SetFormHeader } from "@/components/page-header-context";
import { useProveedor } from "@/components/stock/proveedor-context";
import {
  CostosLoteCampos,
  type EtiquetaInsumoLote,
  type ProductoLoteItem,
} from "@/components/stock/costos-lote-campos";
import type { RecetaEtiquetaConInsumo } from "@/lib/dominio/costos-lote";
import { formatFechaHora } from "@/lib/fechas";
import {
  camposCostosLoteInvalidos,
  construirPCostosLote,
  mensajeCamposInvalidos,
  mensajeErrorLote,
  type CostosLoteState,
} from "@/lib/dominio/lotes";
import { actualizarCostoLoteVigente } from "@/lib/lotes";
import { NEGOCIO } from "@/lib/negocio";
import { createClient } from "@/lib/supabase/client";

type ActualizarCostoLoteFormProps = {
  loteId: string;
  titulo: string;
  items: ProductoLoteItem[];
  recetasEtiqueta: RecetaEtiquetaConInsumo[];
  etiquetas: EtiquetaInsumoLote[];
  valorInicial: CostosLoteState;
  /** Σ `v_stock_por_lote.quedan` de este lote — cuántas botellas van a
   * quedar afectadas por esta actualización. 0: se avisa que no cambia
   * nada de lo ya entregado/vendido (que es TODO lo que tiene este lote). */
  enDeposito: number;
  avisoEtiquetaLegado?: boolean;
  /** `created_at` de la última `lote_valoraciones` de este lote (S2,
   * revisión adversarial) — `valorInicial` salió de ahí, no de los costos
   * originales del pedido. `null`: es la primera actualización, `valorInicial`
   * salió de "Editar costos" como siempre. */
  precargadoDesdeFecha?: string | null;
};

/**
 * "Actualizar costos del depósito" (`/stock/lotes/[id]/actualizar-costos`):
 * costo de REPOSICIÓN de un lote — reusa los mismos campos que "Editar
 * costos" (`CostosLoteCampos`, mismo `CostosLoteState`/`construirPCostosLote`
 * que el formulario del pedido), pero SIN el paso "Revisá el pedido"
 * (pagos/redondeos/"Monto real" — eso sigue siendo exclusivo del costo
 * ORIGINAL, lo que realmente se le pagó al proveedor) y guardando vía
 * `actualizar_costo_lote_vigente` en vez de `fijar_costos_lote`: agrega una
 * fila a `lote_valoraciones` (historial), nunca toca `lote_costos`/
 * `gastos`/`deudas`/`lotes_produccion`. Afecta SOLO las botellas que
 * siguen en el depósito — lo ya entregado/vendido conserva su costo
 * congelado (0044/0052), y lo pagado al proveedor no cambia.
 */
export function ActualizarCostoLoteForm({
  loteId,
  titulo,
  items,
  recetasEtiqueta,
  etiquetas,
  valorInicial,
  enDeposito,
  avisoEtiquetaLegado = false,
  precargadoDesdeFecha = null,
}: ActualizarCostoLoteFormProps) {
  const router = useRouter();
  const proveedor = useProveedor();
  const [costos, setCostos] = useState<CostosLoteState>(valorInicial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const productoIds = items.map((i) => i.productoId);
  const etiquetaInsumoIds = etiquetas.map((e) => e.insumoId);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const invalidos = camposCostosLoteInvalidos(costos, productoIds, etiquetaInsumoIds);
    if (invalidos.length > 0) {
      setError(mensajeCamposInvalidos(invalidos));
      return;
    }

    // Sin redondeos: esta pantalla no tiene paso de "Revisá el pedido" —
    // el costo se calcula directo de lo cargado acá.
    const pCostos = construirPCostosLote(costos, productoIds, etiquetaInsumoIds);
    if (!pCostos) {
      setError("Cargá al menos un costo.");
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const { error: rpcError } = await actualizarCostoLoteVigente(supabase, loteId, pCostos);
      if (rpcError) {
        setError(mensajeErrorLote(rpcError.message, rpcError.details));
        return;
      }
      router.push(`/stock/lotes/${loteId}`);
      router.refresh();
    } catch {
      setError("No se pudo conectar. Revisá la conexión e intentá de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  const plural = enDeposito === 1 ? NEGOCIO.envase.singular : NEGOCIO.envase.plural;

  return (
    <div className="flex flex-col gap-5 pb-8">
      <SetFormHeader
        title={`Actualizar costos — ${titulo}`}
        backHref={`/stock/lotes/${loteId}`}
        backLabel="Volver al lote"
      />
      <FormHeaderDesktop />

      <div className="flex flex-col gap-1.5 border-l-2 border-accent bg-surface-raised p-4">
        {enDeposito > 0 ? (
          <p className="text-[13px] leading-[1.5] text-text">
            Cambia el costo de las <strong className="font-medium">{enDeposito}</strong> {plural} que
            quedan en el depósito. Lo ya entregado o vendido no cambia, y lo pagado {proveedor.a} tampoco.
          </p>
        ) : (
          <p className="text-[13px] leading-[1.5] text-text">
            Este lote no tiene {NEGOCIO.envase.plural} en el depósito — actualizar el costo no cambia
            nada de lo ya entregado o vendido, que es todo lo que tiene este lote hoy.
          </p>
        )}
      </div>

      {precargadoDesdeFecha && (
        <p className="text-[11px] leading-snug text-text-muted">
          Precargado con la actualización del {formatFechaHora(precargadoDesdeFecha)}.
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <CostosLoteCampos
          items={items}
          recetasEtiqueta={recetasEtiqueta}
          etiquetas={etiquetas}
          value={costos}
          onChange={setCostos}
          avisoEtiquetaLegado={avisoEtiquetaLegado}
          soloCosto
        />

        {error && (
          <p role="alert" className="text-[12px] text-accent">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="min-h-14 bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase transition-colors hover:bg-primary-hover disabled:opacity-45"
        >
          {saving ? "Guardando…" : "Actualizar costo vigente"}
        </button>
      </form>
    </div>
  );
}
