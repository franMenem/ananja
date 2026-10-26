import { claseGanaste } from "@/components/plata/resultado-mes";
import { Fila } from "@/components/ui/fila";
import { Tarjeta } from "@/components/ui/tarjeta";
import { labelDePeriodo } from "@/lib/fechas";
import { formatMargen, notaUnidadesSinCosto, type FilaGananciaAnanjaPeriodo } from "@/lib/dominio/margen";
import { formatCentavos } from "@/lib/money";

/**
 * Ganancia de Ananja por mes (siempre los 12 meses, sin importar el chip de
 * período de `/ganancia` — spec: "la misma tabla muestra los 12 meses").
 * Patrón mobile lista / desktop tabla, mismo criterio que
 * `app/(app)/gastos/page.tsx`.
 */
export function TablaPorMes({ filas }: { filas: FilaGananciaAnanjaPeriodo[] }) {
  const hayEstimado = filas.some((f) => f.algunCostoEstimado);
  return (
    <Tarjeta como="section" aria-labelledby="ganancia-por-mes" className="flex flex-col gap-3">
      <h2 id="ganancia-por-mes" className="text-[17px] font-semibold text-text">
        Por mes
      </h2>

      {/* Tabla — escritorio */}
      <div className="hidden md:block">
        <div className="overflow-x-auto">
          <div className="grid min-w-[560px] grid-cols-[160px_1fr_1fr_1fr] gap-4 border-b border-border pb-2 text-[14px] text-text-muted">
            <span>Mes</span>
            <span className="text-right">Margen de botellas</span>
            <span className="text-right">Gastos</span>
            <span className="text-right">Ganaste</span>
          </div>
          {filas.map((fila) => {
            const nota = notaUnidadesSinCosto(fila.unidadesSinCosto);
            return (
              <div
                key={fila.periodo}
                className="grid min-h-12 min-w-[560px] grid-cols-[160px_1fr_1fr_1fr] items-start gap-4 border-b border-line py-2.5 text-[16px]"
              >
                <span className="text-text">
                  {labelDePeriodo(fila.periodo)}
                  {fila.algunCostoEstimado && <span className="ml-1.5 text-[14px] text-text-muted">*</span>}
                </span>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-right text-text-muted tabular-nums">
                    {formatMargen(fila.margenAnanjaCentavos, fila.algunCostoCargado)}
                  </span>
                  {nota && <span className="text-right text-[14px] text-text-muted">{nota}</span>}
                </div>
                <span className="text-right text-text-muted tabular-nums">
                  {formatCentavos(fila.gastosOperativosCentavos)}
                </span>
                <span
                  className={`text-right font-semibold tabular-nums ${
                    fila.algunCostoCargado ? claseGanaste(fila.gananciaAnanjaCentavos) : "text-text-muted"
                  }`}
                >
                  {formatMargen(fila.gananciaAnanjaCentavos, fila.algunCostoCargado)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lista — celular */}
      <div className="flex flex-col divide-y divide-line md:hidden">
        {filas.map((fila) => {
          const nota = notaUnidadesSinCosto(fila.unidadesSinCosto);
          return (
            <Fila
              key={fila.periodo}
              titulo={
                <>
                  {labelDePeriodo(fila.periodo)}
                  {fila.algunCostoEstimado && <span className="ml-1.5 text-[14px] text-text-muted">*</span>}
                </>
              }
              detalle={
                <>
                  Margen {formatMargen(fila.margenAnanjaCentavos, fila.algunCostoCargado)} · Gastos{" "}
                  {formatCentavos(fila.gastosOperativosCentavos)}
                  {nota && <div>{nota}</div>}
                </>
              }
              valor={
                <span
                  className={fila.algunCostoCargado ? claseGanaste(fila.gananciaAnanjaCentavos) : "text-text-muted"}
                >
                  {formatMargen(fila.gananciaAnanjaCentavos, fila.algunCostoCargado)}
                </span>
              }
            />
          );
        })}
      </div>

      {hayEstimado && (
        <p className="text-[14px] text-text-muted">
          * Algunas ventas no tienen lote asignado, el costo es estimado.
        </p>
      )}
    </Tarjeta>
  );
}
