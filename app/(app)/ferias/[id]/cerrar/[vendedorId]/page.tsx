import { FormHeaderDesktop } from "@/components/app/form-header-desktop";
import { CierreFeriaForm, textosCierreFeriaAdmin } from "@/components/ferias/cierre-feria-form";
import { VolverLink } from "@/components/volver-link";
import { listarProductosDeParticipante, obtenerFeria } from "@/lib/data/ferias";
import { createClient } from "@/lib/supabase/server";
import { feriaAbierta, participacionCerrada } from "@/lib/dominio/feria-admin";

export const dynamic = "force-dynamic";

/** `/ferias/[id]/cerrar/[vendedorId]` — el admin cierra la participación de una revendedora. */
export default async function CerrarPorRevendedoraPage({
  params,
}: PageProps<"/ferias/[id]/cerrar/[vendedorId]">) {
  const { id, vendedorId } = await params;
  const supabase = await createClient();
  const [{ data: completa }, productos] = await Promise.all([
    obtenerFeria(supabase, id),
    listarProductosDeParticipante(supabase, id, vendedorId),
  ]);
  const participante = completa?.participantes.find((p) => p.vendedor_id === vendedorId);

  if (!completa || !participante) {
    return (
      <div className="flex flex-col gap-6 pb-8">
        <VolverLink href={`/ferias/${id}`} label="la feria" />
        <p className="text-[16px] text-text-muted">No encontramos esa participación.</p>
      </div>
    );
  }
  if (!feriaAbierta(completa.feria.estado) || participacionCerrada(participante.estado)) {
    return (
      <div className="flex flex-col gap-6 pb-8">
        <VolverLink href={`/ferias/${id}`} label="la feria" />
        <p className="text-[16px] text-text-muted">
          Esta participación ya está cerrada. Si hay que corregirla, reabrila desde la feria.
        </p>
      </div>
    );
  }

  const precioPorProducto = new Map(completa.precios.map((p) => [p.producto_id, p.precio_centavos]));
  const filas = productos.data
    .filter((x) => (x.entregadas ?? 0) > 0 && x.producto_id)
    .map((x) => ({
      productoId: x.producto_id as string,
      nombre: x.producto_nombre ?? "Producto",
      entregadas: x.entregadas ?? 0,
      yaVendidas: x.vendidas ?? 0,
      precioCentavos: x.precio_feria_centavos ?? precioPorProducto.get(x.producto_id as string) ?? null,
    }));

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <div className="flex flex-col gap-5">
        <FormHeaderDesktop />
        <CierreFeriaForm
          feriaId={id}
          vendedorId={vendedorId}
          productos={filas}
          volverHref={`/ferias/${id}`}
          textos={textosCierreFeriaAdmin(participante.vendedor_nombre ?? "la revendedora")}
        />
      </div>
    </div>
  );
}
