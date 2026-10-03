import { describe, expect, it } from "vitest";

import {
  atribuirVenta,
  costoTotalVenta,
  gananciaVenta,
  lotesConStockRevendedora,
  revisarVentasAdmin,
  stockPorEntrega,
  vendeBajoCosto,
  type EntregaItemFifo,
  type VentaFifo,
} from "@/lib/dominio/revendedor-stock";

/**
 * Espejo de `stock_revendedor_por_entrega` / `registrar_venta_revendedor`
 * (supabase/migrations/0040_revendedores_pagos_precios.sql § 2): stock por
 * entrega y reparto FIFO de una venta con el costo de cada entrega.
 */

function item(parcial: Partial<EntregaItemFifo> & { id: string }): EntregaItemFifo {
  return {
    entregaId: `e-${parcial.id}`,
    tipo: "entrega",
    fecha: "2026-09-01",
    createdAt: "2026-09-01T10:00:00+00:00",
    productoId: "p500",
    loteId: "lote-a",
    cantidad: 10,
    costoAnanjaUnitarioCentavos: 1000000,
    precioSugeridoCentavos: 1600000,
    ...parcial,
  };
}

const venta = (parcial: Partial<VentaFifo>): VentaFifo => ({
  productoId: "p500",
  cantidad: 1,
  entregaItemId: null,
  ...parcial,
});

describe("stockPorEntrega", () => {
  it("sin ventas ni devoluciones, cada entrega conserva lo entregado", () => {
    const tramos = stockPorEntrega([item({ id: "i1", cantidad: 12 })], []);
    expect(tramos).toHaveLength(1);
    expect(tramos[0]).toMatchObject({ entregaItemId: "i1", entregado: 12, quedan: 12 });
  });

  it("ordena por fecha, después por created_at y después por id", () => {
    const tramos = stockPorEntrega(
      [
        item({ id: "i3", fecha: "2026-09-05" }),
        item({ id: "i2", fecha: "2026-09-01", createdAt: "2026-09-01T12:00:00+00:00" }),
        item({ id: "i1b", fecha: "2026-09-01", createdAt: "2026-09-01T10:00:00+00:00" }),
        item({ id: "i1a", fecha: "2026-09-01", createdAt: "2026-09-01T10:00:00+00:00" }),
      ],
      [],
    );
    expect(tramos.map((t) => t.entregaItemId)).toEqual(["i1a", "i1b", "i2", "i3"]);
  });

  it("una venta ya atribuida resta de su propia entrega, no de la más vieja", () => {
    const tramos = stockPorEntrega(
      [item({ id: "vieja", fecha: "2026-09-01" }), item({ id: "nueva", fecha: "2026-09-02" })],
      [venta({ cantidad: 4, entregaItemId: "nueva" })],
    );
    expect(tramos.map((t) => t.quedan)).toEqual([10, 6]);
  });

  it("ventas viejas sin atribución se descuentan de la entrega más vieja primero", () => {
    const tramos = stockPorEntrega(
      [
        item({ id: "a", fecha: "2026-09-01", cantidad: 3 }),
        item({ id: "b", fecha: "2026-09-02", cantidad: 5 }),
      ],
      [venta({ cantidad: 4 })],
    );
    expect(tramos.map((t) => t.quedan)).toEqual([0, 4]);
  });

  it("una devolución con lote sale de ese lote, de la entrega más nueva a la más vieja", () => {
    const tramos = stockPorEntrega(
      [
        item({ id: "a1", fecha: "2026-09-01", loteId: "lote-a", cantidad: 5 }),
        item({ id: "b1", fecha: "2026-09-02", loteId: "lote-b", cantidad: 5 }),
        item({ id: "a2", fecha: "2026-09-03", loteId: "lote-a", cantidad: 2 }),
        item({ id: "dev", tipo: "devolucion", fecha: "2026-09-04", loteId: "lote-a", cantidad: 4 }),
      ],
      [],
    );
    // a2 (más nueva de lote-a) queda en 0, a1 pierde 2; b1 intacta
    expect(tramos.map((t) => [t.entregaItemId, t.quedan])).toEqual([
      ["a1", 3],
      ["b1", 5],
      ["a2", 0],
    ]);
  });

  it("lo que una devolución con lote no cubre en su lote sale de la entrega más nueva", () => {
    const tramos = stockPorEntrega(
      [
        item({ id: "a1", fecha: "2026-09-01", loteId: "lote-a", cantidad: 2 }),
        item({ id: "b1", fecha: "2026-09-02", loteId: "lote-b", cantidad: 5 }),
        item({ id: "dev", tipo: "devolucion", fecha: "2026-09-04", loteId: "lote-a", cantidad: 3 }),
      ],
      [],
    );
    expect(tramos.map((t) => t.quedan)).toEqual([0, 4]);
  });

  it("una devolución sin lote sale de la entrega más nueva primero", () => {
    const tramos = stockPorEntrega(
      [
        item({ id: "a", fecha: "2026-09-01", cantidad: 5 }),
        item({ id: "b", fecha: "2026-09-02", cantidad: 3 }),
        item({ id: "dev", tipo: "devolucion", loteId: null, fecha: "2026-09-03", cantidad: 4 }),
      ],
      [],
    );
    expect(tramos.map((t) => t.quedan)).toEqual([4, 0]);
  });

  it("nunca deja un tramo en negativo aunque las ventas atribuidas lo superen", () => {
    const tramos = stockPorEntrega(
      [item({ id: "a", cantidad: 2 })],
      [venta({ cantidad: 5, entregaItemId: "a" })],
    );
    expect(tramos[0].quedan).toBe(0);
  });

  it("separa productos: la venta de uno no toca el stock del otro", () => {
    const tramos = stockPorEntrega(
      [item({ id: "a", productoId: "p500" }), item({ id: "b", productoId: "p1000" })],
      [venta({ productoId: "p1000", cantidad: 3 })],
    );
    const porItem = Object.fromEntries(tramos.map((t) => [t.entregaItemId, t.quedan]));
    expect(porItem).toEqual({ a: 10, b: 7 });
  });
});

