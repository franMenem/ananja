import { FormPage } from "@/components/app/form-page";
import { ClienteForm } from "@/components/cliente-form";

export default function NuevoClientePage() {
  return (
    <FormPage
      title="Agregar un cliente"
      pregunta="¿Quién es? Con el nombre alcanza, lo demás se puede completar después."
      backHref="/clientes"
      backLabel="Volver a clientes"
      pb
    >
      <ClienteForm mode="crear" />
    </FormPage>
  );
}
