"use client";

import Link from "next/link";
import { Fragment, useEffect, useState, type ReactNode } from "react";

import { EliminarVentaButton } from "@/components/mi/eliminar-venta-button";
import { CargarPrecioVenta } from "@/components/revendedores/cargar-precio-venta";
import { LoteLink } from "@/components/revendedores/ficha/lote-link";
import { Pastilla, type VariantePastilla } from "@/components/ui/pastilla";
import { Tarjeta } from "@/components/ui/tarjeta";
import { MEDIO_PAGO_LABELS } from "@/lib/dominio/caja";
import { botellasDeMovimiento, textoBotellas, type ItemLineaDeTiempo } from "@/lib/dominio/personas";
import { ESTADO_PAGO_LABELS, type MovimientoPago } from "@/lib/dominio/pagos-revendedor";
import { etiquetaEntregaAutomatica } from "@/lib/dominio/venta-directa";
import { EVENTO_MOSTRAR_TODOS_MOVIMIENTOS } from "@/lib/eventos-cliente";
import { formatDiaMes, formatFecha } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";
import { NEGOCIO } from "@/lib/negocio";

/** Cuántas líneas se ven de entrada antes de "Ver todo". */
export const LINEAS_VISIBLES = 10;

const VARIANTE_ESTADO: Record<MovimientoPago["estado"], VariantePastilla> = {
  pendiente: "confirmar",
  confirmado: "ok",
  rechazado: "debe",
};

/** Una línea de la línea de tiempo: fecha a la izquierda, texto en el medio,
 * monto o cantidad a la derecha (en celular baja debajo del texto). */
function Linea({
  fecha,
  titulo,
  detalle,
  derecha,
  extra,
  id,
}: {
  fecha: string;
  titulo: ReactNode;
  detalle?: ReactNode;
  derecha?: ReactNode;
  extra?: ReactNode;
  id?: string;
}) {
  return (
    <div id={id} className="flex scroll-mt-24 flex-col gap-2 py-3">
      <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 gap-y-1 @sm:grid-cols-[3.25rem_minmax(0,1fr)_auto]">
        <span className="pt-0.5 text-[14px] tabular-nums text-text-muted" title={formatFecha(fecha)}>
          {formatDiaMes(fecha)}
        </span>
        <div className="flex min-w-0 flex-col">
          <div className="text-[16px] break-words text-text">{titulo}</div>
          {detalle && <div className="text-[14px] break-words text-text-muted">{detalle}</div>}
        </div>
        {derecha && (
          <div className="col-start-2 flex flex-wrap items-center gap-2 @sm:col-start-3 @sm:flex-col @sm:items-end @sm:gap-1 @sm:text-right">
            {derecha}
          </div>
        )}
      </div>
      {extra && <div className="pl-[3.75rem]">{extra}</div>}
    </div>
  );
}

function LineaPago({ pago }: { pago: MovimientoPago }) {
  const hrefDetalle = pago.origen === "pago" ? `/tareas/pagos/${pago.id}` : null;
  const linea = (
    <Linea
      fecha={pago.fecha}
      titulo={`Pagó · ${MEDIO_PAGO_LABELS[pago.medioPago]}`}
      detalle={pago.estado === "rechazado" && pago.motivoRechazo ? `Motivo: ${pago.motivoRechazo}` : undefined}
      derecha={
        <>
          <span className="text-[16px] font-semibold tabular-nums text-text">{formatCentavos(pago.montoCentavos)}</span>
          <Pastilla variante={pago.origen === "rendicion" ? "neutra" : VARIANTE_ESTADO[pago.estado]}>
            {pago.origen === "rendicion" ? "Registrado por un admin" : ESTADO_PAGO_LABELS[pago.estado]}
          </Pastilla>
        </>
      }
    />
  );
  return hrefDetalle ? (
    <Link prefetch={false} href={hrefDetalle} className="-mx-2 block rounded-lg px-2 hover:bg-background">
      {linea}
    </Link>
  ) : (
    linea
  );
}

/**
 * Tarjeta "Lo que pasó" de la ficha (`/revendedores/[id]`): una sola línea
 * de tiempo con entregas, devoluciones, ventas y pagos (mezclados por
 * `armarLineaDeTiempo`). Una venta sin precio muestra una pastilla y el
 * mismo formulario inline de antes (`CargarPrecioVenta`). La primera venta
 * sin precio lleva `id="sin-precio"`: es el ancla de "Cargar precios" del
 * resumen de ganancia (`IrAPrecioPendiente`).
 *
 * `items` llega COMPLETO — acá se ven los últimos `LINEAS_VISIBLES` y "Ver
 * todo" despliega el resto. Si el ancla cae afuera, `IrAPrecioPendiente`
 * dispara `EVENTO_MOSTRAR_TODOS_MOVIMIENTOS`, que este componente escucha
 * para expandirse antes de que se reintente el scroll.
 */
