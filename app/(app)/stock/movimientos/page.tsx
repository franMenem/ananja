import Link from "next/link";

import { FormPage } from "@/components/app/form-page";
import { EliminarMovimientoStockAccion } from "@/components/stock/eliminar-movimiento-stock-accion";
import { listarMovimientosStock, listarMovimientosStockBorrados } from "@/lib/data/stock";
import { etiquetaMotivo, esMovimientoStockBorrable } from "@/lib/dominio/movimientos-stock";
import { formatDiaMesHora, formatFechaHora, formatFechaSinAnio } from "@/lib/fechas";
import { formatPresentacion } from "@/lib/negocio";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Línea chica bajo cada movimiento: motivo y "Lote del D/M" (con link al
 * lote). `null` si no hay ninguno de los dos. */
function DetalleMovimiento({
  motivo,
  loteId,
  fechaLote,
}: {
  motivo: string | null;
  loteId: string | null;
  fechaLote: string | null;
}) {
  const etiqueta = etiquetaMotivo(motivo);
  if (!etiqueta && !loteId) return null;
  return (
    <span className="min-w-0 break-words text-[11px] text-text-muted">
      {etiqueta}
      {etiqueta && loteId && " · "}
      {loteId && (
        <Link
          href={`/stock/lotes/${loteId}`}
          className="underline decoration-border underline-offset-4 hover:text-primary"
        >
          {fechaLote ? `Lote del ${formatFechaSinAnio(fechaLote)}` : "Lote"}
        </Link>
      )}
    </span>
  );
}

