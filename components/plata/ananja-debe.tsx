import Link from "next/link";

import type { DeudaAnanja } from "@/lib/data/plata";
import { formatFecha } from "@/lib/fechas";
import { formatCentavos, formatMonto } from "@/lib/money";

import { Separador } from "./separador";

function BotonPagar({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-11 shrink-0 items-center justify-center bg-primary px-3.5 text-[11px] font-medium tracking-[0.12em] text-background uppercase transition-colors hover:bg-primary-hover"
    >
      Pagar
    </Link>
  );
}

/**
 * Bloque 4 de `/plata` — "Ananja debe": pedidos al proveedor por pagar y deudas
 * del negocio (`lib/deuda-ananja.ts` — mismas dos fuentes que el bloque "Lo
 * que debe Ananja" de Inicio), cada fila con su botón chico "Pagar" a donde
 * ya se paga hoy. Al pie, los links a la lista completa de deudas y a
 * cargar una nueva.
 */
export function AnanjaDebe({ deudaAnanja }: { deudaAnanja: DeudaAnanja }) {
  const sinNadaPorPagar =
    deudaAnanja.pedidosPorPagar.length === 0 && deudaAnanja.deudasNegocio.length === 0;

  return (
    <div className="flex flex-col pt-8">
      <Separador titulo="Ananja debe" />
      {sinNadaPorPagar ? (
        <p className="py-2 text-sm text-text-muted">No hay nada pendiente de pago.</p>
      ) : (
        <div className="flex flex-col">
          {deudaAnanja.pedidosPorPagar.map((p) => (
            <div key={p.loteId} className="flex items-center justify-between gap-3 border-b border-border py-3">
              <div className="flex min-w-0 flex-col">
                <span className="text-sm text-text">Pedido del {formatFecha(p.fecha)}</span>
                {p.conceptos.length > 0 && (
                  <span className="text-xs text-text-muted">
                    {p.conceptos.map((c) => `${c.etiqueta} ${formatCentavos(c.saldoCentavos)}`).join(" · ")}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-medium tabular-nums text-accent">
                  {formatCentavos(p.saldoCentavos)}
                </span>
                <BotonPagar href={`/stock/lotes/${p.loteId}/pago`} />
              </div>
            </div>
          ))}
          {deudaAnanja.deudasNegocio.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 border-b border-border py-3">
              <span className="min-w-0 break-words text-sm text-text">{d.descripcion}</span>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-medium tabular-nums text-accent">
                  {formatMonto(d.moneda, d.restanteCentavos)}
                </span>
                <BotonPagar href={`/plata/deudas/${d.id}/pago`} />
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between">
        <Link
          href="/plata/deudas"
          className="text-[11px] tracking-[0.14em] text-text-muted uppercase hover:text-primary"
        >
          Ver todas las deudas
        </Link>
        <Link
          href="/plata/deudas/nueva"
          className="flex min-h-11 items-center gap-2 bg-primary px-4 text-xs font-medium tracking-[0.12em] text-background uppercase transition-colors hover:bg-primary-hover"
        >
          + Nueva deuda
        </Link>
      </div>
    </div>
  );
}
