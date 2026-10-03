import { describe, expect, it } from "vitest";

import {
  armarItemsEntregaCoordinador,
  armarRevendedorasCoordinador,
  formatDisponiblePorPresentacion,
  mapearLotesDisponibles,
  totalDisponible,
} from "@/lib/dominio/coordinador";
import type { LoteConStock } from "@/lib/dominio/lotes-split";

/**
 * `armarRevendedorasCoordinador` (`lib/coordinador.ts`, 0055_coordinador.sql)
 * — une revendedoras + stock (`v_stock_revendedor`, sumado entre
 * productos) + deuda (`v_deuda_vendedor.saldo_centavos`) en lo que ve un
 * coordinador de sus revendedoras. Espejo de
 * `agruparValorStockPorVendedor` (`tests/revendedores.test.ts`).
 */
describe("armarRevendedorasCoordinador", () => {
  it("sin revendedoras, lista vacía", () => {
    expect(armarRevendedorasCoordinador([], [], [])).toEqual([]);
  });

  it("revendedora sin stock ni deuda todavía: en_poder, debe y valor en poder en 0", () => {
    const resultado = armarRevendedorasCoordinador([{ id: "r1", nombre: "Caro" }], [], []);
    expect(resultado).toEqual([
      { id: "r1", nombre: "Caro", enPoder: 0, debeCentavos: 0, valorEnPoderCentavos: 0 },
    ]);
  });

  it("suma en_poder de varios productos para la misma revendedora", () => {
    const resultado = armarRevendedorasCoordinador(
      [{ id: "r1", nombre: "Caro" }],
      [
        { vendedor_id: "r1", en_poder: 8 },
        { vendedor_id: "r1", en_poder: 7 },
      ],
      [{ vendedor_id: "r1", saldo_centavos: 100_000 }],
    );
    expect(resultado).toEqual([
      { id: "r1", nombre: "Caro", enPoder: 15, debeCentavos: 100_000, valorEnPoderCentavos: 0 },
    ]);
  });

  it("suma valor_en_poder_centavos de varios productos para la misma revendedora (0059)", () => {
    const resultado = armarRevendedorasCoordinador(
      [{ id: "r1", nombre: "Sofi" }],
      [],
      [],
      [
        { vendedor_id: "r1", valor_en_poder_centavos: 4_000_000 },
        { vendedor_id: "r1", valor_en_poder_centavos: 6_000_000 },
      ],
    );
    expect(resultado).toEqual([
      { id: "r1", nombre: "Sofi", enPoder: 0, debeCentavos: 0, valorEnPoderCentavos: 10_000_000 },
    ]);
  });

  it("no mezcla revendedoras distintas", () => {
    const resultado = armarRevendedorasCoordinador(
      [
        { id: "r1", nombre: "Caro" },
        { id: "r2", nombre: "Martín" },
      ],
      [
        { vendedor_id: "r1", en_poder: 5 },
        { vendedor_id: "r2", en_poder: 3 },
      ],
      [
        { vendedor_id: "r1", saldo_centavos: 10_000 },
        { vendedor_id: "r2", saldo_centavos: 20_000 },
      ],
      [
        { vendedor_id: "r1", valor_en_poder_centavos: 1_000 },
        { vendedor_id: "r2", valor_en_poder_centavos: 2_000 },
      ],
    );
    expect(resultado).toEqual([
      { id: "r1", nombre: "Caro", enPoder: 5, debeCentavos: 10_000, valorEnPoderCentavos: 1_000 },
      { id: "r2", nombre: "Martín", enPoder: 3, debeCentavos: 20_000, valorEnPoderCentavos: 2_000 },
    ]);
  });

  it("ignora filas de stock/deuda/valor con vendedor_id null (defensivo, no debería pasar)", () => {
    const resultado = armarRevendedorasCoordinador(
      [{ id: "r1", nombre: "Caro" }],
      [{ vendedor_id: null, en_poder: 99 }],
      [{ vendedor_id: null, saldo_centavos: 99 }],
      [{ vendedor_id: null, valor_en_poder_centavos: 99 }],
    );
    expect(resultado).toEqual([
      { id: "r1", nombre: "Caro", enPoder: 0, debeCentavos: 0, valorEnPoderCentavos: 0 },
    ]);
  });

  it("mantiene el orden de entrada de las revendedoras", () => {
    const resultado = armarRevendedorasCoordinador(
      [
        { id: "r2", nombre: "Zulema" },
        { id: "r1", nombre: "Ana" },
      ],
      [],
      [],
    );
    expect(resultado.map((r) => r.id)).toEqual(["r2", "r1"]);
  });
});

