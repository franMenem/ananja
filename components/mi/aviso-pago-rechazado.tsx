import Link from "next/link";

import { formatFecha } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";

type AvisoPagoRechazadoProps = {
  montoCentavos: number;
  fecha: string;
  motivo: string | null;
};

/**
 * Aviso tipo tarea en `/mi` cuando un pago que informó la revendedora fue
 * rechazado hace poco y todavía debe (`pagoRechazadoParaAvisar`): cuánto, de
 * qué día, por qué, y el botón para volver a pagar. Mismo ancho que
 * `MiInicioVista` (720px en una columna, 1240px cuando el contenedor llega a
 * 48rem).
 */
export function AvisoPagoRechazado({ montoCentavos, fecha, motivo }: AvisoPagoRechazadoProps) {
  return (
    <div className="@container w-full">
      <div
        role="status"
        className="mx-auto mb-6 flex w-full max-w-[720px] flex-col gap-2 border-l-2 border-accent bg-surface-raised px-4 py-3 sm:flex-row sm:items-center sm:justify-between @3xl:max-w-[1240px]"
      >
        <div className="flex min-w-0 flex-col">
          <span className="text-[9px] font-medium tracking-[0.14em] text-accent uppercase">Pago rechazado</span>
          <span className="text-sm break-words text-text">
            No te confirmaron el pago de {formatCentavos(montoCentavos)} del {formatFecha(fecha)}.
          </span>
          {motivo && <span className="text-[13px] break-words text-text-muted">Motivo: {motivo}</span>}
        </div>
        <Link
          href="/mi/pagar"
          className="flex min-h-11 shrink-0 items-center justify-center bg-primary px-4 text-xs font-medium tracking-[0.12em] text-background uppercase hover:bg-primary-hover"
        >
          Volver a pagar
        </Link>
      </div>
    </div>
  );
}
