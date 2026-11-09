import { FormPage } from "@/components/app/form-page";
import { FeriaForm } from "@/components/ferias/feria-form";
import { listarProductosResumen } from "@/lib/data/revendedores";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NuevaFeriaPage() {
  const supabase = await createClient();
  const { data: productos } = await listarProductosResumen(supabase);
  return (
    <FormPage
      title="Nueva feria"
      pregunta="¿Cuándo y dónde es? Después sumás a las revendedoras y les cargás las botellas."
      backHref="/ferias"
      backLabel="Volver a ferias"
      pb
    >
      <FeriaForm productos={productos} />
    </FormPage>
  );
}
