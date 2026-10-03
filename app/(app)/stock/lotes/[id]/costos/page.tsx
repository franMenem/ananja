import { notFound } from "next/navigation";

import type { AceiteHeredado } from "@/components/stock/costos-lote-campos";
import { CostosLoteForm } from "@/components/stock/costos-lote-form";
import { obtenerUltimasComprasInsumos } from "@/lib/data/insumos";
import { obtenerCostosLoteForm } from "@/lib/data/lotes";
import { aPagarGuardadoPorConcepto, prefillCostosLote, tieneCostoEtiquetaLegado } from "@/lib/dominio/lotes";
import { formatPresentacion } from "@/lib/negocio";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * "Completar costos de este pedido" / "Editar costos"
 * (`/stock/lotes/[id]/costos`):
 * mismos campos que al crear el lote (`CostosLoteForm` → `CostosLoteCampos`),
 * prefijados con los `lote_costos` YA cargados de este lote — vacíos si
 * todavía no tiene ninguno (el mismo formulario sirve para completar y
 * para corregir, `fijar_costos_lote` reemplaza todo) — y con los % de
 * ganancia/mayorista/minorista PROPIOS de este lote (`lotes_produccion`,
 * ya NO de la versión de precios vigente, ver
 * `supabase/migrations/0028_costos_por_lote.sql`).
 */
export default async function StockLoteCostosPage({
  params,
}: PageProps<"/stock/lotes/[id]/costos">) {
  const { id } = await params;
  const supabase = await createClient();

  // Las 6 consultas de esta pantalla (incluida la del "pedido anterior",
  // antes una segunda tanda aparte) viven en `lib/data/lotes.ts` §
  // `obtenerCostosLoteForm`, en UN `Promise.all`.
  const { lote, items, costosRows, recetasRows, loteProduccion, loteItemsRows, loteAnterior } =
    await obtenerCostosLoteForm(supabase, id);

  if (!lote) {
    notFound();
  }

  const aceiteHeredado: AceiteHeredado =
    loteAnterior &&
    (loteAnterior.dolar_centavos != null || loteAnterior.precio_litro_aceite_usd_centavos != null)
      ? {
          fecha: loteAnterior.fecha,
          dolarCentavos: loteAnterior.dolar_centavos,
          usdCentavos: loteAnterior.precio_litro_aceite_usd_centavos,
        }
      : null;

  const itemsForm = items.map((i) => ({
    productoId: i.producto_id,
    nombre: i.producto_nombre,
    presentacionMl: i.presentacion_ml,
    cantidad: i.cantidad,
  }));
  const productoIds = itemsForm.map((i) => i.productoId);

  const recetasEtiqueta = recetasRows
    .filter((r) => r.insumos?.tipo === "etiqueta")
    .map((r) => ({ productoId: r.producto_id, insumoId: r.insumo_id, cantidad: r.cantidad }));

  // Insumos de etiqueta distintos usados por las presentaciones de este
  // lote — una fila de precio + envío por cada uno (mismo criterio que
  // `LoteForm`, ver components/stock/lote-form.tsx).
  const idsUsados = new Set(productoIds);
  const vistos = new Set<string>();
  const etiquetas = recetasRows.flatMap((r) => {
    if (r.insumos?.tipo !== "etiqueta" || !idsUsados.has(r.producto_id) || vistos.has(r.insumo_id)) {
      return [];
    }
    vistos.add(r.insumo_id);
    return [{ insumoId: r.insumo_id, nombre: r.insumos.nombre }];
  });

  // Última compra de cada insumo de etiqueta que este lote usa — fallback
  // de precio cuando `costosRows` no trae ese insumo, y fuente del hint
  // "Precio de la última compra — 12/09" (build "insumos en cero").
  const ultimasComprasEtiquetas = await obtenerUltimasComprasInsumos(
    supabase,
    etiquetas.map((e) => e.insumoId),
  );

  const titulo =
    itemsForm.length > 0
      ? itemsForm.map((i) => `${i.cantidad} × ${formatPresentacion(i.presentacionMl)}`).join(" · ")
      : "Lote";

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <CostosLoteForm
        loteId={id}
        titulo={titulo}
        items={itemsForm}
        recetasEtiqueta={recetasEtiqueta}
        etiquetas={etiquetas}
        avisoEtiquetaLegado={tieneCostoEtiquetaLegado(costosRows ?? [])}
        aceiteHeredado={aceiteHeredado}
        ultimasComprasEtiquetas={ultimasComprasEtiquetas}
        aPagarGuardado={aPagarGuardadoPorConcepto(costosRows ?? [])}
        valorInicial={prefillCostosLote(
          costosRows ?? [],
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
            ultimasComprasEtiquetas,
          },
          recetasEtiqueta,
          Object.fromEntries(
            (loteItemsRows ?? []).map((r) => [r.producto_id, r.costo_ananja_redondeado_centavos]),
          ),
        )}
      />
    </div>
  );
}
