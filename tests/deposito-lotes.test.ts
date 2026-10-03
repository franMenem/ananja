import { describe, expect, it } from "vitest";

import { segmentosDeposito, type LoteConQuedan } from "@/lib/dominio/deposito-lotes";

/**
 * Reparto por pedido en Depósito (`v_stock_por_lote.quedan`, ver
 * supabase/migrations/0028_costos_por_lote.sql) — espejo del ejemplo de
 * Fran: "500 ml: 347 en depósito · 20 del pedido 03/09 · 327 del pedido
 * 11/09" (la cifra grande "347 en depósito" la pone `StockCard`, acá solo
 * se testean los segmentos de la línea chica).
 */

const PEDIDO_VIEJO: LoteConQuedan = { loteId: "l1", fecha: "2026-09-03", quedan: 20 };
const PEDIDO_NUEVO: LoteConQuedan = { loteId: "l2", fecha: "2026-09-11", quedan: 327 };

describe("segmentosDeposito", () => {
  it("dos pedidos con stock, del más viejo al más nuevo, cuadra con el total", () => {
    expect(segmentosDeposito([PEDIDO_NUEVO, PEDIDO_VIEJO], 347)).toEqual([
      { texto: "20 del pedido 03/09", loteId: "l1" },
      { texto: "327 del pedido 11/09", loteId: "l2" },
    ]);
  });

  it("un solo pedido que cubre todo el stock: 'todo del pedido D/M'", () => {
    expect(segmentosDeposito([PEDIDO_VIEJO], 20)).toEqual([
      { texto: "todo del pedido 03/09", loteId: "l1" },
    ]);
  });

  it("sin pedidos con stock y stock total 0: nada que mostrar", () => {
    expect(segmentosDeposito([], 0)).toEqual([]);
  });

  it("pedidos con quedan <= 0 no se muestran", () => {
    expect(segmentosDeposito([{ ...PEDIDO_VIEJO, quedan: 0 }, PEDIDO_NUEVO], 327)).toEqual([
      { texto: "todo del pedido 11/09", loteId: "l2" },
    ]);
  });

  it("el total no cuadra con la suma de pedidos: la diferencia va como 'sin pedido asignado', sin link", () => {
    expect(segmentosDeposito([PEDIDO_VIEJO], 35)).toEqual([
      { texto: "20 del pedido 03/09", loteId: "l1" },
      { texto: "15 sin pedido asignado", loteId: null },
    ]);
  });

  it("sin pedidos con stock pero el total no es 0: todo 'sin pedido asignado'", () => {
    expect(segmentosDeposito([], 12)).toEqual([{ texto: "12 sin pedido asignado", loteId: null }]);
  });

  it("un pedido con stock pero no cubre todo el total (no es 'todo')", () => {
    expect(segmentosDeposito([PEDIDO_VIEJO, PEDIDO_NUEVO], 400)).toEqual([
      { texto: "20 del pedido 03/09", loteId: "l1" },
      { texto: "327 del pedido 11/09", loteId: "l2" },
      { texto: "53 sin pedido asignado", loteId: null },
    ]);
  });

  it("la suma de pedidos nunca supera al total: la diferencia se recorta a 0 en vez de mostrarse negativa", () => {
    expect(segmentosDeposito([PEDIDO_VIEJO, PEDIDO_NUEVO], 10)).toEqual([
      { texto: "20 del pedido 03/09", loteId: "l1" },
      { texto: "327 del pedido 11/09", loteId: "l2" },
    ]);
  });
});
