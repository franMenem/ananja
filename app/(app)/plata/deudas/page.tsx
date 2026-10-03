import Link from "next/link";

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

      <div className="flex items-center justify-between">
        <h1 className="font-display text-[28px] text-primary">Deudas</h1>
        <Link
          href="/plata/deudas/nueva"
          className="flex min-h-11 items-center gap-2 bg-primary px-4 text-xs font-medium tracking-[0.12em] text-background uppercase transition-colors hover:bg-primary-hover"
        >
          + Nueva deuda
        </Link>
      </div>

      {error && (
        <p role="alert" className="text-sm text-accent">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
          Pendientes
        </span>
        {pendientes.length === 0 ? (
          <p className="py-2 text-sm text-text-muted">No hay deudas pendientes.</p>
        ) : (
          pendientes.map((deuda) => {
            const progresoPct =
              deuda.montoCentavos > 0
                ? Math.min(100, Math.max(0, (deuda.pagadoCentavos / deuda.montoCentavos) * 100))
                : 0;

            return (
              <div key={deuda.id} className="flex flex-col gap-2.5 border-b border-border py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-sm text-text">{deuda.descripcion}</span>
                    <span className="text-xs text-text-muted">
                      {formatFecha(deuda.fecha)}
                      {deuda.nota ? ` · ${deuda.nota}` : ""}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-col items-end">
                    <span className="text-sm font-medium tabular-nums text-text">
                      Resta {formatMonto(deuda.moneda, deuda.restanteCentavos)}
                    </span>
                    <span className="text-xs text-text-muted tabular-nums">
                      de {formatMonto(deuda.moneda, deuda.montoCentavos)}
                    </span>
                  </div>
                </div>

                {deuda.pagadoCentavos > 0 && (
                  <div className="h-1 w-full bg-border">
                    <div
                      className="h-1 bg-secondary"
                      style={{ width: `${progresoPct}%` }}
                    />
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

                <div className="flex items-center justify-between gap-3">
                  <MarcarSaldadaButton
                    deudaId={deuda.id}
                    descripcion={deuda.descripcion}
                    moneda={deuda.moneda}
                    montoCentavos={deuda.restanteCentavos}
                  />
                  <Link
                    href={`/plata/deudas/${deuda.id}/pago`}
                    className="flex min-h-11 items-center justify-center bg-primary px-4 text-xs font-medium tracking-[0.12em] text-background uppercase transition-colors hover:bg-primary-hover"
                  >
                    Registrar pago
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
          Saldadas
        </span>
        {saldadas.length === 0 ? (
          <p className="py-2 text-sm text-text-muted">Todavía no hay ninguna.</p>
        ) : (
          saldadas.map((deuda) => (
            <div
              key={deuda.id}
              className="flex flex-col gap-2 border-b border-border py-3 opacity-60"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm text-text line-through">
                    {deuda.descripcion}
                  </span>
                  <span className="text-xs text-text-muted">
                    Saldada el {formatFecha(deuda.saldadaEn as string)}
                  </span>
                </div>
                <span className="text-sm tabular-nums text-text-muted">
                  {formatMonto(deuda.moneda, deuda.montoCentavos)}
                </span>
              </div>

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
          ))
        )}
      </div>
    </div>
  );
}
