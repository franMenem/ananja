import { FormPage } from "@/components/app/form-page";
import { DeudaForm } from "@/components/caja/deuda-form";

export default function NuevaDeudaPage() {
  return (
    <FormPage title="Cargar una deuda" pregunta="¿Qué debe Ananja y cuánto?" backHref="/plata" backLabel="Volver a Plata">
      <DeudaForm />
    </FormPage>
  );
}