/**
 * `armarItemsEntregaCoordinador` (`lib/coordinador.ts`, 0055_coordinador.sql)
 * — reparte cada cantidad entre los lotes disponibles de ese producto
 * REUSANDO `repartirCantidadEntreLotes` (`lib/lotes-split.ts`, ya testeada
 * en `tests/lotes-split.test.ts`): si un pedido no entra en un solo lote,
 * lo divide entre varios (decisión de Fran, 2026-09-17), igual que ya hace
 * la carga de un admin.
 */
describe("armarItemsEntregaCoordinador", () => {
  const nombrePorProducto = new Map([
    ["p250", "Botella 250 ml"],
    ["p500", "Botella 500 ml"],
  ]);

  it("sin cantidades cargadas, error pidiendo cargar algo", () => {
    const resultado = armarItemsEntregaCoordinador({ p250: 0 }, {}, nombrePorProducto);
    expect(resultado.items).toBeNull();
    expect(resultado.error).toMatch(/Cargá al menos una cantidad/);
  });

  it("un solo lote alcanza: un único ítem con ese lote", () => {
    const lotes: LoteConStock[] = [{ loteId: "lote-viejo", fecha: "2026-09-01", quedan: 50 }];
    const resultado = armarItemsEntregaCoordinador({ p250: 30 }, { p250: lotes }, nombrePorProducto);
    expect(resultado.items).toEqual([{ productoId: "p250", loteId: "lote-viejo", cantidad: 30 }]);
    expect(resultado.error).toBeNull();
  });

  it("reparte entre dos lotes cuando ninguno alcanza solo (decisión de Fran)", () => {
    const lotes: LoteConStock[] = [
      { loteId: "lote-viejo", fecha: "2026-08-01", quedan: 30 },
      { loteId: "lote-nuevo", fecha: "2026-09-01", quedan: 40 },
    ];
    const resultado = armarItemsEntregaCoordinador({ p250: 50 }, { p250: lotes }, nombrePorProducto);
    expect(resultado.items).toEqual([
      { productoId: "p250", loteId: "lote-viejo", cantidad: 30 },
      { productoId: "p250", loteId: "lote-nuevo", cantidad: 20 },
    ]);
    expect(resultado.error).toBeNull();
  });

  it("reparte por producto por separado, cada uno con sus propios lotes", () => {
    const resultado = armarItemsEntregaCoordinador(
      { p250: 10, p500: 5 },
      {
        p250: [{ loteId: "l1", fecha: "2026-09-01", quedan: 20 }],
        p500: [{ loteId: "l2", fecha: "2026-09-05", quedan: 20 }],
      },
      nombrePorProducto,
    );
    expect(resultado.items).toEqual([
      { productoId: "p250", loteId: "l1", cantidad: 10 },
      { productoId: "p500", loteId: "l2", cantidad: 5 },
    ]);
  });

  it("no manda una entrega parcial: si el stock total no alcanza, error con el nombre del producto", () => {
    const lotes: LoteConStock[] = [{ loteId: "l1", fecha: "2026-09-01", quedan: 10 }];
    const resultado = armarItemsEntregaCoordinador({ p250: 30 }, { p250: lotes }, nombrePorProducto);
    expect(resultado.items).toBeNull();
    expect(resultado.error).toMatch(/Botella 250 ml/);
  });

  it("producto sin ningún lote disponible: mismo error, no revienta", () => {
    const resultado = armarItemsEntregaCoordinador({ p250: 5 }, {}, nombrePorProducto);
    expect(resultado.items).toBeNull();
    expect(resultado.error).toMatch(/Botella 250 ml/);
  });

  it("ignora productos con cantidad 0 o negativa", () => {
    const resultado = armarItemsEntregaCoordinador(
      { p250: 0, p500: 5 },
      { p500: [{ loteId: "l2", fecha: "2026-09-05", quedan: 20 }] },
      nombrePorProducto,
    );
    expect(resultado.items).toEqual([{ productoId: "p500", loteId: "l2", cantidad: 5 }]);
  });
});

