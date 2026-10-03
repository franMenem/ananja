import { describe, expect, it } from "vitest";
import {
  calcularCostoLoteItems,
  calcularCostoUnitarioLote,
  calcularCostoUnitarioPromedio,
  type GastoLoteInput,
  type LoteItemInput,
} from "@/lib/dominio/calculos";

/**
 * Espejo de v_costo_lote / v_costo_producto
 * (supabase/migrations/0010_lotes_produccion.sql).
 */

describe("calcularCostoUnitarioLote", () => {
  it("sin gastos asignados, el costo unitario es 0 (no error)", () => {
    expect(calcularCostoUnitarioLote(0, 100)).toBe(0);
  });

  it("caso del quickstart: lote de 100 botellas, $50.000 de gastos → $500 c/u", () => {
    // $50.000,00 = 5_000_000 centavos; / 100 = 50_000 centavos = $500,00
    expect(calcularCostoUnitarioLote(5_000_000, 100)).toBe(50_000);
  });

  it("redondea al entero más cercano cuando no divide exacto", () => {
    expect(calcularCostoUnitarioLote(1000, 3)).toBe(333); // 333.33 -> 333
    expect(calcularCostoUnitarioLote(1000, 7)).toBe(143); // 142.857 -> 143
  });

  it("suma de varios gastos asignados al mismo lote", () => {
    // Aceite $40.000 + envases $8.000 + flete $2.000 = $50.000 sobre 100u
    expect(calcularCostoUnitarioLote(4_000_000 + 800_000 + 200_000, 100)).toBe(
      50_000,
    );
  });
});

describe("calcularCostoUnitarioPromedio", () => {
  it("sin lotes, el promedio es 0", () => {
    expect(calcularCostoUnitarioPromedio([])).toBe(0);
  });

  it("un solo lote: el promedio coincide con su costo unitario", () => {
    expect(
      calcularCostoUnitarioPromedio([
        { totalGastosCentavos: 5_000_000, cantidad: 100 },
      ]),
    ).toBe(50_000);
  });

  it("promedio ponderado por cantidad, no promedio simple de costos unitarios", () => {
    // Lote A: 100u a $500 c/u ($50.000 total); lote B: 50u a $600 c/u ($30.000 total)
    // Promedio simple de costos sería $550; el ponderado por cantidad da:
    // (50.000 + 30.000) / (100 + 50) = 80.000 / 150 = 533,33 -> 533
    expect(
      calcularCostoUnitarioPromedio([
        { totalGastosCentavos: 5_000_000, cantidad: 100 },
        { totalGastosCentavos: 3_000_000, cantidad: 50 },
      ]),
    ).toBe(53_333);
  });

  it("últimos 3 lotes: un lote sin gastos asignados todavía pesa con costo 0", () => {
    expect(
      calcularCostoUnitarioPromedio([
        { totalGastosCentavos: 5_000_000, cantidad: 100 },
        { totalGastosCentavos: 0, cantidad: 50 }, // producción reciente, sin gastos cargados
        { totalGastosCentavos: 3_000_000, cantidad: 50 },
      ]),
    ).toBe(40_000); // (5_000_000 + 0 + 3_000_000) / (100+50+50) = 40_000
  });
});

