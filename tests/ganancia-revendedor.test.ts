import { describe, expect, it } from "vitest";

import { calcularResumenRevendedor } from "@/lib/dominio/calculos";
import {
  calcularGananciaRevendedor,
  seriesGananciaPorAnio,
  type VentaGanancia,
} from "@/lib/dominio/ganancia-revendedor";

const venta = (v: Partial<VentaGanancia>): VentaGanancia => ({
  fecha: "2026-09-10",
  cantidad: 1,
  precioVentaCentavos: 1500000,
  precioCostoCentavos: 1000000,
  ...v,
});

describe("calcularGananciaRevendedor", () => {
  it("sin ventas, todo en cero y sin meses", () => {
    expect(calcularGananciaRevendedor([])).toEqual({
      vendidoCentavos: 0,
      ananjaCentavos: 0,
      gananciaCentavos: 0,
      porMes: [],
      unidadesSinPrecio: 0,
    });
  });

  it("las ventas sin precio de venta no cuentan en vendido/ganancia y se informan aparte", () => {
    const r = calcularGananciaRevendedor([
      venta({ cantidad: 2 }),
      venta({ cantidad: 5, precioVentaCentavos: null }),
      venta({ fecha: "2026-08-01", cantidad: 1, precioVentaCentavos: null }),
    ]);
    expect(r.vendidoCentavos).toBe(2 * 1500000);
    expect(r.ananjaCentavos).toBe(2 * 1000000);
    expect(r.gananciaCentavos).toBe(2 * 500000);
    expect(r.unidadesSinPrecio).toBe(6);
    // el mes que solo tiene ventas sin precio no aparece (no inventa $0)
    expect(r.porMes.map((f) => f.periodo)).toEqual(["2026-09"]);
  });

  it("al completar el precio, la venta pasa a contar", () => {
    const sinPrecio = [venta({ cantidad: 3, precioVentaCentavos: null })];
    const conPrecio = [venta({ cantidad: 3, precioVentaCentavos: 1400000 })];
    expect(calcularGananciaRevendedor(sinPrecio).gananciaCentavos).toBe(0);
    const r = calcularGananciaRevendedor(conPrecio);
    expect(r.gananciaCentavos).toBe(3 * 400000);
    expect(r.unidadesSinPrecio).toBe(0);
  });
});

describe("calcularResumenRevendedor con ventas sin precio (espejo de v_resumen_revendedor, 0040)", () => {
  it("la venta sin precio suma a la deuda pero no a vendido ni ganancia", () => {
    const r = calcularResumenRevendedor(
      [
        { cantidad: 3, precioVentaCentavos: 1500, precioCostoCentavos: 1000 },
        { cantidad: 2, precioVentaCentavos: null, precioCostoCentavos: 1200 },
      ],
      [{ montoCentavos: 1000 }],
    );
    expect(r.vendidoCentavos).toBe(4500);
    expect(r.costoCentavos).toBe(3000 + 2400);
    expect(r.gananciaCentavos).toBe(4500 - 3000);
    expect(r.debeCentavos).toBe(3000 + 2400 - 1000);
  });

  it("total histórico: vendido, lo de Ananja y la ganancia, multiplicando por cantidad", () => {
    const r = calcularGananciaRevendedor([
      venta({ cantidad: 3 }),
      venta({ cantidad: 2, precioVentaCentavos: 1800000, precioCostoCentavos: 1200000 }),
    ]);
    expect(r.vendidoCentavos).toBe(3 * 1500000 + 2 * 1800000);
    expect(r.ananjaCentavos).toBe(3 * 1000000 + 2 * 1200000);
    expect(r.gananciaCentavos).toBe(r.vendidoCentavos - r.ananjaCentavos);
  });

  it("agrupa por mes, del más reciente al más viejo, incluyendo meses a pérdida", () => {
    const r = calcularGananciaRevendedor([
      venta({ fecha: "2026-08-03" }),
      venta({ fecha: "2026-09-20", cantidad: 2 }),
      venta({ fecha: "2025-12-31", precioVentaCentavos: 900000 }),
      venta({ fecha: "2026-09-01" }),
    ]);
    expect(r.porMes.map((f) => [f.periodo, f.gananciaCentavos])).toEqual([
      ["2026-09", 3 * 500000],
      ["2026-08", 500000],
      ["2025-12", -100000],
    ]);
    expect(r.porMes[0].vendidoCentavos).toBe(3 * 1500000);
    expect(r.porMes[0].ananjaCentavos).toBe(3 * 1000000);
  });
});

describe("seriesGananciaPorAnio", () => {
  it("arma 12 valores por año, año más reciente primero, meses negativos en 0", () => {
    const { porMes } = calcularGananciaRevendedor([
      venta({ fecha: "2026-01-15" }),
      venta({ fecha: "2026-09-15", cantidad: 2 }),
      venta({ fecha: "2025-12-01", precioVentaCentavos: 900000 }),
    ]);
    const series = seriesGananciaPorAnio(porMes);
    expect(series.map((s) => s.anio)).toEqual([2026, 2025]);
    expect(series[0].valores).toHaveLength(12);
    expect(series[0].valores[0]).toBe(500000);
    expect(series[0].valores[8]).toBe(1000000);
    expect(series[1].valores[11]).toBe(0);
  });
});
