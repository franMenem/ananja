import { FormPage } from "@/components/app/form-page";
import { ClienteForm } from "@/components/cliente-form";

export default function NuevoClientePage() {
  return (
    <FormPage title="Nuevo cliente" backHref="/clientes" backLabel="Volver a clientes">
      <ClienteForm mode="crear" />
    </FormPage>
  );
}