describe("calcularCostoLoteItems", () => {
  it("lote de un solo ítem: mismo resultado que calcularCostoUnitarioLote (paridad con el comportamiento actual)", () => {
    const items: LoteItemInput[] = [
      { producto_id: "p500", presentacion_ml: 500, cantidad: 100 },
    ];
    const gastos: GastoLoteInput[] = [
      { producto_id: null, monto_centavos: 5_000_000 },
    ];
    const [resultado] = calcularCostoLoteItems(items, gastos);
    expect(resultado.total_gastos_centavos).toBe(5_000_000);
    expect(resultado.costo_unitario_centavos).toBe(
      calcularCostoUnitarioLote(5_000_000, 100),
    );
  });

  it("dos ítems, solo gastos compartidos: 100×500ml y 50×250ml → pesos 50.000/12.500 → reparto 80%/20%", () => {
    const items: LoteItemInput[] = [
      { producto_id: "p500", presentacion_ml: 500, cantidad: 100 }, // peso 50.000
      { producto_id: "p250", presentacion_ml: 250, cantidad: 50 }, // peso 12.500
    ];
    const gastos: GastoLoteInput[] = [
      { producto_id: null, monto_centavos: 1_000_000 }, // flete compartido
    ];
    const resultado = calcularCostoLoteItems(items, gastos);
    const item500 = resultado.find((r) => r.producto_id === "p500")!;
    const item250 = resultado.find((r) => r.producto_id === "p250")!;
    expect(item500.gastos_compartidos_centavos).toBe(800_000);
    expect(item250.gastos_compartidos_centavos).toBe(200_000);
    expect(item500.total_gastos_centavos).toBe(800_000);
    expect(item250.total_gastos_centavos).toBe(200_000);
  });

  it("directos + compartidos combinados: un ítem con gasto directo propio, otro solo con su parte de lo compartido", () => {
    const items: LoteItemInput[] = [
      { producto_id: "p500", presentacion_ml: 500, cantidad: 100 },
      { producto_id: "p250", presentacion_ml: 250, cantidad: 50 },
    ];
    const gastos: GastoLoteInput[] = [
      { producto_id: "p250", monto_centavos: 300_000 }, // envases 250ml, directo
      { producto_id: null, monto_centavos: 1_000_000 }, // flete compartido
    ];
    const resultado = calcularCostoLoteItems(items, gastos);
    const item500 = resultado.find((r) => r.producto_id === "p500")!;
    const item250 = resultado.find((r) => r.producto_id === "p250")!;
    expect(item500.gastos_directos_centavos).toBe(0);
    expect(item500.gastos_compartidos_centavos).toBe(800_000);
    expect(item500.total_gastos_centavos).toBe(800_000);
    expect(item250.gastos_directos_centavos).toBe(300_000);
    expect(item250.gastos_compartidos_centavos).toBe(200_000);
    expect(item250.total_gastos_centavos).toBe(500_000);
  });

  it("redondeo: la suma de las N partes prorrateadas puede diferir del total compartido en hasta N-1 centavos", () => {
    const items: LoteItemInput[] = [
      { producto_id: "a", presentacion_ml: 100, cantidad: 1 },
      { producto_id: "b", presentacion_ml: 100, cantidad: 1 },
      { producto_id: "c", presentacion_ml: 100, cantidad: 1 },
    ];
    const gastos: GastoLoteInput[] = [
      { producto_id: null, monto_centavos: 100 },
    ];
    const resultado = calcularCostoLoteItems(items, gastos);
    const sumaPartes = resultado.reduce(
      (acc, r) => acc + r.gastos_compartidos_centavos,
      0,
    );
    // 100/3 = 33.33 -> round 33 cada uno; 33+33+33 = 99, no 100.
    expect(sumaPartes).not.toBe(100);
    expect(Math.abs(100 - sumaPartes)).toBeLessThanOrEqual(items.length - 1);
  });

  it("lote sin ningún gasto asignado: todos los ítems en costo 0 (no error)", () => {
    const items: LoteItemInput[] = [
      { producto_id: "p500", presentacion_ml: 500, cantidad: 100 },
      { producto_id: "p250", presentacion_ml: 250, cantidad: 50 },
    ];
    const resultado = calcularCostoLoteItems(items, []);
    for (const item of resultado) {
      expect(item.gastos_directos_centavos).toBe(0);
      expect(item.gastos_compartidos_centavos).toBe(0);
      expect(item.total_gastos_centavos).toBe(0);
      expect(item.costo_unitario_centavos).toBe(0);
    }
  });
});