export default async function StockMovimientosPage() {
  const supabase = await createClient();

  const [{ data: movimientos, error }, borrados] = await Promise.all([
    listarMovimientosStock(supabase),
    listarMovimientosStockBorrados(supabase),
  ]);

  return (
    <FormPage title="Historial de movimientos" backHref="/stock" backLabel="Volver a stock" maxWidth="none" pb>
      {error && (
        <p role="alert" className="text-sm text-accent">
          No se pudo cargar el historial.
        </p>
      )}

      {!error && (movimientos ?? []).length === 0 && (
        <p className="text-sm text-text-muted">
          Todavía no hay movimientos de stock registrados.
        </p>
      )}

      {/* Tabla — escritorio */}
      <div className="hidden md:block">
      <div className="overflow-x-auto">
        <div className="min-w-[680px] grid grid-cols-[16px_82px_1fr_110px_160px_64px] gap-4 border-b border-border pb-2 text-[10px] tracking-[0.16em] text-text-muted uppercase">
          <span />
          <span>Fecha</span>
          <span>Concepto</span>
          <span>Vendedor</span>
          <span className="text-right">Cantidad</span>
          <span />
        </div>
        {(movimientos ?? []).map((movimiento) => {
          const esIngreso = movimiento.tipo === "ingreso";
          return (
            <div
              key={movimiento.id}
              className="min-w-[680px] grid grid-cols-[16px_82px_1fr_110px_160px_64px] items-center gap-4 border-b border-border py-[11px] text-sm"
            >
              <span
                aria-hidden="true"
                className={esIngreso ? "text-secondary" : "text-accent"}
              >
                {esIngreso ? "+" : "−"}
              </span>
              <span className="text-text-muted">
                {formatFechaHora(movimiento.created_at)}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-text">
                  {esIngreso ? "Ingreso" : "Egreso manual"} ·{" "}
                  {movimiento.comprobante_id ? (
                    <Link
                      href={`/comprobantes/${movimiento.comprobante_id}`}
                      className="text-primary underline decoration-mark underline-offset-4"
                    >
                      venta
                    </Link>
                  ) : (
                    <span className="text-text-muted">
                      {movimiento.nota || "sin nota"}
                    </span>
                  )}
                </span>
                <DetalleMovimiento
                  motivo={movimiento.motivo}
                  loteId={movimiento.lote_id}
                  fechaLote={movimiento.fecha_lote}
                />
              </span>
              <span className="truncate text-text-muted">
                {movimiento.vendedores?.nombre ?? "—"}
              </span>
              <span className="text-right tabular-nums text-text">
                {movimiento.cantidad}×
                {formatPresentacion(movimiento.productos?.presentacion_ml)}
              </span>
              <span className="text-right">
                {esMovimientoStockBorrable(movimiento) && (
                  <EliminarMovimientoStockAccion
                    movimientoId={movimiento.id}
                    cantidad={movimiento.cantidad}
                    producto={movimiento.productos?.nombre ?? "producto"}
                    fechaLote={movimiento.fecha_lote}
                  />
                )}
              </span>
            </div>
          );
        })}
      </div>
      </div>

      {/* Filas regladas — celular */}
      <div className="flex flex-col md:hidden">
        {(movimientos ?? []).map((movimiento) => {
          const esIngreso = movimiento.tipo === "ingreso";
          return (
            <div
              key={movimiento.id}
              className="flex items-baseline gap-3 border-b border-border py-3"
            >
              <span
                aria-hidden="true"
                className={`w-[13px] shrink-0 ${
                  esIngreso ? "text-secondary" : "text-accent"
                }`}
              >
                {esIngreso ? "+" : "−"}
              </span>

              <div className="flex flex-1 flex-col gap-0.5 text-[13px]">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-text">
                    {esIngreso ? "Ingreso" : "Egreso"} ·{" "}
                    {movimiento.productos?.nombre ?? "Producto"} (
                    {formatPresentacion(movimiento.productos?.presentacion_ml)})
                  </span>
                  <span className="text-text-muted tabular-nums">
                    {movimiento.cantidad} un.
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  {movimiento.comprobante_id ? (
                    <Link
                      href={`/comprobantes/${movimiento.comprobante_id}`}
                      className="text-text-muted underline decoration-mark underline-offset-4"
                    >
                      Venta
                    </Link>
                  ) : (
                    <span className="text-text-muted">
                      {movimiento.nota || "Sin nota"}
                    </span>
                  )}
                  <span className="shrink-0 text-text-muted">
                    {movimiento.vendedores?.nombre ?? "—"} ·{" "}
                    {formatFechaHora(movimiento.created_at)}
                  </span>
                </div>
                {(movimiento.motivo || movimiento.lote_id || esMovimientoStockBorrable(movimiento)) && (
                  <div className="flex items-center justify-between gap-2">
                    <DetalleMovimiento
                      motivo={movimiento.motivo}
                      loteId={movimiento.lote_id}
                      fechaLote={movimiento.fecha_lote}
                    />
                    {esMovimientoStockBorrable(movimiento) && (
                      <span className="ml-auto shrink-0">
                        <EliminarMovimientoStockAccion
                          movimientoId={movimiento.id}
                          cantidad={movimiento.cantidad}
                          producto={movimiento.productos?.nombre ?? "producto"}
                          fechaLote={movimiento.fecha_lote}
                        />
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {borrados.length > 0 && (
        <details className="group mt-6">
          <summary className="flex items-center gap-1.5 select-none text-[10px] tracking-[0.22em] text-text-muted uppercase [&::-webkit-details-marker]:hidden">
            <span aria-hidden className="inline-block transition-transform group-open:rotate-90">
              ›
            </span>
            Eliminados ({borrados.length})
          </summary>
          <div className="mt-2 flex flex-col">
            {borrados.map((b) => (
              <div key={b.id} className="flex flex-col gap-0.5 border-b border-border py-3 text-sm">
                <span className="min-w-0 break-words text-text-muted">
                  {b.tipo === "ingreso" ? "Ingreso" : "Egreso"} de {b.cantidad} × {b.producto ?? "producto"}
                  {b.nota ? ` · ${b.nota}` : ""}
                </span>
                <DetalleMovimiento motivo={b.motivo} loteId={b.lote_id} fechaLote={b.fecha_lote} />
                <span className="text-[11px] text-text-muted">
                  Cargado el {formatFechaHora(b.created_at)}. Eliminado por {b.borrado_por ?? "alguien"} el{" "}
                  {formatDiaMesHora(b.borrado_at)}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </FormPage>
  );
}
