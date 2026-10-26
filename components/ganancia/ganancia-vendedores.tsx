import { claseGanaste } from "@/components/plata/resultado-mes";
import { Tarjeta } from "@/components/ui/tarjeta";
import { labelDePeriodo } from "@/lib/fechas";
import {
  formatMargen,
  notaUnidadesSinCosto,
  type ResumenMargenVendedor,
} from "@/lib/dominio/margen";

/** Ganancia de cada vendedor de UN período puntual (mes actual / año
 * actual) — una fila por vendedor, sin desglose histórico. Privado a este
 * archivo: `GananciaVendedores` (abajo) es lo único que se exporta. */
function TablaGananciaVendedores({
  titulo,
  filas,
  nombreDe,
  unidadesSinPrecio,
}: {
  titulo: string;
  filas: ResumenMargenVendedor[];
  nombreDe: (vendedorId: string) => string;
  /** Botellas de revendedoras vendidas sin precio de venta en el período
   * (`unidadesSinPrecioRevendedorDePeriodo`) — no entran en la tabla. */
  unidadesSinPrecio: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[15px] font-semibold text-text-muted">{titulo}</h3>
      {unidadesSinPrecio > 0 && (
        <span className="text-[14px] text-text">
          {unidadesSinPrecio} {unidadesSinPrecio === 1 ? "botella" : "botellas"} de revendedoras sin
          precio de venta, no contada{unidadesSinPrecio === 1 ? "" : "s"}
        </span>
      )}
      {filas.length === 0 ? (
        <p className="py-2 text-[16px] text-text-muted">
          Todavía no hay ventas con precio cargado este período.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-line">
          {filas.map((fila) => {
            const nota = notaUnidadesSinCosto(fila.unidadesSinCosto);
            return (
              <div
                key={fila.vendedorId}
                className="flex min-h-11 items-start justify-between gap-3 py-2.5"
              >
                <div className="flex flex-col">
                  <span className="text-[16px] text-text">
                    {nombreDe(fila.vendedorId)}
                    {fila.algunCostoEstimado && (
                      <span className="ml-1.5 text-[14px] text-text-muted">*</span>
                    )}
                  </span>
                  {nota && <span className="text-[14px] text-text-muted">{nota}</span>}
                </div>
                <span
                  className={`shrink-0 font-semibold tabular-nums ${fila.algunCostoCargado ? claseGanaste(fila.margenVendedorCentavos) : "text-text-muted"}`}
                >
                  {formatMargen(fila.margenVendedorCentavos, fila.algunCostoCargado)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * `<details>` plegado "Ganancia de cada vendedor" de `/ganancia` — adentro,
 * la ganancia de cada vendedor de este mes y de este año (las dos, sin
 * importar el chip de período de arriba).
 */
export function GananciaVendedores({
  mesActual,
  anioActual,
  vendedoresEsteMes,
  vendedoresEsteAnio,
  nombreDe,
  unidadesSinPrecioMes,
  unidadesSinPrecioAnio,
}: {
  /** "YYYY-MM" del mes actual. */
  mesActual: string;
  /** "YYYY" del año actual. */
  anioActual: string;
  vendedoresEsteMes: ResumenMargenVendedor[];
  vendedoresEsteAnio: ResumenMargenVendedor[];
  nombreDe: (vendedorId: string) => string;
  unidadesSinPrecioMes: number;
  unidadesSinPrecioAnio: number;
}) {
  return (
    <Tarjeta>
      <details className="group flex flex-col gap-4">
        <summary className="flex min-h-11 cursor-pointer items-center text-[17px] font-semibold text-text">
          Ganancia de cada vendedor
        </summary>
        <div className="flex flex-col gap-5 pt-2">
          <TablaGananciaVendedores
            titulo={`Este mes (${labelDePeriodo(mesActual)})`}
            filas={vendedoresEsteMes}
            nombreDe={nombreDe}
            unidadesSinPrecio={unidadesSinPrecioMes}
          />
          <TablaGananciaVendedores
            titulo={`Este año (${anioActual})`}
            filas={vendedoresEsteAnio}
            nombreDe={nombreDe}
            unidadesSinPrecio={unidadesSinPrecioAnio}
          />
        </div>
      </details>
    </Tarjeta>
  );
}
