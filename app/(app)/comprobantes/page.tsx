import { ComprobantesTabs } from "@/components/comprobantes/comprobantes-tabs";
import { PagosTab } from "@/components/comprobantes/pagos-tab";
import { VentasTab } from "@/components/comprobantes/ventas-tab";
import { tabComprobantesDeParam } from "@/lib/dominio/comprobantes";

export const dynamic = "force-dynamic";

/**
 * `/comprobantes` — dos pestañas (`?tab=`): "Ventas" (los comprobantes de
 * venta, lo de siempre) y "Pagos de revendedores" (los pagos con comprobante
 * que informan las revendedoras). Solo se cargan los datos de la pestaña
 * abierta; cada una vive en su componente de servidor.
 */
export default async function ComprobantesPage({ searchParams }: PageProps<"/comprobantes">) {
  const { tab } = await searchParams;
  const activa = tabComprobantesDeParam(tab);

  return (
    <div className="flex flex-col gap-5">
      <ComprobantesTabs activa={activa} />
      {activa === "pagos" ? <PagosTab /> : <VentasTab />}
    </div>
  );
}
