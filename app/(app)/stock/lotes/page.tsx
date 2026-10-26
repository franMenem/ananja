import Link from "next/link";

import { FilaPedido } from "@/components/stock/pedido/fila-pedido";
import { BOTON_SECUNDARIO } from "@/components/ui/boton";
import { EncabezadoPantalla } from "@/components/ui/encabezado-pantalla";
import { ListaTarjeta } from "@/components/ui/fila";
import { obtenerListaLotes } from "@/lib/data/lotes";
import { resumenStockLote, totalEnManosPorLoteProducto } from "@/lib/dominio/lote-en-manos";
import {
  construirPedidosCards,
  itemsDeLote,
  type DesgloseLoteProducto,
  type PedidoInput,
} from "@/lib/dominio/pedidos-lote";
import { leerFormasProveedor } from "@/lib/proveedor-servidor";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * "Pedidos": responde "¿qué le pedimos al proveedor y cuánto falta pagar?".
 * Una fila por pedido, con UNA pastilla de estado (falta pagar / sin costos /
 * pagado) calculada por `construirPedidosCards` (`lib/dominio/pedidos-lote.ts`)
 * a partir del costo vigente (`v_costo_lote_vigente`, 0052) y del saldo
 * (`v_saldo_lote`). Los costos por presentación, lo que cambió contra el
 * pedido anterior y el cálculo viven en el detalle (`/stock/lotes/[id]`).
 */
export default async function StockLotesPage() {
  const supabase = await createClient();

  const [{ lotesRows, error, vigente, saldos, stockPorLote, enManosFilas }, proveedor] = await Promise.all([
    obtenerListaLotes(supabase),
    leerFormasProveedor(),
  ]);

  const lotes: PedidoInput[] = (lotesRows ?? []).map((lote) => ({
    loteId: lote.lote_id ?? "",
    fecha: lote.fecha ?? "",
    items: itemsDeLote(lote).map((item) => ({
      productoId: item.producto_id,
      presentacionMl: item.presentacion_ml,
      cantidad: item.cantidad,
    })),
  }));

  const desglosePorLoteProducto = new Map<string, DesgloseLoteProducto>(
    (vigente ?? []).map((d) => [
      `${d.lote_id}:${d.producto_id}`,
      {
        costoAnanjaCentavos: d.costo_ananja_centavos,
        costoAnanjaCalculadoCentavos: d.costo_ananja_calculado_centavos,
        tieneCostos: d.tiene_costos ?? false,
      },
    ]),
  );
  const saldoPorLote = new Map((saldos ?? []).map((s) => [s.lote_id ?? "", s.saldo_centavos ?? 0]));
  const pedidos = construirPedidosCards({ lotes, desglosePorLoteProducto, saldoPorLote });

  // Cuánto queda sin vender de cada pedido: depósito + en manos de revendedoras.
  const enManosPorLoteProducto = totalEnManosPorLoteProducto(enManosFilas);
  const quedanPorLoteProducto = new Map(
    (stockPorLote ?? []).map((s) => [`${s.lote_id}:${s.producto_id}`, s.quedan ?? 0]),
  );
  function sinVenderDe(loteId: string, productoIds: string[]): number | null {
    let total = 0;
    for (const productoId of productoIds) {
      const resumen = resumenStockLote(
        quedanPorLoteProducto.get(`${loteId}:${productoId}`) ?? null,
        enManosPorLoteProducto.get(`${loteId}:${productoId}`) ?? 0,
      );
      total += resumen.totalSinVender ?? 0;
    }
    return total;
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-6 pb-8">
      <EncabezadoPantalla
        titulo="Pedidos"
        pregunta={`¿Qué le pedimos ${proveedor.a} y cuánto falta pagar?`}
        acciones={
          <Link prefetch={false} href="/stock/lotes/nuevo" className={`${BOTON_SECUNDARIO} flex px-4`}>
            + Nuevo pedido
          </Link>
        }
      />

      {error && (
        <p role="alert" className="text-[16px] text-accent">
          No se pudo cargar el historial de pedidos.
        </p>
      )}

      {!error && pedidos.length === 0 && (
        <p className="text-[16px] text-text-muted">
          Todavía no hay pedidos registrados. &ldquo;+ Nuevo pedido&rdquo; crea el primero.
        </p>
      )}

      {pedidos.length > 0 && (
        <ListaTarjeta>
          {pedidos.map((pedido) => (
            <FilaPedido
              key={pedido.loteId}
              loteId={pedido.loteId}
              fecha={pedido.fecha}
              items={pedido.items}
              sinVender={sinVenderDe(
                pedido.loteId,
                pedido.items.map((i) => i.productoId),
              )}
              estado={pedido.estado}
            />
          ))}
        </ListaTarjeta>
      )}
    </div>
  );
}
