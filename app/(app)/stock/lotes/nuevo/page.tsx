import { LoteForm } from "@/components/stock/lote-form";
import { obtenerUltimasComprasInsumos } from "@/lib/data/insumos";
import { obtenerNuevoLoteForm } from "@/lib/data/lotes";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * "Nuevo pedido al proveedor":
 * cantidades por presentación + "Costos del pedido", prefijado con los
 * valores del último lote que tenga costos cargados (`lote_costos`) y con
 * los % de ganancia/mayorista/minorista del lote de producción MÁS
 * RECIENTE (tenga costos o no — `lotes_produccion`, mismo criterio que usa
 * `crear_lote` cuando no se le manda ningún %; la calculadora de Precios
 * vigente ya NO es la fuente de estos porcentajes, ver
 * `supabase/migrations/0028_costos_por_lote.sql`) — todo lo demás lo
 * resuelve `LoteForm` (`components/stock/lote-form.tsx`) del lado del
 * cliente.
 */
export default async function StockLoteNuevoPage() {
  const supabase = await createClient();

  // Todo lo independiente de "Nuevo pedido al proveedor", en un solo
  // `Promise.all` (lib/data/lotes.ts § obtenerNuevoLoteForm): productos,
  // costos de todos los lotes (para precargar del más reciente con
  // costos), % del lote de producción más reciente, tanque de aceite
  // vigente e insumos de etiqueta activos (build "insumos en cero").
  const { productos, costosRows, ultimoLote, tanqueRows, etiquetaInsumos } = await obtenerNuevoLoteForm(supabase);

  const ultimasComprasEtiquetas = await obtenerUltimasComprasInsumos(
    supabase,
    (etiquetaInsumos ?? []).map((i) => i.id),
  );

  // El lote con costos de fecha (created_at como desempate) más reciente
  // — mismo criterio de orden que `ordenarVersiones` (lib/precios.ts).
  let ultimoLoteId: string | null = null;
  let ultimaFecha = "";
  let ultimoCreatedAt = "";
  for (const fila of costosRows ?? []) {
    const fecha = fila.lotes_produccion?.fecha ?? "";
    const createdAt = fila.lotes_produccion?.created_at ?? "";
    const esMasReciente =
      ultimoLoteId === null ||
      fecha > ultimaFecha ||
      (fecha === ultimaFecha && createdAt > ultimoCreatedAt);
    if (esMasReciente) {
      ultimoLoteId = fila.lote_id;
      ultimaFecha = fecha;
      ultimoCreatedAt = createdAt;
    }
  }

  const ultimoLoteCostos = (costosRows ?? []).filter((f) => f.lote_id === ultimoLoteId);

  // Un solo insumo de materia prima en la práctica (aceite/miel a granel) —
  // se toma el primero, ver v_tanque_aceite (supabase/migrations/0029_costos_reales_lote.sql).
  const tanque = (tanqueRows ?? [])[0] ?? null;

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <LoteForm
        productos={productos ?? []}
        ultimoLoteCostos={ultimoLoteCostos}
        ultimoLotePcts={
          ultimoLote
            ? {
                gananciaPct: ultimoLote.ganancia_pct,
                mayoristaPct: ultimoLote.mayorista_pct,
                minoristaPct: ultimoLote.minorista_pct,
              }
            : null
        }
        ultimoLoteTransportePct={ultimoLote?.transporte_pct ?? null}
        ultimoLoteIvaPct={ultimoLote?.iva_pct ?? null}
        ultimoLotePrecioIncluyeIva={ultimoLote?.precios_incluyen_iva ?? null}
        ultimoLoteEnvaseCobradoSinIva={ultimoLote?.envase_cobrado_sin_iva ?? null}
        ultimoLoteDolarCentavos={ultimoLote?.dolar_centavos ?? null}
        ultimoLotePrecioLitroAceiteUsdCentavos={
          ultimoLote?.precio_litro_aceite_usd_centavos ?? null
        }
        ultimoLoteFecha={ultimoLote?.fecha ?? null}
        tanqueAceite={
          tanque
            ? {
                costoPromedioCentavosPorLitro: tanque.costo_promedio_centavos_por_litro,
                litrosRestantes: tanque.litros_restantes ?? 0,
              }
            : null
        }
        ultimasComprasEtiquetas={ultimasComprasEtiquetas}
      />
    </div>
  );
}
