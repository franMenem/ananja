import { Pastilla } from "@/components/ui/pastilla";
import { BOTON_PRIMARIO } from "@/components/ui/boton";
import Link from "next/link";

import { HistorialPagos } from "@/components/mi/historial-pagos";
import { GananciaRevendedor } from "@/components/revendedores/ganancia-revendedor";
import type { VentaGanancia } from "@/lib/dominio/ganancia-revendedor";
import { formatCentavos } from "@/lib/money";
import { NEGOCIO } from "@/lib/negocio";
import type { MovimientoPago } from "@/lib/dominio/pagos-revendedor";

type MiGananciaVistaProps = {
  ventas: VentaGanancia[];
  debeCentavos: number;
  pendienteCentavos: number;
  movimientos: MovimientoPago[];
};

/**
 * Contenido de `/mi/ganancia` (los datos los arma
 * `app/(mi)/mi/ganancia/page.tsx`). Mobile: ganancia y abajo los pagos. Con
 * el contenedor a partir de 48rem (escritorio), dos columnas: la ganancia
 * con su gráfico a la izquierda y lo que debe + todos sus pagos a la
 * derecha — mismo orden de lectura que en mobile.
 */
export function MiGananciaVista({
  ventas,
  debeCentavos,
  pendienteCentavos,
  movimientos,
}: MiGananciaVistaProps) {
  return (
    <div className="@container w-full">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8 pb-8 @3xl:grid @3xl:max-w-[1240px] @3xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] @3xl:items-start @3xl:gap-x-12 @6xl:gap-x-16">
        <h1 className="font-display text-[28px] leading-[1.05] text-text @3xl:col-span-2 @3xl:text-[32px]">
          Ganancia
        </h1>

        <GananciaRevendedor persona="vos" ventas={ventas} />

        <section className="flex flex-col gap-3">
          <span className="text-[13px] text-text-muted">Tus pagos</span>
          <div className="flex flex-wrap items-end justify-between gap-3 border-y border-border py-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13px] text-text-muted">
                Le debés a {NEGOCIO.nombre}
              </span>
              <span className="font-display text-lg break-words text-accent tabular-nums">
                {formatCentavos(debeCentavos)}
              </span>
              {pendienteCentavos > 0 && (
                <Pastilla variante="confirmar" className="w-fit">
                  Pendiente de confirmar {formatCentavos(pendienteCentavos)}
                </Pastilla>
              )}
            </div>
            <Link
              href="/mi/pagar"
              className={`${BOTON_PRIMARIO} flex px-4`}
            >
              Pagar
            </Link>
          </div>
          <HistorialPagos movimientos={movimientos} vacio="Todavía no registraste pagos." />
        </section>
      </div>
    </div>
  );
}
