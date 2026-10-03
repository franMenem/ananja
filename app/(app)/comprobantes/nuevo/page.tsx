import { FormPage } from "@/components/app/form-page";
import { ComprobanteForm } from "@/components/comprobante-form";

export default function NuevoComprobantePage() {
  return (
    <FormPage title="Nuevo comprobante" backHref="/comprobantes" backLabel="Volver a comprobantes">
      <ComprobanteForm mode="crear" />
    </FormPage>
  );
}
