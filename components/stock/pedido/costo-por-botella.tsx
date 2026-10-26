import Link from "next/link";

import { BOTON_SECUNDARIO } from "@/components/ui/boton";
import { Tarjeta } from "@/components/ui/tarjeta";
import { construirLineasCostoBotellaDetallada } from "@/lib/dominio/costos-lote";
import { formatFechaHora } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";
import { variacionContraAnterior, type CostoHistorico } from "@/lib/dominio/pedidos-lote";
import { formatPresentacion } from "@/lib/negocio";
import type { Tables } from "@/lib/types";

type DesgloseRow = Tables<"v_costo_lote_desglose">;

type CostosFilaRow = {
  concepto: string | null;
  producto_id: string | null;
  cantidad: number | null;
  costo_unitario_centavos: number | null;
  neto_centavos: number | null;
  /** `lote_costos.costo_neto_centavos` (0053_pago_vs_costo_insumo.sql):
   * precio para EL COSTO, si se cargó uno distinto del pagado/ya comprado
   * (`neto_centavos`) — `null` = se usó `neto_centavos` tal cual. */
  costo_neto_centavos: number | null;
  envio_centavos: number | null;
  total_centavos: number;
  a_pagar_centavos: number | null;
  insumos: { nombre: string } | null;
};

/** Una fila de `v_costo_lote_vigente` (0052_costo_vigente_lote.sql) — el
 * costo VIGENTE del depósito de un producto de este pedido, que puede
 * diferir del original (`DesgloseRow`) si hubo una "actualización de
 * costos del depósito". Idéntica al original cuando nunca se actualizó
 * (`actualizado_en: null`). */
type VigenteRow = {
  producto_id: string | null;
  costo_unitario_centavos: number | null;
  costo_ananja_centavos: number | null;
  /** 0054_costo_ananja_redondeado.sql: el costo Ananja SIN redondear de
   * esta valoración — para mostrar "calculado $X" en chico cuando difiere
   * del vigente (que ya es el redondeado, si se cargó uno). */
  costo_ananja_calculado_centavos: number | null;
  precio_mayorista_sugerido_centavos: number | null;
  precio_minorista_sugerido_centavos: number | null;
  costo_ananja_original_centavos: number | null;
  actualizado_en: string | null;
};

/** Una fila de `lote_valoraciones` — historial append-only de
 * actualizaciones de costo vigente. */
type ValoracionRow = {
  id: string;
  costo_ananja_centavos: number;
  nota: string | null;
  created_at: string;
  vendedores: { nombre: string } | null;
};

type CostoPorBotellaProps = {
  pedidoId: string;
  desglose: DesgloseRow[];
  costosFilas: CostosFilaRow[];
  ivaPct: number;
  incluyeIva: boolean;
  /** `lotes_produccion.envase_cobrado_sin_iva` (0038, ver
   * `0053_pago_vs_costo_insumo.sql`): `true` si el proveedor cobra el envase sin
   * IVA — el costo le suma `ivaPct`, lo pagado no. */
  envaseSinIva: boolean;
  /** `lotes_produccion.transporte_pct` — solo se usa en el modo
   * directo/% (una fila `transporte` con `producto_id`, no null); el modo
   * fijo/compartido no la necesita (el reparto ya viene resuelto en
   * `transporte_centavos`). */
  transportePctLote: number | null;
  /** Costo VIGENTE del depósito por producto (0052) — `[]` si ningún
   * producto de este pedido tuvo nunca una actualización (el bloque de
   * abajo entonces no muestra nada por producto). */
  vigente: VigenteRow[];
  /** Botellas que quedan en depósito de este pedido, sumadas entre
   * presentaciones — "actualizar costos" no cambiaría nada si es 0. */
  enDepositoTotal: number;
  /** Historial de actualizaciones de costo vigente, más reciente primero. */
  valoraciones: ValoracionRow[];
  /** Costo original de todos los pedidos, para comparar contra el anterior. */
  historialCostos: CostoHistorico[];
};

/**
 * Tarjeta "Costo por botella" del detalle de un pedido: por presentación, lo
 * que costó producir una botella y el precio al que se la damos a las
 * revendedoras (costo Ananja = costo real + ganancia). Debajo, en 14px, lo que
 * cambió contra el pedido anterior y el costo calculado si hubo redondeo. El
 * cálculo detallado (aceite, etiquetas, envase, transporte, IVA, sugeridos)
 * queda plegado en "Ver cálculo". Si hubo una "actualización de costos del
 * depósito" (0052), el costo vigente aparece aparte con el original al lado.
 * Solo se muestra cuando el pedido ya tiene costos cargados.
 */
