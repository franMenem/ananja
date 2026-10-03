import { describe, expect, it } from "vitest";
import {
  agruparFilasPorProducto,
  fusionarFilasDuplicadas,
  hayDescuadre,
  loteMasNuevo,
  loteUnicoConStock,
  ordenarLotesPorAntiguedad,
  repartirCantidadEntreLotes,
  repartirEnLotePreferido,
  totalFilas,
  type LoteConStock,
} from "@/lib/dominio/lotes-split";

/**
 * Reparto de una cantidad entre lotes con stock (`v_stock_por_lote`, ver
 * supabase/migrations/0028_costos_por_lote.sql) — espejo puro de las
 * reglas que sigue `components/lotes/selector-lote.tsx`.
 */

const LOTE_VIEJO: LoteConStock = { loteId: "l1", fecha: "2026-09-03", quedan: 20 };
const LOTE_NUEVO: LoteConStock = { loteId: "l2", fecha: "2026-09-11", quedan: 327 };

describe("ordenarLotesPorAntiguedad", () => {
  it("ordena de más viejo a más nuevo por fecha", () => {
    expect(ordenarLotesPorAntiguedad([LOTE_NUEVO, LOTE_VIEJO])).toEqual([
      LOTE_VIEJO,
      LOTE_NUEVO,
    ]);
  });
});

describe("loteMasNuevo", () => {
  it("sin lotes, null", () => {
    expect(loteMasNuevo([])).toBeNull();
  });

  it("con varios, el de fecha máxima", () => {
    expect(loteMasNuevo([LOTE_VIEJO, LOTE_NUEVO])).toEqual(LOTE_NUEVO);
  });
});

describe("loteUnicoConStock", () => {
  it("un solo lote con stock -> ese lote", () => {
    expect(
      loteUnicoConStock([LOTE_NUEVO, { ...LOTE_VIEJO, quedan: 0 }]),
    ).toEqual(LOTE_NUEVO);
  });

  it("dos lotes con stock -> null (hace falta elegir)", () => {
    expect(loteUnicoConStock([LOTE_VIEJO, LOTE_NUEVO])).toBeNull();
  });

  it("ningún lote con stock -> null", () => {
    expect(
      loteUnicoConStock([
        { ...LOTE_VIEJO, quedan: 0 },
        { ...LOTE_NUEVO, quedan: 0 },
      ]),
    ).toBeNull();
  });

  it("sin lotes -> null", () => {
    expect(loteUnicoConStock([])).toBeNull();
  });
});

describe("repartirCantidadEntreLotes", () => {
  it("cabe entero en el lote más viejo: todo ahí, nada al nuevo", () => {
    expect(repartirCantidadEntreLotes(15, [LOTE_NUEVO, LOTE_VIEJO])).toEqual([
      { loteId: "l1", cantidad: 15 },
    ]);
  });

  it("no alcanza el viejo: llena el viejo y el resto al siguiente", () => {
    expect(repartirCantidadEntreLotes(50, [LOTE_NUEVO, LOTE_VIEJO])).toEqual([
      { loteId: "l1", cantidad: 20 },
      { loteId: "l2", cantidad: 30 },
    ]);
  });

  it("salta lotes con quedan <= 0", () => {
    expect(
      repartirCantidadEntreLotes(10, [{ ...LOTE_VIEJO, quedan: 0 }, LOTE_NUEVO]),
    ).toEqual([{ loteId: "l2", cantidad: 10 }]);
  });

  it("stock total insuficiente: el remanente queda SIN repartir (no se le carga de más a nadie en silencio)", () => {
    const filas = repartirCantidadEntreLotes(400, [LOTE_VIEJO, LOTE_NUEVO]);
    expect(totalFilas(filas)).toBe(347); // 20 + 327, no 400
  });

  it("sin lotes, reparto vacío", () => {
    expect(repartirCantidadEntreLotes(10, [])).toEqual([]);
  });
});

describe("hayDescuadre", () => {
  it("el total coincide -> sin descuadre", () => {
    expect(hayDescuadre([{ loteId: "l1", cantidad: 30 }], 30)).toBe(false);
  });

  it("el total no coincide -> descuadre", () => {
    expect(hayDescuadre([{ loteId: "l1", cantidad: 20 }], 30)).toBe(true);
  });
});

describe("repartirEnLotePreferido (devolución)", () => {
  it("el lote preferido existe: todo ahí, sin importar quedan", () => {
    expect(
      repartirEnLotePreferido(30, [LOTE_VIEJO, LOTE_NUEVO], "l1"),
    ).toEqual([{ loteId: "l1", cantidad: 30 }]);
  });

  it("el lote preferido ya no existe: cae al más nuevo", () => {
    expect(
      repartirEnLotePreferido(30, [LOTE_VIEJO, LOTE_NUEVO], "l-viejo-borrado"),
    ).toEqual([{ loteId: "l2", cantidad: 30 }]);
  });

  it("sin preferencia (null): al más nuevo", () => {
    expect(repartirEnLotePreferido(30, [LOTE_VIEJO, LOTE_NUEVO], null)).toEqual([
      { loteId: "l2", cantidad: 30 },
    ]);
  });

  it("sin lotes, reparto vacío", () => {
    expect(repartirEnLotePreferido(30, [], null)).toEqual([]);
  });

  it("cantidad 0, reparto vacío", () => {
    expect(repartirEnLotePreferido(0, [LOTE_VIEJO], "l1")).toEqual([]);
  });
});

describe("agruparFilasPorProducto", () => {
  it("agrupa varias filas de distintos productos por productoId", () => {
    expect(
      agruparFilasPorProducto([
        { productoId: "p1", cantidad: 30, loteId: "l1" },
        { productoId: "p1", cantidad: 20, loteId: "l2" },
        { productoId: "p2", cantidad: 5, loteId: null },
      ]),
    ).toEqual({
      p1: [
        { loteId: "l1", cantidad: 30 },
        { loteId: "l2", cantidad: 20 },
      ],
      p2: [{ loteId: null, cantidad: 5 }],
    });
  });
});

describe("fusionarFilasDuplicadas", () => {
  it("sin duplicados, devuelve las mismas filas", () => {
    expect(
      fusionarFilasDuplicadas([
        { loteId: "l1", cantidad: 10 },
        { loteId: "l2", cantidad: 5 },
      ]),
    ).toEqual([
      { loteId: "l1", cantidad: 10 },
      { loteId: "l2", cantidad: 5 },
    ]);
  });

  it("suma cantidades del mismo lote (incluido null = sin lote)", () => {
    expect(
      fusionarFilasDuplicadas([
        { loteId: "l1", cantidad: 10 },
        { loteId: null, cantidad: 3 },
        { loteId: "l1", cantidad: 4 },
        { loteId: null, cantidad: 2 },
      ]),
    ).toEqual([
      { loteId: "l1", cantidad: 14 },
      { loteId: null, cantidad: 5 },
    ]);
  });
});
