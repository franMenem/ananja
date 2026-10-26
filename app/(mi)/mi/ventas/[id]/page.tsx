import { EliminarVentaButton } from "@/components/mi/eliminar-venta-button";
import { CargarPrecioVenta } from "@/components/revendedores/cargar-precio-venta";
import { EncabezadoPantalla } from "@/components/ui/encabezado-pantalla";
import { Pastilla } from "@/components/ui/pastilla";
import { Tarjeta } from "@/components/ui/tarjeta";
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
        <VolverLink href="/mi/ventas" label="ventas" hover={false} corto />
        <p className="text-[16px] text-text-muted">No encontramos esta venta.</p>
      </div>
    );
  }

  const filas = filasGrupo && filasGrupo.length > 0 ? filasGrupo : [{ ...venta, entrega_items: null }];
  const cantidad = filas.reduce((acc, f) => acc + f.cantidad, 0);
  const paraAnanja = filas.reduce((acc, f) => acc + f.cantidad * f.precio_costo_centavos, 0);
  const precio = venta.precio_venta_centavos;
  const total = precio !== null ? cantidad * precio : null;

  const fila = (etiqueta: string, valor: React.ReactNode, clase = "text-text") => (
    <div className="flex min-h-12 items-center justify-between gap-3 py-2">
      <span className="text-[16px] text-text-muted">{etiqueta}</span>
      <span className={`text-right text-[16px] font-semibold tabular-nums ${clase}`}>{valor}</span>
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5 pb-8">
      <VolverLink href="/mi/ventas" label="ventas" hover={false} corto />

      <EncabezadoPantalla titulo={`${cantidad} × ${producto ?? "?"}`} pregunta="¿Cómo fue esta venta?" />

      <Tarjeta className="flex flex-col divide-y divide-line">
        {fila("Fecha", formatFecha(venta.fecha))}
        {fila("Medio de pago", venta.medio_pago ? MEDIO_PAGO_LABELS[venta.medio_pago] : "Sin cargar")}
        {precio !== null && total !== null ? (
          <>
            {fila("La vendiste a", `${formatCentavos(precio)} c/u`)}
            {fila("Total", formatCentavos(total))}
          </>
        ) : (
          <div className="py-3">
            <Pastilla variante="aviso" className="whitespace-normal! leading-snug!">
              Todavía no se cargó a cuánto la vendiste
            </Pastilla>
          </div>
        )}
        {fila(`Le debés a ${NEGOCIO.nombre}`, formatCentavos(paraAnanja), paraAnanja > 0 ? "text-accent" : "text-text")}
        {total !== null &&
          fila("Ganaste", formatCentavos(total - paraAnanja), total - paraAnanja > 0 ? "text-secondary" : "text-text")}
        {venta.nota && fila("Nota", venta.nota)}
      </Tarjeta>

      {venta.registrada_por && (
        <p className="text-[14px] text-text-muted">Esta venta la cargó un admin por vos.</p>
      )}

      {precio === null && (
        <CargarPrecioVenta
          grupoId={venta.grupo_id}
          persona="vos"
          pideMedio={venta.medio_pago === null}
        />
      )}

      {filas.some((f) => f.entrega_items?.entregas_revendedor) && (
        <Tarjeta como="section" className="flex flex-col gap-2">
          <h2 className="font-display text-[20px] leading-tight font-bold text-text">De dónde salió</h2>
          {filas.map((f) => (
            <span key={f.id} className="text-[15px] text-text-muted">
              {f.cantidad}
              {f.entrega_items?.entregas_revendedor
                ? f.entrega_items.entregas_revendedor.automatica
                  ? ` que agarraste del depósito el ${formatFecha(f.entrega_items.entregas_revendedor.fecha)}`
                  : ` de la entrega del ${formatFecha(f.entrega_items.entregas_revendedor.fecha)}`
                : ""}{" "}
              · le debés {formatCentavos(f.precio_costo_centavos)} c/u
            </span>
          ))}
        </Tarjeta>
      )}

      {puedeBorrarVentaRevendedor({
        esAdmin: revendedor?.rol === "admin",
        miVendedorId: revendedor?.id ?? "",
        vendedorId: venta.vendedor_id,
        registradaPor: venta.registrada_por,
      }) ? (
        <EliminarVentaButton ventaId={venta.id} />
      ) : (
        <p className="text-[14px] text-text-muted">
          Si hay algún error en esta venta, pedile a un admin que la corrija.
        </p>
      )}
    </div>
  );
}
