import Link from "next/link";

import { Separador } from "@/components/plata/separador";
import { MEDIO_PAGO_LABELS } from "@/lib/dominio/caja";
import { formatFechaCorta } from "@/lib/fechas";
import { etiquetaConceptoPago } from "@/lib/dominio/gastos";
import { formatCantidadConUnidad } from "@/lib/dominio/insumos";
import type { ConceptoPagoLote } from "@/lib/dominio/lotes";
import { formatCentavos, formatMonto } from "@/lib/money";

type PagoRow = {
  id: string;
  monto_centavos: number;
  fecha: string;
  medio_pago: "banco" | "mercado_pago" | "efectivo";
  nota: string | null;
  concepto_pago: string | null;
  productos: { presentacion_ml: number | null } | null;
};

type DeudaAceite = {
  deuda_id: string | null;
  debe_usd_centavos: number | null;
  saldo_usd_centavos: number | null;
} | null;

type PagoPedidoProps = {
  pedidoId: string;
  aPagarCentavos: number;
  pagadoCentavos: number;
  pendienteCentavos: number;
  pagos: PagoRow[];
  conceptosPago: ConceptoPagoLote[];
  pagadoSinConceptoCentavos: number;
  deudaAceite: DeudaAceite;
  litrosAceite: number;
};

/**
 * Bloque "Pago" del detalle de un pedido (bloque 2): a pagar/pagado arriba, el
 * estado en grande (Falta $Z o Pagado), la lista de pagos y, si este
 * pedido usó aceite, una fila con los litros usados (v_deuda_aceite_lote,
 * 0047) — si generó deuda automática con el proveedor se explica cuánto se
 * debe y, con saldo, un link para pagarla; si el aceite no se cargó en
 * dólares por litro se aclara por qué no hay deuda. El desglose por
 * concepto ("envasado", "transporte", "otros") queda plegado en "Ver por
 * concepto" — información útil pero secundaria frente a "cuánto falta".
 */
export function PagoPedido({
  pedidoId,
  aPagarCentavos,
  pagadoCentavos,
  pendienteCentavos,
  pagos,
  conceptosPago,
  pagadoSinConceptoCentavos,
  deudaAceite,
  litrosAceite,
}: PagoPedidoProps) {
  const debeAceite = deudaAceite?.debe_usd_centavos ?? 0;
  const restaAceite = deudaAceite?.saldo_usd_centavos ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <Separador titulo="Pago" />

      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] text-text-muted tabular-nums">
          A pagar {formatCentavos(aPagarCentavos)} · Pagado {formatCentavos(pagadoCentavos)}
        </span>
        <span
          className={`text-[15px] font-medium tabular-nums ${pendienteCentavos > 0 ? "text-accent" : "text-secondary"}`}
        >
          {pendienteCentavos > 0 ? `Falta ${formatCentavos(pendienteCentavos)}` : "Pagado"}
        </span>
      </div>

      {pagos.length > 0 && (
        <div className="flex flex-col">
          {pagos.map((pago) => (
            <Link
              key={pago.id}
              href={`/gastos/${pago.id}`}
              className="flex items-baseline justify-between gap-2 border-b border-border py-2.5 text-[13px]"
            >
              <span className="min-w-0 text-text">
                {etiquetaConceptoPago(pago.concepto_pago, pago.productos?.presentacion_ml) ?? "Pago"}
                <span className="block text-[11px] text-text-muted">
                  {formatFechaCorta(pago.fecha)} · {MEDIO_PAGO_LABELS[pago.medio_pago]}
                  {!pago.concepto_pago && pago.nota ? ` · ${pago.nota}` : ""}
                </span>
              </span>
              <span className="font-medium text-text tabular-nums">
                {formatCentavos(pago.monto_centavos)}
              </span>
            </Link>
          ))}
        </div>
      )}

      {litrosAceite > 0 && (
        <div className="flex flex-col gap-2 border-l-2 border-mark bg-surface-raised px-4 py-3">
          <span className="text-[13px] text-text">
            Se usaron {formatCantidadConUnidad(litrosAceite, "litro")} de este pedido.
          </span>
          {deudaAceite ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-text">
                {restaAceite > 0 ? (
                  <>
                    Le debés al proveedor{" "}
                    <strong className="font-medium text-primary tabular-nums">
                      {formatMonto("USD", debeAceite)}
                    </strong>
                    {" · Resta "}
                    <strong className="font-medium text-accent tabular-nums">
                      {formatMonto("USD", restaAceite)}
                    </strong>
                  </>
                ) : (
                  "El aceite de este pedido ya está pagado."
                )}
              </span>
              {restaAceite > 0 && deudaAceite.deuda_id && (
                <Link
                  href={`/plata/deudas/${deudaAceite.deuda_id}/pago`}
                  className="shrink-0 text-[11px] font-medium tracking-[0.1em] text-primary uppercase underline decoration-mark underline-offset-4"
                >
                  Pagar
                </Link>
              )}
            </div>
          ) : (
            <span className="text-[12px] leading-snug text-text-muted">
              Este pedido no generó una deuda automática con el proveedor: el
              precio del aceite no se cargó en dólares por litro (se usó un
              precio en pesos o el promedio del depósito).
            </span>
          )}
        </div>
      )}

      {pendienteCentavos > 0 && (
        <Link
          href={`/stock/lotes/${pedidoId}/pago`}
          className="flex min-h-12 items-center justify-center bg-primary px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase transition-colors hover:bg-primary-hover"
        >
          Registrar pago
        </Link>
      )}

      {conceptosPago.length > 0 && (
        <details className="group border-t border-border pt-3">
          <summary className="text-[12px] font-medium tracking-[0.06em] text-primary uppercase">
            Ver por concepto
          </summary>
          <div className="mt-3 flex flex-col">
            {conceptosPago.map((c) => (
              <div key={c.clave} className="flex flex-col gap-0.5 border-b border-border py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] text-text">{c.etiqueta}</span>
                  <span
                    className={`text-[13px] tabular-nums ${c.pendienteCentavos > 0 ? "font-medium text-accent" : "text-text-muted"}`}
                  >
                    {c.pendienteCentavos > 0 ? `Pendiente ${formatCentavos(c.pendienteCentavos)}` : "Pagado"}
                  </span>
                </div>
                <span className="text-[11px] text-text-muted tabular-nums">
                  A pagar {formatCentavos(c.aPagarCentavos)} · Pagado {formatCentavos(c.pagadoCentavos)}
                </span>
              </div>
            ))}
            {pagadoSinConceptoCentavos > 0 && (
              <div className="flex items-baseline justify-between gap-2 border-b border-border py-2.5">
                <span className="text-[13px] text-text">
                  Pagos sin concepto
                  <span className="text-[11px] text-text-muted"> · anteriores</span>
                </span>
                <span className="text-[13px] text-text-muted tabular-nums">
                  Pagado {formatCentavos(pagadoSinConceptoCentavos)}
                </span>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
