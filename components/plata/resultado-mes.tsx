import Link from "next/link";
import type { ReactNode } from "react";

import { Tarjeta } from "@/components/ui/tarjeta";
import { notaUnidadesSinCosto, type DesgloseResultado } from "@/lib/dominio/margen";
import { formatCentavos } from "@/lib/money";

function FilaCuenta({ etiqueta, valor }: { etiqueta: ReactNode; valor: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 py-1.5 text-[16px]">
      <span className="min-w-0 text-text">{etiqueta}</span>
      <span className="shrink-0 text-right whitespace-nowrap tabular-nums text-text">{valor}</span>
    </div>
  );
}

/** Color de "Ganaste": verde si es positivo, rojo si es negativo, normal en 0
 * (un cero nunca va en rojo). */
export function claseGanaste(centavos: number): string {
  return centavos > 0 ? "text-secondary" : centavos < 0 ? "text-accent" : "text-text";
}

/**
 * La cuenta del resultado en filas alineadas a la derecha: lo que cobró
 * Ananja por las botellas, menos lo que costaron, menos los gastos, igual a
 * lo que ganó. Compartida por `/plata` (tarjeta "Resultado") y `/ganancia`
 * (debajo del número grande, con `mostrarTotal={false}` porque el total ya
 * es el número grande). Los números salen de `desgloseResultadoDelPeriodo`.
 */
export function FilasResultado({
  desglose,
  mostrarTotal = true,
}: {
  desglose: DesgloseResultado;
  mostrarTotal?: boolean;
}) {
  const sinCostos = !desglose.algunCostoCargado;
  const nota = notaUnidadesSinCosto(desglose.unidadesSinCosto);
  return (
    <div className="flex flex-col">
      <FilaCuenta
        etiqueta="Lo que cobró Ananja por las botellas"
        valor={sinCostos ? "—" : formatCentavos(desglose.cobroBotellasCentavos)}
      />
      <FilaCuenta
        etiqueta="Lo que costaron las botellas"
        valor={sinCostos ? "—" : `− ${formatCentavos(desglose.costoBotellasCentavos)}`}
      />
      <FilaCuenta etiqueta="Gastos" valor={`− ${formatCentavos(desglose.gastosCentavos)}`} />
      {mostrarTotal && (
        <div className="mt-1 flex min-h-12 items-center justify-between gap-4 border-t border-border pt-2">
          <span className="text-[17px] font-semibold text-text">Ganaste</span>
          <span
            className={`text-right text-[22px] leading-tight font-bold tabular-nums ${
              sinCostos ? "text-text-muted" : claseGanaste(desglose.gananciaCentavos)
            }`}
          >
            {sinCostos ? "Sin costos cargados" : formatCentavos(desglose.gananciaCentavos)}
          </span>
        </div>
      )}
      {nota && <p className="pt-1 text-[14px] text-text-muted">{nota}</p>}
      {desglose.algunCostoEstimado && (
        <p className="pt-1 text-[14px] text-text-muted">
          Algunas ventas no tienen pedido asignado, el costo es estimado.
        </p>
      )}
    </div>
  );
}

/** Cuerpo de la tarjeta: las filas, o el aviso si `desglose` es `null` (no se
 * pudo cargar — nunca se muestra como cero). */
export function CuerpoResultado({ desglose }: { desglose: DesgloseResultado | null }) {
  return desglose ? (
    <FilasResultado desglose={desglose} />
  ) : (
    <p role="alert" className="text-[16px] text-text-muted">
      No se pudo calcular el resultado.
    </p>
  );
}

/** Esqueleto de {@link FilasResultado}: mismas filas con las MISMAS clases de
 * alto (3 renglones de 44 px + el total de 48 px con su borde y márgenes), así
 * al llegar el dato no salta el layout. Las notas opcionales de abajo no se
 * reservan: dependen del dato. */
export function EsqueletoResultado() {
  const renglon = (ancho: string) => (
    <div className="flex min-h-11 items-center justify-between gap-4 py-1.5">
      <div className={`h-4 rounded bg-surface-raised ${ancho}`} />
      <div className="h-4 w-20 rounded bg-surface-raised" />
    </div>
  );
  return (
    <div aria-hidden="true" data-testid="resultado-esqueleto" className="flex flex-col">
      {renglon("w-3/5")}
      {renglon("w-1/2")}
      {renglon("w-1/4")}
      <div className="mt-1 flex min-h-12 items-center justify-between gap-4 border-t border-border pt-2">
        <div className="h-5 w-16 rounded bg-surface-raised" />
        <div className="h-6 w-28 rounded bg-surface-raised" />
      </div>
    </div>
  );
}

/** Marco de la tarjeta "Resultado de <mes>" de `/plata`: título y link se
 * pintan enseguida; el cuerpo (`children`) puede llegar por streaming. */
export function MarcoResultado({ nombreMes, children }: { nombreMes: string; children: ReactNode }) {
  return (
    <Tarjeta como="section" aria-labelledby="plata-resultado" className="flex flex-col gap-2">
      <h2 id="plata-resultado" className="text-[20px] leading-tight font-semibold text-text">
        Resultado de {nombreMes}
      </h2>
      {children}
      <Link
        prefetch={false}
        href="/ganancia"
        className="inline-flex min-h-11 items-center self-start text-[15px] font-medium text-primary hover:underline"
      >
        Ver mes por mes
      </Link>
    </Tarjeta>
  );
}

/** Tarjeta "Resultado de <mes>" con el dato ya resuelto. `desglose` es `null`
 * si no se pudo cargar. */
export function TarjetaResultado({
  nombreMes,
  desglose,
}: {
  nombreMes: string;
  desglose: DesgloseResultado | null;
}) {
  return (
    <MarcoResultado nombreMes={nombreMes}>
      <CuerpoResultado desglose={desglose} />
    </MarcoResultado>
  );
}
