import Link from "next/link";

import { MEDIO_PAGO_LABELS } from "@/lib/dominio/caja";
import { formatFecha } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";
import { ESTADO_PAGO_LABELS, type MovimientoPago } from "@/lib/dominio/pagos-revendedor";

const COLOR_ESTADO: Record<MovimientoPago["estado"], string> = {
  pendiente: "text-mark",
  confirmado: "text-secondary",
  rechazado: "text-accent",
};

type HistorialPagosProps = {
  movimientos: MovimientoPago[];
  /** Muestra solo los primeros N (resumen en `/mi`). */
  limite?: number;
  vacio: string;
  /** Link de cada pago informado (admin: a su pantalla de confirmación). */
  hrefPago?: (id: string) => string;
};

/**
 * Lista de pagos de una revendedora con su estado (pendiente de confirmar /
 * confirmado / rechazado + motivo) — `historialPagos` de
 * `lib/pagos-revendedor.ts`. Server Component; `hrefPago` solo lo usa otro
 * Server Component, nunca se pasa a un Client Component.
 */
export function HistorialPagos({ movimientos, limite, vacio, hrefPago }: HistorialPagosProps) {
  const filas = limite ? movimientos.slice(0, limite) : movimientos;

  if (filas.length === 0) {
    return <p className="py-2 text-sm text-text-muted">{vacio}</p>;
  }

  return (
    <div className="flex flex-col">
      {filas.map((m) => {
        const contenido = (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-text">
                {formatFecha(m.fecha)} · {MEDIO_PAGO_LABELS[m.medioPago]}
              </span>
              <span className="shrink-0 text-sm font-medium tabular-nums text-text">
                {formatCentavos(m.montoCentavos)}
              </span>
            </div>
            <span className={`text-[11px] tracking-[0.08em] uppercase ${COLOR_ESTADO[m.estado]}`}>
              {m.origen === "rendicion" ? "Registrado por un admin" : ESTADO_PAGO_LABELS[m.estado]}
            </span>
            {m.estado === "rechazado" && m.motivoRechazo && (
              <span className="text-[12px] text-text-muted">Motivo: {m.motivoRechazo}</span>
            )}
          </>
        );

        return m.origen === "pago" && hrefPago ? (
          <Link
            key={m.id}
            href={hrefPago(m.id)}
            className="flex flex-col gap-1 border-b border-border py-3 hover:bg-border/30"
          >
            {contenido}
          </Link>
        ) : (
          <div key={m.id} className="flex flex-col gap-1 border-b border-border py-3">
            {contenido}
          </div>
        );
      })}
    </div>
  );
}
