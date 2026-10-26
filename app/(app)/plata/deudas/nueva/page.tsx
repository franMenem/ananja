import { FormPage } from "@/components/app/form-page";
import { DeudaForm } from "@/components/caja/deuda-form";

export default function NuevaDeudaPage() {
  return (
    <FormPage title="Nueva deuda" backHref="/plata" backLabel="Volver a Plata">
      <p className="text-[15px] text-text-muted">¿Qué debe Ananja y cuánto?</p>
      <DeudaForm />
    </FormPage>
  );
}
