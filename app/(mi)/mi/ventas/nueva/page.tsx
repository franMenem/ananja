import { TituloFormularioEscritorio } from "@/components/mi/titulo-formulario";
import { VentaForm } from "@/components/mi/venta-form";
import { leerTomaDirecto, listarProductosPublicosResumen } from "@/lib/data/mi";
import { stockPorEntrega } from "@/lib/dominio/revendedor-stock";
import { ventasComoFifo } from "@/lib/dominio/revendedores";
import {
  listarEntregaItemsFifo,
  listarPreciosRevendedor,
  listarStockRevendedor,
  listarVentasRevendedor,
} from "@/lib/revendedores";
import { sesionActual } from "@/lib/sesion-actual";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * `/mi/ventas/nueva` — arma, por producto con stock en poder, de qué
 * entregas saldría la venta (`stockPorEntrega`, FIFO: la revendedora nunca
 * elige lote) con el costo y el precio sugerido de cada una
 * (0040_revendedores_pagos_precios.sql § 2). El precio manual
 * (`revendedor_precios`) solo se usa como respaldo para entregas viejas sin
 * costo aprobado; el precio de la última venta, como respaldo de la
 * precarga cuando la entrega no trae sugerido.
 *
 * Si la persona tiene "agarra directo del depósito" (`toma_directo`, 0073),
 * salen todos los productos y el formulario no le pone tope de cantidad: lo
 * que no tenga entregado lo saca el servidor del depósito.
 */
export default async function NuevaVentaPage() {
  const supabase = await createClient();
  const { vendedor: revendedor } = await sesionActual();

  // `app/(mi)/layout.tsx` ya garantiza acceso — `revendedor` nunca
  // debería ser `null` acá, pero se cubre igual (sin productos
  // disponibles) en vez de asumirlo con `!`.
  const vacio = Promise.resolve({ data: [], error: null });
  const [
    { data: productos },
    { data: stock },
    { data: precios },
    { data: ventas },
    { data: items },
    tomaDirecto,
  ] = await Promise.all([
      listarProductosPublicosResumen(supabase),
      revendedor ? listarStockRevendedor(supabase, revendedor.id) : vacio,
      revendedor ? listarPreciosRevendedor(supabase, revendedor.id) : vacio,
      revendedor ? listarVentasRevendedor(supabase, revendedor.id) : vacio,
      revendedor ? listarEntregaItemsFifo(supabase, revendedor.id) : vacio,
      // El flag se lee de la base (el header de sesión no lo lleva).
      revendedor ? leerTomaDirecto(supabase, revendedor.id) : Promise.resolve(false),
    ]);

  const stockPorProducto = new Map(stock.map((s) => [s.producto_id, s.en_poder ?? 0]));
  const precioManualPorProducto = new Map(precios.map((p) => [p.producto_id, p.precio_centavos]));
  const tramos = stockPorEntrega(items, ventasComoFifo(ventas)).filter((t) => t.quedan > 0);

  const ultimaVentaPorProducto = new Map<string, number>();
  for (const v of ventas) {
    if (v.precio_venta_centavos !== null && !ultimaVentaPorProducto.has(v.producto_id)) {
      ultimaVentaPorProducto.set(v.producto_id, v.precio_venta_centavos);
    }
  }

  // `v_productos_publicos` reporta columnas nullable (toda vista lo hace en
  // los tipos generados), pero `id` es la PK de `productos` — nunca es null
  // en la práctica. Filtrarlo acá deja el resto sin `?`/`!`.
  const disponibles = (productos ?? [])
    .filter((p): p is typeof p & { id: string } => p.id !== null)
    // Con "agarra directo" salen todos los productos aunque tenga 0 en
    // poder: lo que le falte se saca del depósito (0073).
    .filter((p) => tomaDirecto || (stockPorProducto.get(p.id) ?? 0) > 0)
    .map((p) => ({
      producto: p,
      enPoder: stockPorProducto.get(p.id) ?? 0,
      tramos: tramos.filter((t) => t.productoId === p.id),
      precioManualCentavos: precioManualPorProducto.get(p.id) ?? null,
      ultimoPrecioVentaCentavos: ultimaVentaPorProducto.get(p.id) ?? null,
    }));

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
      <TituloFormularioEscritorio />
      <VentaForm productos={disponibles} tomaDirecto={tomaDirecto} />
    </div>
  );
}
