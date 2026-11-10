import { redirect } from "next/navigation";

import { CierreFeriaForm, TEXTOS_CIERRE_FERIA_MI } from "@/components/ferias/cierre-feria-form";
import { TituloFormularioEscritorio } from "@/components/mi/titulo-formulario";
import { cargarFeriaMi } from "@/lib/data/ferias-mi";
import { sesionActual } from "@/lib/sesion-actual";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** `/mi/feria/cerrar` — la revendedora cierra su parte de la feria: cuántas devuelve, cuántas se
 * usaron para degustar y cuánta plata juntó. Si no hay feria o ya cerró, vuelve a `/mi/feria`. */
export default async function CerrarFeriaPage() {
  const supabase = await createClient();
  const { vendedor } = await sesionActual();
  const { data } = vendedor ? await cargarFeriaMi(supabase, vendedor.id) : { data: null };

  if (!data || data.datos.cerrada) redirect("/mi/feria");

  const productos = data.datos.productos
    .filter((p) => p.entregadas > 0 || p.degustadasCarga > 0)
    .map((p) => ({
      productoId: p.productoId,
      nombre: p.nombre,
      entregadas: p.entregadas,
      yaVendidas: p.vendidas,
      degustadasCarga: p.degustadasCarga,
      precioCentavos: p.precioFeriaCentavos,
    }));

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
      <TituloFormularioEscritorio pregunta="Contanos cuántas devolvés y cuántas usaste para degustar." />
      <CierreFeriaForm
        feriaId={data.feriaId}
        vendedorId={null}
        productos={productos}
        volverHref="/mi/feria"
        textos={TEXTOS_CIERRE_FERIA_MI}
      />
    </div>
  );
}