describe("atribuirVenta", () => {
  const stock = stockPorEntrega(
    [
      item({ id: "vieja", fecha: "2026-09-01", cantidad: 5, costoAnanjaUnitarioCentavos: 1000000 }),
      item({
        id: "nueva",
        fecha: "2026-09-10",
        loteId: "lote-b",
        cantidad: 5,
        costoAnanjaUnitarioCentavos: 1200000,
        precioSugeridoCentavos: 1900000,
      }),
    ],
    [venta({ cantidad: 2, entregaItemId: "vieja" })],
  );

  it("una venta que entra en la entrega más vieja queda en un solo tramo", () => {
    const { tramos, faltante } = atribuirVenta(stock, "p500", 3, null);
    expect(faltante).toBe(0);
    expect(tramos).toEqual([
      expect.objectContaining({ entregaItemId: "vieja", cantidad: 3, costoUnitarioCentavos: 1000000 }),
    ]);
  });

  it("una venta que cruza dos entregas se parte con el costo de cada una", () => {
    const { tramos, faltante } = atribuirVenta(stock, "p500", 5, null);
    expect(faltante).toBe(0);
    expect(tramos.map((t) => [t.entregaItemId, t.cantidad, t.costoUnitarioCentavos])).toEqual([
      ["vieja", 3, 1000000],
      ["nueva", 2, 1200000],
    ]);
    expect(costoTotalVenta(tramos)).toBe(3 * 1000000 + 2 * 1200000);
    expect(gananciaVenta(tramos, 1500000)).toBe(5 * 1500000 - (3 * 1000000 + 2 * 1200000));
  });

  it("avisa cuando el precio queda bajo el costo de algún tramo", () => {
    const { tramos } = atribuirVenta(stock, "p500", 5, null);
    expect(vendeBajoCosto(tramos, 1100000)).toBe(true);
    expect(vendeBajoCosto(tramos, 1200000)).toBe(false);
  });

  it("pedir más de lo que tiene deja un faltante", () => {
    const { tramos, faltante } = atribuirVenta(stock, "p500", 10, null);
    expect(tramos.reduce((acc, t) => acc + t.cantidad, 0)).toBe(8);
    expect(faltante).toBe(2);
  });

  it("una entrega sin costo aprobado usa el precio revendedor manual", () => {
    const legado = stockPorEntrega([item({ id: "l", costoAnanjaUnitarioCentavos: null })], []);
    const { tramos } = atribuirVenta(legado, "p500", 2, 900000);
    expect(tramos[0].costoUnitarioCentavos).toBe(900000);
    expect(costoTotalVenta(tramos)).toBe(1800000);
  });

  // 0062_venta_revendedor_elegir_lote.sql: elegir lote en vez de FIFO puro.
  describe("con loteId (0062)", () => {
    it("sin loteId (undefined/null) es EXACTAMENTE el mismo FIFO de siempre", () => {
      const sinLote = atribuirVenta(stock, "p500", 5, null);
      expect(atribuirVenta(stock, "p500", 5, null, undefined, undefined)).toEqual(sinLote);
      expect(atribuirVenta(stock, "p500", 5, null, undefined, null)).toEqual(sinLote);
    });

    it("restringe el reparto a los tramos del lote elegido, aunque otro lote tenga stock de sobra", () => {
      // "vieja" es lote-a (3 quedan) y "nueva" es lote-b (5 quedan). Pide 3
      // del lote-b: no toca lote-a aunque sea el más viejo (FIFO lo haría).
      const { tramos, faltante } = atribuirVenta(stock, "p500", 3, null, undefined, "lote-b");
      expect(faltante).toBe(0);
      expect(tramos).toEqual([
        expect.objectContaining({ entregaItemId: "nueva", loteId: "lote-b", cantidad: 3, costoUnitarioCentavos: 1200000 }),
      ]);
    });

    it("pedir más de lo que tiene ESE lote deja faltante, aunque el total entre lotes alcance", () => {
      // lote-a solo tiene 3; el total (lote-a + lote-b) sería 8, pero acá
      // no puede cruzar a lote-b.
      const { tramos, faltante } = atribuirVenta(stock, "p500", 4, null, undefined, "lote-a");
      expect(tramos.reduce((acc, t) => acc + t.cantidad, 0)).toBe(3);
      expect(faltante).toBe(1);
    });
  });

  it("sin costo aprobado ni precio manual, el costo queda sin resolver", () => {
    const legado = stockPorEntrega([item({ id: "l", costoAnanjaUnitarioCentavos: null })], []);
    const { tramos } = atribuirVenta(legado, "p500", 2, null);
    expect(costoTotalVenta(tramos)).toBeNull();
    expect(gananciaVenta(tramos, 1000)).toBeNull();
    expect(vendeBajoCosto(tramos, 1)).toBe(false);
  });
});

