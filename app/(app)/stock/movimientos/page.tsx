import Link from "next/link";

import { FormPage } from "@/components/app/form-page";
import { listarMovimientosStock } from "@/lib/data/stock";
import { formatFechaHora } from "@/lib/fechas";
import { formatPresentacion } from "@/lib/negocio";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function StockMovimientosPage() {
  const supabase = await createClient();

  const { data: movimientos, error } = await listarMovimientosStock(supabase);

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
        <div className="min-w-[580px] grid grid-cols-[16px_82px_1fr_110px_160px] gap-4 border-b border-border pb-2 text-[10px] tracking-[0.16em] text-text-muted uppercase">
          <span />
          <span>Fecha</span>
          <span>Concepto</span>
          <span>Vendedor</span>
          <span className="text-right">Cantidad</span>
        </div>
        {(movimientos ?? []).map((movimiento) => {
          const esIngreso = movimiento.tipo === "ingreso";
          return (
            <div
              key={movimiento.id}
              className="min-w-[580px] grid grid-cols-[16px_82px_1fr_110px_160px] items-center gap-4 border-b border-border py-[11px] text-sm"
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
              <span className="truncate text-text-muted">
                {movimiento.vendedores?.nombre ?? "—"}
              </span>
              <span className="text-right tabular-nums text-text">
                {movimiento.cantidad}×
                {formatPresentacion(movimiento.productos?.presentacion_ml)}
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
              </div>
            </div>
          );
        })}
      </div>
    </FormPage>
  );
}
