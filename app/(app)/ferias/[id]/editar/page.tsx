import { FormPage } from "@/components/app/form-page";
import { FeriaForm } from "@/components/ferias/feria-form";
import { obtenerFeria } from "@/lib/data/ferias";
import { listarProductosResumen } from "@/lib/data/revendedores";
import { createClient } from "@/lib/supabase/server";
import { feriaAbierta } from "@/lib/dominio/feria-admin";

export const dynamic = "force-dynamic";

export default async function EditarFeriaPage({ params }: PageProps<"/ferias/[id]/editar">) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: completa }, { data: productos }] = await Promise.all([
    obtenerFeria(supabase, id),
    listarProductosResumen(supabase),
  ]);

  if (!completa) {
    return (
      <FormPage title="Editar feria" backHref="/ferias" backLabel="Volver a ferias">
        <p className="text-[16px] text-text-muted">No encontramos esta feria.</p>
      </FormPage>
    );
  }
  if (!feriaAbierta(completa.feria.estado)) {
    return (
      <FormPage title="Editar feria" backHref={`/ferias/${id}`} backLabel="Volver a la feria">
        <p className="text-[16px] text-text-muted">Esta feria ya está cerrada. Reabrila para editarla.</p>
      </FormPage>
    );
  }

  const { feria, precios } = completa;
  return (
    <FormPage title="Editar feria" backHref={`/ferias/${id}`} backLabel="Volver a la feria" pb>
      <FeriaForm
        productos={productos}
        feriaId={id}
        inicial={{
          nombre: feria.nombre,
          fecha: feria.fecha,
          lugar: feria.lugar,
          nota: feria.nota,
          precios: Object.fromEntries(precios.map((p) => [p.producto_id, p.precio_centavos])),
        }}
      />
    </FormPage>
  );
}
