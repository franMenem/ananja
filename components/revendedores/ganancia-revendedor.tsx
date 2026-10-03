import Link from "next/link";

import { GraficoLineas, type SerieLinea } from "@/components/graficos/grafico-lineas";
import { IrAPrecioPendiente } from "@/components/revendedores/ir-a-precio-pendiente";
import { hoyISO, labelDeMes } from "@/lib/fechas";
import {
  calcularGananciaRevendedor,
  seriesGananciaPorAnio,
  type VentaGanancia,
} from "@/lib/dominio/ganancia-revendedor";
import { formatCentavos } from "@/lib/money";
import { NEGOCIO, envase } from "@/lib/negocio";
import { PALETA_GRAFICOS } from "@/lib/paleta-graficos";

type GananciaRevendedorProps = {
  ventas: VentaGanancia[];
  /** "vos": la propia revendedora en `/mi` ("Vendiste", "Ganaste").
   * "ella": un admin mirando `/revendedores/[id]` ("Vendió", "Ganó"). */
  persona: "vos" | "ella";
};

/**
 * "Tu ganancia" (`/mi`, `/mi/ganancia`) y su espejo de admin
 * (`/revendedores/[id]`): total histórico — vendido, lo que le correspondió
 * a Ananja y lo que le quedó —, gráfico por mes (año actual y anterior) y
 * lista por mes. Server Component: le pasa a `GraficoLineas` (cliente) solo
 * datos planos, nunca funciones.
 */
export function GananciaRevendedor({ ventas, persona }: GananciaRevendedorProps) {
  const resumen = calcularGananciaRevendedor(ventas);
  const vos = persona === "vos";

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
    <section className="flex flex-col gap-4">
      <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
        {vos ? "Tu ganancia" : "Ganancia como revendedora"}
      </span>

      {resumen.unidadesSinPrecio > 0 && (
        <p className="text-[12px] text-accent">
          {resumen.unidadesSinPrecio} {envase(resumen.unidadesSinPrecio)} sin precio de venta: no
          cuentan en la ganancia hasta que{" "}
          {vos ? "cargues a cuánto las vendiste" : "se cargue a cuánto las vendió"}.{" "}
          {vos ? (
            <Link href="/mi/ventas" className="border-b border-mark text-text">
              Ver ventas
            </Link>
          ) : (
            <IrAPrecioPendiente destinoId="sin-precio">Cargar precios</IrAPrecioPendiente>
          )}
        </p>
      )}

      {ventas.length === 0 ? (
        <p className="py-2 text-sm text-text-muted">Todavía no hay ventas.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 border-y border-border py-4">
            <div className="min-w-0">
              <span className="text-[10px] tracking-[0.12em] text-text-muted uppercase">
                {vos ? "Vendiste" : "Vendió"}
              </span>
              <p className="font-display text-lg break-words text-text tabular-nums">
                {formatCentavos(resumen.vendidoCentavos)}
              </p>
            </div>
            <div className="min-w-0">
              <span className="text-[10px] tracking-[0.12em] text-text-muted uppercase">
                Le correspondió a {NEGOCIO.nombre}
              </span>
              <p className="font-display text-lg break-words text-text tabular-nums">
                {formatCentavos(resumen.ananjaCentavos)}
              </p>
            </div>
            <div className="min-w-0">
              <span className="text-[10px] tracking-[0.12em] text-text-muted uppercase">
                {vos ? "Ganaste" : "Ganó"}
              </span>
              <p className="font-display text-lg break-words text-accent tabular-nums">
                {formatCentavos(resumen.gananciaCentavos)}
              </p>
            </div>
          </div>

          {series.length > 0 && (
            <GraficoLineas
              series={series}
              alto={180}
              compacto
              anioActual={anioActual}
              mesActual={mesActual}
              leyenda="Ganancia por mes."
            />
          )}

          <div className="flex flex-col">
            {resumen.porMes.map((fila) => (
              <div
                key={fila.periodo}
                className="flex items-center justify-between gap-3 border-b border-border py-3"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm text-text">{labelDeMes(fila.periodo)}</span>
                  <span className="text-[11px] text-text-muted">
                    {vos ? "Vendiste" : "Vendió"} {formatCentavos(fila.vendidoCentavos)} ·{" "}
                    {NEGOCIO.nombre} {formatCentavos(fila.ananjaCentavos)}
                  </span>
                </div>
                <span className="shrink-0 text-sm font-medium tabular-nums text-text">
                  {formatCentavos(fila.gananciaCentavos)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
