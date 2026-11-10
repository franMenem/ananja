import { Fila } from "@/components/ui/fila";
import { Pastilla } from "@/components/ui/pastilla";
import { MEDIO_PAGO_LABELS } from "@/lib/dominio/caja";
import { formatFecha } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";
import {
  ESTADO_PAGO_LABELS,
  ESTADO_PAGO_VARIANTE,
  type MovimientoPago,
} from "@/lib/dominio/pagos-revendedor";

type HistorialPagosProps = {
  movimientos: MovimientoPago[];
  /** Muestra solo los primeros N (resumen en `/mi`). */
  limite?: number;
  vacio: string;
};

/**
 * Lista de pagos de una revendedora: fecha y medio, monto y una pastilla con
 * el estado (por confirmar / confirmado / rechazado + motivo). Las filas van
 * sueltas: las envuelve la tarjeta de quien la usa. Server Component.
 */
export function HistorialPagos({ movimientos, limite, vacio }: HistorialPagosProps) {
  const filas = limite ? movimientos.slice(0, limite) : movimientos;

  if (filas.length === 0) {
    return <p className="py-2 text-[16px] text-text-muted">{vacio}</p>;
  }

  return (
    <div className="flex flex-col divide-y divide-line">
      {filas.map((m) => {
        return (
          <Fila
            key={m.id}
            titulo={`${formatFecha(m.fecha)} · ${MEDIO_PAGO_LABELS[m.medioPago]}`}
            detalle={
              <span className="flex flex-col items-start gap-1 pt-1">
                {m.origen === "rendicion" ? (
                  <Pastilla variante="neutra">Registrado por un admin</Pastilla>
                ) : (
                  <Pastilla variante={ESTADO_PAGO_VARIANTE[m.estado]}>{ESTADO_PAGO_LABELS[m.estado]}</Pastilla>
                )}
                {m.estado === "rechazado" && m.motivoRechazo && <span>Motivo: {m.motivoRechazo}</span>}
              </span>
            }
            valor={formatCentavos(m.montoCentavos)}
          />
        );
      })}
    </div>
  );
}