/**
 * `mapearLotesDisponibles` (`lib/coordinador.ts`, 0055_coordinador.sql) —
 * traduce el resultado crudo del RPC `lotes_disponibles_coordinador`. Bug
 * encontrado probando contra Postgres local: si el RPC fallaba (el tipo
 * `quedan numeric` vs. `RETURNS TABLE(quedan int)` sin castear, corregido
 * en la migración), `listarLotesDisponiblesCoordinador` devolvía `[]` en
 * silencio y `armarItemsEntregaCoordinador` terminaba mostrando "No hay
 * stock suficiente… Avisale a un admin" — mentira, el coordinador nunca
 * podía entregar nada. Estos tests cubren que un error del RPC se
 * distinga de "sin stock" (`[]` sin error).
 */
describe("mapearLotesDisponibles", () => {
  it("sin error: mapea lote_id/fecha/quedan a loteId/fecha/quedan", () => {
    const resultado = mapearLotesDisponibles(
      [
        { lote_id: "l1", fecha: "2026-09-01", quedan: 30 },
        { lote_id: "l2", fecha: "2026-09-05", quedan: 20 },
      ],
      null,
    );
    expect(resultado).toEqual({
      data: [
        { loteId: "l1", fecha: "2026-09-01", quedan: 30 },
        { loteId: "l2", fecha: "2026-09-05", quedan: 20 },
      ],
      error: null,
    });
  });

  it("sin lotes y sin error: lista vacía SIN error (es 'no hay stock', no una falla)", () => {
    const resultado = mapearLotesDisponibles([], null);
    expect(resultado).toEqual({ data: [], error: null });
  });

  it("data null y sin error (RPC sin filas): también lista vacía sin error", () => {
    const resultado = mapearLotesDisponibles(null, null);
    expect(resultado).toEqual({ data: [], error: null });
  });

  it("el RPC falla: error explícito, NUNCA se confunde con 'sin stock'", () => {
    const resultado = mapearLotesDisponibles(null, { message: "structure of query does not match function result type" });
    expect(resultado.data).toEqual([]);
    expect(resultado.error).not.toBeNull();
    expect(resultado.error).toMatch(/No pudimos consultar el stock/);
  });

  it("el RPC falla aunque venga con filas: prioriza el error, no las usa", () => {
    const resultado = mapearLotesDisponibles([{ lote_id: "l1", fecha: "2026-09-01", quedan: 30 }], {
      message: "algo raro",
    });
    expect(resultado.data).toEqual([]);
    expect(resultado.error).toMatch(/No pudimos consultar el stock/);
  });
});

/**
 * `totalDisponible` (0057_coordinador_plata_stock.sql) — suma de `quedan`
 * entre los lotes de un producto, para mostrar "Disponible: X" y topear el
 * stepper ANTES de entregar.
 */
describe("totalDisponible", () => {
  it("sin lotes, 0", () => {
    expect(totalDisponible([])).toBe(0);
  });

  it("suma quedan entre varios lotes", () => {
    const lotes: LoteConStock[] = [
      { loteId: "l1", fecha: "2026-09-01", quedan: 30 },
      { loteId: "l2", fecha: "2026-09-05", quedan: 20 },
    ];
    expect(totalDisponible(lotes)).toBe(50);
  });

  it("un solo lote", () => {
    expect(totalDisponible([{ loteId: "l1", fecha: "2026-09-01", quedan: 7 }])).toBe(7);
  });
});

/**
 * `formatDisponiblePorPresentacion` (0057_coordinador_plata_stock.sql) —
 * "Disponible: 199 de 500 ml · 99 de 250 ml", de mayor a menor presentación.
 * Sin precios ni costos: solo cantidad y presentación.
 */
describe("formatDisponiblePorPresentacion", () => {
  it("un producto solo", () => {
    expect(formatDisponiblePorPresentacion([{ presentacionMl: 500, disponible: 199 }])).toBe("199 de 500 ml");
  });

  it("varios productos, de mayor a menor presentación sin importar el orden de entrada", () => {
    const texto = formatDisponiblePorPresentacion([
      { presentacionMl: 250, disponible: 99 },
      { presentacionMl: 500, disponible: 199 },
    ]);
    expect(texto).toBe("199 de 500 ml · 99 de 250 ml");
  });

  it("sin disponibles, lista vacía", () => {
    expect(formatDisponiblePorPresentacion([])).toBe("");
  });

  it("muestra 0 cuando no hay disponible de esa presentación (no la oculta)", () => {
    const texto = formatDisponiblePorPresentacion([
      { presentacionMl: 500, disponible: 0 },
      { presentacionMl: 250, disponible: 12 },
    ]);
    expect(texto).toBe("0 de 500 ml · 12 de 250 ml");
  });
});
