import { describe, expect, it } from "vitest";
import {
  ajustarQuedanParaEdicion,
  lotesDeProducto,
  ultimoLotePorProducto,
  type LoteConStockDeProducto,
} from "@/lib/dominio/lotes-disponibles";

/**
 * `lib/lotes-disponibles.ts` § `ajustarQuedanParaEdicion` — bugfix de
 * revisión de `supabase/migrations/0028_costos_por_lote.sql`: al EDITAR un
 * comprobante, `v_stock_por_lote.quedan` todavía cuenta las filas ACTUALES
 * de ese comprobante como vendidas (recién se borran al guardar), así que
 * subestima la disponibilidad real en exactamente lo que el comprobante ya
 * tenía asignado a cada lote.
 */

describe("ajustarQuedanParaEdicion", () => {
  const LOTES: LoteConStockDeProducto[] = [
    {
      loteId: "l1",
      productoId: "p500",
      fecha: "2026-08-01",
      quedan: 10,
      precioMinoristaSugeridoCentavos: null,
      costoAnanjaCentavos: null,
    },
    {
      loteId: "l2",
      productoId: "p500",
      fecha: "2026-09-01",
      quedan: 5,
      precioMinoristaSugeridoCentavos: null,
      costoAnanjaCentavos: null,
    },
    {
      loteId: "l1",
      productoId: "p250",
      fecha: "2026-08-01",
      quedan: 20,
      precioMinoristaSugeridoCentavos: null,
      costoAnanjaCentavos: null,
    },
  ];

  it("le suma a cada (lote, producto) lo que el comprobante ya tenía asignado", () => {
    const resultado = ajustarQuedanParaEdicion(LOTES, [
      { productoId: "p500", loteId: "l1", cantidad: 30 },
    ]);
    expect(resultado.find((l) => l.loteId === "l1" && l.productoId === "p500")!.quedan).toBe(40);
    // Los demás lotes no se tocan.
    expect(resultado.find((l) => l.loteId === "l2" && l.productoId === "p500")!.quedan).toBe(5);
    expect(resultado.find((l) => l.loteId === "l1" && l.productoId === "p250")!.quedan).toBe(20);
  });

  it("suma varias filas del mismo (lote, producto) — venta repartida en más de una fila", () => {
    const resultado = ajustarQuedanParaEdicion(LOTES, [
      { productoId: "p500", loteId: "l1", cantidad: 10 },
      { productoId: "p500", loteId: "l1", cantidad: 15 },
    ]);
    expect(resultado.find((l) => l.loteId === "l1" && l.productoId === "p500")!.quedan).toBe(35);
  });

  it("una venta repartida entre dos lotes ajusta cada uno por su parte", () => {
    const resultado = ajustarQuedanParaEdicion(LOTES, [
      { productoId: "p500", loteId: "l1", cantidad: 8 },
      { productoId: "p500", loteId: "l2", cantidad: 12 },
    ]);
    expect(resultado.find((l) => l.loteId === "l1" && l.productoId === "p500")!.quedan).toBe(18);
    expect(resultado.find((l) => l.loteId === "l2" && l.productoId === "p500")!.quedan).toBe(17);
  });

  it("filas sin lote_id (ítem legado) no ajustan nada — no hay a qué lote atribuirlas", () => {
    const resultado = ajustarQuedanParaEdicion(LOTES, [
      { productoId: "p500", loteId: null, cantidad: 99 },
    ]);
    expect(resultado).toEqual(LOTES);
  });

  it("sin ítems iniciales (alta, no edición): devuelve los lotes sin tocar", () => {
    expect(ajustarQuedanParaEdicion(LOTES, [])).toEqual(LOTES);
  });

  it("no muta el array/objetos originales", () => {
    const original = structuredClone(LOTES);
    ajustarQuedanParaEdicion(LOTES, [{ productoId: "p500", loteId: "l1", cantidad: 30 }]);
    expect(LOTES).toEqual(original);
  });
});

describe("lotesDeProducto / ultimoLotePorProducto (regresión, ya cubiertas indirectamente)", () => {
  it("lotesDeProducto filtra y proyecta solo el shape de LoteConStock", () => {
    const lotes: LoteConStockDeProducto[] = [
      {
        loteId: "l1",
        productoId: "p500",
        fecha: "2026-08-01",
        quedan: 10,
        costoUnitarioCentavos: 100,
        precioMinoristaSugeridoCentavos: null,
      costoAnanjaCentavos: null,
      },
      {
        loteId: "l1",
        productoId: "p250",
        fecha: "2026-08-01",
        quedan: 20,
        costoUnitarioCentavos: 50,
        precioMinoristaSugeridoCentavos: null,
      costoAnanjaCentavos: null,
      },
    ];
    expect(lotesDeProducto(lotes, "p500")).toEqual([
      { loteId: "l1", fecha: "2026-08-01", quedan: 10, costoUnitarioCentavos: 100 },
    ]);
  });

  it("ultimoLotePorProducto se queda con la primera fila con lote_id no nulo por producto", () => {
    expect(
      ultimoLotePorProducto([
        { producto_id: "p500", lote_id: null },
        { producto_id: "p500", lote_id: "l2" },
        { producto_id: "p500", lote_id: "l1" },
      ]),
    ).toEqual({ p500: "l2" });
  });
});
