import { useMemo } from "react";

import { GraficoLineas, type SerieLinea } from "@/components/graficos/grafico-lineas";
import { Tarjeta } from "@/components/ui/tarjeta";
import { aniosDisponibles, ventasPorAnioMes, type VentaConFecha } from "@/lib/dominio/graficos";
import type { DatosGraficos } from "@/lib/data/ganancia";
import { PALETA_GRAFICOS } from "@/lib/paleta-graficos";

/**
 * "Ventas por mes" de `/ganancia`: gráfico de líneas (una serie por año) de
 * comprobantes + ventas de revendedor al precio revendedor — no depende
 * del chip de período de arriba, siempre muestra todo el histórico.
 */
export function VentasPorMes({ datosGraficos }: { datosGraficos: DatosGraficos }) {
  const ventasParaLineas = useMemo<VentaConFecha[]>(
    () => [
      ...datosGraficos.comprobantes,
      ...datosGraficos.ventasRevendedor.map((v) => ({
        fecha: v.fecha,
        monto_centavos: v.cantidad * v.precio_costo_centavos,
      })),
    ],
    [datosGraficos.comprobantes, datosGraficos.ventasRevendedor],
  );
  const porAnioMes = useMemo(() => ventasPorAnioMes(ventasParaLineas), [ventasParaLineas]);
  const anios = useMemo(() => aniosDisponibles(porAnioMes), [porAnioMes]);
  const series = useMemo<SerieLinea[]>(
    () =>
      anios.map((anio, i) => ({
        etiqueta: String(anio),
        valores: porAnioMes[anio],
        color: PALETA_GRAFICOS[i % PALETA_GRAFICOS.length],
      })),
    [anios, porAnioMes],
  );

  return (
    <Tarjeta como="section" aria-labelledby="ganancia-ventas-por-mes" className="flex flex-col gap-3">
      <h2 id="ganancia-ventas-por-mes" className="text-[17px] font-semibold text-text">
        Ventas por mes
      </h2>
      <GraficoLineas series={series} />
    </Tarjeta>
  );
}
