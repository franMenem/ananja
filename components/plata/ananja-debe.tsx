import { BOTON_PRIMARIO } from "@/components/ui/boton";
import Link from "next/link";

import type { DeudaAnanja } from "@/lib/data/plata";
import { formatFecha } from "@/lib/fechas";
import { formatCentavos, formatMonto } from "@/lib/money";

import { Separador } from "./separador";

function BotonPagar({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className={`${BOTON_PRIMARIO} flex shrink-0 px-3.5`}
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
        <p className="py-2 text-[16px] text-text-muted">No hay nada pendiente de pago.</p>
      ) : (
        <div className="flex flex-col">
          {deudaAnanja.pedidosPorPagar.map((p) => (
            <div key={p.loteId} className="flex items-center justify-between gap-3 border-b border-border py-3">
              <div className="flex min-w-0 flex-col">
                <span className="text-[16px] text-text">Pedido del {formatFecha(p.fecha)}</span>
                {p.conceptos.length > 0 && (
                  <span className="text-[14px] text-text-muted">
                    {p.conceptos.map((c) => `${c.etiqueta} ${formatCentavos(c.saldoCentavos)}`).join(" · ")}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-[16px] font-medium tabular-nums text-accent">
                  {formatCentavos(p.saldoCentavos)}
                </span>
                <BotonPagar href={`/stock/lotes/${p.loteId}/pago`} />
              </div>
            </div>
          ))}
          {deudaAnanja.deudasNegocio.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 border-b border-border py-3">
              <span className="min-w-0 break-words text-[16px] text-text">{d.descripcion}</span>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-[16px] font-medium tabular-nums text-accent">
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
          className="text-[13px] text-text-muted hover:text-primary"
        >
          Ver todas las deudas
        </Link>
        <Link
          href="/plata/deudas/nueva"
          className={`${BOTON_PRIMARIO} flex gap-2 px-4`}
        >
          + Nueva deuda
        </Link>
      </div>
    </div>
  );
}
