import Link from "next/link";

import { CifraHeroica } from "@/components/plata/cifra-heroica";
import { construirLineasCostoBotellaDetallada } from "@/lib/dominio/costos-lote";
import { formatFechaHora } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";
import { formatPresentacion, NEGOCIO } from "@/lib/negocio";
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
  tieneCostos: boolean;
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
};

/**
 * Bloque "Costo por botella" del detalle de un pedido (bloque 1): una fila
 * heroica por presentación con el Costo Ananja y la producción real de
 * ese lote — el cálculo detallado (aceite, etiquetas, envase, transporte,
 * IVA, sugeridos) queda plegado en "Ver cálculo" para no competir con el
 * número que de verdad importa acá. El hero SIEMPRE es el costo ORIGINAL
 * del pedido (lo que costó producirlo) — si hubo una "actualización de
 * costos del depósito" (0052), el vigente aparece debajo como bloque
 * aparte, con la fecha y el original al lado, más el link para actualizar
 * de nuevo, el aviso si ya no queda nada en depósito, y el historial
 * simple de actualizaciones — todo esto solo existe cuando el pedido ya
 * tiene costos cargados (`tieneCostos`).
 */
export function CostoPorBotella({
  pedidoId,
  tieneCostos,
  desglose,
  costosFilas,
  ivaPct,
  incluyeIva,
  envaseSinIva,
  transportePctLote,
  vigente,
  enDepositoTotal,
  valoraciones,
}: CostoPorBotellaProps) {
  const vigentePorProducto = new Map(vigente.map((v) => [v.producto_id, v]));
  if (!tieneCostos) {
    return (
      <div className="flex flex-col gap-3 border-l-2 border-accent bg-surface-raised p-5">
        <p className="text-[15px] leading-snug text-text">
          Este pedido todavía no tiene costos cargados, así que todavía no
          sabemos cuánto costó cada {NEGOCIO.envase.singular}.
        </p>
        <Link
          href={`/stock/lotes/${pedidoId}/costos`}
          className="flex min-h-12 items-center justify-center bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase transition-colors hover:bg-primary-hover"
        >
          Completar costos de este pedido
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {desglose.map((d) => {
        const hayRedondeo =
          d.tiene_costos &&
          d.costo_ananja_centavos != null &&
          d.costo_ananja_calculado_centavos != null &&
          d.costo_ananja_centavos !== d.costo_ananja_calculado_centavos;
        return (
          <div key={d.producto_id} className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] text-text-muted">
              {formatPresentacion(d.presentacion_ml)}
              <span className="block text-[11px]">
                producción {d.tiene_costos && d.costo_unitario_centavos != null ? formatCentavos(d.costo_unitario_centavos) : "—"}
              </span>
            </span>
            <span className="flex flex-col items-end gap-0.5">
              <span className="text-right font-display text-[34px] leading-none text-primary">
                {d.tiene_costos && d.costo_ananja_centavos != null ? (
                  <CifraHeroica centavos={d.costo_ananja_centavos} />
                ) : (
                  <span className="text-[16px] text-text-muted">Sin costos</span>
                )}
              </span>
              {hayRedondeo && (
                <span className="text-[11px] text-text-muted tabular-nums">
                  calculado {formatCentavos(d.costo_ananja_calculado_centavos!)}
                </span>
              )}
            </span>
          </div>
        );
      })}

      {/* Costo VIGENTE del depósito (0052): solo los productos que tuvieron
          una "actualización de costos del depósito" — sin eso,
          v_costo_lote_vigente es idéntica al original de arriba, no hay
          nada nuevo que mostrar. Nunca reemplaza el hero: lo ya entregado o
          vendido se quedó con el costo original, esto es "de acá en más". */}
      {desglose.map((d) => {
        const v = vigentePorProducto.get(d.producto_id);
        if (!v?.actualizado_en) return null;
        const hayRedondeo =
          v.costo_ananja_centavos != null &&
          v.costo_ananja_calculado_centavos != null &&
          v.costo_ananja_centavos !== v.costo_ananja_calculado_centavos;
        return (
          <div
            key={`vigente-${d.producto_id}`}
            className="flex flex-col gap-1 border-l-2 border-mark bg-surface-raised p-3"
          >
            <p className="text-[13px] leading-snug text-text">
              {desglose.length > 1 ? `${formatPresentacion(d.presentacion_ml)} — ` : ""}
              Costo Ananja vigente del depósito{" "}
              <strong className="font-medium text-primary tabular-nums">
                {formatCentavos(v.costo_ananja_centavos ?? 0)}
              </strong>
              {hayRedondeo && (
                <span className="text-[11px] text-text-muted">
                  {" "}
                  (calculado {formatCentavos(v.costo_ananja_calculado_centavos!)})
                </span>
              )}
            </p>
            <p className="text-[11px] leading-snug text-text-muted">
              Actualizado el {formatFechaHora(v.actualizado_en)} — original{" "}
              {formatCentavos(v.costo_ananja_original_centavos ?? 0)}. Solo afecta a las botellas
              que siguen en el depósito; lo ya entregado o vendido conserva el costo original.
            </p>
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link
          href={`/stock/lotes/${pedidoId}/costos`}
          className="text-[13px] font-medium tracking-[0.06em] text-primary uppercase underline decoration-mark underline-offset-4"
        >
          Editar costos
        </Link>
        <Link
          href={`/stock/lotes/${pedidoId}/actualizar-costos`}
          className="text-[13px] font-medium tracking-[0.06em] text-primary uppercase underline decoration-mark underline-offset-4"
        >
          Actualizar costos del depósito
        </Link>
      </div>
      {enDepositoTotal === 0 && (
        <p className="text-[11px] leading-snug text-text-muted">
          Este pedido no tiene botellas en el depósito — actualizar el costo no cambiaría nada de lo
          ya entregado o vendido.
        </p>
      )}
      {valoraciones.length > 0 && (
        <details className="group border-t border-border pt-3">
          <summary className="text-[12px] font-medium tracking-[0.06em] text-primary uppercase">
            Ver historial de actualizaciones
          </summary>
          <div className="mt-3 flex flex-col gap-1.5">
            {valoraciones.map((v) => (
              <p key={v.id} className="text-[12px] leading-snug text-text-muted">
                {formatFechaHora(v.created_at)} · {v.vendedores?.nombre ?? "—"} · costo Ananja{" "}
                {formatCentavos(v.costo_ananja_centavos)}
                {v.nota ? ` · ${v.nota}` : ""}
              </p>
            ))}
          </div>
        </details>
      )}

      <details className="group border-t border-border pt-3">
        <summary className="text-[12px] font-medium tracking-[0.06em] text-primary uppercase">
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
                <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
                  {desglose.length > 1 ? formatPresentacion(d.presentacion_ml) : "Cálculo"}
                </span>
                <div className="flex flex-col gap-1.5 border-l-2 border-mark pl-4">
                  {lineas.map((linea, i) => (
                    <p key={i} className="text-[13px] leading-snug tabular-nums text-text">
                      {linea.antes}
                      <strong className="font-medium text-primary">{linea.resultado}</strong>
                    </p>
                  ))}
                </div>
                {d.tiene_costos && d.costo_ananja_centavos != null && (
                  <p className="text-[13px] leading-snug text-text">
                    Costo Ananja (incluye {d.ganancia_pct ?? "—"}% de ganancia){" "}
                    <strong className="font-medium text-primary tabular-nums">
                      {formatCentavos(d.costo_ananja_centavos)}
                    </strong>
                    {d.costo_ananja_redondeado_centavos != null &&
                      d.costo_ananja_calculado_centavos != null && (
                        <span className="text-[11px] text-text-muted">
                          {" "}
                          (calculado {formatCentavos(d.costo_ananja_calculado_centavos)})
                        </span>
                      )}
                  </p>
                )}
                {d.tiene_costos &&
                  d.precio_mayorista_sugerido_centavos != null &&
                  d.precio_minorista_sugerido_centavos != null && (
                    <p className="text-[13px] leading-snug text-text">
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
            <p className="text-[11px] leading-snug text-text-muted">
              El transporte y otros gastos compartidos se reparten según el
              volumen de cada presentación (una más grande carga más que una
              más chica).
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
