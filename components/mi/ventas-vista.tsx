import Link from "next/link";

import { BOTON_PRIMARIO } from "@/components/ui/boton";
import { EncabezadoPantalla } from "@/components/ui/encabezado-pantalla";
import { Fila } from "@/components/ui/fila";
import { Pastilla } from "@/components/ui/pastilla";
import { Tarjeta } from "@/components/ui/tarjeta";
import { MEDIO_PAGO_LABELS } from "@/lib/dominio/caja";
import { formatFecha, labelDeMes } from "@/lib/fechas";
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

/**
 * Contenido de `/mi/ventas` (los datos los arma `app/(mi)/mi/ventas/page.tsx`):
 * ventas propias agrupadas por mes, más reciente primero, cada mes en su
 * tarjeta con el total vendido. En escritorio se limita a 760px para que el
 * monto no quede lejos del producto.
 */
export function MisVentasVista({ meses }: { meses: MesVentasMi[] }) {
  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5 pb-8">
      <EncabezadoPantalla titulo="Mis ventas" pregunta="¿Qué vendiste?" />

      <Link href="/mi/ventas/nueva" className={`${BOTON_PRIMARIO} flex w-full px-4`}>
        Registré una venta
      </Link>

      {meses.length === 0 ? (
        <Tarjeta>
          <p className="text-[16px] text-text-muted">Todavía no cargaste ninguna venta.</p>
        </Tarjeta>
      ) : (
        meses.map(({ periodo, ventas }) => {
          const total = ventas.reduce((acc, v) => acc + (v.totalCentavos ?? 0), 0);
          return (
            <Tarjeta como="section" key={periodo} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-[20px] leading-tight font-bold text-text">{labelDeMes(periodo)}</h2>
                <span className="shrink-0 text-[16px] font-semibold tabular-nums text-text">
                  {formatCentavos(total)}
                </span>
              </div>
              <div className="flex flex-col divide-y divide-line">
                {ventas.map((v) => (
                  <Link key={v.id} href={`/mi/ventas/${v.id}`} className="block hover:bg-background">
                    <Fila
                      titulo={
                        <span className="break-words">
                          {v.cantidad} × {v.productoNombre}
                        </span>
                      }
                      detalle={`${formatFecha(v.fecha)}${v.medioPago ? ` · ${MEDIO_PAGO_LABELS[v.medioPago]}` : ""}`}
                      valor={
                        v.totalCentavos !== null ? (
                          formatCentavos(v.totalCentavos)
                        ) : (
                          <Pastilla variante="aviso">Cargar precio</Pastilla>
                        )
                      }
                    />
                  </Link>
                ))}
              </div>
            </Tarjeta>
          );
        })
      )}
    </div>
  );
}
