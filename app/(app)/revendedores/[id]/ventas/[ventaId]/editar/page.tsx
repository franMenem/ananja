import { redirect } from "next/navigation";

import { EditarVentaForm } from "@/components/mi/editar-venta-form";
import { VolverLink } from "@/components/volver-link";
import { cargarVentaParaEdicionDeAdmin, obtenerVendedorPorId } from "@/lib/data/revendedores";
import { obtenerProductoPublicoNombre } from "@/lib/data/mi";
import { decidirEdicionVentaRevendedor } from "@/lib/dominio/ventas-revendedor";
import { exigirAdmin } from "@/lib/invitaciones-server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * `/revendedores/[id]/ventas/[ventaId]/editar` — un admin edita medio de pago,
 * precio, fecha y nota de una venta de la revendedora de la ficha
 * (`editar_venta_revendedor`, que deja pasar a cualquier admin sin mirar
 * quién la cargó). Reutiliza `EditarVentaForm` de `/mi`; a diferencia de
 * `/mi/ventas/[id]/editar` (que filtra por dueña a propósito), acá la venta se
 * carga sin mirar quién mira, pero se exige que sea de la revendedora de la
 * ficha. Si no existe, no es de ella o la RPC la rechazaría (`VENTA_CON_RENDICION`),
 * no hay formulario: vuelve a la ficha o explica por qué.
 */
export default async function EditarVentaAdminPage({
  params,
}: PageProps<"/revendedores/[id]/ventas/[ventaId]/editar">) {
  const caller = await exigirAdmin();
  if (!caller) redirect("/");

  const { id, ventaId } = await params;
  const supabase = await createClient();
  const fichaHref = `/revendedores/${id}`;

  const [revendedora, carga] = await Promise.all([
    obtenerVendedorPorId(supabase, id),
    cargarVentaParaEdicionDeAdmin(supabase, id, ventaId),
  ]);

  if (!revendedora || !carga) {
    return (
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 pb-8">
        <VolverLink href={fichaHref} label="la ficha" hover={false} corto />
        <p className="text-[16px] text-text-muted">No encontramos esta venta.</p>
      </div>
    );
  }

  const { venta, filas, conRendicion } = carga;
  const decision = decidirEdicionVentaRevendedor({
    esAdmin: true,
    miVendedorId: caller.id,
    vendedorId: venta.vendedor_id,
    registradaPor: venta.registrada_por,
    feriaId: venta.feria_id,
    conRendicion,
  });
  if (!decision.puede) {
    return (
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 pb-8">
        <VolverLink href={fichaHref} label="la ficha" hover={false} corto />
        <p className="text-[16px] text-text-muted">{decision.motivo}</p>
      </div>
    );
  }

  const producto = await obtenerProductoPublicoNombre(supabase, venta.producto_id);
  const cantidad = filas.reduce((acc, f) => acc + f.cantidad, 0);

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5 pb-8">
      <EditarVentaForm
        ventaId={ventaId}
        grupoId={venta.grupo_id}
        producto={producto ?? "?"}
        cantidad={cantidad}
        medioPago={venta.medio_pago}
        precioVentaCentavos={venta.precio_venta_centavos}
        fecha={venta.fecha}
        nota={venta.nota}
        volverHref={fichaHref}
        volverLabel={`Volver a ${revendedora.nombre}`}
      />
    </div>
  );
}
