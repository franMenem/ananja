import { FormPage } from "@/components/app/form-page";
import { GastoForm } from "@/components/gasto-form";

/**
 * Alta de gasto. Ya no admite `?lote=<id>`: un gasto no se asigna más a un
 * lote de producción (ver `GastoForm`) — los costos y pagos del pedido se
 * cargan desde el detalle del lote.
 */
export default function NuevoGastoPage() {
  return (
    <FormPage title="Registrar gasto" backHref="/gastos" backLabel="Volver a gastos" pb>
      <GastoForm />
    </FormPage>
  );
}
