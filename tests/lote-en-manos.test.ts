import { describe, expect, it } from "vitest";

import {
  enManosDeLote,
  formatProductosEnManos,
  resumenStockLote,
  stockRevendedorasPorLote,
  totalEnManosPorLoteProducto,
  type EntregaItemVendedor,
  type VentaVendedor,
} from "@/lib/dominio/lote-en-manos";

/**
 * Botellas de cada lote en manos de revendedoras — mismo reparto por
 * entrega que `stockPorEntrega` (0040), sumado por revendedora/lote/producto.
 */

function item(parcial: Partial<EntregaItemVendedor> & { id: string }): EntregaItemVendedor {
  return {
    vendedorId: "martin",
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

const venta = (parcial: Partial<VentaVendedor>): VentaVendedor => ({
  vendedorId: "martin",
  productoId: "p500",
  cantidad: 1,
  entregaItemId: null,
  ...parcial,
});

describe("stockRevendedorasPorLote", () => {
  it("suma las entregas del mismo lote y producto de una revendedora", () => {
    const filas = stockRevendedorasPorLote(
      [item({ id: "i1", cantidad: 13 }), item({ id: "i2", cantidad: 13, fecha: "2026-09-02" })],
      [],
    );
    expect(filas).toEqual([
      { vendedorId: "martin", loteId: "lote-a", productoId: "p500", enPoder: 26 },
    ]);
  });

  it("descuenta ventas FIFO: se vacía primero el lote más viejo", () => {
    const filas = stockRevendedorasPorLote(
      [
        item({ id: "i1", cantidad: 10, loteId: "lote-a" }),
        item({ id: "i2", cantidad: 10, loteId: "lote-b", fecha: "2026-09-05" }),
      ],
      [venta({ cantidad: 12 })],
    );
    expect(filas).toEqual([
      { vendedorId: "martin", loteId: "lote-b", productoId: "p500", enPoder: 8 },
    ]);
  });

  it("respeta ventas ya atribuidas a un ítem de entrega", () => {
    const filas = stockRevendedorasPorLote(
      [
        item({ id: "i1", cantidad: 10, loteId: "lote-a" }),
        item({ id: "i2", cantidad: 10, loteId: "lote-b", fecha: "2026-09-05" }),
      ],
      [venta({ cantidad: 4, entregaItemId: "i2" })],
    );
    expect(filas).toEqual([
      { vendedorId: "martin", loteId: "lote-a", productoId: "p500", enPoder: 10 },
      { vendedorId: "martin", loteId: "lote-b", productoId: "p500", enPoder: 6 },
    ]);
  });

  it("una devolución con lote sale de ese lote, aunque haya uno más nuevo", () => {
    const filas = stockRevendedorasPorLote(
      [
        item({ id: "i1", cantidad: 10, loteId: "lote-a" }),
        item({ id: "i2", cantidad: 10, loteId: "lote-b", fecha: "2026-09-05" }),
        item({ id: "d1", tipo: "devolucion", cantidad: 3, loteId: "lote-a", fecha: "2026-09-06" }),
      ],
      [],
    );
    expect(filas).toEqual([
      { vendedorId: "martin", loteId: "lote-a", productoId: "p500", enPoder: 7 },
      { vendedorId: "martin", loteId: "lote-b", productoId: "p500", enPoder: 10 },
    ]);
  });

  it("no mezcla el stock de dos revendedoras", () => {
    const filas = stockRevendedorasPorLote(
      [item({ id: "i1", cantidad: 10 }), item({ id: "i2", vendedorId: "sofi", cantidad: 7 })],
      [venta({ vendedorId: "sofi", cantidad: 7 })],
    );
    expect(filas).toEqual([
      { vendedorId: "martin", loteId: "lote-a", productoId: "p500", enPoder: 10 },
    ]);
  });

  it("entregas viejas sin lote quedan con loteId null (no cuentan para ningún lote)", () => {
    const filas = stockRevendedorasPorLote([item({ id: "i1", cantidad: 5, loteId: null })], []);
    expect(filas).toEqual([{ vendedorId: "martin", loteId: null, productoId: "p500", enPoder: 5 }]);
    expect(totalEnManosPorLoteProducto(filas).size).toBe(0);
  });

  it("por revendedora y producto suma lo mismo que entregas − devoluciones − ventas", () => {
    const items = [
      item({ id: "i1", cantidad: 10, loteId: "lote-a" }),
      item({ id: "i2", cantidad: 8, loteId: "lote-b", fecha: "2026-09-03" }),
      item({ id: "i3", cantidad: 6, loteId: null, fecha: "2026-08-01" }),
      item({ id: "d1", tipo: "devolucion", cantidad: 2, loteId: "lote-b", fecha: "2026-09-04" }),
      item({ id: "d2", tipo: "devolucion", cantidad: 1, loteId: null, fecha: "2026-09-04" }),
    ];
    const ventas = [venta({ cantidad: 3 }), venta({ cantidad: 2, entregaItemId: "i1" })];
    const total = stockRevendedorasPorLote(items, ventas).reduce((acc, f) => acc + f.enPoder, 0);
    expect(total).toBe(10 + 8 + 6 - 2 - 1 - 3 - 2);
  });
});

describe("enManosDeLote", () => {
  const nombres = new Map([
    ["martin", "Martín Gómez"],
    ["sofi", "Sofi"],
  ]);
  const productos = new Map([
    ["p250", { nombre: "Botella 250 ml", presentacionMl: 250 }],
    ["p500", { nombre: "Botella 500 ml", presentacionMl: 500 }],
  ]);

  it("agrupa por persona, de la que más tiene a la que menos, y ordena presentaciones", () => {
    const { personas, total } = enManosDeLote(
      [
        { vendedorId: "sofi", loteId: "lote-a", productoId: "p500", enPoder: 7 },
        { vendedorId: "martin", loteId: "lote-a", productoId: "p250", enPoder: 26 },
        { vendedorId: "martin", loteId: "lote-a", productoId: "p500", enPoder: 13 },
        { vendedorId: "martin", loteId: "lote-b", productoId: "p500", enPoder: 99 },
      ],
      "lote-a",
      nombres,
      productos,
    );
    expect(total).toBe(46);
    expect(personas.map((p) => [p.nombre, p.total])).toEqual([
      ["Martín Gómez", 39],
      ["Sofi", 7],
    ]);
    expect(formatProductosEnManos(personas[0].productos)).toBe(
      "13 × Botella 500 ml, 26 × Botella 250 ml",
    );
  });

  it("sin nadie con botellas del lote, devuelve vacío", () => {
    expect(enManosDeLote([], "lote-a", nombres, productos)).toEqual({ personas: [], total: 0 });
  });
});

describe("totalEnManosPorLoteProducto", () => {
  it("suma todas las revendedoras por lote y producto", () => {
    const totales = totalEnManosPorLoteProducto([
      { vendedorId: "martin", loteId: "lote-a", productoId: "p500", enPoder: 26 },
      { vendedorId: "sofi", loteId: "lote-a", productoId: "p500", enPoder: 7 },
      { vendedorId: "sofi", loteId: "lote-a", productoId: "p250", enPoder: 7 },
    ]);
    expect(totales.get("lote-a:p500")).toBe(33);
    expect(totales.get("lote-a:p250")).toBe(7);
  });
});

describe("resumenStockLote", () => {
  it("suma depósito + en revendedoras (ejemplo: 250 ml, 9 + 10 = 19)", () => {
    expect(resumenStockLote(9, 10)).toEqual({
      totalSinVender: 19,
      enDeposito: 9,
      enRevendedoras: 10,
    });
  });

  it("suma depósito + en revendedoras (ejemplo: 500 ml, 16 + 5 = 21)", () => {
    expect(resumenStockLote(16, 5)).toEqual({
      totalSinVender: 21,
      enDeposito: 16,
      enRevendedoras: 5,
    });
  });

  it("sin nada en revendedoras, el total es igual al depósito", () => {
    expect(resumenStockLote(9, 0)).toEqual({
      totalSinVender: 9,
      enDeposito: 9,
      enRevendedoras: 0,
    });
  });

  it("sin dato de depósito (null), el total queda null en vez de inventar un número", () => {
    expect(resumenStockLote(null, 10)).toEqual({
      totalSinVender: null,
      enDeposito: null,
      enRevendedoras: 10,
    });
  });
});
