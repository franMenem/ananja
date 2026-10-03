import { FormPage } from "@/components/app/form-page";
import { NuevoInsumoForm } from "@/components/stock/nuevo-insumo-form";

export default function NuevoInsumoPage() {
  return (
    <FormPage title="Nuevo insumo" backHref="/stock/insumos" backLabel="Volver a insumos">
      <NuevoInsumoForm />
    </FormPage>
  );
}
