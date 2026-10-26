import Link from "next/link";

import { Pastilla } from "@/components/ui/pastilla";
import { Tarjeta } from "@/components/ui/tarjeta";
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
  aPagarCentavos: number;
  pagadoCentavos: number;
  pagos: PagoRow[];
  conceptosPago: ConceptoPagoLote[];
  pagadoSinConceptoCentavos: number;
  deudaAceite: DeudaAceite;
  litrosAceite: number;
};

/**
 * Tarjeta "Pagos" del detalle de un pedido: cuánto hay que pagar y cuánto se
 * pagó por concepto (envasado, transporte, otros...), los pagos registrados
 * y, si este pedido usó aceite, cuántos litros fueron y la deuda automática
 * con el proveedor (`v_deuda_aceite_lote`, 0047). El botón para registrar un
 * pago está en el héroe de la pantalla.
 */
export function PagoPedido({
  aPagarCentavos,
  pagadoCentavos,
  pagos,
  conceptosPago,
  pagadoSinConceptoCentavos,
  deudaAceite,
  litrosAceite,
}: PagoPedidoProps) {
  const debeAceite = deudaAceite?.debe_usd_centavos ?? 0;
  const restaAceite = deudaAceite?.saldo_usd_centavos ?? 0;

  return (
    <Tarjeta como="section" aria-labelledby="pedido-pagos" className="flex flex-col gap-3">
      <h2 id="pedido-pagos" className="text-[20px] leading-tight font-semibold text-text">
        Pagos
      </h2>

      <div className="flex flex-col gap-1 text-[16px]">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-text">A pagar</span>
          <span className="font-semibold text-text tabular-nums">{formatCentavos(aPagarCentavos)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-text">Pagado</span>
          <span className="font-semibold text-text tabular-nums">{formatCentavos(pagadoCentavos)}</span>
        </div>
      </div>

      {(conceptosPago.length > 0 || pagadoSinConceptoCentavos > 0) && (
        <div className="flex flex-col divide-y divide-line border-t border-line">
          {conceptosPago.map((c) => (
            <div key={c.clave} className="flex flex-col gap-0.5 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[16px] font-semibold text-text">{c.etiqueta}</span>
                {c.pendienteCentavos > 0 ? (
                  <Pastilla variante="debe">Falta {formatCentavos(c.pendienteCentavos)}</Pastilla>
                ) : (
                  <Pastilla variante="ok">Pagado</Pastilla>
                )}
              </div>
              <span className="text-[14px] text-text-muted tabular-nums">
                A pagar {formatCentavos(c.aPagarCentavos)} · Pagado {formatCentavos(c.pagadoCentavos)}
              </span>
            </div>
          ))}
          {pagadoSinConceptoCentavos > 0 && (
            <div className="flex items-baseline justify-between gap-3 py-3">
              <span className="text-[16px] text-text">
                Pagos sin concepto
                <span className="block text-[14px] text-text-muted">de antes de separar por concepto</span>
              </span>
              <span className="text-[16px] text-text-muted tabular-nums">{formatCentavos(pagadoSinConceptoCentavos)}</span>
            </div>
          )}
        </div>
      )}

      {aPagarCentavos > 0 && pagos.length === 0 && (
        <p className="text-[14px] text-text-muted">Todavía no se registró ningún pago.</p>
      )}

      {pagos.length > 0 && (
        <div className="flex flex-col border-t border-line">
          <h3 className="pt-3 text-[15px] text-text-muted">Pagos registrados</h3>
          <div className="flex flex-col divide-y divide-line">
            {pagos.map((pago) => (
              <Link
                prefetch={false}
                key={pago.id}
                href={`/gastos/${pago.id}`}
                className="flex min-h-14 items-center justify-between gap-3 py-2 text-[16px]"
              >
                <span className="min-w-0 text-text">
                  {etiquetaConceptoPago(pago.concepto_pago, pago.productos?.presentacion_ml) ?? "Pago"}
                  <span className="block text-[14px] text-text-muted">
                    {formatFechaCorta(pago.fecha)} · {MEDIO_PAGO_LABELS[pago.medio_pago]}
                    {!pago.concepto_pago && pago.nota ? ` · ${pago.nota}` : ""}
                  </span>
                </span>
                <span className="shrink-0 font-semibold text-text tabular-nums">
                  {formatCentavos(pago.monto_centavos)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {litrosAceite > 0 && (
        <div className="flex flex-col gap-2 rounded-xl bg-background p-3">
          <span className="text-[16px] text-text">
            Se usaron {formatCantidadConUnidad(litrosAceite, "litro")} de este pedido.
          </span>
          {deudaAceite ? (
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="text-[16px] text-text">
                {restaAceite > 0 ? (
                  <>
                    Le debés al proveedor{" "}
                    <strong className="font-semibold tabular-nums">{formatMonto("USD", debeAceite)}</strong>
                    {" · Resta "}
                    <strong className="font-semibold text-accent tabular-nums">{formatMonto("USD", restaAceite)}</strong>
                  </>
                ) : (
                  "El aceite de este pedido ya está pagado."
                )}
              </span>
              {restaAceite > 0 && deudaAceite.deuda_id && (
                <Link
                  prefetch={false}
                  href={`/plata/deudas/${deudaAceite.deuda_id}/pago`}
                  className="inline-flex min-h-11 items-center text-[15px] font-semibold text-primary underline decoration-mark underline-offset-4"
                >
                  Pagar
                </Link>
              )}
            </div>
          ) : (
            <span className="text-[14px] leading-snug text-text-muted">
              Este pedido no generó una deuda automática con el proveedor: el precio del aceite no se cargó en dólares por
              litro (se usó un precio en pesos o el promedio del depósito).
            </span>
          )}
        </div>
      )}
    </Tarjeta>
  );
}
