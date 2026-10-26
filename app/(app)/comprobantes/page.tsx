import Link from "next/link";

import { ComprobantesTabs } from "@/components/comprobantes/comprobantes-tabs";
import { PagosTab } from "@/components/comprobantes/pagos-tab";
import { VentasTab } from "@/components/comprobantes/ventas-tab";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "@/components/ui/boton";
import { EncabezadoPantalla } from "@/components/ui/encabezado-pantalla";
import { tabComprobantesDeParam } from "@/lib/dominio/comprobantes";

export const dynamic = "force-dynamic";

/**
 * `/comprobantes` ("Ventas" en el menú) — dos pestañas (`?tab=`): "Ventas"
 * (los comprobantes de venta directa) y "Pagos informados" (los pagos con
 * comprobante que informan las revendedoras). Solo se cargan los datos de la
 * pestaña abierta; cada una vive en su componente de servidor. El título y
 * la pregunta son los mismos en las dos.
 */
export default async function ComprobantesPage({ searchParams }: PageProps<"/comprobantes">) {
  const { tab } = await searchParams;
  const activa = tabComprobantesDeParam(tab);

  return (
    <div className="flex min-w-0 flex-col gap-5 pb-8">
      <EncabezadoPantalla
        titulo="Ventas"
        pregunta="¿Qué vendió Ananja directo y quién informó pagos?"
        acciones={
          <div className="hidden items-center gap-2.5 md:flex">
            <Link href="/clientes" className={`${BOTON_SECUNDARIO} flex px-4`}>
              Clientes
            </Link>
            <Link href="/comprobantes/nuevo" className={`${BOTON_PRIMARIO} flex gap-2 px-5`}>
              + Cargar
            </Link>
          </div>
        }
      />
      <ComprobantesTabs activa={activa} />
      {activa === "pagos" ? <PagosTab /> : <VentasTab />}
    </div>
  );
}
