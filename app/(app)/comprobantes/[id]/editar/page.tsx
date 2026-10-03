import { notFound } from "next/navigation";

import { FormPage } from "@/components/app/form-page";
import { ComprobanteForm } from "@/components/comprobante-form";
import { obtenerComprobanteParaEditar } from "@/lib/data/comprobantes";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EditarComprobantePage({
  params,
}: PageProps<"/comprobantes/[id]/editar">) {
  const { id } = await params;
  const supabase = await createClient();

  const comprobante = await obtenerComprobanteParaEditar(supabase, id);

  if (!comprobante) notFound();

  return (
    <FormPage
      title="Editar comprobante"
      backHref={`/comprobantes/${comprobante.id}`}
      backLabel="Volver al comprobante"
    >
      <ComprobanteForm
        mode="editar"
        comprobanteId={comprobante.id}
        initial={{
          imagenPath: comprobante.imagen_path,
          montoCentavos: comprobante.monto_centavos,
          cobradoCentavos: comprobante.cobrado_centavos,
          medioPago: comprobante.medio_pago,
          fecha: comprobante.fecha,
          nota: comprobante.nota,
          items: comprobante.comprobante_items.map((item) => ({
            productoId: item.producto_id,
            cantidad: item.cantidad,
            loteId: item.lote_id,
            precioUnitarioCentavos: item.precio_unitario_centavos,
          })),
          clienteId: comprobante.cliente_id,
        }}
        feriaIdActual={comprobante.feria_id}
      />
    </FormPage>
  );
}
