import { labelDePeriodo } from "@/lib/fechas";
import {
  colorGanancia,
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
      <span className="text-[10px] tracking-[0.18em] text-text-muted uppercase">{titulo}</span>
      {unidadesSinPrecio > 0 && (
        <span className="text-[11px] text-accent">
          {unidadesSinPrecio} {unidadesSinPrecio === 1 ? "botella" : "botellas"} de revendedoras sin
          precio de venta, no contada{unidadesSinPrecio === 1 ? "" : "s"}
        </span>
      )}
      {filas.length === 0 ? (
        <p className="py-2 text-[13px] text-text-muted">
          Todavía no hay ventas con precio cargado este período.
        </p>
      ) : (
        <div className="flex flex-col">
          {filas.map((fila) => {
            const nota = notaUnidadesSinCosto(fila.unidadesSinCosto);
            return (
              <div
                key={fila.vendedorId}
                className="flex items-start justify-between gap-3 border-b border-border py-2.5"
              >
                <div className="flex flex-col">
                  <span className="text-sm text-text">
                    {nombreDe(fila.vendedorId)}
                    {fila.algunCostoEstimado && (
                      <span className="ml-1.5 text-[10px] text-text-muted">*</span>
                    )}
                  </span>
                  {nota && <span className="text-[11px] text-text-muted">{nota}</span>}
                </div>
                <span
                  className={`shrink-0 font-medium tabular-nums ${colorGanancia(fila.margenVendedorCentavos)}`}
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
 * `<details>` plegado "Ver ganancia de vendedores" de `/ganancia` — adentro,
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
    <details className="flex flex-col gap-4">
      <summary className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
        Ver ganancia de vendedores
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
  );
}
