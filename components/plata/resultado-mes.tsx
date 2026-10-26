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
          Algunas ventas no tienen lote asignado, el costo es estimado.
        </p>
      )}
    </div>
  );
}

/** Tarjeta "Resultado de <mes>" de `/plata`. `desglose` es `null` si no se
 * pudo cargar. */
export function TarjetaResultado({
  nombreMes,
  desglose,
}: {
  nombreMes: string;
  desglose: DesgloseResultado | null;
}) {
  return (
    <Tarjeta como="section" aria-labelledby="plata-resultado" className="flex flex-col gap-2">
      <h2 id="plata-resultado" className="text-[20px] leading-tight font-semibold text-text">
        Resultado de {nombreMes}
      </h2>
      {desglose ? (
        <FilasResultado desglose={desglose} />
      ) : (
        <p role="alert" className="text-[16px] text-text-muted">
          No se pudo calcular el resultado.
        </p>
      )}
      <Link
        href="/ganancia"
        className="inline-flex min-h-11 items-center self-start text-[15px] font-medium text-primary hover:underline"
      >
        Ver mes por mes
      </Link>
    </Tarjeta>
  );
}
