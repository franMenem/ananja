import Link from "next/link";

import { FormPage } from "@/components/app/form-page";
import { compararCostoUnitario, etiquetaSaldoPendiente } from "@/lib/dominio/costos-lote";
import { obtenerListaLotes } from "@/lib/data/lotes";
import { formatFechaCorta } from "@/lib/fechas";
import { resumenStockLote, totalEnManosPorLoteProducto } from "@/lib/dominio/lote-en-manos";
import {
  construirPedidosCards,
  itemsDeLote,
  type DesgloseLoteProducto,
  type PedidoInput,
} from "@/lib/dominio/pedidos-lote";
import { formatCentavos } from "@/lib/money";
import { formatPresentacion } from "@/lib/negocio";
import { leerFormasProveedor } from "@/lib/proveedor-servidor";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Chip de estado del pedido: "Falta pagar"/"Sin costos" en bordó (texto,
 * mismo criterio que el resto de los avisos de la app), "Pagado" con
 * fondo verde claro — el único estado "todo bien" de la tarjeta. */
const CHIP_CLASES: Record<"sin-costos" | "pagado" | "falta", string> = {
  "sin-costos": "text-accent",
  falta: "text-accent",
  pagado: "bg-[#e3e7d8] px-2 py-1 text-secondary",
};

/** Info extra por lote+producto que no entra en la tarjeta simplificada
 * como "número grande" — queda de texto chico debajo del costo Ananja: si
 * este pedido tuvo una "actualización de costos del depósito" (0052,
 * con el costo ORIGINAL al lado) y, si no, cómo compara contra el pedido
 * anterior de la MISMA presentación; y cuánto queda sin vender (depósito +
 * en manos de revendedoras, commit 102ce3b). */
type InfoVigente = {
  actualizado: boolean;
  costoAnanjaOriginalCentavos: number | null;
  comparacion: ReturnType<typeof compararCostoUnitario>;
  resumen: ReturnType<typeof resumenStockLote>;
};

/**
 * "Pedidos": responde "¿qué pedí,
 * cuánto costó y qué falta pagar?" — una tarjeta por pedido (lote), en
 * mobile y escritorio (lista, no tabla), con el costo Ananja VIGENTE de
 * cada presentación (`v_costo_lote_vigente`, 0052_costo_vigente_lote.sql)
 * y un único chip de estado (`lib/pedidos-lote.ts`).
 *
 * Lo que en la tabla vieja eran columnas propias queda de texto chico bajo
 * el costo Ananja de cada ítem: si el pedido tuvo una "actualización de
 * costos del depósito" (con el costo ORIGINAL al lado — corrección de la
 * revisión adversarial de 0052, nunca comparar contra el vigente, que
 * dejaría de significar "pedido más caro que el anterior") o, si no, el
 * "% vs pedido anterior" de la MISMA presentación (con costos ORIGINALES
 * de los dos lados, `v_costo_lote_desglose`), y cuánto queda sin vender.
 * Sugeridos y el desglose del cálculo quedan en el detalle del pedido
 * (`/stock/lotes/[id]`).
 */
