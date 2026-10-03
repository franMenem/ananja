import { FormHeaderDesktop } from "@/components/app/form-header-desktop";
import { EntregaForm } from "@/components/revendedores/entrega-form";
import { VolverLink } from "@/components/volver-link";
import { listarProductos, listarUltimaEntregaPorProducto, obtenerVendedorPorId } from "@/lib/data/revendedores";
import { obtenerLotesConStock } from "@/lib/data/lotes";
import { ultimoLotePorProducto } from "@/lib/dominio/lotes-disponibles";
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
  const [revendedor, { data: productos }, lotesConStock, { data: entregasConLote }] = await Promise.all([
    obtenerVendedorPorId(supabase, id),
    listarProductos(supabase),
    obtenerLotesConStock(supabase),
    // Última entrega (no devolución) de cada producto a ESTE revendedor,
    // con su lote — default de "a qué lote vuelve" una devolución (ver
    // `lib/lotes-disponibles.ts` § ultimoLotePorProducto).
    listarUltimaEntregaPorProducto(supabase, id),
  ]);

  if (!revendedor) {
    return (
      <div className="flex flex-col gap-6 pb-8">
        <VolverLink href="/revendedores" label="revendedores" />
        <p className="text-sm text-text-muted">No encontramos este revendedor.</p>
      </div>
    );
  }

  const ultimoLotePorProductoEntregado = ultimoLotePorProducto(entregasConLote ?? []);

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <div className="flex flex-col gap-5">
        {/* Sin título fijo acá: EntregaForm ya registra el suyo (dinámico,
            "Devolución"/"Revisá la entrega") con su propio SetFormHeader —
            mismo criterio que /revendedores/[id]/carga. */}
        <FormHeaderDesktop />
        <EntregaForm
          vendedorId={id}
          vendedorNombre={revendedor.nombre}
          productos={productos ?? []}
          tipoInicial="devolucion"
          soloDevolucion
          lotesConStock={lotesConStock}
          ultimoLotePorProducto={ultimoLotePorProductoEntregado}
        />
      </div>
    </div>
  );
}