export function LoQuePasoFicha({
  items,
  nombrePorProducto,
  primerGrupoSinPrecio,
}: {
  items: ItemLineaDeTiempo[];
  nombrePorProducto: Map<string, string>;
  primerGrupoSinPrecio: string | null;
}) {
  const [expandido, setExpandido] = useState(false);

  useEffect(() => {
    function mostrarTodos() {
      setExpandido(true);
    }
    window.addEventListener(EVENTO_MOSTRAR_TODOS_MOVIMIENTOS, mostrarTodos);
    return () => window.removeEventListener(EVENTO_MOSTRAR_TODOS_MOVIMIENTOS, mostrarTodos);
  }, []);

  const visibles = expandido ? items : items.slice(0, LINEAS_VISIBLES);
  const ocultos = items.length - visibles.length;

  return (
    <Tarjeta como="section" aria-labelledby="ficha-paso" className="@container flex flex-col gap-1">
      <h2 id="ficha-paso" className="text-[20px] leading-tight font-semibold text-text">
        Lo que pasó
      </h2>
      {items.length === 0 ? (
        <p className="py-2 text-[16px] text-text-muted">Todavía no hay movimientos.</p>
      ) : (
        <div className="flex flex-col divide-y divide-line">
          {visibles.map((it) => {
            if (it.clase === "pago") return <LineaPago key={`pago-${it.pago.id}`} pago={it.pago} />;
            const m = it.movimiento;
            if (m.tipo === "venta") {
              return (
                <Linea
                  key={`venta-${m.id}`}
                  id={m.grupoId === primerGrupoSinPrecio ? "sin-precio" : undefined}
                  fecha={m.fecha}
                  titulo={`Vendió ${m.cantidad} × ${nombrePorProducto.get(m.productoId) ?? "?"}`}
                  detalle={[
                    m.medioPago ? MEDIO_PAGO_LABELS[m.medioPago] : null,
                    m.cargadaPorAdmin ? "Cargada por un admin" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  derecha={
                    m.precioVentaCentavos !== null ? (
                      <span className="text-[16px] font-semibold tabular-nums text-text">
                        {formatCentavos(m.precioVentaCentavos)} c/u
                      </span>
                    ) : (
                      <Pastilla variante="aviso">Sin precio</Pastilla>
                    )
                  }
                  extra={
                    <div className="flex flex-col gap-1">
                      {m.precioVentaCentavos === null && (
                        <CargarPrecioVenta grupoId={m.grupoId} persona="ella" pideMedio={m.medioPago === null} />
                      )}
                      <EliminarVentaButton ventaId={m.id} redirectHref={null} />
                    </div>
                  }
                />
              );
            }
            return (
              <Linea
                key={`entrega-${m.id}`}
                fecha={m.fecha}
                titulo={m.tipo === "entrega" ? "Entrega" : "Devolución"}
                detalle={
                  <>
                    {m.automatica && <span className="block">{etiquetaEntregaAutomatica(m.tipo, true)}</span>}
                    {m.items.map((item, i) => {
                      const producto = nombrePorProducto.get(item.productoId) ?? "?";
                      const costos =
                        item.costoCentavos === null
                          ? ""
                          : ` (le cobrás ${formatCentavos(item.costoCentavos)} c/u${
                              item.costoLoteCentavos !== null
                                ? ` · costo ${NEGOCIO.nombre} ${formatCentavos(item.costoLoteCentavos)}`
                                : ""
                            })`;
                      return (
                        <Fragment key={i}>
                          {i > 0 && ", "}
                          {item.cantidad} × {producto}
                          {item.loteId !== null && (
                            <>
                              {" · "}
                              <LoteLink loteId={item.loteId} fecha={item.loteFecha} />
                            </>
                          )}
                          {costos}
                        </Fragment>
                      );
                    })}
                  </>
                }
                derecha={
                  <span className="text-[16px] font-semibold tabular-nums text-text">
                    {textoBotellas(botellasDeMovimiento(m))}
                  </span>
                }
              />
            );
          })}
        </div>
      )}
      {ocultos > 0 && (
        <button
          type="button"
          onClick={() => setExpandido(true)}
          className="inline-flex min-h-11 items-center self-start text-[15px] font-semibold text-primary hover:underline"
        >
          Ver todo ({ocultos} más)
        </button>
      )}
    </Tarjeta>
  );
}
