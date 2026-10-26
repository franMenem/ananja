import { FormPage } from "@/components/app/form-page";
import { AjusteInsumoForm } from "@/components/stock/ajuste-insumo-form";

export default function AjusteInsumoPage() {
  return (
    <FormPage
      title="Ajustar stock"
      backHref="/stock/insumos"
      backLabel="Volver a insumos"
      pregunta="¿Cuánto hay realmente de cada insumo?"
      pb
    >
      <AjusteInsumoForm />
    </FormPage>
  );
}
