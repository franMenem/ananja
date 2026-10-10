import { EliminarVentaButton } from "@/components/mi/eliminar-venta-button";
import { CargarPrecioVenta } from "@/components/revendedores/cargar-precio-venta";
import { VolverLink } from "@/components/volver-link";
import {
  listarVentasDelGrupo,
  obtenerProductoPublicoNombre,
  obtenerVentaRevendedorPropia,
} from "@/lib/data/mi";
import { MEDIO_PAGO_LABELS } from "@/lib/dominio/caja";
import { formatFecha } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";
import { NEGOCIO } from "@/lib/negocio";
import { sesionActual } from "@/lib/sesion-actual";
import { puedeBorrarVentaRevendedor } from "@/lib/dominio/ventas-revendedor";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * `/mi/ventas/[id]` — detalle de una venta propia, con botón para
 * borrarla (`EliminarVentaButton`, que borra la venta entera). Una venta
 * que salió de dos entregas son varias filas con el mismo `grupo_id`
 * (0040_revendedores_pagos_precios.sql § 2): se muestran juntas, con de
 * qué entrega salió cada parte y cuánto le debe a Ananja por cada una. Si
 * la cargó un admin sin precio de venta, permite completarlo
 * (`CargarPrecioVenta`). Pantalla de detalle (no formulario): link
 * "← Volver" simple, sin `SetFormHeader`. Filtro explícito por
 * `vendedor_id` (además del `id`): la RLS deja pasar cualquier venta a un
 * admin, y un admin con espacio propio (`revende`) entra a `/mi` como un
 * revendedor más — sin este filtro podría abrir el detalle de la venta de
 * OTRO revendedor con solo cambiar el id en la URL.
 */
export default async function VentaDetallePage({
  params,
}: PageProps<"/mi/ventas/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const { vendedor: revendedor } = await sesionActual();

  const venta = revendedor ? await obtenerVentaRevendedorPropia(supabase, id, revendedor.id) : null;

  // `productos` ya no es legible por un revendedor (RLS acota `productos_select`
  // a `es_vendedor()`) — el nombre sale de `v_productos_publicos`.
  const [producto, { data: filasGrupo }] = await Promise.all([
    venta ? obtenerProductoPublicoNombre(supabase, venta.producto_id) : Promise.resolve(null),
    venta && revendedor
      ? listarVentasDelGrupo(supabase, venta.grupo_id, revendedor.id)
      : Promise.resolve({ data: null }),
  ]);

  if (!venta) {
    return (
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 pb-8">
        <VolverLink href="/mi/ventas" label="ventas" hover={false} />
        <p className="text-sm text-text-muted">No encontramos esta venta.</p>
      </div>
    );
  }

  const filas = filasGrupo && filasGrupo.length > 0 ? filasGrupo : [{ ...venta, entrega_items: null }];
  const cantidad = filas.reduce((acc, f) => acc + f.cantidad, 0);
  const paraAnanja = filas.reduce((acc, f) => acc + f.cantidad * f.precio_costo_centavos, 0);
  const precio = venta.precio_venta_centavos;
  const total = precio !== null ? cantidad * precio : null;

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 pb-8">
      <VolverLink href="/mi/ventas" label="ventas" hover={false} />

      <h1 className="font-display text-[28px] text-primary">
        {producto ?? "?"} × {cantidad}
      </h1>

      <div className="flex flex-col gap-2 text-sm text-text">
        <p>Fecha: {formatFecha(venta.fecha)}</p>
        <p>Medio de pago: {venta.medio_pago ? MEDIO_PAGO_LABELS[venta.medio_pago] : "Sin cargar"}</p>
        {precio !== null && total !== null ? (
          <>
            <p>La vendiste a: {formatCentavos(precio)} c/u</p>
            <p>Total: {formatCentavos(total)}</p>
          </>
        ) : (
          <p className="text-accent">Todavía no se cargó a cuánto la vendiste.</p>
        )}
        <p>
          Le debés a {NEGOCIO.nombre}: {formatCentavos(paraAnanja)}
        </p>
        {total !== null && <p>Ganaste: {formatCentavos(total - paraAnanja)}</p>}
        {venta.registrada_por && (
          <p className="text-text-muted">Esta venta la cargó un admin por vos.</p>
        )}
        {venta.nota && <p>Nota: {venta.nota}</p>}
      </div>

      {precio === null && (
        <CargarPrecioVenta
          grupoId={venta.grupo_id}
          persona="vos"
          pideMedio={venta.medio_pago === null}
        />
      )}

      {filas.some((f) => f.entrega_items?.entregas_revendedor) && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
            De dónde salió
          </span>
          {filas.map((f) => (
            <span key={f.id} className="text-[13px] text-text-muted">
              {f.cantidad}
              {f.entrega_items?.entregas_revendedor
                ? f.entrega_items.entregas_revendedor.automatica
                  ? ` que agarraste del depósito el ${formatFecha(f.entrega_items.entregas_revendedor.fecha)}`
                  : ` de la entrega del ${formatFecha(f.entrega_items.entregas_revendedor.fecha)}`
                : ""}{" "}
              · le debés {formatCentavos(f.precio_costo_centavos)} c/u
            </span>
          ))}
        </div>
      )}

      {puedeBorrarVentaRevendedor({
        esAdmin: revendedor?.rol === "admin",
        miVendedorId: revendedor?.id ?? "",
        vendedorId: venta.vendedor_id,
        registradaPor: venta.registrada_por,
      }) ? (
        <EliminarVentaButton ventaId={venta.id} />
      ) : (
        <p className="text-[12px] text-text-muted">
          Si hay algún error en esta venta, pedile a un admin que la corrija.
        </p>
      )}
    </div>
  );
}
