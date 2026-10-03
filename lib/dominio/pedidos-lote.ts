/**
 * Espejo puro (sin Supabase) de la tarjeta de pedido de `/stock/lotes`
 *: una tarjeta por lote,
 * con el costo Ananja de cada presentación en el orden de sus ítems y UN
 * chip de estado ("Falta pagar $X" / "Pagado" / "Sin costos"). Reemplaza
 * la tabla comparativa vieja (con "% vs anterior" y "sugeridos").
 */

import { formatCentavos } from "@/lib/money";
import type { Tables } from "@/lib/types";

/** Un ítem de `v_costo_lote.items` (JSON) — una presentación de un pedido. */
export type ItemLoteRow = {
  producto_id: string;
  producto_nombre: string;
  presentacion_ml: number;
  cantidad: number;
};

/** `v_costo_lote.items` es `json`, no un array tipado — mismo cast en
 * `/stock/lotes` y `/stock/lotes/[id]`. */
export function itemsDeLote(lote: Pick<Tables<"v_costo_lote">, "items">): ItemLoteRow[] {
  return Array.isArray(lote.items) ? (lote.items as unknown as ItemLoteRow[]) : [];
}

export interface ItemPedidoInput {
  productoId: string;
  presentacionMl: number;
  cantidad: number;
}

export interface PedidoInput {
  loteId: string;
  fecha: string;
  items: ItemPedidoInput[];
}

/** Costo Ananja + si tiene costos cargados, de un lote+producto (mismo
 * criterio que el detalle del lote: `tieneCostos` manda, no `!= null` —
 * una presentación sin costos igual trae `costo_ananja_centavos = 0` de
 * la vista). */
export interface DesgloseLoteProducto {
  costoAnanjaCentavos: number | null;
  /** 0054_costo_ananja_redondeado.sql: el calculado SIN redondear — para
   * mostrarlo en chico en la tarjeta cuando difiere de `costoAnanjaCentavos`
   * (que ya es el efectivo: redondeado si se cargó uno, si no el
   * calculado). `null`: mismo criterio que `costoAnanjaCentavos`, sin
   * costos cargados. */
  costoAnanjaCalculadoCentavos: number | null;
  tieneCostos: boolean;
}

export type EstadoPedido =
  | { tipo: "sin-costos"; label: string }
  | { tipo: "pagado"; label: string }
  | { tipo: "falta"; label: string };

/** Chip de estado de un pedido: sin costos cargados manda por sobre el
 * saldo (un lote sin costos siempre tiene `a_pagar = 0` en `v_saldo_lote`,
 * que se leería como "Pagado" si no se chequea `tieneCostos` primero). */
export function estadoPedido(input: {
  tieneCostos: boolean;
  saldoCentavos: number;
}): EstadoPedido {
  if (!input.tieneCostos) {
    return { tipo: "sin-costos", label: "Sin costos" };
  }
  if (input.saldoCentavos > 0) {
    return { tipo: "falta", label: `Falta pagar ${formatCentavos(input.saldoCentavos)}` };
  }
  return { tipo: "pagado", label: "Pagado" };
}

export interface PedidoItemVM {
  /** Para volver a buscar el ítem crudo del lote (`v_costo_lote.items`) por
   * id en vez de por posición — dos lotes con la misma cantidad de ítems
   * pero en otro orden no deben desalinearse (`/stock/lotes`). */
  productoId: string;
  presentacionMl: number;
  cantidad: number;
  /** `null` cuando esa presentación todavía no tiene costos cargados. */
  costoAnanjaCentavos: number | null;
  /** Ver `DesgloseLoteProducto.costoAnanjaCalculadoCentavos`. */
  costoAnanjaCalculadoCentavos: number | null;
}

export interface PedidoCardVM {
  loteId: string;
  fecha: string;
  items: PedidoItemVM[];
  estado: EstadoPedido;
}

/**
 * Arma una tarjeta por pedido: el costo Ananja de cada ítem en el mismo
 * orden en el que vienen los ítems del lote, y el chip de estado a partir
 * de si ALGUNA presentación ya tiene costos y el saldo pendiente total del
 * lote (`v_saldo_lote`).
 */
