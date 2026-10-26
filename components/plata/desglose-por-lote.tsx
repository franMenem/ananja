import Link from "next/link";

import { Tarjeta } from "@/components/ui/tarjeta";
import type { DesglosePorLote } from "@/lib/dominio/plata-por-lote";
import { formatFechaSinAnio } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";

/**
 * "De qué lote es" — desglose por lote de lo que una coordinadora tiene que
 * pasar a Ananja (`/plata/en-manos/[id]`). Solo presentación: el cálculo
 * está en `lib/dominio/plata-por-lote.ts`.
 */
export function DesgloseLotes({ desglose }: { desglose: DesglosePorLote }) {
  const { lineas, otrosMovimientosCentavos } = desglose;

  return (
    <Tarjeta como="section" aria-labelledby="desglose-lotes" className="flex flex-col gap-2">
      <h2 id="desglose-lotes" className="text-[20px] leading-tight font-semibold text-text">
        De qué pedido es
      </h2>

      <div className="flex flex-col divide-y divide-line">
        {lineas.map((l) => (
          <div key={l.loteId ?? "sin-lote"} className="flex min-h-11 items-center justify-between gap-3 py-2 text-[16px]">
            {l.loteId === null ? (
              <span className="min-w-0 break-words text-text-muted">Sin pedido asignado</span>
            ) : (
              <Link
                href={`/stock/lotes/${l.loteId}`}
                className="min-w-0 break-words text-text underline decoration-border underline-offset-4 hover:text-primary"
              >
                {l.fecha ? `Pedido del ${formatFechaSinAnio(l.fecha)}` : "Pedido"}
              </Link>
            )}
            <span className="shrink-0 tabular-nums text-text">{formatCentavos(l.pendienteCentavos)}</span>
          </div>
        ))}
        {otrosMovimientosCentavos !== 0 && (
          <div className="flex min-h-11 items-center justify-between gap-3 py-2 text-[16px]">
            <span className="min-w-0 break-words text-text-muted">Otros movimientos</span>
            <span className="shrink-0 tabular-nums text-text">
              {otrosMovimientosCentavos < 0 ? "− " : ""}
              {formatCentavos(Math.abs(otrosMovimientosCentavos))}
            </span>
          </div>
        )}
      </div>

      <p className="text-[14px] leading-relaxed text-text-muted">
        Lo que ya pasó a la cuenta se descuenta primero del pedido más viejo.
      </p>
    </Tarjeta>
  );
}
