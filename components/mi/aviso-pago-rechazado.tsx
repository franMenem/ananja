import { BOTON_PRIMARIO } from "@/components/ui/boton";
import Link from "next/link";

import { Pastilla } from "@/components/ui/pastilla";

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
        className="mx-auto mb-5 flex w-full max-w-[720px] flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between @3xl:max-w-[1100px]"
      >
        <div className="flex min-w-0 flex-col">
          <Pastilla variante="debe" className="mb-1 w-fit">Pago rechazado</Pastilla>
          <span className="text-[16px] break-words text-text">
            No te confirmaron el pago de {formatCentavos(montoCentavos)} del {formatFecha(fecha)}.
          </span>
          {motivo && <span className="text-[14px] break-words text-text-muted">Motivo: {motivo}</span>}
        </div>
        <Link
          prefetch={false}
          href="/mi/pagar"
          className={`${BOTON_PRIMARIO} flex w-full shrink-0 px-4 sm:w-auto`}
        >
          Volver a pagar
        </Link>
      </div>
    </div>
  );
}
