import { labelDePeriodo } from "@/lib/fechas";
import { formatMargen, notaUnidadesSinCosto, type FilaGananciaAnanjaPeriodo } from "@/lib/dominio/margen";
import { formatCentavos } from "@/lib/money";
import { NEGOCIO } from "@/lib/negocio";

/** Los dos períodos de `/ganancia` — chip "Este mes"/"Este año", default
 * "Este año" (`app/(app)/ganancia/page.tsx`). */
export type Periodo = "mes" | "anio";

const OPCIONES_PERIODO: { value: Periodo; label: string }[] = [
  { value: "mes", label: "Este mes" },
  { value: "anio", label: "Este año" },
];

/**
 * Cabecera de `/ganancia`: los chips de período (siempre visibles, incluso
 * mientras carga) y, cuando ya hay datos (`filaPeriodoActual` no es
 * `null`), el bloque oliva "Ganancia de Ananja · {período}" con su nota de
 * botellas sin costo y el aviso de costo estimado.
 */
export function GananciaHeader({
  periodo,
  onChangePeriodo,
  filaPeriodoActual,
  algunCostoEstimado,
}: {
  periodo: Periodo;
  onChangePeriodo: (periodo: Periodo) => void;
  /** `null` mientras carga o si no hay nada que mostrar todavía — el
   * bloque oliva no se renderiza en ese caso. */
  filaPeriodoActual: FilaGananciaAnanjaPeriodo | null;
  /** Alguna venta del histórico completo (no solo del período elegido)
   * tiene el costo estimado por FIFO en vez de un lote elegido a mano. */
  algunCostoEstimado: boolean;
}) {
  return (
    <>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Período">
        {OPCIONES_PERIODO.map((opcion) => (
          <button
            key={opcion.value}
            type="button"
            onClick={() => onChangePeriodo(opcion.value)}
            aria-pressed={periodo === opcion.value}
            className={`border border-border px-2.5 py-1.5 text-xs tracking-[0.08em] uppercase ${
              periodo === opcion.value ? "bg-primary text-background" : "bg-surface-raised text-text"
            }`}
          >
            {opcion.label}
          </button>
        ))}
      </div>

      {filaPeriodoActual && (
        <>
          {/* Bloque oliva: mismo patrón que app/(app)/gastos/page.tsx. */}
          <div className="-mx-5 -mt-4 flex flex-col gap-3 bg-primary px-5 pt-[14px] pb-5 lg:-mx-[var(--page-px)] lg:-mt-[34px] lg:px-[var(--page-px)] lg:pt-[26px] lg:pb-[22px]">
            <span className="text-[10px] tracking-[0.22em] text-on-primary-muted uppercase">
              Ganancia de {NEGOCIO.nombre} · {labelDePeriodo(filaPeriodoActual.periodo).toLowerCase()}
            </span>
            <p
              className={`font-display text-[32px] leading-[1] tabular-nums md:text-[40px] ${
                filaPeriodoActual.gananciaAnanjaCentavos < 0 ? "text-accent" : "text-background"
              }`}
            >
              {formatMargen(filaPeriodoActual.gananciaAnanjaCentavos, filaPeriodoActual.algunCostoCargado)}
            </p>
            <p className="text-[13px] text-on-primary-muted tabular-nums">
              Margen de botellas{" "}
              {formatMargen(filaPeriodoActual.margenAnanjaCentavos, filaPeriodoActual.algunCostoCargado)} · Gastos{" "}
              {formatCentavos(filaPeriodoActual.gastosOperativosCentavos)}
            </p>
            {filaPeriodoActual.unidadesSinCosto > 0 && (
              <p className="text-[11px] text-on-primary-muted">
                {notaUnidadesSinCosto(filaPeriodoActual.unidadesSinCosto)}
              </p>
            )}
          </div>

          {algunCostoEstimado && (
            <p className="text-[11px] text-text-muted">
              * Algunas ventas no tienen lote asignado, el costo es estimado.
            </p>
          )}
        </>
      )}
    </>
  );
}
