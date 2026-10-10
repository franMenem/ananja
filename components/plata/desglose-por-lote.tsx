import Link from "next/link";

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
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5 pt-2">
        <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">De qué lote es</span>
        <span
          className="h-px flex-1"
          style={{ background: "linear-gradient(to right, var(--color-border), transparent)" }}
        />
      </div>

      <div className="flex flex-col">
        {lineas.map((l) => (
          <div
            key={l.loteId ?? "sin-lote"}
            className="flex items-baseline justify-between gap-3 border-b border-border py-2 text-[13px]"
          >
            {l.loteId === null ? (
              <span className="min-w-0 break-words text-text-muted">Sin lote asignado</span>
            ) : (
              <Link
                href={`/stock/lotes/${l.loteId}`}
                className="min-w-0 break-words text-text underline decoration-border underline-offset-4 hover:text-primary"
              >
                {l.fecha ? `Lote del ${formatFechaSinAnio(l.fecha)}` : "Lote"}
              </Link>
            )}
            <span className="shrink-0 tabular-nums text-text">{formatCentavos(l.pendienteCentavos)}</span>
          </div>
        ))}
        {otrosMovimientosCentavos !== 0 && (
          <div className="flex items-baseline justify-between gap-3 border-b border-border py-2 text-[13px]">
            <span className="min-w-0 break-words text-text-muted">Otros movimientos</span>
            <span
              className={`shrink-0 tabular-nums ${otrosMovimientosCentavos < 0 ? "text-accent" : "text-text"}`}
            >
              {otrosMovimientosCentavos < 0 ? "− " : ""}
              {formatCentavos(Math.abs(otrosMovimientosCentavos))}
            </span>
          </div>
        )}
      </div>

      <p className="text-[12px] leading-relaxed text-text-muted">
        Lo que ya pasó a la cuenta se descuenta primero del lote más viejo.
      </p>
    </section>
  );
}