export default async function StockLotesPage() {
  const supabase = await createClient();

  const [{ lotesRows, error, vigente, original, saldos, stockPorLote, enManosFilas }, proveedor] =
    await Promise.all([obtenerListaLotes(supabase), leerFormasProveedor()]);

  const lotes: PedidoInput[] = (lotesRows ?? []).map((lote) => ({
    loteId: lote.lote_id ?? "",
    fecha: lote.fecha ?? "",
    items: itemsDeLote(lote).map((item) => ({
      productoId: item.producto_id,
      presentacionMl: item.presentacion_ml,
      cantidad: item.cantidad,
    })),
  }));

  const desglosePorLoteProducto = new Map<string, DesgloseLoteProducto>(
    (vigente ?? []).map((d) => [
      `${d.lote_id}:${d.producto_id}`,
      {
        costoAnanjaCentavos: d.costo_ananja_centavos,
        costoAnanjaCalculadoCentavos: d.costo_ananja_calculado_centavos,
        tieneCostos: d.tiene_costos ?? false,
      },
    ]),
  );
  const saldoPorLote = new Map((saldos ?? []).map((s) => [s.lote_id ?? "", s.saldo_centavos ?? 0]));

  const pedidos = construirPedidosCards({ lotes, desglosePorLoteProducto, saldoPorLote });

  // Historial cronológico (ascendente) por producto, con el costo
  // ORIGINAL, para comparar cada lote contra el anterior de la MISMA
  // presentación — no contra el lote inmediatamente anterior en la lista
  // (que puede traer otra presentación).
  const originalPorLoteProducto = new Map(
    (original ?? []).map((d) => [`${d.lote_id}:${d.producto_id}`, d]),
  );
  const historialAscendentePorProducto = new Map<
    string,
    { loteId: string; costoUnitarioCentavos: number; tieneCostos: boolean }[]
  >();
  for (const lote of [...lotes].reverse()) {
    for (const item of lote.items) {
      const d = originalPorLoteProducto.get(`${lote.loteId}:${item.productoId}`);
      const lista = historialAscendentePorProducto.get(item.productoId) ?? [];
      lista.push({
        loteId: lote.loteId,
        costoUnitarioCentavos: d?.costo_unitario_centavos ?? 0,
        tieneCostos: d?.tiene_costos ?? false,
      });
      historialAscendentePorProducto.set(item.productoId, lista);
    }
  }
  function compararConAnterior(productoId: string, loteId: string) {
    const historial = historialAscendentePorProducto.get(productoId) ?? [];
    const idx = historial.findIndex((h) => h.loteId === loteId);
    if (idx <= 0 || !historial[idx].tieneCostos) return null;
    const anterior = historial[idx - 1];
    if (!anterior.tieneCostos) return null;
    return compararCostoUnitario(historial[idx].costoUnitarioCentavos, anterior.costoUnitarioCentavos);
  }

  const enManosPorLoteProducto = totalEnManosPorLoteProducto(enManosFilas);
  const quedanPorLoteProducto = new Map(
    (stockPorLote ?? []).map((s) => [`${s.lote_id}:${s.producto_id}`, s.quedan ?? 0]),
  );
  const vigentePorLoteProducto = new Map((vigente ?? []).map((d) => [`${d.lote_id}:${d.producto_id}`, d]));

  function infoVigente(loteId: string, productoId: string): InfoVigente {
    const v = vigentePorLoteProducto.get(`${loteId}:${productoId}`);
    return {
      actualizado: v?.actualizado_en != null,
      costoAnanjaOriginalCentavos: v?.costo_ananja_original_centavos ?? null,
      comparacion: compararConAnterior(productoId, loteId),
      resumen: resumenStockLote(
        quedanPorLoteProducto.get(`${loteId}:${productoId}`) ?? null,
        enManosPorLoteProducto.get(`${loteId}:${productoId}`) ?? 0,
      ),
    };
  }

  return (
    <FormPage title="Pedidos" backHref="/stock" backLabel="Volver a stock" maxWidth="none" pb>
      <Link
        href="/stock/lotes/nuevo"
        className="flex min-h-[52px] items-center justify-center bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase transition-colors hover:bg-primary-hover"
      >
        + Pedido {proveedor.a}
      </Link>

      {error && (
        <p role="alert" className="text-sm text-accent">
          No se pudo cargar el historial de pedidos.
        </p>
      )}

      {!error && pedidos.length === 0 && (
        <p className="text-sm text-text-muted">
          Todavía no hay pedidos registrados. &ldquo;+ Pedido {proveedor.a}&rdquo;
          crea el primero.
        </p>
      )}

      <div className="flex flex-col gap-px bg-border">
        {pedidos.map((pedido) => {
          const saldo = saldoPorLote.get(pedido.loteId) ?? 0;
          const badgeSaldo = etiquetaSaldoPendiente(saldo);
          const infos = pedido.items.map((item) => infoVigente(pedido.loteId, item.productoId));
          const totalSinVender = infos.reduce((acc, info) => acc + (info.resumen.totalSinVender ?? 0), 0);
          const totalEnRevendedoras = infos.reduce((acc, info) => acc + info.resumen.enRevendedoras, 0);

          return (
            <Link
              key={pedido.loteId}
              href={`/stock/lotes/${pedido.loteId}`}
              className="flex flex-col gap-1.5 bg-surface-raised p-4"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-[14px] text-text">
                  {formatFechaCorta(pedido.fecha)} ·{" "}
                  {pedido.items
                    .map((item) => `${item.cantidad} × ${formatPresentacion(item.presentacionMl)}`)
                    .join(" + ")}
                </span>
                <span className={`shrink-0 text-[11px] font-medium tracking-[0.06em] uppercase ${CHIP_CLASES[pedido.estado.tipo]}`}>
                  {pedido.estado.label}
                </span>
              </div>

              {pedido.estado.tipo === "sin-costos" ? (
                <span className="text-[13px] font-medium text-accent">Sin costos</span>
              ) : (
                <div className="flex flex-col gap-1">
                  {pedido.items.map((item, i) => {
                    const info = infos[i];
                    return (
                      <div
                        key={item.productoId}
                        className="flex items-baseline justify-between gap-2 text-[13px] tabular-nums text-text-muted"
                      >
                        <span>
                          {pedido.items.length > 1 ? formatPresentacion(item.presentacionMl) : "Costo Ananja"}
                        </span>
                        <span className="flex flex-col items-end">
                          <span>
                            {item.costoAnanjaCentavos != null ? formatCentavos(item.costoAnanjaCentavos) : "—"}
                            {info.actualizado && (
                              <span className="ml-1.5 text-[11px] text-mark">actualizado</span>
                            )}
                          </span>
                          {!info.actualizado && info.comparacion && (
                            <span
                              className={`text-[11px] ${info.comparacion.subio ? "text-accent" : "text-secondary"}`}
                            >
                              {info.comparacion.subio ? "+" : ""}
                              {info.comparacion.pctCambio}% vs anterior
                            </span>
                          )}
                          {info.actualizado && info.costoAnanjaOriginalCentavos != null && (
                            <span className="text-[11px] text-text-muted">
                              original {formatCentavos(info.costoAnanjaOriginalCentavos)}
                            </span>
                          )}
                          {item.costoAnanjaCentavos != null &&
                            item.costoAnanjaCalculadoCentavos != null &&
                            item.costoAnanjaCentavos !== item.costoAnanjaCalculadoCentavos && (
                              <span className="text-[11px] text-text-muted">
                                calculado {formatCentavos(item.costoAnanjaCalculadoCentavos)}
                              </span>
                            )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {totalSinVender > 0 && (
                <span className="text-[11px] text-text-muted">
                  Sin vender {totalSinVender}
                  {totalEnRevendedoras > 0 ? ` · ${totalEnRevendedoras} en revendedoras` : ""}
                </span>
              )}

              {badgeSaldo && (
                <span className="w-fit text-[11px] font-medium tracking-[0.06em] text-accent uppercase">
                  {badgeSaldo}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </FormPage>
  );
}
