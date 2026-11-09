import Link from "next/link";

import { BOTON_PRIMARIO } from "@/components/ui/boton";
import { EncabezadoPantalla } from "@/components/ui/encabezado-pantalla";
import { VentasFiltradas } from "@/components/mi/ventas-filtradas";
import type { MesVentasMi, VentaAgrupadaMi } from "@/lib/dominio/filtro-ventas-mi";
import { hoyISO } from "@/lib/fechas";

export type { MesVentasMi, VentaAgrupadaMi };

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

      <Link prefetch={false} href="/mi/ventas/nueva" className={`${BOTON_PRIMARIO} flex w-full px-4`}>
        Registré una venta
      </Link>

      <VentasFiltradas meses={meses} hoy={hoyISO()} />
    </div>
  );
}
