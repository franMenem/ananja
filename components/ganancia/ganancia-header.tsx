import { NumeroGrande } from "@/components/ui/numero-grande";
import { Tarjeta } from "@/components/ui/tarjeta";
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
 * `null`), la tarjeta "Ganancia de Ananja · {período}" con su nota de
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
   * tarjeta no se renderiza en ese caso. */
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
            className={`border border-border px-3 py-2 text-[16px] rounded-full ${
              periodo === opcion.value ? "bg-primary text-primary-foreground" : "bg-surface text-text"
            }`}
          >
            {opcion.label}
          </button>
        ))}
      </div>

      {filaPeriodoActual && (
        <>
          <Tarjeta className="flex flex-col gap-3">
            <NumeroGrande
              etiqueta={`Ganancia de ${NEGOCIO.nombre} · ${labelDePeriodo(filaPeriodoActual.periodo).toLowerCase()}`}
              tono={filaPeriodoActual.gananciaAnanjaCentavos < 0 ? "debe" : undefined}
            >
              {formatMargen(filaPeriodoActual.gananciaAnanjaCentavos, filaPeriodoActual.algunCostoCargado)}
            </NumeroGrande>
            <p className="text-[16px] text-text-muted tabular-nums">
              Margen de botellas{" "}
              {formatMargen(filaPeriodoActual.margenAnanjaCentavos, filaPeriodoActual.algunCostoCargado)} · Gastos{" "}
              {formatCentavos(filaPeriodoActual.gastosOperativosCentavos)}
            </p>
            {filaPeriodoActual.unidadesSinCosto > 0 && (
              <p className="text-[13px] text-text-muted">
                {notaUnidadesSinCosto(filaPeriodoActual.unidadesSinCosto)}
              </p>
            )}
          </Tarjeta>

          {algunCostoEstimado && (
            <p className="text-[13px] text-text-muted">
              * Algunas ventas no tienen lote asignado, el costo es estimado.
            </p>
          )}
        </>
      )}
    </>
  );
}
