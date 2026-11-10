import { BOTON_PRIMARIO } from "@/components/ui/boton";

import { EncabezadoPantalla } from "@/components/ui/encabezado-pantalla";
import { Fila } from "@/components/ui/fila";
import { Tarjeta } from "@/components/ui/tarjeta";
import { EliminarDeudaButton } from "@/components/caja/eliminar-deuda-button";
import { ReabrirDeudaButton } from "@/components/caja/reabrir-deuda-button";
import { MarcarSaldadaButton } from "@/components/caja/marcar-saldada-button";
import { PagosDeudaList } from "@/components/deudas/pagos-deuda-list";
import { VolverLink } from "@/components/volver-link";
import { listarDeudasConSaldo } from "@/lib/deudas";
import { deudaSigueDebiendose, puedeEliminarDeuda, puedeReabrirDeuda } from "@/lib/dominio/deudas";
import { formatFecha } from "@/lib/fechas";
import { formatMonto } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { LinkBoton } from "@/components/ui/link-boton";

export const dynamic = "force-dynamic";

export default async function DeudasPage() {
  const supabase = await createClient();
  const { data: deudas, error } = await listarDeudasConSaldo(supabase);

  const pendientes = deudas.filter((d) => deudaSigueDebiendose(d.saldadaEn, d.restanteCentavos));
  const saldadas = deudas.filter((d) => !deudaSigueDebiendose(d.saldadaEn, d.restanteCentavos));

  return (
    <div className="flex flex-col gap-6 pb-8">
      <VolverLink href="/plata" label="plata" />

      <EncabezadoPantalla
        titulo="Deudas"
        pregunta="¿Qué debe Ananja y cuánto falta pagar?"
        acciones={
          <LinkBoton prefetch={false} href="/plata/deudas/nueva" className={`${BOTON_PRIMARIO} flex gap-2 px-4`}>
            + Nueva deuda
          </LinkBoton>
        }
      />

      {error && (
        <p role="alert" className="text-[16px] text-accent">
          {error}
        </p>
      )}

      <Tarjeta como="section" aria-labelledby="deudas-pendientes" className="flex flex-col gap-1">
        <h2 id="deudas-pendientes" className="text-[20px] leading-tight font-semibold text-text">
          Pendientes
        </h2>
        {pendientes.length === 0 ? (
          <p className="py-2 text-[16px] text-text-muted">No hay deudas pendientes.</p>
        ) : (
          <div className="flex flex-col divide-y divide-line">
            {pendientes.map((deuda) => {
              const progresoPct =
                deuda.montoCentavos > 0
                  ? Math.min(100, Math.max(0, (deuda.pagadoCentavos / deuda.montoCentavos) * 100))
                  : 0;

              return (
                <div key={deuda.id} className="flex flex-col gap-2.5 py-3">
                  <Fila
                    titulo={<span className="break-words">{deuda.descripcion}</span>}
                    detalle={
                      <>
                        {formatFecha(deuda.fecha)}
                        {deuda.nota ? ` · ${deuda.nota}` : ""}
                      </>
                    }
                    valor={
                      <div className="flex flex-col items-end">
                        <span className={deuda.restanteCentavos > 0 ? "text-accent" : "text-text"}>
                          Resta {formatMonto(deuda.moneda, deuda.restanteCentavos)}
                        </span>
                        <span className="text-[14px] font-normal text-text-muted">
                          de {formatMonto(deuda.moneda, deuda.montoCentavos)}
                        </span>
                      </div>
                    }
                  />

                  {deuda.pagadoCentavos > 0 && (
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
                      <div className="h-1.5 rounded-full bg-secondary" style={{ width: `${progresoPct}%` }} />
                    </div>
                  )}

                  <PagosDeudaList
                    moneda={deuda.moneda}
                    pagos={deuda.pagos.map((p) => ({
                      id: p.id,
                      montoCentavos: p.monto_centavos,
                      montoCajaCentavos: p.monto_caja_centavos,
                      medioPago: p.medio_pago,
                      fecha: p.fecha,
                      nota: p.nota,
                    }))}
                  />

                  {deuda.loteId && <CorregirDesdePedido loteId={deuda.loteId} />}

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-x-4">
                      <MarcarSaldadaButton
                        deudaId={deuda.id}
                        descripcion={deuda.descripcion}
                        moneda={deuda.moneda}
                        montoCentavos={deuda.restanteCentavos}
                      />
                      {puedeEliminarDeuda(deuda) && (
                        <EliminarDeudaButton
                          deudaId={deuda.id}
                          descripcion={deuda.descripcion}
                          moneda={deuda.moneda}
                          montoCentavos={deuda.montoCentavos}
                        />
                      )}
                    </div>
                    <LinkBoton prefetch={false} href={`/plata/deudas/${deuda.id}/pago`} className={`${BOTON_PRIMARIO} flex px-4`}>
                      Registrar pago
                    </LinkBoton>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Tarjeta>

      <Tarjeta como="section" aria-labelledby="deudas-saldadas" className="flex flex-col gap-1">
        <h2 id="deudas-saldadas" className="text-[20px] leading-tight font-semibold text-text">
          Saldadas
        </h2>
        {saldadas.length === 0 ? (
          <p className="py-2 text-[16px] text-text-muted">Todavía no hay ninguna.</p>
        ) : (
          <div className="flex flex-col divide-y divide-line">
            {saldadas.map((deuda) => (
              <div key={deuda.id} className="flex flex-col gap-2 py-3">
                <Fila
                  titulo={<span className="break-words line-through">{deuda.descripcion}</span>}
                  detalle={`Saldada el ${formatFecha(deuda.saldadaEn as string)}`}
                  valor={<span className="text-text-muted">{formatMonto(deuda.moneda, deuda.montoCentavos)}</span>}
                />

                <PagosDeudaList
                  moneda={deuda.moneda}
                  pagos={deuda.pagos.map((p) => ({
                    id: p.id,
                    montoCentavos: p.monto_centavos,
                    montoCajaCentavos: p.monto_caja_centavos,
                    medioPago: p.medio_pago,
                    fecha: p.fecha,
                    nota: p.nota,
                  }))}
                />

                {deuda.loteId && <CorregirDesdePedido loteId={deuda.loteId} />}

                {(puedeReabrirDeuda(deuda) || puedeEliminarDeuda(deuda)) && (
                  <div className="flex flex-wrap items-center gap-x-4">
                    {puedeReabrirDeuda(deuda) && (
                      <ReabrirDeudaButton
                        deudaId={deuda.id}
                        descripcion={deuda.descripcion}
                        moneda={deuda.moneda}
                        restanteCentavos={deuda.restanteCentavos}
                      />
                    )}
                    {puedeEliminarDeuda(deuda) && (
                      <EliminarDeudaButton
                        deudaId={deuda.id}
                        descripcion={deuda.descripcion}
                        moneda={deuda.moneda}
                        montoCentavos={deuda.montoCentavos}
                      />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Tarjeta>
    </div>
  );
}

/** Indicación de las deudas que nacen de un pedido: no se tocan a mano. */
function CorregirDesdePedido({ loteId }: { loteId: string }) {
  return (
    <Link
      prefetch={false}
      href={`/stock/lotes/${loteId}`}
      className="inline-flex min-h-11 items-center text-[14px] text-text-muted hover:text-primary"
    >
      Sale de un pedido: se corrige desde el pedido
    </Link>
  );
}