export function CostoPorBotella({
  pedidoId,
  desglose,
  costosFilas,
  ivaPct,
  incluyeIva,
  envaseSinIva,
  transportePctLote,
  vigente,
  enDepositoTotal,
  valoraciones,
  historialCostos,
}: CostoPorBotellaProps) {
  const vigentePorProducto = new Map(vigente.map((v) => [v.producto_id, v]));

  return (
    <Tarjeta como="section" aria-labelledby="pedido-costo" className="flex flex-col gap-3">
      <h2 id="pedido-costo" className="text-[20px] leading-tight font-semibold text-text">
        Costo por botella
      </h2>

      <div className="flex flex-col divide-y divide-line">
        {desglose.map((d) => {
          const hayRedondeo =
            d.tiene_costos &&
            d.costo_ananja_centavos != null &&
            d.costo_ananja_calculado_centavos != null &&
            d.costo_ananja_centavos !== d.costo_ananja_calculado_centavos;
          const v = vigentePorProducto.get(d.producto_id);
          const actualizado = Boolean(v?.actualizado_en);
          const variacion = d.producto_id && d.lote_id ? variacionContraAnterior(historialCostos, d.lote_id, d.producto_id) : null;
          const hayRedondeoVigente =
            actualizado &&
            v!.costo_ananja_centavos != null &&
            v!.costo_ananja_calculado_centavos != null &&
            v!.costo_ananja_centavos !== v!.costo_ananja_calculado_centavos;
          return (
            <div key={d.producto_id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
              <h3 className="text-[16px] font-semibold text-text">{formatPresentacion(d.presentacion_ml)}</h3>
              {d.tiene_costos && d.costo_ananja_centavos != null ? (
                <>
                  <div className="flex items-baseline justify-between gap-3 text-[16px]">
                    <span className="text-text">Costo de producir</span>
                    <span className="font-semibold text-text tabular-nums">
                      {d.costo_unitario_centavos != null ? formatCentavos(d.costo_unitario_centavos) : "—"}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 text-[16px]">
                    <span className="text-text">Precio a revendedoras</span>
                    <span className="font-semibold text-text tabular-nums">{formatCentavos(d.costo_ananja_centavos)}</span>
                  </div>
                  {variacion && (
                    <p className={`text-[14px] ${variacion.subio ? "text-warning" : "text-secondary"}`}>
                      {variacion.subio ? "+" : ""}
                      {variacion.pctCambio}% de costo vs el pedido anterior
                    </p>
                  )}
                  {hayRedondeo && (
                    <p className="text-[14px] text-text-muted tabular-nums">
                      calculado {formatCentavos(d.costo_ananja_calculado_centavos!)}
                    </p>
                  )}
                  {actualizado && (
                    <div className="mt-1 flex flex-col gap-1 rounded-xl bg-background p-3">
                      <p className="text-[15px] leading-snug text-text">
                        Precio vigente del depósito{" "}
                        <strong className="font-semibold tabular-nums">{formatCentavos(v!.costo_ananja_centavos ?? 0)}</strong>
                        {hayRedondeoVigente && (
                          <span className="text-[14px] text-text-muted">
                            {" "}
                            (calculado {formatCentavos(v!.costo_ananja_calculado_centavos!)})
                          </span>
                        )}
                      </p>
                      <p className="text-[14px] leading-snug text-text-muted">
                        Actualizado el {formatFechaHora(v!.actualizado_en!)}, original{" "}
                        {formatCentavos(v!.costo_ananja_original_centavos ?? 0)}. Solo afecta a las botellas que siguen
                        en el depósito; lo ya entregado o vendido conserva el costo original.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[14px] text-text-muted">Sin costos cargados.</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link href={`/stock/lotes/${pedidoId}/actualizar-costos`} className={`${BOTON_SECUNDARIO} flex px-4`}>
          Actualizar costos
        </Link>
        <Link
          href={`/stock/lotes/${pedidoId}/costos`}
          className="inline-flex min-h-11 items-center text-[16px] font-semibold text-primary underline decoration-mark underline-offset-4"
        >
          Editar costos
        </Link>
      </div>
      {enDepositoTotal === 0 && (
        <p className="text-[14px] leading-snug text-text-muted">
          Este pedido no tiene botellas en el depósito: actualizar el costo no cambiaría nada de lo ya entregado o
          vendido.
        </p>
      )}
      {valoraciones.length > 0 && (
        <details className="group border-t border-border pt-3">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-[15px] font-semibold text-primary">
            Ver historial de actualizaciones
          </summary>
          <div className="mt-3 flex flex-col gap-1.5">
            {valoraciones.map((val) => (
              <p key={val.id} className="text-[14px] leading-snug text-text-muted">
                {formatFechaHora(val.created_at)} · {val.vendedores?.nombre ?? "—"} · precio a revendedoras{" "}
                {formatCentavos(val.costo_ananja_centavos)}
                {val.nota ? ` · ${val.nota}` : ""}
              </p>
            ))}
          </div>
        </details>
      )}

      <details className="group border-t border-border pt-3">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-[15px] font-semibold text-primary">
          Ver cálculo
        </summary>
        <div className="mt-3 flex flex-col gap-5">
          {desglose.map((d) => {
            const filasProducto = costosFilas.filter((f) => f.producto_id === d.producto_id);
            const aceiteFila = filasProducto.find((f) => f.concepto === "aceite");
            const envaseFila = filasProducto.find((f) => f.concepto === "envase");
            const transporteDirecto = filasProducto.find((f) => f.concepto === "transporte");
            const etiquetasFilas = filasProducto.filter((f) => f.concepto === "etiqueta");

            const lineas = construirLineasCostoBotellaDetallada({
              aceite: aceiteFila
                ? {
                    cantidad: aceiteFila.cantidad ?? 0,
                    costoUnitarioCentavos: aceiteFila.costo_unitario_centavos ?? 0,
                    totalCentavos: aceiteFila.total_centavos,
                    dolarCentavos: d.dolar_centavos,
                    usdPorLitroCentavos: d.precio_litro_aceite_usd_centavos,
                  }
                : null,
              etiquetas: etiquetasFilas.map((f) => ({
                nombreInsumo: f.insumos?.nombre ?? "Etiqueta",
                cantidad: f.cantidad ?? 0,
                netoCentavos: f.neto_centavos,
                envioCentavos: f.envio_centavos,
                costoUnitarioCentavos: f.costo_unitario_centavos ?? 0,
                totalCentavos: f.total_centavos,
                costoNetoCentavos: f.costo_neto_centavos,
              })),
              envase: envaseFila
                ? {
                    cantidad: envaseFila.cantidad ?? 0,
                    netoCentavos: envaseFila.neto_centavos,
                    costoUnitarioCentavos: envaseFila.costo_unitario_centavos ?? 0,
                    totalCentavos: envaseFila.total_centavos,
                    aPagarCentavos: envaseFila.a_pagar_centavos,
                    costoNetoCentavos: envaseFila.costo_neto_centavos,
                  }
                : null,
              transporteCentavos: d.transporte_centavos ?? 0,
              transportePct: transporteDirecto ? transportePctLote : null,
              otrosCentavos: d.otros_centavos ?? 0,
              totalCentavos: d.total_centavos ?? 0,
              costoUnitarioCentavos: d.costo_unitario_centavos ?? 0,
              cantidadBotellas: d.cantidad ?? 0,
              ivaPct,
              incluyeIva,
              envaseSinIva,
            });

            return (
              <div key={d.producto_id} className="flex flex-col gap-2.5">
                <span className="text-[13px] text-text-muted">
                  {desglose.length > 1 ? formatPresentacion(d.presentacion_ml) : "Cálculo"}
                </span>
                <div className="flex flex-col gap-1.5 border-l-2 border-mark pl-4">
                  {lineas.map((linea, i) => (
                    <p key={i} className="text-[16px] leading-snug tabular-nums text-text">
                      {linea.antes}
                      <strong className="font-medium text-primary">{linea.resultado}</strong>
                    </p>
                  ))}
                </div>
                {d.tiene_costos && d.costo_ananja_centavos != null && (
                  <p className="text-[16px] leading-snug text-text">
                    Costo Ananja (incluye {d.ganancia_pct ?? "—"}% de ganancia){" "}
                    <strong className="font-medium text-primary tabular-nums">
                      {formatCentavos(d.costo_ananja_centavos)}
                    </strong>
                    {d.costo_ananja_redondeado_centavos != null &&
                      d.costo_ananja_calculado_centavos != null && (
                        <span className="text-[13px] text-text-muted">
                          {" "}
                          (calculado {formatCentavos(d.costo_ananja_calculado_centavos)})
                        </span>
                      )}
                  </p>
                )}
                {d.tiene_costos &&
                  d.precio_mayorista_sugerido_centavos != null &&
                  d.precio_minorista_sugerido_centavos != null && (
                    <p className="text-[16px] leading-snug text-text">
                      Mayorista sugerido{" "}
                      <strong className="font-medium text-primary tabular-nums">
                        {formatCentavos(d.precio_mayorista_sugerido_centavos)}
                      </strong>
                      {" · Minorista sugerido "}
                      <strong className="font-medium text-primary tabular-nums">
                        {formatCentavos(d.precio_minorista_sugerido_centavos)}
                      </strong>
                    </p>
                  )}
              </div>
            );
          })}
          {desglose.length > 1 && (
            <p className="text-[13px] leading-snug text-text-muted">
              El transporte y otros gastos compartidos se reparten según el
              volumen de cada presentación (una más grande carga más que una
              más chica).
            </p>
          )}
        </div>
      </details>
    </Tarjeta>
  );
}
