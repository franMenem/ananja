import { useMemo } from "react";

import type { Periodo } from "@/components/ganancia/ganancia-header";
import { hoyISO } from "@/lib/fechas";
import {
  rangoPeriodo,
  resumenBotellasPorPresentacion,
  unidadesPorProducto,
  type ItemVendido,
  type PeriodoTorta,
} from "@/lib/dominio/graficos";
import type { DatosGraficos } from "@/lib/data/ganancia";
import { envase, formatPresentacion } from "@/lib/negocio";

/**
 * "Botellas vendidas" del período elegido arriba (chip de `/ganancia`):
 * una sola línea "N botellas · 250 ml 60% · 500 ml 40%"
 * (`resumenBotellasPorPresentacion`, `lib/graficos.ts`).
 */
export function BotellasVendidas({
  datosGraficos,
  periodo,
}: {
  datosGraficos: DatosGraficos;
  periodo: Periodo;
}) {
  const items = useMemo<ItemVendido[]>(
    () => [
      ...datosGraficos.comprobanteItems,
      ...datosGraficos.ventasRevendedor.map((v) => ({
        fecha: v.fecha,
        producto_id: v.producto_id,
        cantidad: v.cantidad,
      })),
    ],
    [datosGraficos.comprobanteItems, datosGraficos.ventasRevendedor],
  );
  const presentacionPorProducto = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const p of datosGraficos.productos) mapa.set(p.id, p.presentacion_ml);
    return mapa;
  }, [datosGraficos.productos]);
  const resumen = useMemo(() => {
    const periodoRango: PeriodoTorta = periodo === "mes" ? "este_mes" : "este_anio";
    const { desde, hasta } = rangoPeriodo(periodoRango, hoyISO());
    const porProducto = unidadesPorProducto(items, desde, hasta);
    return resumenBotellasPorPresentacion(porProducto, presentacionPorProducto);
  }, [items, presentacionPorProducto, periodo]);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">Botellas vendidas</span>
        <span className="h-px flex-1 bg-[linear-gradient(to_right,var(--color-border),transparent)]" />
      </div>
      {resumen.total === 0 ? (
        <p className="py-2 text-sm text-text-muted">Sin ventas en este período.</p>
      ) : (
        <p className="text-sm text-text tabular-nums">
          {resumen.total} {envase(resumen.total)}
          {resumen.partes.map((p) => (
            <span key={p.presentacionMl}>
              {" "}
              · {formatPresentacion(p.presentacionMl)} {p.porcentajePct}%
            </span>
          ))}
        </p>
      )}
    </section>
  );
}
