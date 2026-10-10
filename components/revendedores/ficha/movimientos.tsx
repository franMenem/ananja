"use client";

import { Fragment, useEffect, useState } from "react";

import { EliminarVentaButton } from "@/components/mi/eliminar-venta-button";
import { Separador } from "@/components/plata/separador";
import { CargarPrecioVenta } from "@/components/revendedores/cargar-precio-venta";
import { LoteLink } from "@/components/revendedores/ficha/lote-link";
import { MEDIO_PAGO_LABELS } from "@/lib/dominio/caja";
import { EVENTO_MOSTRAR_TODOS_MOVIMIENTOS } from "@/lib/eventos-cliente";
import { formatFecha } from "@/lib/fechas";
import { LIMITE_MOVIMIENTOS_VISIBLES, type MovimientoRevendedor } from "@/lib/dominio/movimientos-revendedor";
import { formatCentavos } from "@/lib/money";
import { NEGOCIO } from "@/lib/negocio";

/**
 * Bloque 5 de la ficha (`/revendedores/[id]`, rediseño "de 10 bloques a
 * 5", 2026-09-16): un solo hilo cronológico con entregas, devoluciones y
 * ventas (mezcladas por `fusionarMovimientos`, `lib/movimientos-revendedor.ts`).
 * Reemplaza los bloques separados "Entregas", "Ventas" y "Ventas sin
 * precio de venta" — una venta sin precio muestra un chip y el mismo
 * formulario inline de antes (`CargarPrecioVenta`), sin una sección aparte.
 * La primera venta sin precio del hilo lleva `id="sin-precio"`: es el
 * ancla de "Cargar precios" del resumen de ganancia (`IrAPrecioPendiente`).
 *
 * `movimientos` llega COMPLETO (sin recortar) — acá se muestran solo los
 * últimos `LIMITE_MOVIMIENTOS_VISIBLES` con un botón "Ver todos los
 * movimientos" para desplegar el resto. Si el ancla `id="sin-precio"` cae
 * afuera de lo visible, `IrAPrecioPendiente` no la encuentra y dispara
 * `EVENTO_MOSTRAR_TODOS_MOVIMIENTOS`, que este componente escucha para
 * expandirse antes de que se reintente el scroll.
 */
export function MovimientosFicha({
  movimientos,
  nombrePorProducto,
  primerGrupoSinPrecio,
}: {
  movimientos: MovimientoRevendedor[];
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

  const visibles = expandido ? movimientos : movimientos.slice(0, LIMITE_MOVIMIENTOS_VISIBLES);
  const ocultos = movimientos.length - visibles.length;

  return (
    <div className="flex flex-col gap-2">
      <Separador titulo="Movimientos" />
      {movimientos.length === 0 ? (
        <p className="py-2 text-sm text-text-muted">Todavía no hay movimientos.</p>
      ) : (
        visibles.map((m) =>
          m.tipo === "venta" ? (
            <div
              key={`venta-${m.id}`}
              id={m.grupoId === primerGrupoSinPrecio ? "sin-precio" : undefined}
              className="flex scroll-mt-24 flex-col gap-2 border-b border-border py-3 text-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-text">
                  {formatFecha(m.fecha)} · Venta {m.cantidad} × {nombrePorProducto.get(m.productoId) ?? "?"}
                </span>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {m.precioVentaCentavos !== null ? (
                    <span className="text-right tabular-nums text-text">
                      {formatCentavos(m.precioVentaCentavos)}
                      {m.medioPago ? ` · ${MEDIO_PAGO_LABELS[m.medioPago]}` : ""}
                    </span>
                  ) : (
                    <span className="border border-accent px-1.5 py-px text-[9px] tracking-[0.1em] text-accent uppercase">
                      Sin precio
                    </span>
                  )}
                  {m.cargadaPorAdmin && (
                    <span className="text-[11px] text-text-muted">Cargada por un admin</span>
                  )}
                  <EliminarVentaButton ventaId={m.id} redirectHref={null} />
                </div>
              </div>
              {m.precioVentaCentavos === null && (
                <CargarPrecioVenta grupoId={m.grupoId} persona="ella" pideMedio={m.medioPago === null} />
              )}
            </div>
          ) : (
            <div key={`entrega-${m.id}`} className="border-b border-border py-3 text-sm">
              <span className="font-medium text-text">
                {m.tipo === "entrega" ? "Entrega" : "Devolución"} · {formatFecha(m.fecha)}
              </span>
              <p className="text-xs text-text-muted">
                {m.items.map((it, i) => {
                  const producto = nombrePorProducto.get(it.productoId) ?? "?";
                  const costos =
                    it.costoCentavos === null
                      ? ""
                      : ` (le cobrás ${formatCentavos(it.costoCentavos)} c/u${
                          it.costoLoteCentavos !== null
                            ? ` · costo ${NEGOCIO.nombre} ${formatCentavos(it.costoLoteCentavos)}`
                            : ""
                        })`;
                  return (
                    <Fragment key={i}>
                      {i > 0 && ", "}
                      {it.cantidad} × {producto}
                      {it.loteId !== null && (
                        <>
                          {" · "}
                          <LoteLink loteId={it.loteId} fecha={it.loteFecha} />
                        </>
                      )}
                      {costos}
                    </Fragment>
                  );
                })}
              </p>
            </div>
          ),
        )
      )}
      {ocultos > 0 && (
        <button
          type="button"
          onClick={() => setExpandido(true)}
          className="self-start py-2 text-[12px] font-medium tracking-[0.06em] text-primary uppercase underline decoration-mark underline-offset-4"
        >
          Ver todos los movimientos ({ocultos} más)
        </button>
      )}
    </div>
  );
}
