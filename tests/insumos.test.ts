import { describe, expect, it } from "vitest";
import {
  calcularBajoUmbral,
  calcularConsumoLote,
  calcularStockInsumo,
  estimarUnidadesProducibles,
  type ConsumoInsumo,
  type ItemLoteConsumo,
  type MovimientoInsumoInput,
  type RecetaInput,
} from "@/lib/dominio/calculos";
import {
  agruparEtiquetasPorLado,
  elegirUltimasComprasPorInsumo,
  nombreBaseEtiqueta,
} from "@/lib/dominio/insumos";

/**
 * Espejo de v_stock_insumos y del descuento de insumos de crear_lote
 * (supabase/migrations/0017_insumos.sql).
 */

describe("calcularStockInsumo", () => {
  it("sin movimientos, stock es 0", () => {
    expect(calcularStockInsumo([])).toBe(0);
  });

  it("cantidades fraccionarias: 0,5 L + 0,25 L ingresados - 0,3 L consumidos", () => {
    const movimientos: MovimientoInsumoInput[] = [
      { tipo: "ingreso", cantidad: 0.5 },
      { tipo: "ingreso", cantidad: 0.25 },
      { tipo: "egreso", cantidad: 0.3 },
    ];
    // 0.5 + 0.25 - 0.3 = 0.45, con la tolerancia habitual de punto
    // flotante de JS (0.1 + 0.2 !== 0.3) — toBeCloseTo en vez de toBe.
    expect(calcularStockInsumo(movimientos)).toBeCloseTo(0.45, 10);
  });

  it("ingresos y egresos mezclados, caso de compra + consumo de lote", () => {
    const movimientos: MovimientoInsumoInput[] = [
      { tipo: "ingreso", cantidad: 100 }, // compra de 100 envases
      { tipo: "egreso", cantidad: 30 }, // consumo de un lote
      { tipo: "egreso", cantidad: 20 }, // consumo de otro lote
    ];
    expect(calcularStockInsumo(movimientos)).toBe(50);
  });
});

describe("calcularConsumoLote", () => {
  it("dos presentaciones a la vez, insumo compartido (aceite) e insumos exclusivos por presentación", () => {
    // Ejemplo: 100 × Botella 500 ml + 50 × Botella 250 ml.
    const items: ItemLoteConsumo[] = [
      { producto_id: "p500", cantidad: 100 },
      { producto_id: "p250", cantidad: 50 },
    ];
    const recetas: RecetaInput[] = [
      { producto_id: "p500", insumo_id: "aceite", cantidad: 0.5 },
      { producto_id: "p500", insumo_id: "envase500", cantidad: 1 },
      { producto_id: "p500", insumo_id: "etiq_g_frente", cantidad: 1 },
      { producto_id: "p500", insumo_id: "etiq_g_retro", cantidad: 1 },
      { producto_id: "p250", insumo_id: "aceite", cantidad: 0.25 },
      { producto_id: "p250", insumo_id: "envase250", cantidad: 1 },
      { producto_id: "p250", insumo_id: "etiq_c_frente", cantidad: 1 },
      { producto_id: "p250", insumo_id: "etiq_c_retro", cantidad: 1 },
    ];

    const resultado = calcularConsumoLote(items, recetas);
    const porInsumo = new Map(resultado.map((r) => [r.insumo_id, r.cantidad]));

    // Aceite: 100 × 0,5 + 50 × 0,25 = 50 + 12,5 = 62,5 L (suma de ambas
    // presentaciones en una sola fila, no dos).
    expect(porInsumo.get("aceite")).toBeCloseTo(62.5, 10);
    expect(porInsumo.get("envase500")).toBe(100);
    expect(porInsumo.get("envase250")).toBe(50);
    expect(porInsumo.get("etiq_g_frente")).toBe(100);
    expect(porInsumo.get("etiq_c_frente")).toBe(50);
    expect(resultado).toHaveLength(7); // aceite + 2 envases + 4 etiquetas
  });

  it("producto sin ninguna receta no aporta filas", () => {
    const items: ItemLoteConsumo[] = [{ producto_id: "sin_receta", cantidad: 10 }];
    const recetas: RecetaInput[] = [
      { producto_id: "otro_producto", insumo_id: "algo", cantidad: 1 },
    ];
    expect(calcularConsumoLote(items, recetas)).toEqual([]);
  });

  it("sin items, no hay consumo", () => {
    const recetas: RecetaInput[] = [
      { producto_id: "p500", insumo_id: "aceite", cantidad: 0.5 },
    ];
    expect(calcularConsumoLote([], recetas)).toEqual([]);
  });

  it("dos productos que comparten un insumo (caso hipotético, no las recetas reales) suman en una sola fila", () => {
    const items: ItemLoteConsumo[] = [
      { producto_id: "a", cantidad: 10 },
      { producto_id: "b", cantidad: 5 },
    ];
    const recetas: RecetaInput[] = [
      { producto_id: "a", insumo_id: "compartido", cantidad: 2 },
      { producto_id: "b", insumo_id: "compartido", cantidad: 3 },
    ];
    const resultado: ConsumoInsumo[] = calcularConsumoLote(items, recetas);
    expect(resultado).toEqual([{ insumo_id: "compartido", cantidad: 35 }]); // 10×2 + 5×3
  });
});

