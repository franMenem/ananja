import { BOTON_PRIMARIO } from "@/components/ui/boton";
import Link from "next/link";

import { EncabezadoPantalla } from "@/components/ui/encabezado-pantalla";
import { Fila } from "@/components/ui/fila";
import { Tarjeta } from "@/components/ui/tarjeta";
import { MarcarSaldadaButton } from "@/components/caja/marcar-saldada-button";
import { PagosDeudaList } from "@/components/deudas/pagos-deuda-list";
import { VolverLink } from "@/components/volver-link";
import { listarDeudasConSaldo } from "@/lib/deudas";
import { formatFecha } from "@/lib/fechas";
import { formatMonto } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DeudasPage() {
  const supabase = await createClient();
  const { data: deudas, error } = await listarDeudasConSaldo(supabase);

  const pendientes = deudas.filter((d) => d.estado !== "saldada");
  const saldadas = deudas.filter((d) => d.estado === "saldada");

  return (
    <div className="flex flex-col gap-6 pb-8">
      <VolverLink href="/plata" label="plata" />

      <EncabezadoPantalla
        titulo="Deudas"
        pregunta="¿Qué debe Ananja y cuánto falta pagar?"
        acciones={
          <Link prefetch={false} href="/plata/deudas/nueva" className={`${BOTON_PRIMARIO} flex gap-2 px-4`}>
            + Nueva deuda
          </Link>
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

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <MarcarSaldadaButton
                      deudaId={deuda.id}
                      descripcion={deuda.descripcion}
                      moneda={deuda.moneda}
                      montoCentavos={deuda.restanteCentavos}
                    />
                    <Link prefetch={false} href={`/plata/deudas/${deuda.id}/pago`} className={`${BOTON_PRIMARIO} flex px-4`}>
                      Registrar pago
                    </Link>
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
              </div>
            ))}
          </div>
        )}
      </Tarjeta>
    </div>
  );
}
