"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { FormHeaderDesktop } from "@/components/app/form-header-desktop";
import { SetFormHeader } from "@/components/page-header-context";
import {
  CostosLoteCampos,
  type AceiteHeredado,
  type EtiquetaInsumoLote,
  type ProductoLoteItem,
  type TanqueAceiteHint,
  type UltimasComprasEtiquetas,
} from "@/components/stock/costos-lote-campos";
import { RevisionPedido } from "@/components/stock/revision-pedido";
import type { RecetaEtiquetaConInsumo } from "@/lib/dominio/costos-lote";
import {
  camposCostosLoteInvalidos,
  construirEntradaPedido,
  construirPCostosLote,
  mensajeCamposInvalidos,
  mensajeErrorLote,
  montosInicialesRevision,
  type CostosLoteState,
  type RedondeoCosto,
} from "@/lib/dominio/lotes";
import { fijarCostosLote } from "@/lib/lotes";
import { createClient } from "@/lib/supabase/client";

type CostosLoteFormProps = {
  loteId: string;
  titulo: string;
  items: ProductoLoteItem[];
  recetasEtiqueta: RecetaEtiquetaConInsumo[];
  etiquetas: EtiquetaInsumoLote[];
  valorInicial: CostosLoteState;
  /** Lo que el pedido YA tiene guardado como a pagar, por clave de redondeo
   * (`aPagarGuardadoPorConcepto`, lib/lotes.ts) — para arrancar "Revisá el
   * pedido" con los montos reales que ya se habían cargado. */
  aPagarGuardado?: Record<string, number>;
  tanqueAceite?: TanqueAceiteHint;
  /** Dólar/USD del pedido ANTERIOR a este — para el aviso "¿lo actualizás?"
   * mientras `dolar`/`precioLitroAceiteUsd` sigan iguales a lo que este
   * lote ya tenía cargado (ver `AceiteHeredado` en `costos-lote-campos.tsx`
   * — mismo riesgo de "dólar vencido" que en `LoteForm`, acá comparado
   * contra el pedido previo en vez del más reciente). */
  aceiteHeredado?: AceiteHeredado;
  /** `true`: este lote tenía etiquetas cargadas con el formato anterior a
   * 0029 (`insumo_id` null) — `valorInicial` ya reconstruyó un precio por
   * insumo a partir de esas filas (ver `prefillCostosLote`), pero conviene
   * que el dueño los revise antes de guardar. */
  avisoEtiquetaLegado?: boolean;
  /** Última compra de cada insumo de etiqueta — fuente del hint "Precio de
   * la última compra — 12/09" en `CostosLoteCampos` (el prefill en sí ya
   * viene resuelto en `valorInicial`, ver `prefillCostosLote`). */
  ultimasComprasEtiquetas?: UltimasComprasEtiquetas;
};

/**
 * "Editar costos"/"Completar costos de este pedido" (`/stock/lotes/[id]/costos`):
 * la misma sección "Costos del
 * pedido" que `LoteForm` usa al crear el lote (`CostosLoteCampos`), acá
 * prefijada con los costos YA cargados de este lote (o vacía, si todavía
 * no tiene ninguno) y guardando vía `fijar_costos_lote` — que REEMPLAZA
 * todos los `lote_costos` del lote, así que este formulario sirve tanto
 * para completar un lote sin costos como para corregir uno que ya los
 * tenía. Antes de guardar pasa por "Revisá el pedido" (`RevisionPedido`,
 * 0038): costo y a pagar por concepto, con los montos reales (redondeos).
 */
export function CostosLoteForm({
  loteId,
  titulo,
  items,
  recetasEtiqueta,
  etiquetas,
  valorInicial,
  aPagarGuardado = {},
  tanqueAceite = null,
  avisoEtiquetaLegado = false,
  aceiteHeredado = null,
  ultimasComprasEtiquetas = null,
}: CostosLoteFormProps) {
  const router = useRouter();
  const [costos, setCostos] = useState<CostosLoteState>(valorInicial);
  const [revisando, setRevisando] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const productoIds = items.map((i) => i.productoId);
  const etiquetaInsumoIds = etiquetas.map((e) => e.insumoId);
  const precioLitroTanqueCentavos = tanqueAceite?.costoPromedioCentavosPorLitro ?? null;

  const entrada = useMemo(
    () =>
      construirEntradaPedido({
        state: costos,
        items,
        recetasEtiqueta,
        etiquetaInsumoIds: etiquetas.map((e) => e.insumoId),
        precioLitroTanqueCentavos,
      }),
    [costos, items, recetasEtiqueta, etiquetas, precioLitroTanqueCentavos],
  );

  // Se calcula al entrar a la revisión: lo guardado solo se respeta para los
  // conceptos cuyo cálculo no cambió desde que se abrió la pantalla.
  const montosIniciales = useMemo(() => {
    if (!revisando) return {};
    return montosInicialesRevision({
      entradaInicial: construirEntradaPedido({
        state: valorInicial,
        items,
        recetasEtiqueta,
        etiquetaInsumoIds: etiquetas.map((e) => e.insumoId),
        precioLitroTanqueCentavos,
      }),
      entradaActual: entrada,
      aPagarGuardado,
    });
  }, [revisando, valorInicial, items, recetasEtiqueta, etiquetas, precioLitroTanqueCentavos, entrada, aPagarGuardado]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    // Algo escrito que no se entiende ("1520*") no se guarda como "no cargado".
    const invalidos = camposCostosLoteInvalidos(costos, productoIds, etiquetaInsumoIds);
    if (invalidos.length > 0) {
      setError(mensajeCamposInvalidos(invalidos));
      return;
    }

    if (!construirPCostosLote(costos, productoIds, etiquetaInsumoIds)) {
      setError("Cargá al menos un costo.");
      return;
    }

    setRevisando(true);
    window.scrollTo({ top: 0 });
  }

  async function guardar(redondeos: RedondeoCosto[]) {
    const pCostos = construirPCostosLote(costos, productoIds, etiquetaInsumoIds, redondeos);
    if (!pCostos) {
      setError("Cargá al menos un costo.");
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const supabase = createClient();
      const { error: rpcError } = await fijarCostosLote(supabase, loteId, pCostos);
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

  return (
    <div className="flex flex-col gap-5 pb-8">
      <SetFormHeader
        title={`Costos — ${titulo}`}
        backHref={`/stock/lotes/${loteId}`}
        backLabel="Volver al lote"
      />
      <FormHeaderDesktop />

      {revisando ? (
        <RevisionPedido
          entrada={entrada}
          etiquetaNombres={Object.fromEntries(etiquetas.map((e) => [e.insumoId, e.nombre]))}
          otrosDescripcion={costos.otrosDescripcion}
          montosIniciales={montosIniciales}
          saving={saving}
          error={error}
          onVolver={() => {
            setError(null);
            setRevisando(false);
          }}
          onConfirmar={(redondeos) => void guardar(redondeos)}
        />
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <CostosLoteCampos
            items={items}
            recetasEtiqueta={recetasEtiqueta}
            etiquetas={etiquetas}
            value={costos}
            onChange={setCostos}
            tanqueAceite={tanqueAceite}
            avisoEtiquetaLegado={avisoEtiquetaLegado}
            aceiteHeredado={aceiteHeredado}
            ultimasComprasEtiquetas={ultimasComprasEtiquetas}
          />

          {error && (
            <p role="alert" className="text-[12px] text-accent">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="min-h-14 bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase transition-colors hover:bg-primary-hover disabled:opacity-45"
          >
            Guardar costos
          </button>
        </form>
      )}
    </div>
  );
}
