import { notFound } from "next/navigation";

import { PagoLoteForm } from "@/components/stock/pago-lote-form";
import { obtenerPagoLoteForm } from "@/lib/data/lotes";
import { conceptosPagoLote } from "@/lib/dominio/lotes";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * "Registrar pago" de un pedido al proveedor (`/stock/lotes/[id]/pago`): 404 si el lote no existe o
 * ya no tiene nada pendiente (mismo criterio que `/plata/deudas/[id]/pago`
 * con una deuda saldada) — evita registrar un pago sobre un pedido ya
 * cubierto. Desde 0038 el pago se carga por concepto (envasado de cada
 * presentación, transporte, otros) con lo pendiente de
 * `v_saldo_lote_concepto`; los pagos viejos sin concepto solo descuentan
 * del total (`v_saldo_lote`).
 */
export default async function StockLotePagoPage({
  params,
}: PageProps<"/stock/lotes/[id]/pago">) {
  const { id } = await params;
  const supabase = await createClient();

  const { saldo, conceptosRows, items } = await obtenerPagoLoteForm(supabase, id);

  if (!saldo || saldo.saldo_centavos === null || saldo.saldo_centavos <= 0) {
    notFound();
  }

  const conceptos = conceptosPagoLote(
    conceptosRows,
    new Map(items.map((i) => [i.producto_id, i.productos?.presentacion_ml ?? null])),
  );
  const pagadoConConcepto = conceptos.reduce((acc, c) => acc + c.pagadoCentavos, 0);

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <PagoLoteForm
        loteId={id}
        pendienteCentavos={saldo.saldo_centavos}
        conceptos={conceptos}
        pagadoSinConceptoCentavos={Math.max((saldo.pagado_centavos ?? 0) - pagadoConConcepto, 0)}
      />
    </div>
  );
}