describe("revisarVentasAdmin (venta cargada por un admin, mismo reparto que la de la revendedora)", () => {
  const stock = stockPorEntrega(
    [
      item({ id: "vieja", fecha: "2026-09-01", cantidad: 5, costoAnanjaUnitarioCentavos: 1000000 }),
      item({ id: "nueva", fecha: "2026-09-10", cantidad: 5, costoAnanjaUnitarioCentavos: 1200000 }),
      item({ id: "otro", productoId: "p1000", cantidad: 4, costoAnanjaUnitarioCentavos: null }),
    ],
    [],
  );

  it("atribuye cada fila exactamente como atribuirVenta (el camino de la revendedora)", () => {
    const [revisada] = revisarVentasAdmin(
      stock,
      [{ productoId: "p500", cantidad: 7, precioVentaCentavos: 1500000 }],
      {},
    );
    expect(revisada.tramos).toEqual(atribuirVenta(stock, "p500", 7, null).tramos);
    expect(revisada.costoCentavos).toBe(5 * 1000000 + 2 * 1200000);
    expect(revisada.gananciaCentavos).toBe(7 * 1500000 - (5 * 1000000 + 2 * 1200000));
  });

  it("sin precio de venta: la deuda se calcula igual y la ganancia queda sin resolver", () => {
    const [revisada] = revisarVentasAdmin(
      stock,
      [{ productoId: "p500", cantidad: 3, precioVentaCentavos: null }],
      {},
    );
    expect(revisada.costoCentavos).toBe(3 * 1000000);
    expect(revisada.gananciaCentavos).toBeNull();
  });

  it("una venta fechada antes de una entrega de la que tomaría botellas queda marcada (los dos caminos)", () => {
    // stock: 5 de la entrega del 01/09 y 5 de la del 10/09
    const deLaRevendedora = atribuirVenta(stock, "p500", 7, null, "2026-09-05");
    expect(deLaRevendedora.entregaPosterior).toBe("2026-09-10");
    const [delAdmin] = revisarVentasAdmin(
      stock,
      [{ productoId: "p500", cantidad: 7, precioVentaCentavos: null }],
      {},
      "2026-09-05",
    );
    expect(delAdmin.entregaPosterior).toBe("2026-09-10");
    // si solo toma de la entrega vieja, no hay problema
    expect(atribuirVenta(stock, "p500", 5, null, "2026-09-05").entregaPosterior).toBeNull();
    // misma fecha que la entrega: permitido
    expect(atribuirVenta(stock, "p500", 7, null, "2026-09-10").entregaPosterior).toBeNull();
    // sin fecha: no se chequea
    expect(atribuirVenta(stock, "p500", 7, null).entregaPosterior).toBeNull();
  });

  it("ignora filas en 0, usa el precio manual como respaldo y marca faltantes", () => {
    const revisadas = revisarVentasAdmin(
      stock,
      [
        { productoId: "p500", cantidad: 0, precioVentaCentavos: null },
        { productoId: "p1000", cantidad: 6, precioVentaCentavos: 2000000 },
      ],
      { p1000: 1500000 },
    );
    expect(revisadas).toHaveLength(1);
    expect(revisadas[0].faltante).toBe(2);
    expect(revisadas[0].costoCentavos).toBe(4 * 1500000);
  });
});

