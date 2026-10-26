import { FormPage } from "@/components/app/form-page";
import { ProveedorForm } from "@/components/stock/proveedor-form";
import { leerProveedorNombre } from "@/lib/proveedor-servidor";

// Datos en vivo: el nombre se edita desde esta misma pantalla.
export const dynamic = "force-dynamic";

export default async function ProveedorPage() {
  const nombre = await leerProveedorNombre();

  return (
    <FormPage
      title="Proveedor"
      backHref="/stock"
      backLabel="Volver a botellas"
      pregunta="¿Cómo se llama quien nos vende el aceite?"
      pb
    >
      <ProveedorForm nombreInicial={nombre} />
    </FormPage>
  );
}
