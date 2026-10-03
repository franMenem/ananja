import { labelDePeriodo } from "@/lib/fechas";
import { colorGanancia, formatMargen, notaUnidadesSinCosto, type FilaGananciaAnanjaPeriodo } from "@/lib/dominio/margen";
import { formatCentavos } from "@/lib/money";

/**
 * Ganancia de Ananja por mes (siempre los 12 meses, sin importar el chip de
 * período de `/ganancia` — spec: "la misma tabla muestra los 12 meses").
 * Patrón mobile lista / desktop tabla, mismo criterio que
 * `app/(app)/gastos/page.tsx`.
 */
export function TablaPorMes({ filas }: { filas: FilaGananciaAnanjaPeriodo[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">Por mes</span>
        <span className="h-px flex-1 bg-[linear-gradient(to_right,var(--color-border),transparent)]" />
      </div>

      {/* Tabla — escritorio */}
      <div className="hidden md:block">
        <div className="overflow-x-auto">
          <div className="min-w-[560px] grid grid-cols-[160px_1fr_1fr_1fr] gap-4 border-b border-border pb-2 text-[10px] tracking-[0.16em] text-text-muted uppercase">
            <span>Mes</span>
            <span className="text-right">Margen botellas</span>
            <span className="text-right">Gastos operativos</span>
            <span className="text-right">Ganancia</span>
          </div>
          {filas.map((fila) => {
            const nota = notaUnidadesSinCosto(fila.unidadesSinCosto);
            return (
              <div
                key={fila.periodo}
                className="min-w-[560px] grid grid-cols-[160px_1fr_1fr_1fr] items-start gap-4 border-b border-border py-[11px] text-sm"
              >
                <span className="text-text">
                  {labelDePeriodo(fila.periodo)}
                  {fila.algunCostoEstimado && (
                    <span className="ml-1.5 text-[10px] text-text-muted">*</span>
                  )}
                </span>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-right text-text-muted tabular-nums">
                    {formatMargen(fila.margenAnanjaCentavos, fila.algunCostoCargado)}
                  </span>
                  {nota && (
                    <span className="text-right text-[10px] text-text-muted">{nota}</span>
                  )}
                </div>
                <span className="text-right text-text-muted tabular-nums">
                  {formatCentavos(fila.gastosOperativosCentavos)}
                </span>
                <span
                  className={`text-right font-medium tabular-nums ${colorGanancia(fila.gananciaAnanjaCentavos)}`}
                >
                  {formatMargen(fila.gananciaAnanjaCentavos, fila.algunCostoCargado)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lista — celular */}
      <div className="flex flex-col md:hidden">
        {filas.map((fila) => {
          const nota = notaUnidadesSinCosto(fila.unidadesSinCosto);
          return (
            <div
              key={fila.periodo}
              className="flex items-baseline justify-between gap-2 border-b border-border py-3"
            >
              <div className="flex flex-col">
                <span className="font-display text-[19px] leading-[1.1] text-primary">
                  {labelDePeriodo(fila.periodo)}
                  {fila.algunCostoEstimado && (
                    <span className="ml-1.5 text-[11px] text-text-muted">*</span>
                  )}
                </span>
                <span className="text-[11px] text-text-muted">
                  Margen {formatMargen(fila.margenAnanjaCentavos, fila.algunCostoCargado)} · Gastos{" "}
                  {formatCentavos(fila.gastosOperativosCentavos)}
                </span>
                {nota && <span className="text-[11px] text-text-muted">{nota}</span>}
              </div>
              <span
                className={`shrink-0 text-[16px] font-medium tabular-nums ${colorGanancia(fila.gananciaAnanjaCentavos)}`}
              >
                {formatMargen(fila.gananciaAnanjaCentavos, fila.algunCostoCargado)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
