import { redirect } from "next/navigation";

import { EditarVentaForm } from "@/components/mi/editar-venta-form";
import { VolverLink } from "@/components/volver-link";
import {
  listarVentasDelGrupo,
  obtenerProductoPublicoNombre,
  obtenerVentaRevendedorPropia,
} from "@/lib/data/mi";
import { puedeEditarVentaRevendedor } from "@/lib/dominio/ventas-revendedor";
import { sesionActual } from "@/lib/sesion-actual";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * `/mi/ventas/[id]/editar` — editar medio de pago, precio, fecha y nota de
 * una venta propia. Mismo patrón de lectura que el detalle (filtro explícito
 * por `vendedor_id`). Si la venta no existe o no es editable por quien mira
 * (`puedeEditarVentaRevendedor`, espejo de `editar_venta_revendedor`), vuelve
 * al detalle.
 */
export default async function EditarVentaPage({ params }: PageProps<"/mi/ventas/[id]/editar">) {
  const { id } = await params;
  const supabase = await createClient();
  const { vendedor: revendedor } = await sesionActual();

  const venta = revendedor ? await obtenerVentaRevendedorPropia(supabase, id, revendedor.id) : null;

  if (!venta || !revendedor) {
    return (
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 pb-8">
        <VolverLink href="/mi/ventas" label="ventas" hover={false} corto />
        <p className="text-[16px] text-text-muted">No encontramos esta venta.</p>
      </div>
    );
  }

  if (
    !puedeEditarVentaRevendedor({
      esAdmin: revendedor.rol === "admin",
      miVendedorId: revendedor.id,
      vendedorId: venta.vendedor_id,
      registradaPor: venta.registrada_por,
    })
  ) {
    redirect(`/mi/ventas/${id}`);
  }

  const [producto, { data: filasGrupo }] = await Promise.all([
    obtenerProductoPublicoNombre(supabase, venta.producto_id),
    listarVentasDelGrupo(supabase, venta.grupo_id, revendedor.id),
  ]);

  const filas = filasGrupo.length > 0 ? filasGrupo : [venta];
  const cantidad = filas.reduce((acc, f) => acc + f.cantidad, 0);

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5 pb-8">
      <EditarVentaForm
        ventaId={id}
        grupoId={venta.grupo_id}
        producto={producto ?? "?"}
        cantidad={cantidad}
        medioPago={venta.medio_pago}
        precioVentaCentavos={venta.precio_venta_centavos}
        fecha={venta.fecha}
        nota={venta.nota}
      />
    </div>
  );
}
