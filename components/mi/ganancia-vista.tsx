import Link from "next/link";

import { GraficoLineas, type SerieLinea } from "@/components/graficos/grafico-lineas";
import { HistorialPagos } from "@/components/mi/historial-pagos";
import { BOTON_SECUNDARIO } from "@/components/ui/boton";
import { EncabezadoPantalla } from "@/components/ui/encabezado-pantalla";
import { Fila } from "@/components/ui/fila";
import { NumeroGrande } from "@/components/ui/numero-grande";
import { Pastilla } from "@/components/ui/pastilla";
import { Tarjeta } from "@/components/ui/tarjeta";
import { calcularGananciaRevendedor, seriesGananciaPorAnio, type VentaGanancia } from "@/lib/dominio/ganancia-revendedor";
import type { MovimientoPago } from "@/lib/dominio/pagos-revendedor";
import { hoyISO, labelDeMes } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";
import { NEGOCIO, envase } from "@/lib/negocio";
import { PALETA_GRAFICOS } from "@/lib/paleta-graficos";

type MiGananciaVistaProps = {
  ventas: VentaGanancia[];
  debeCentavos: number;
  pendienteCentavos: number;
  movimientos: MovimientoPago[];
};

/**
 * Contenido de `/mi/ganancia` (los datos los arma
 * `app/(mi)/mi/ganancia/page.tsx`). Columna 1: lo que ganó (cifra total,
 * gráfico y lista por mes). Columna 2: lo que debe y todos sus pagos. En
 * mobile se apilan en ese orden; con el contenedor a partir de 48rem
 * (escritorio) quedan lado a lado. La cifra de cada mes es la misma que
 * muestra "Este mes ganaste" en `/mi`.
 */
export function MiGananciaVista({ ventas, debeCentavos, pendienteCentavos, movimientos }: MiGananciaVistaProps) {
  const resumen = calcularGananciaRevendedor(ventas);

  const [anioTexto, mesTexto] = hoyISO().split("-");
  const anioActual = Number(anioTexto);
  const mesActual = Number(mesTexto) - 1;
  const series: SerieLinea[] = seriesGananciaPorAnio(resumen.porMes)
    .filter((s) => s.anio >= anioActual - 1)
    .map((s, i) => ({
      etiqueta: String(s.anio),
      valores: s.valores,
      color: PALETA_GRAFICOS[i % PALETA_GRAFICOS.length],
    }));

  return (
    <div className="@container w-full">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 pb-8 @3xl:grid @3xl:max-w-[1100px] @3xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] @3xl:items-start @3xl:gap-x-8">
        <EncabezadoPantalla titulo="Ganancia" pregunta="¿Cuánto ganaste?" className="@3xl:col-span-2" />

        <div className="flex flex-col gap-5">
          <Tarjeta como="section" className="flex flex-col gap-3">
            <NumeroGrande etiqueta="Ganaste en total" tono={resumen.gananciaCentavos > 0 ? "ok" : undefined}>
              {formatCentavos(resumen.gananciaCentavos)}
            </NumeroGrande>
            {ventas.length === 0 ? (
              <p className="text-[16px] text-text-muted">Todavía no hay ventas.</p>
            ) : (
              <p className="text-[14px] text-text-muted">
                Vendiste {formatCentavos(resumen.vendidoCentavos)} y {NEGOCIO.nombre} se quedó con{" "}
                {formatCentavos(resumen.ananjaCentavos)}.
              </p>
            )}
            {resumen.unidadesSinPrecio > 0 && (
              <div className="flex flex-col items-start gap-2">
                <Pastilla variante="aviso" className="max-w-full whitespace-normal! leading-snug!">
                  {resumen.unidadesSinPrecio} {envase(resumen.unidadesSinPrecio)} sin precio de venta
                </Pastilla>
                <p className="text-[14px] text-text-muted">
                  No cuentan en la ganancia hasta que cargues a cuánto las vendiste.{" "}
                  <Link href="/mi/ventas" className="inline-flex min-h-11 items-center font-semibold text-primary">
                    Ver ventas
                  </Link>
                </p>
              </div>
            )}
          </Tarjeta>

          {series.length > 0 && (
            <Tarjeta como="section" className="flex flex-col gap-2">
              <h2 className="font-display text-[20px] leading-tight font-bold text-text">Mes a mes</h2>
              <GraficoLineas
                series={series}
                alto={180}
                compacto
                anioActual={anioActual}
                mesActual={mesActual}
                leyenda="Ganancia por mes."
              />
            </Tarjeta>
          )}

          {resumen.porMes.length > 0 && (
            <Tarjeta como="section" className="flex flex-col gap-1">
              <h2 className="font-display text-[20px] leading-tight font-bold text-text">Por mes</h2>
              <div className="flex flex-col divide-y divide-line">
                {resumen.porMes.map((fila) => (
                  <Fila
                    key={fila.periodo}
                    titulo={labelDeMes(fila.periodo)}
                    detalle={`Vendiste ${formatCentavos(fila.vendidoCentavos)} · ${NEGOCIO.nombre} ${formatCentavos(fila.ananjaCentavos)}`}
                    valor={formatCentavos(fila.gananciaCentavos)}
                  />
                ))}
              </div>
            </Tarjeta>
          )}
        </div>

        <div className="flex flex-col gap-5">
          <Tarjeta como="section" className="flex flex-col gap-3">
            <h2 className="font-display text-[20px] leading-tight font-bold text-text">Lo que debés</h2>
            <div className="flex flex-col items-start gap-2">
              <span
                className={`font-display text-[28px] leading-none break-words tabular-nums ${
                  debeCentavos > 0 ? "text-accent" : "text-text"
                }`}
              >
                {formatCentavos(debeCentavos)}
              </span>
              {debeCentavos <= 0 && pendienteCentavos <= 0 && <Pastilla variante="ok">Al día</Pastilla>}
              {pendienteCentavos > 0 && (
                <Pastilla variante="confirmar" className="max-w-full whitespace-normal! leading-snug!">
                  {formatCentavos(pendienteCentavos)} por confirmar
                </Pastilla>
              )}
            </div>
            <Link href="/mi/pagar" className={`${BOTON_SECUNDARIO} flex w-full px-4`}>
              Pagar
            </Link>
          </Tarjeta>

          <Tarjeta como="section" className="flex flex-col gap-1">
            <h2 className="font-display text-[20px] leading-tight font-bold text-text">Tus pagos</h2>
            <HistorialPagos movimientos={movimientos} vacio="Todavía no registraste pagos." />
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}
