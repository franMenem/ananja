import { notFound } from "next/navigation";

import { FormPage } from "@/components/app/form-page";
import { CobroForm } from "@/components/cobros/cobro-form";
import { obtenerDeudaComprobante } from "@/lib/data/comprobantes";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CobroComprobantePage({
  params,
}: PageProps<"/comprobantes/[id]/cobro">) {
  const { id } = await params;
  const supabase = await createClient();

  const saldo = await obtenerDeudaComprobante(supabase, id);

  if (!saldo || saldo.deuda_centavos === null || saldo.deuda_centavos <= 0) {
    notFound();
  }

  return (
    <FormPage title="Registrar cobro" backHref={`/comprobantes/${id}`} backLabel="Volver al comprobante">
      <CobroForm
        comprobanteId={id}
        deudaCentavos={saldo.deuda_centavos}
        volverA={`/comprobantes/${id}`}
      />
    </FormPage>
  );
}
