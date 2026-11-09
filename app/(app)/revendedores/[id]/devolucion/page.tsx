import { FormHeaderDesktop } from "@/components/app/form-header-desktop";
import { EntregaForm } from "@/components/revendedores/entrega-form";
import { VolverLink } from "@/components/volver-link";
import { listarProductos, obtenerVendedorPorId } from "@/lib/data/revendedores";
import { obtenerLotesConStock } from "@/lib/data/lotes";
import { pedidosEnPoderPorProducto } from "@/lib/dominio/devolucion";
import { listarStockEnPoderDeVendedor } from "@/lib/data/stock";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * `/revendedores/[id]/devolucion` — botellas que la revendedora devuelve
 * (rediseño "de 10 bloques a 5", 2026-09-16): reusa `EntregaForm` restringido
 * a devolución (`soloDevolucion`, sin el chip Entrega/Devolución) — la
 * Entrega vive ahora en "Cargar movimiento" (`/revendedores/[id]/carga`).
 */
export default async function DevolucionRevendedorPage({
  params,
}: PageProps<"/revendedores/[id]/devolucion">) {
  const { id } = await params;

  const supabase = await createClient();
  const [revendedor, { data: productos }, lotesConStock, { data: enPoder }] = await Promise.all([
    obtenerVendedorPorId(supabase, id),
    listarProductos(supabase),
    obtenerLotesConStock(supabase),
    // Lo que ESTA revendedora tiene en poder por pedido: la devolución solo
    // ofrece esos pedidos (antes ofrecía todos y podía quedar en uno ajeno).
    listarStockEnPoderDeVendedor(supabase, id),
  ]);

  if (!revendedor) {
    return (
      <div className="flex flex-col gap-6 pb-8">
        <VolverLink href="/revendedores" label="revendedores" />
        <p className="text-[16px] text-text-muted">No encontramos este revendedor.</p>
      </div>
    );
  }

  const fechaPorLote = new Map(lotesConStock.map((l) => [l.loteId, l.fecha]));
  const pedidosEnPoder = pedidosEnPoderPorProducto(enPoder, id, fechaPorLote);

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <div className="flex flex-col gap-5 pb-8">
        {/* Sin título fijo acá: EntregaForm ya registra el suyo (dinámico,
            "Devolución"/"Revisá la entrega") con su propio SetFormHeader —
            mismo criterio que /revendedores/[id]/carga. */}
        <FormHeaderDesktop />
        <p className="-mt-2 text-[15px] text-text-muted">¿Qué botellas devolvió {revendedor.nombre}? Solo aparecen los pedidos de los que tiene botellas.</p>
        <EntregaForm
          vendedorId={id}
          vendedorNombre={revendedor.nombre}
          productos={productos ?? []}
          tipoInicial="devolucion"
          soloDevolucion
          lotesConStock={lotesConStock}
          pedidosEnPoder={pedidosEnPoder}
        />
      </div>
    </div>
  );
}
