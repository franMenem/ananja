import Link from "next/link";
import { notFound } from "next/navigation";

import { ClienteBajaButton } from "@/components/cliente-baja-button";
import { ClienteElegirVenta } from "@/components/cobros/elegir-venta";
import { IconReceipt } from "@/components/icons";
import { VolverLink } from "@/components/volver-link";
import {
  listarCobrosDeComprobantes,
  listarComprobantesDeCliente,
  listarSaldosDeComprobantes,
  obtenerCliente,
  obtenerResumenDeudaCliente,
} from "@/lib/data/clientes";
import { etiquetaMedioPago } from "@/lib/etiquetas/medio-pago";
import { formatFecha } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";
import { formatCantidadesPorPresentacion } from "@/lib/negocio";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Ficha de cliente (US7): todos los campos + historial de compras
 * automático (sus comprobantes, desc por fecha) con el resumen
 * Vendido/Cobrado/Debe arriba (`v_deuda_cliente`, US Ventas a crédito) y,
 * más abajo, el historial de cobros con acceso directo a "Registrar
 * cobro" — a la única venta pendiente si hay una sola, o eligiendo entre
 * varias (`ClienteElegirVenta`) si hay más de una.
 */
export default async function ClienteDetailPage({
  params,
}: PageProps<"/clientes/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  // Tanda 1: ninguna de las tres depende de las otras (`comprobantes` y
  // `resumen` solo necesitan el `id` del párametro, no el resultado de
  // `cliente`) — antes iban en dos tandas serializadas, ahora en una sola.
  const [cliente, { data: comprobantes }, resumen] = await Promise.all([
    obtenerCliente(supabase, id),
    listarComprobantesDeCliente(supabase, id),
    obtenerResumenDeudaCliente(supabase, id),
  ]);

  if (!cliente) notFound();

  const rows = comprobantes;
  const comprobanteIds = rows.map((c) => c.id);

  // Tanda 2 (dependiente de `comprobanteIds`): deuda de cada venta y
  // cobros — `v_deuda_cliente`/`v_saldo_comprobante` (Task 3) ya hacen la
  // cuenta en la base, sin N+1 acá.
  const [{ data: saldosPorVenta }, { data: cobros }] = await Promise.all([
    listarSaldosDeComprobantes(supabase, comprobanteIds),
    listarCobrosDeComprobantes(supabase, comprobanteIds),
  ]);

  const deudaPorVenta = new Map<string, number>(
    (saldosPorVenta ?? []).map((s) => [s.comprobante_id ?? "", s.deuda_centavos ?? 0]),
  );
  const ventasPendientes = rows.filter((c) => (deudaPorVenta.get(c.id) ?? 0) > 0);

  const vendidoCentavos = resumen?.vendido_centavos ?? 0;
  const cobradoCentavos = resumen?.cobrado_centavos ?? 0;
  const deudaCentavos = resumen?.deuda_centavos ?? 0;

  return (
    <div className="mx-auto w-full max-w-[760px]">
      <div className="flex flex-col gap-6 pb-8">
        <VolverLink href="/clientes" label="clientes" />

        <div className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-2">
            <h1 className="font-display text-[32px] leading-[1.1] text-primary">
              {cliente.nombre}
            </h1>
            {!cliente.activo && (
              <span className="shrink-0 text-[10px] tracking-[0.14em] text-accent uppercase">
                Dado de baja
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1 text-[13px] text-text">
            {cliente.telefono && <p>Teléfono: {cliente.telefono}</p>}
            {cliente.direccion && <p>Dirección: {cliente.direccion}</p>}
            {cliente.email && <p>Email: {cliente.email}</p>}
            {cliente.nota && (
              <p className="text-text-muted">Nota: {cliente.nota}</p>
            )}
            {!cliente.telefono &&
              !cliente.direccion &&
              !cliente.email &&
              !cliente.nota && (
                <p className="text-text-muted">Sin datos adicionales cargados.</p>
              )}
          </div>

          <div className="flex gap-2.5 pt-1">
            <Link
              href={`/clientes/${id}/editar`}
              className="flex min-h-11 flex-1 items-center justify-center bg-primary px-4 text-xs font-medium tracking-[0.1em] text-background uppercase transition-colors hover:bg-primary-hover"
            >
              Editar
            </Link>
            <div className="flex-1">
              <ClienteBajaButton clienteId={id} nombre={cliente.nombre} activo={cliente.activo} />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
              Ventas
            </span>
            <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
          </div>
          <div className="grid grid-cols-3 gap-3 md:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] tracking-[0.14em] text-text-muted uppercase">
                Vendido
              </span>
              <span className="text-base font-medium whitespace-nowrap tabular-nums text-text">
                {formatCentavos(vendidoCentavos)}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] tracking-[0.14em] text-text-muted uppercase">
                Cobrado
              </span>
              <span className="text-base font-medium whitespace-nowrap tabular-nums text-text">
                {formatCentavos(cobradoCentavos)}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] tracking-[0.14em] text-text-muted uppercase">
                Debe
              </span>
              <span
                className={`text-base font-medium whitespace-nowrap tabular-nums ${deudaCentavos > 0 ? "text-accent" : "text-text"}`}
              >
                {formatCentavos(deudaCentavos)}
              </span>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <IconReceipt className="h-7 w-7 text-text-muted" />
              <p className="mt-3 text-[13px] text-text-muted">
                Este cliente todavía no tiene comprobantes registrados.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col">
              {rows.map((comprobante) => (
                <li key={comprobante.id} className="border-b border-border">
                  <Link
                    href={`/comprobantes/${comprobante.id}`}
                    className="flex items-center justify-between gap-3 py-3.5"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-display text-[22px] leading-none text-primary tabular-nums">
                          {formatCentavos(comprobante.monto_centavos)}
                        </span>
                        {(deudaPorVenta.get(comprobante.id) ?? 0) > 0 && (
                          <span className="border border-accent px-1 text-[9px] tracking-[0.1em] text-accent uppercase">
                            Debe {formatCentavos(deudaPorVenta.get(comprobante.id)!)}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-text-muted">
                        {formatCantidadesPorPresentacion(comprobante.comprobante_items)} ·{" "}
                        {comprobante.vendedores?.nombre ?? "—"} ·{" "}
                        {formatFecha(comprobante.fecha)}
                      </p>
                    </div>
                    <span className="shrink-0 self-start pb-0.5 text-[10px] tracking-[0.14em] text-primary uppercase">
                      <span className="border-b border-mark pb-0.5">
                        {etiquetaMedioPago(comprobante.medio_pago)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
              Cobros
            </span>
            <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
          </div>

          {(cobros ?? []).length === 0 ? (
            <p className="py-2 text-sm text-text-muted">
              Todavía no hay cobros registrados.
            </p>
          ) : (
            <ul className="flex flex-col">
              {(cobros ?? []).map((cobro) => (
                <li key={cobro.id} className="border-b border-border py-2.5">
                  <Link
                    href={`/comprobantes/${cobro.comprobante_id}`}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-sm text-text">
                      {formatCentavos(cobro.monto_centavos)} ·{" "}
                      {etiquetaMedioPago(cobro.medio_pago)}
                    </span>
                    <span className="text-xs text-text-muted">
                      {formatFecha(cobro.fecha)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {ventasPendientes.length === 1 ? (
            <Link
              href={`/comprobantes/${ventasPendientes[0].id}/cobro`}
              className="flex min-h-11 items-center justify-center bg-primary px-4 text-xs font-medium tracking-[0.1em] text-background uppercase transition-colors hover:bg-primary-hover"
            >
              Registrar cobro
            </Link>
          ) : ventasPendientes.length > 1 ? (
            <ClienteElegirVenta
              ventas={ventasPendientes.map((v) => ({
                id: v.id,
                deudaCentavos: deudaPorVenta.get(v.id) ?? 0,
                fecha: v.fecha,
              }))}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
