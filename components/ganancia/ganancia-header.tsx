import { FilasResultado } from "@/components/plata/resultado-mes";
import { claseChip } from "@/components/ui/chip";
import { NumeroGrande } from "@/components/ui/numero-grande";
import { Tarjeta } from "@/components/ui/tarjeta";
import { labelDePeriodo } from "@/lib/fechas";
import type { DesgloseResultado } from "@/lib/dominio/margen";
import { formatCentavos } from "@/lib/money";

/** Los dos períodos de `/ganancia` — chip "Este mes"/"Este año", default
 * "Este año" (`app/(app)/ganancia/page.tsx`). */
export type Periodo = "mes" | "anio";

const OPCIONES_PERIODO: { value: Periodo; label: string }[] = [
  { value: "mes", label: "Este mes" },
  { value: "anio", label: "Este año" },
];

/**
 * Cabecera de `/ganancia`: los chips de período (siempre visibles, incluso
 * mientras carga) y, cuando ya hay datos (`desglose` no es `null`), la
 * tarjeta con UNA sola ganancia: "Ganaste en <período>" y, debajo, la cuenta
 * en filas (mismo componente que la tarjeta "Resultado" de `/plata`). El
 * número grande es el total de la cuenta, por eso las filas van sin "Ganaste".
 */
export function GananciaHeader({
  periodo,
  onChangePeriodo,
  desglose,
}: {
  periodo: Periodo;
  onChangePeriodo: (periodo: Periodo) => void;
  /** `null` mientras carga o si no hay nada que mostrar todavía — la
   * tarjeta no se renderiza en ese caso. */
  desglose: DesgloseResultado | null;
}) {
  return (
    <>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Período">
        {OPCIONES_PERIODO.map((opcion) => (
          <button
            key={opcion.value}
            type="button"
            onClick={() => onChangePeriodo(opcion.value)}
            aria-pressed={periodo === opcion.value}
            className={claseChip(periodo === opcion.value)}
          >
            {opcion.label}
          </button>
        ))}
      </div>

      {desglose && (
        <Tarjeta className="flex flex-col gap-3">
          <NumeroGrande
            etiqueta={`Ganaste en ${labelDePeriodo(desglose.periodo).toLowerCase()}`}
            tono={
              !desglose.algunCostoCargado
                ? undefined
                : desglose.gananciaCentavos > 0
                  ? "ok"
                  : desglose.gananciaCentavos < 0
                    ? "debe"
                    : undefined
            }
          >
            {desglose.algunCostoCargado ? formatCentavos(desglose.gananciaCentavos) : "Sin costos cargados"}
          </NumeroGrande>
          <div className="border-t border-line pt-2">
            <FilasResultado desglose={desglose} mostrarTotal={false} />
          </div>
        </Tarjeta>
      )}
    </>
  );
}
