import { notFound } from "next/navigation";

import { ActualizarCostoLoteForm } from "@/components/stock/actualizar-costo-lote-form";
import { obtenerActualizarCostosLoteForm } from "@/lib/data/lotes";
import { prefillCostosLote, prefillCostosLoteDesdeValoracion, tieneCostoEtiquetaLegado } from "@/lib/dominio/lotes";
import { formatPresentacion } from "@/lib/negocio";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * "Actualizar costos del depósito" (`/stock/lotes/[id]/actualizar-costos`,
 * plan-actualizar-costos-lote.md rev. 2): costo de REPOSICIÓN de un lote —
 * reusa la misma sección "Costos del pedido" que "Editar costos"
 * (`CostosLoteForm`/`costos/page.tsx`). Precarga (corrección de la
 * revisión adversarial, S2): si el lote YA tuvo una actualización antes,
 * desde la ÚLTIMA `lote_valoraciones` (`prefillCostosLoteDesdeValoracion`
 * — lo que el dueño cargó la vez pasada, para que una segunda
 * actualización no vuelva a los costos originales del pedido); si nunca
 * se actualizó, desde los costos ORIGINALES del lote (`lote_costos`,
 * `prefillCostosLote`, igual que "Editar costos"). Los % de
 * ganancia/mayorista/minorista son editables acá, sin escribirse de vuelta
 * salvo que se confirme la actualización. Guarda vía
 * `actualizar_costo_lote_vigente` (`ActualizarCostoLoteForm`) — nunca toca
 * `lote_costos`/`gastos`/`deudas`/`lotes_produccion`, solo agrega una fila
 * a `lote_valoraciones`.
 */
export default async function ActualizarCostoLotePage({
  params,
}: PageProps<"/stock/lotes/[id]/actualizar-costos">) {
  const { id } = await params;
  const supabase = await createClient();

  // Las 7 consultas de esta pantalla viven en `lib/data/lotes.ts` §
  // `obtenerActualizarCostosLoteForm`, en UN `Promise.all` (ya lo estaban)
  // — incluye el cast de `costos_jsonb` de `ultimaValoracion`, resuelto
  // ahí adentro en vez de acá.
  const { lote, items: itemsLote, costosRows, recetasRows, loteProduccion, stockPorLote, loteItemsRows, ultimaValoracion } =
    await obtenerActualizarCostosLoteForm(supabase, id);

  if (!lote) {
    notFound();
  }

  const items = itemsLote.map((i) => ({
    productoId: i.producto_id,
    nombre: i.producto_nombre,
    presentacionMl: i.presentacion_ml,
    cantidad: i.cantidad,
  }));
  const productoIds = items.map((i) => i.productoId);

  const recetasEtiqueta = recetasRows
    .filter((r) => r.insumos?.tipo === "etiqueta")
    .map((r) => ({ productoId: r.producto_id, insumoId: r.insumo_id, cantidad: r.cantidad }));

  const idsUsados = new Set(productoIds);
  const vistos = new Set<string>();
  const etiquetas = recetasRows.flatMap((r) => {
    if (r.insumos?.tipo !== "etiqueta" || !idsUsados.has(r.producto_id) || vistos.has(r.insumo_id)) {
      return [];
    }
    vistos.add(r.insumo_id);
    return [{ insumoId: r.insumo_id, nombre: r.insumos.nombre }];
  });

  const enDeposito = stockPorLote.reduce((acc, s) => acc + (s.quedan ?? 0), 0);

  const titulo =
    items.length > 0
      ? items.map((i) => `${i.cantidad} × ${formatPresentacion(i.presentacionMl)}`).join(" · ")
      : "Lote";

  const valorInicial = ultimaValoracion
    ? prefillCostosLoteDesdeValoracion(ultimaValoracion.costosJsonb, {
        gananciaPct: ultimaValoracion.gananciaPct,
        mayoristaPct: ultimaValoracion.mayoristaPct,
        minoristaPct: ultimaValoracion.minoristaPct,
      })
    : prefillCostosLote(
        costosRows,
        productoIds,
        {
          pcts: loteProduccion
            ? {
                gananciaPct: loteProduccion.ganancia_pct,
                mayoristaPct: loteProduccion.mayorista_pct,
                minoristaPct: loteProduccion.minorista_pct,
              }
            : null,
          ivaPct: loteProduccion?.iva_pct ?? null,
          precioIncluyeIva: loteProduccion?.precios_incluyen_iva ?? null,
          envaseCobradoSinIva: loteProduccion?.envase_cobrado_sin_iva ?? null,
          transportePct: loteProduccion?.transporte_pct ?? null,
          dolarCentavos: loteProduccion?.dolar_centavos ?? null,
          precioLitroAceiteUsdCentavos: loteProduccion?.precio_litro_aceite_usd_centavos ?? null,
        },
        recetasEtiqueta,
        Object.fromEntries(loteItemsRows.map((r) => [r.producto_id, r.costo_ananja_redondeado_centavos])),
      );

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <ActualizarCostoLoteForm
        loteId={id}
        titulo={titulo}
        items={items}
        recetasEtiqueta={recetasEtiqueta}
        etiquetas={etiquetas}
        enDeposito={enDeposito}
        avisoEtiquetaLegado={tieneCostoEtiquetaLegado(costosRows)}
        valorInicial={valorInicial}
        precargadoDesdeFecha={ultimaValoracion?.createdAt ?? null}
      />
    </div>
  );
}
