import Link from "next/link";

import { MEDIO_PAGO_LABELS } from "@/lib/dominio/caja";
import { labelDeMes } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";
import type { Enums } from "@/lib/types";

/** Una venta tal como la cargó la revendedora (filas del mismo `grupo_id` juntas). */
export type VentaAgrupadaMi = {
  /** Primera fila del grupo: el detalle `/mi/ventas/[id]` trae el grupo entero. */
  id: string;
  fecha: string;
  productoNombre: string;
  cantidad: number;
  /** `null` = la venta todavía no tiene precio de venta cargado. */
  totalCentavos: number | null;
  medioPago: Enums<"medio_pago"> | null;
};

export type MesVentasMi = { periodo: string; ventas: VentaAgrupadaMi[] };

function formatDia(fecha: string): string {
  return fecha.split("-")[2];
}

/**
 * Contenido de `/mi/ventas` (los datos los arma `app/(mi)/mi/ventas/page.tsx`):
 * ventas propias agrupadas por mes, más reciente primero. En escritorio la
 * lista se limita a 760px (mismo ancho que los detalles) para que el monto
 * no quede lejos del producto.
 */
export function MisVentasVista({ meses }: { meses: MesVentasMi[] }) {
  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 pb-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-[30px] leading-[1.05] text-primary">Ventas</h1>
        <Link
          href="/mi/ventas/nueva"
          className="flex min-h-11 shrink-0 items-center justify-center bg-primary px-4 text-[13px] font-medium tracking-[0.12em] text-background uppercase hover:bg-primary-hover"
        >
          + Nueva
        </Link>
      </div>

      {meses.length === 0 ? (
        <p className="py-6 text-sm text-text-muted">Todavía no cargaste ninguna venta.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {meses.map(({ periodo, ventas }) => (
            <div key={periodo} className="flex flex-col gap-1">
              <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
                {labelDeMes(periodo)}
              </span>
              <div className="flex flex-col">
                {ventas.map((v) => (
                  <Link
                    key={v.id}
                    href={`/mi/ventas/${v.id}`}
                    className="flex items-center justify-between gap-3 border-b border-border py-3 hover:bg-border/30"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="break-words text-sm text-text">
                        {v.productoNombre} × {v.cantidad}
                      </span>
                      <span className="text-[11px] text-text-muted">
                        Día {formatDia(v.fecha)}
                        {v.medioPago ? ` · ${MEDIO_PAGO_LABELS[v.medioPago]}` : ""}
                      </span>
                    </div>
                    {v.totalCentavos !== null ? (
                      <span className="shrink-0 text-sm font-medium tabular-nums text-text">
                        {formatCentavos(v.totalCentavos)}
                      </span>
                    ) : (
                      <span className="shrink-0 text-[11px] tracking-[0.1em] text-accent uppercase">
                        Cargar precio
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
