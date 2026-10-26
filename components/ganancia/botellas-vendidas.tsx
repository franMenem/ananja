import { useMemo } from "react";

import type { Periodo } from "@/components/ganancia/ganancia-header";
import { Tarjeta } from "@/components/ui/tarjeta";
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
    <Tarjeta como="section" aria-labelledby="ganancia-botellas" className="flex flex-col gap-2">
      <h2 id="ganancia-botellas" className="text-[17px] font-semibold text-text">
        Botellas vendidas
      </h2>
      {resumen.total === 0 ? (
        <p className="py-1 text-[16px] text-text-muted">Sin ventas en este período.</p>
      ) : (
        <p className="text-[16px] text-text tabular-nums">
          {resumen.total} {envase(resumen.total)}
          {resumen.partes.map((p) => (
            <span key={p.presentacionMl}>
              {" "}
              · {formatPresentacion(p.presentacionMl)} {p.porcentajePct}%
            </span>
          ))}
        </p>
      )}
    </Tarjeta>
  );
}