describe("calcularBajoUmbral (caso fraccionario de insumos)", () => {
  it("stock decimal por debajo/igual/por encima del umbral — el caso general ya está cubierto por tests/stock.test.ts", () => {
    expect(calcularBajoUmbral(4.5, 5)).toBe(true);
    expect(calcularBajoUmbral(5, 5)).toBe(false);
  });
});

describe("estimarUnidadesProducibles", () => {
  it("un solo insumo: stock ÷ consumo por unidad, redondeado hacia abajo", () => {
    const recetas: RecetaInput[] = [{ producto_id: "p500", insumo_id: "aceite", cantidad: 0.5 }];
    const stock = new Map([["aceite", 100]]); // 100 L / 0.5 L por botella = 200
    expect(estimarUnidadesProducibles("p500", recetas, stock)).toBe(200);
  });

  it("varios insumos: manda el más escaso", () => {
    const recetas: RecetaInput[] = [
      { producto_id: "p500", insumo_id: "aceite", cantidad: 0.5 }, // alcanza para 200
      { producto_id: "p500", insumo_id: "etiqueta", cantidad: 1 }, // alcanza para 40
    ];
    const stock = new Map([
      ["aceite", 100],
      ["etiqueta", 40],
    ]);
    expect(estimarUnidadesProducibles("p500", recetas, stock)).toBe(40);
  });

  it("producto sin ninguna receta: null (nada con qué estimar)", () => {
    expect(estimarUnidadesProducibles("sin-receta", [], new Map())).toBeNull();
  });

  it("insumo sin stock en el Map: se trata como 0, nunca negativo", () => {
    const recetas: RecetaInput[] = [{ producto_id: "p500", insumo_id: "aceite", cantidad: 0.5 }];
    expect(estimarUnidadesProducibles("p500", recetas, new Map())).toBe(0);
  });

  it("recetas de OTRO producto no afectan el cálculo", () => {
    const recetas: RecetaInput[] = [
      { producto_id: "p500", insumo_id: "aceite", cantidad: 0.5 },
      { producto_id: "p250", insumo_id: "aceite", cantidad: 0.25 },
    ];
    const stock = new Map([["aceite", 100]]);
    expect(estimarUnidadesProducibles("p500", recetas, stock)).toBe(200);
    expect(estimarUnidadesProducibles("p250", recetas, stock)).toBe(400);
  });
});