// 0062_venta_revendedor_elegir_lote.sql § selector de lote en "Cargar
// movimiento" § Ventas.
describe("lotesConStockRevendedora", () => {
  it("agrupa por lote y suma quedan de varios tramos del mismo lote", () => {
    const tramos = stockPorEntrega(
      [
        item({ id: "a1", fecha: "2026-09-01", loteId: "lote-a", cantidad: 5 }),
        item({ id: "a2", fecha: "2026-09-03", loteId: "lote-a", cantidad: 4 }),
        item({ id: "b1", fecha: "2026-09-02", loteId: "lote-b", cantidad: 6 }),
      ],
      [],
    );
    const lotes = lotesConStockRevendedora(tramos, "p500");
    expect(lotes).toEqual([
      { loteId: "lote-a", fecha: "2026-09-01", quedan: 9 },
      { loteId: "lote-b", fecha: "2026-09-02", quedan: 6 },
    ]);
  });

  it("ignora tramos sin lote y en 0, y otros productos", () => {
    const tramos = stockPorEntrega(
      [
        item({ id: "sin-lote", loteId: null, cantidad: 3 }),
        item({ id: "agotado", loteId: "lote-c", cantidad: 2 }),
        item({ id: "otro-producto", productoId: "p1000", loteId: "lote-d", cantidad: 5 }),
      ],
      [venta({ cantidad: 2, entregaItemId: "agotado" })],
    );
    expect(lotesConStockRevendedora(tramos, "p500")).toEqual([]);
    expect(lotesConStockRevendedora(tramos, "p1000")).toEqual([
      { loteId: "lote-d", fecha: "2026-09-01", quedan: 5 },
    ]);
  });
});
