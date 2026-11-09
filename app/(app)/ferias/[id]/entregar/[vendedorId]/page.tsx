import { FormHeaderDesktop } from "@/components/app/form-header-desktop";
import { EntregaForm } from "@/components/revendedores/entrega-form";
import { VolverLink } from "@/components/volver-link";
import { obtenerFeria } from "@/lib/data/ferias";
import { obtenerLotesConStock } from "@/lib/data/lotes";
import { listarProductos, obtenerVendedorPorId } from "@/lib/data/revendedores";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** `/ferias/[id]/entregar/[vendedorId]` — botellas que se lleva una revendedora a la feria. */
export default async function EntregarFeriaPage({
  params,
}: PageProps<"/ferias/[id]/entregar/[vendedorId]">) {
  const { id, vendedorId } = await params;
  const supabase = await createClient();
  const [{ data: completa }, revendedora, { data: productos }, lotesConStock] = await Promise.all([
    obtenerFeria(supabase, id),
    obtenerVendedorPorId(supabase, vendedorId),
    listarProductos(supabase),
    obtenerLotesConStock(supabase),
  ]);

  if (!completa || !revendedora) {
    return (
      <div className="flex flex-col gap-6 pb-8">
        <VolverLink href={`/ferias/${id}`} label="la feria" />
        <p className="text-[16px] text-text-muted">No encontramos la feria o la revendedora.</p>
      </div>
    );
  }
  if (completa.feria.estado !== "abierta") {
    return (
      <div className="flex flex-col gap-6 pb-8">
        <VolverLink href={`/ferias/${id}`} label="la feria" />
        <p className="text-[16px] text-text-muted">Esta feria está cerrada. Reabrila para cargar botellas.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <div className="flex flex-col gap-5 pb-8">
        <FormHeaderDesktop />
        <EntregaForm
          vendedorId={vendedorId}
          vendedorNombre={revendedora.nombre}
          productos={productos}
          tipoInicial="entrega"
          lotesConStock={lotesConStock}
          feriaId={id}
          titulo={`Botellas para la feria · ${revendedora.nombre}`}
          volverHref={`/ferias/${id}`}
          volverLabel="Volver a la feria"
        />
      </div>
    </div>
  );
}