export function construirPedidosCards(input: {
  lotes: PedidoInput[];
  desglosePorLoteProducto: Map<string, DesgloseLoteProducto>;
  saldoPorLote: Map<string, number>;
}): PedidoCardVM[] {
  return input.lotes.map((lote) => {
    const items: PedidoItemVM[] = lote.items.map((item) => {
      const d = input.desglosePorLoteProducto.get(`${lote.loteId}:${item.productoId}`);
      return {
        productoId: item.productoId,
        presentacionMl: item.presentacionMl,
        cantidad: item.cantidad,
        costoAnanjaCentavos: d?.tieneCostos ? (d.costoAnanjaCentavos ?? null) : null,
        costoAnanjaCalculadoCentavos: d?.tieneCostos ? (d.costoAnanjaCalculadoCentavos ?? null) : null,
      };
    });
    const tieneCostos = items.some((i) => i.costoAnanjaCentavos !== null);
    return {
      loteId: lote.loteId,
      fecha: lote.fecha,
      items,
      estado: estadoPedido({
        tieneCostos,
        saldoCentavos: input.saldoPorLote.get(lote.loteId) ?? 0,
      }),
    };
  });
}

// ============================================================
// Bloque "BOTELLAS" del detalle de un pedido (/stock/lotes/[id]).
// ============================================================

export interface FilaCobranzaLote {
  producidas: number;
  enDeposito: number;
  vendidas: number;
  perdidas: number;
  esperadoTotalCentavos: number;
  esperadoPorVendidasCentavos: number;
}

export interface CobranzaPedido {
  producidas: number;
  enDeposito: number;
  vendidas: number;
  perdidas: number;
  esperadoTotalCentavos: number;
  esperadoPorVendidasCentavos: number;
}

/** Suma las filas de `v_cobranza_lote` (una por presentación) de UN pedido
 * en los totales del bloque "Botellas" del detalle — el pedido responde
 * "cuánto costó" por presentación (bloque "Costo por botella") pero
 * "cuántas botellas" de un vistazo, sumadas entre todas sus presentaciones. */
export function sumarCobranzaLote(filas: FilaCobranzaLote[]): CobranzaPedido {
  return filas.reduce(
    (acc, f) => ({
      producidas: acc.producidas + f.producidas,
      enDeposito: acc.enDeposito + f.enDeposito,
      vendidas: acc.vendidas + f.vendidas,
      perdidas: acc.perdidas + f.perdidas,
      esperadoTotalCentavos: acc.esperadoTotalCentavos + f.esperadoTotalCentavos,
      esperadoPorVendidasCentavos: acc.esperadoPorVendidasCentavos + f.esperadoPorVendidasCentavos,
    }),
    {
      producidas: 0,
      enDeposito: 0,
      vendidas: 0,
      perdidas: 0,
      esperadoTotalCentavos: 0,
      esperadoPorVendidasCentavos: 0,
    },
  );
}

// ============================================================
// Pérdidas por motivo del `<details>` legado del detalle de un pedido.
// ============================================================

export interface FilaPerdidaLote {
  motivo: string | null;
  unidades: number | null;
  costo_total_centavos: number | null;
}

export interface PerdidaPorMotivo {
  motivo: string;
  unidades: number;
  costoCentavos: number;
}

/** Agrupa las filas de `v_perdidas_lote` (una por lote+producto+motivo) de
 * UN pedido en un total por motivo, sumado entre presentaciones. */
export function agruparPerdidasPorMotivo(filas: FilaPerdidaLote[]): PerdidaPorMotivo[] {
  const porMotivo = new Map<string, PerdidaPorMotivo>();
  for (const fila of filas) {
    if (!fila.motivo) continue;
    const actual = porMotivo.get(fila.motivo) ?? { motivo: fila.motivo, unidades: 0, costoCentavos: 0 };
    actual.unidades += fila.unidades ?? 0;
    actual.costoCentavos += fila.costo_total_centavos ?? 0;
    porMotivo.set(fila.motivo, actual);
  }
  return Array.from(porMotivo.values());
}
