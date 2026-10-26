import { FormPage } from "@/components/app/form-page";
import { ComprobanteForm } from "@/components/comprobante-form";

export default function NuevoComprobantePage() {
  return (
    <FormPage
      title="Registrar una venta"
      pregunta="¿Qué vendiste y cómo te pagaron?"
      backHref="/comprobantes"
      backLabel="Volver a comprobantes"
    >
      <ComprobanteForm mode="crear" />
    </FormPage>
  );
}
