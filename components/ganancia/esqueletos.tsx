import { NumeroGrande } from "@/components/ui/numero-grande";
import { Tarjeta } from "@/components/ui/tarjeta";

/**
 * Esqueletos de `/ganancia`: cada uno usa la MISMA tarjeta, el mismo título y
 * las mismas clases de alto que el bloque real, así al llegar el dato no salta
 * el layout. Los títulos (que no dependen de ningún dato) se pintan de verdad;
 * solo el cuerpo es una barra. Las notas opcionales que dependen del dato (las
 * de "costo estimado", "sin costo") no se reservan.
 */

const barra = "rounded bg-surface-raised";

/** Esqueleto de la tarjeta del encabezado: el número grande y las 3 filas de
 * la cuenta (`FilasResultado` con `mostrarTotal={false}`, 44 px cada una). */
export function EsqueletoGananciaHeader() {
  const renglon = (ancho: string) => (
    <div className="flex min-h-11 items-center justify-between gap-4 py-1.5">
      <div className={`h-4 ${barra} ${ancho}`} />
      <div className={`h-4 w-20 ${barra}`} />
    </div>
  );
  return (
    <Tarjeta aria-hidden="true" data-testid="ganancia-esqueleto-header" className="flex flex-col gap-3">
      <NumeroGrande etiqueta={<span className={`inline-block h-4 w-40 align-middle ${barra}`} />}>
        <span className={`inline-block h-[1em] w-48 max-w-full ${barra}`} />
      </NumeroGrande>
      <div className="border-t border-line pt-2">
        <div className="flex flex-col">
          {renglon("w-3/5")}
          {renglon("w-1/2")}
          {renglon("w-1/4")}
        </div>
      </div>
    </Tarjeta>
  );
}

/** Esqueleto de "Por mes": título real y filas de 48 px (alto mínimo de las
 * filas reales). Cuántos meses hay depende del dato, así que se reserva un
 * tramo razonable. */
export function EsqueletoTablaPorMes({ filas = 6 }: { filas?: number }) {
  return (
    <Tarjeta como="section" className="flex flex-col gap-3" data-testid="ganancia-esqueleto-por-mes">
      <h2 className="text-[17px] font-semibold text-text">Por mes</h2>
      <div aria-hidden="true" className="flex flex-col divide-y divide-line">
        {Array.from({ length: filas }).map((_, i) => (
          <div key={i} className="flex min-h-12 items-center justify-between gap-4 py-2.5">
            <div className={`h-4 w-1/3 ${barra}`} />
            <div className={`h-4 w-24 ${barra}`} />
          </div>
        ))}
      </div>
    </Tarjeta>
  );
}

/** "Ganancia de cada vendedor": plegado, así que el cuerpo del dato no se ve;
 * solo se reserva el título (mismo `min-h-11` que el `<summary>`). */
export function EsqueletoGananciaVendedores() {
  return (
    <Tarjeta data-testid="ganancia-esqueleto-vendedores">
      <div className="flex min-h-11 items-center text-[17px] font-semibold text-text">
        Ganancia de cada vendedor
      </div>
    </Tarjeta>
  );
}

/** "Ventas por mes" mientras llegan los datos de los gráficos. */
export function EsqueletoVentasPorMes() {
  return (
    <Tarjeta como="section" className="flex flex-col gap-3" data-testid="ganancia-esqueleto-ventas">
      <h2 className="text-[17px] font-semibold text-text">Ventas por mes</h2>
      <div aria-hidden="true" className={`h-[340px] w-full ${barra}`} />
    </Tarjeta>
  );
}

/** "Botellas vendidas" mientras llegan los datos de los gráficos. */
export function EsqueletoBotellasVendidas() {
  return (
    <Tarjeta className="flex flex-col gap-2" data-testid="ganancia-esqueleto-botellas">
      <h2 className="text-[17px] font-semibold text-text">Botellas vendidas</h2>
      <div aria-hidden="true" className="flex items-center py-1">
        <div className={`h-6 w-2/3 ${barra}`} />
      </div>
    </Tarjeta>
  );
}
