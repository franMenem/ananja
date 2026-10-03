import Link from "next/link";
import { notFound } from "next/navigation";

import { SetFormHeader } from "@/components/page-header-context";
import { BotellasPedido } from "@/components/stock/pedido/botellas-pedido";
import { CostoPorBotella } from "@/components/stock/pedido/costo-por-botella";
import { DetalleLegado } from "@/components/stock/pedido/detalle-legado";
import { PagoPedido } from "@/components/stock/pedido/pago-pedido";
import { obtenerDetalleLote } from "@/lib/data/lotes";
import { formatFecha } from "@/lib/fechas";
import { enManosDeLote } from "@/lib/dominio/lote-en-manos";
import { conceptosPagoLote } from "@/lib/dominio/lotes";
import { agruparPerdidasPorMotivo, itemsDeLote, sumarCobranzaLote } from "@/lib/dominio/pedidos-lote";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * "Pedido del {fecha}": responde
 * "¿cuánto me costó cada botella y qué falta?" en 4 bloques (Costo por
 * botella, Pago, Botellas, y un `<details>` con pérdidas por motivo +
 * gastos legado) — cada uno en `components/stock/pedido/*`. Esta página
 * solo carga los datos y los compone.
 */
export default async function StockLoteDetallePage({
  params,
}: PageProps<"/stock/lotes/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  // Las ~17 consultas de esta pantalla (todas independientes entre sí, en
  // UN `Promise.all`) viven en `lib/data/lotes.ts` § `obtenerDetalleLote`.
  const {
    lote,
    loteProduccion,
    desglose,
    costosFilas,
    saldo,
    stockPorLote,
    pagos,
    gastosLegacy,
    cobranzaFilas,
    perdidas,
    saldoConceptos,
    enManosFilas,
    enManosError,
    vendedores,
    deudaAceite,
    vigente,
    valoraciones,
  } = await obtenerDetalleLote(supabase, id);

  if (!lote) {
    notFound();
  }

  const items = itemsDeLote(lote);
  const titulo = lote.fecha ? `Pedido del ${formatFecha(lote.fecha)}` : "Pedido";

  const tieneCostos = (desglose ?? []).some((d) => d.tiene_costos);

  // "0 en depósito" (aviso de CostoPorBotella junto a "Actualizar costos
  // del depósito" — actualizar el costo no cambiaría nada de lo ya
  // entregado o vendido).
  const enDepositoTotal = (stockPorLote ?? []).reduce((acc, s) => acc + (s.quedan ?? 0), 0);

  // Litros de aceite usados por este pedido, sumados entre TODAS las
  // presentaciones (lote_costos, concepto 'aceite') — mismo dato del que
  // sale la deuda automática con el proveedor (v_deuda_aceite_lote).
  const litrosAceite = (costosFilas ?? [])
    .filter((f) => f.concepto === "aceite")
    .reduce((acc, f) => acc + (f.cantidad ?? 0), 0);

  const aPagar = saldo?.a_pagar_centavos ?? 0;
  const pagado = saldo?.pagado_centavos ?? 0;
  const pendiente = saldo?.saldo_centavos ?? 0;
  const ivaPct = loteProduccion?.iva_pct ?? 21;
  const incluyeIva = loteProduccion?.precios_incluyen_iva ?? true;
  const envaseSinIva = loteProduccion?.envase_cobrado_sin_iva ?? false;

  // Pago por concepto (0038, v_saldo_lote_concepto). Los pagos viejos sin
  // concepto solo cuentan en el total (v_saldo_lote) — se muestran aparte.
  const conceptosPago = conceptosPagoLote(
    saldoConceptos ?? [],
    new Map(items.map((i) => [i.producto_id, i.presentacion_ml])),
  );
  const pagadoSinConcepto = Math.max(
    pagado - conceptosPago.reduce((acc, c) => acc + c.pagadoCentavos, 0),
    0,
  );

  // "Botellas": todo sumado entre presentaciones (v_cobranza_lote ya trae
  // producidas/vendidas/pérdidas/en depósito y lo esperado de cobro por
  // presentación — ver lib/pedidos-lote.ts § sumarCobranzaLote).
  const cobranza = sumarCobranzaLote(
    (cobranzaFilas ?? []).map((c) => ({
      producidas: c.producidas ?? 0,
      enDeposito: c.en_deposito ?? 0,
      vendidas: c.vendidas ?? 0,
      perdidas: c.perdidas ?? 0,
      esperadoTotalCentavos: c.esperado_total_centavos ?? 0,
      esperadoPorVendidasCentavos: c.esperado_por_vendidas_centavos ?? 0,
    })),
  );

  // Pérdidas (degustación/rotura/regalo/ajuste/otro) — agrupadas por
  // motivo, sumadas entre presentaciones (v_perdidas_lote ya viene por
  // lote+producto+motivo, lib/pedidos-lote.ts § agruparPerdidasPorMotivo).
  const perdidasPorMotivo = agruparPerdidasPorMotivo(perdidas ?? []);

  // "En manos de revendedoras": lo que cada una todavía tiene de ESTE lote.
  const enManos = enManosDeLote(
    enManosFilas,
    id,
    new Map((vendedores ?? []).map((v) => [v.id, v.nombre])),
    new Map(
      items.map((i) => [
        i.producto_id,
        { nombre: i.producto_nombre, presentacionMl: i.presentacion_ml },
      ]),
    ),
  );

  return (
    <div className="mx-auto w-full max-w-[760px]">
      <div className="flex flex-col gap-6 pb-8">
        <SetFormHeader title={titulo} backHref="/stock/lotes" backLabel="Volver a pedidos" />
        <div className="hidden items-center gap-3 lg:flex">
          <Link
            href="/stock/lotes"
            aria-label="Volver a pedidos"
            className="flex min-h-11 min-w-11 items-center justify-center text-[22px] leading-none text-primary"
          >
            ←
          </Link>
          <h1 className="font-display text-[22px] text-primary">{titulo}</h1>
        </div>

        {lote.nota && <p className="text-[13px] text-text-muted">{lote.nota}</p>}

        <CostoPorBotella
          pedidoId={id}
          tieneCostos={tieneCostos}
          desglose={desglose ?? []}
          costosFilas={costosFilas ?? []}
          ivaPct={ivaPct}
          incluyeIva={incluyeIva}
          envaseSinIva={envaseSinIva}
          transportePctLote={loteProduccion?.transporte_pct ?? null}
          vigente={vigente ?? []}
          enDepositoTotal={enDepositoTotal}
          valoraciones={valoraciones ?? []}
        />

        <PagoPedido
          pedidoId={id}
          aPagarCentavos={aPagar}
          pagadoCentavos={pagado}
          pendienteCentavos={pendiente}
          pagos={pagos ?? []}
          conceptosPago={conceptosPago}
          pagadoSinConceptoCentavos={pagadoSinConcepto}
          deudaAceite={deudaAceite}
          litrosAceite={litrosAceite}
        />

        {enManosError && (
          <p role="alert" className="text-[13px] text-accent">
            {enManosError}
          </p>
        )}

        <BotellasPedido
          cobranza={cobranza}
          personasEnManos={enManos.personas}
          totalEnManos={enManos.total}
        />

        <DetalleLegado perdidasPorMotivo={perdidasPorMotivo} gastosLegacy={gastosLegacy ?? []} />
      </div>
    </div>
  );
}