describe("elegirUltimasComprasPorInsumo (build \"insumos en cero\")", () => {
  it("sin filas: objeto vacío", () => {
    expect(elegirUltimasComprasPorInsumo([])).toEqual({});
  });

  it("una sola compra: precio = monto / cantidad de esa compra", () => {
    const resultado = elegirUltimasComprasPorInsumo([
      { insumo_id: "frente", cantidad: 100, gastos: { fecha: "2026-09-01", monto_centavos: 10_000 } },
    ]);
    expect(resultado.frente).toEqual({ precioUnitarioCentavos: 100, fecha: "2026-09-01" });
  });

  it("dos compras del mismo insumo: se queda con la de fecha de gasto más reciente, no la última en llegar", () => {
    const resultado = elegirUltimasComprasPorInsumo([
      { insumo_id: "frente", cantidad: 100, gastos: { fecha: "2026-09-12", monto_centavos: 12_000 } },
      { insumo_id: "frente", cantidad: 100, gastos: { fecha: "2026-08-01", monto_centavos: 8_000 } },
    ]);
    expect(resultado.frente).toEqual({ precioUnitarioCentavos: 120, fecha: "2026-09-12" });
  });

  it("insumos distintos no se mezclan", () => {
    const resultado = elegirUltimasComprasPorInsumo([
      { insumo_id: "frente", cantidad: 100, gastos: { fecha: "2026-09-01", monto_centavos: 10_000 } },
      { insumo_id: "retro", cantidad: 50, gastos: { fecha: "2026-09-05", monto_centavos: 6_000 } },
    ]);
    expect(resultado.frente).toEqual({ precioUnitarioCentavos: 100, fecha: "2026-09-01" });
    expect(resultado.retro).toEqual({ precioUnitarioCentavos: 120, fecha: "2026-09-05" });
  });

  it("una fila sin gasto (no debería llegar, el !inner del query las filtra) o con cantidad 0 se ignora, sin explotar", () => {
    const resultado = elegirUltimasComprasPorInsumo([
      { insumo_id: "frente", cantidad: 100, gastos: null },
      { insumo_id: "retro", cantidad: 0, gastos: { fecha: "2026-09-01", monto_centavos: 5_000 } },
    ]);
    expect(resultado).toEqual({});
  });

  it("el precio redondea al centavo más cercano", () => {
    const resultado = elegirUltimasComprasPorInsumo([
      { insumo_id: "frente", cantidad: 3, gastos: { fecha: "2026-09-01", monto_centavos: 1_000 } },
    ]);
    // 1000 / 3 = 333.33... -> 333
    expect(resultado.frente.precioUnitarioCentavos).toBe(333);
  });
});

/**
 * Build "costos del pedido simple" (2026-09-15): un solo campo de precio
 * para frente + reverso de la misma presentación (`supabase/migrations/0017_insumos.sql`
 * § seed: "Etiqueta chica frente"/"Etiqueta chica retro").
 */
describe("nombreBaseEtiqueta", () => {
  it("saca 'frente'/'retro' del final del nombre", () => {
    expect(nombreBaseEtiqueta("Etiqueta chica frente")).toBe("Etiqueta chica");
    expect(nombreBaseEtiqueta("Etiqueta chica retro")).toBe("Etiqueta chica");
    expect(nombreBaseEtiqueta("Etiqueta grande frente")).toBe("Etiqueta grande");
    expect(nombreBaseEtiqueta("Etiqueta grande retro")).toBe("Etiqueta grande");
  });

  it("también reconoce 'reverso'/'anverso'/'dorso', sin importar mayúsculas", () => {
    expect(nombreBaseEtiqueta("Etiqueta 500 Reverso")).toBe("Etiqueta 500");
    expect(nombreBaseEtiqueta("Etiqueta 500 ANVERSO")).toBe("Etiqueta 500");
    expect(nombreBaseEtiqueta("Etiqueta 500 dorso")).toBe("Etiqueta 500");
  });

  it("un nombre sin lado se devuelve tal cual", () => {
    expect(nombreBaseEtiqueta("Etiqueta única")).toBe("Etiqueta única");
  });
});

describe("agruparEtiquetasPorLado", () => {
  it("junta frente + reverso de la misma presentación en un solo grupo", () => {
    const grupos = agruparEtiquetasPorLado([
      { insumoId: "chica-frente", nombre: "Etiqueta chica frente" },
      { insumoId: "chica-retro", nombre: "Etiqueta chica retro" },
      { insumoId: "grande-frente", nombre: "Etiqueta grande frente" },
      { insumoId: "grande-retro", nombre: "Etiqueta grande retro" },
    ]);
    expect(grupos).toEqual([
      { clave: "etiqueta chica", nombre: "Etiqueta chica", insumoIds: ["chica-frente", "chica-retro"] },
      {
        clave: "etiqueta grande",
        nombre: "Etiqueta grande",
        insumoIds: ["grande-frente", "grande-retro"],
      },
    ]);
  });

  it("un insumo sin lado queda en su propio grupo de un solo miembro", () => {
    const grupos = agruparEtiquetasPorLado([{ insumoId: "unica", nombre: "Etiqueta única" }]);
    expect(grupos).toEqual([{ clave: "etiqueta única", nombre: "Etiqueta única", insumoIds: ["unica"] }]);
  });

  it("sin etiquetas: sin grupos", () => {
    expect(agruparEtiquetasPorLado([])).toEqual([]);
  });
});
