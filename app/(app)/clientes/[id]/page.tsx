import Link from "next/link";
import { notFound } from "next/navigation";

import { ClienteBajaButton } from "@/components/cliente-baja-button";
import { ClienteElegirVenta } from "@/components/cobros/elegir-venta";
import { Dato } from "@/components/ui/dato";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "@/components/ui/boton";
import { ListaTarjeta } from "@/components/ui/fila";
import { NumeroGrande } from "@/components/ui/numero-grande";
import { Pastilla } from "@/components/ui/pastilla";
import { Tarjeta } from "@/components/ui/tarjeta";
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
import { ChevronFila, FilaLink } from "@/components/ui/estado-fila";
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

  const datosContacto = [
    cliente.telefono ? `Teléfono: ${cliente.telefono}` : null,
    cliente.direccion ? `Dirección: ${cliente.direccion}` : null,
    cliente.email ? `Email: ${cliente.email}` : null,
  ].filter((d): d is string => d !== null);
  const debe = deudaCentavos > 0;

  return (
    <div className="mx-auto w-full max-w-[760px]">
      <div className="flex flex-col gap-6 pb-8">
        <VolverLink href="/clientes" label="clientes" corto />

        <header className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="font-display text-[28px] leading-[1.1] font-bold break-words text-text">
              {cliente.nombre}
            </h1>
            {!cliente.activo && <Pastilla variante="neutra">Dado de baja</Pastilla>}
          </div>
          {datosContacto.map((d) => (
            <p key={d} className="text-[15px] break-words text-text-muted">
              {d}
            </p>
          ))}
          {cliente.nota && <p className="text-[15px] break-words text-text-muted">Nota: {cliente.nota}</p>}
          {datosContacto.length === 0 && !cliente.nota && (
            <p className="text-[15px] text-text-muted">Sin datos adicionales cargados.</p>
          )}
        </header>

        <Tarjeta como="section" aria-label="Cuánto debe" className="flex flex-col gap-3">
          <NumeroGrande etiqueta="Debe" tono={debe ? "debe" : undefined}>
            {formatCentavos(Math.max(deudaCentavos, 0))}
          </NumeroGrande>
          {!debe && <Pastilla variante="ok" className="self-start">Al día</Pastilla>}
        </Tarjeta>

        <div className="grid grid-cols-2 gap-3">
          <Dato etiqueta="Vendido">{formatCentavos(vendidoCentavos)}</Dato>
          <Dato etiqueta="Cobrado">{formatCentavos(cobradoCentavos)}</Dato>
        </div>

        <div className="flex flex-col gap-2">
          {ventasPendientes.length === 1 ? (
            <Link prefetch={false} href={`/comprobantes/${ventasPendientes[0].id}/cobro`} className={`${BOTON_PRIMARIO} flex px-4`}>
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
          <div className="grid grid-cols-2 gap-2">
            <Link prefetch={false} href={`/clientes/${id}/editar`} className={`${BOTON_SECUNDARIO} flex px-4`}>
              Editar
            </Link>
            <ClienteBajaButton clienteId={id} nombre={cliente.nombre} activo={cliente.activo} />
          </div>
        </div>

        <section aria-labelledby="cliente-compras" className="flex flex-col gap-3">
          <h2 id="cliente-compras" className="text-[20px] leading-tight font-semibold text-text">
            Comprobantes
          </h2>
          {rows.length === 0 ? (
            <p className="text-[16px] text-text-muted">Este cliente todavía no tiene comprobantes registrados.</p>
          ) : (
            <ListaTarjeta>
              {rows.map((comprobante) => {
                const deudaVenta = deudaPorVenta.get(comprobante.id) ?? 0;
                return (
                  <FilaLink
                    key={comprobante.id}
                    href={`/comprobantes/${comprobante.id}`}
                    izquierda={
                      <div className="flex min-w-0 flex-col">
                        <span className="text-[16px] font-semibold tabular-nums text-text">
                          {formatCentavos(comprobante.monto_centavos)}
                        </span>
                        <span className="text-[14px] break-words text-text-muted">
                          {formatCantidadesPorPresentacion(comprobante.comprobante_items)} ·{" "}
                          {comprobante.vendedores?.nombre ?? "—"} · {formatFecha(comprobante.fecha)} ·{" "}
                          {etiquetaMedioPago(comprobante.medio_pago)}
                        </span>
                      </div>
                    }
                    derecha={
                      <>
                        {deudaVenta > 0 && <Pastilla variante="debe">Debe {formatCentavos(deudaVenta)}</Pastilla>}
                        <ChevronFila />
                      </>
                    }
                  />
                );
              })}
            </ListaTarjeta>
          )}
        </section>

        <section aria-labelledby="cliente-cobros" className="flex flex-col gap-3">
          <h2 id="cliente-cobros" className="text-[20px] leading-tight font-semibold text-text">
            Cobros
          </h2>
          {(cobros ?? []).length === 0 ? (
            <p className="text-[16px] text-text-muted">Todavía no hay cobros registrados.</p>
          ) : (
            <ListaTarjeta>
              {(cobros ?? []).map((cobro) => (
                <FilaLink
                  key={cobro.id}
                  href={`/comprobantes/${cobro.comprobante_id}`}
                  izquierda={
                    <div className="flex min-w-0 flex-col">
                      <span className="text-[16px] font-semibold tabular-nums text-text">
                        {formatCentavos(cobro.monto_centavos)}
                      </span>
                      <span className="text-[14px] text-text-muted">
                        {etiquetaMedioPago(cobro.medio_pago)} · {formatFecha(cobro.fecha)}
                      </span>
                    </div>
                  }
                  derecha={<ChevronFila />}
                />
              ))}
            </ListaTarjeta>
          )}
        </section>
      </div>
    </div>
  );
}
