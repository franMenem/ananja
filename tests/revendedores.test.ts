import { describe, expect, it } from "vitest";
import {
  agruparValorStockPorVendedor,
  calcularResumenRevendedor,
  calcularStockRevendedor,
  calcularTotalRevendedor,
  type CantidadItem,
  type RendicionMonto,
  type ValorStockRevendedorFila,
  type VentaRevendedorMonto,
} from "@/lib/dominio/calculos";

/**
 * Espejo de v_stock_revendedor y v_resumen_revendedor
 * (supabase/migrations/0018_revendedores.sql).
 */

describe("calcularStockRevendedor", () => {
  it("sin movimientos, en_poder es 0", () => {
    expect(calcularStockRevendedor([], [], [])).toBe(0);
  });

  it("solo entregas: en_poder = total entregado", () => {
    const entregas: CantidadItem[] = [{ cantidad: 20 }, { cantidad: 10 }];
    expect(calcularStockRevendedor(entregas, [], [])).toBe(30);
  });

  it("entrega + devolución parcial", () => {
    const entregas: CantidadItem[] = [{ cantidad: 30 }];
    const devoluciones: CantidadItem[] = [{ cantidad: 5 }];
    expect(calcularStockRevendedor(entregas, devoluciones, [])).toBe(25);
  });

  it("entrega + venta que deja en_poder en 0", () => {
    const entregas: CantidadItem[] = [{ cantidad: 12 }];
    const ventas: CantidadItem[] = [{ cantidad: 12 }];
    expect(calcularStockRevendedor(entregas, [], ventas)).toBe(0);
  });

  it("puede dar negativo (mismo criterio que calcularStock, sin CHECK que lo impida)", () => {
    const entregas: CantidadItem[] = [{ cantidad: 10 }];
    const ventas: CantidadItem[] = [{ cantidad: 15 }];
    expect(calcularStockRevendedor(entregas, [], ventas)).toBe(-5);
  });

  it("entrega + devolución + venta combinadas", () => {
    const entregas: CantidadItem[] = [{ cantidad: 50 }, { cantidad: 20 }];
    const devoluciones: CantidadItem[] = [{ cantidad: 10 }];
    const ventas: CantidadItem[] = [{ cantidad: 15 }, { cantidad: 5 }];
    // 50 + 20 - 10 - 15 - 5 = 40
    expect(calcularStockRevendedor(entregas, devoluciones, ventas)).toBe(40);
  });
});

describe("calcularResumenRevendedor", () => {
  it("sin ventas ni rendiciones, todo en 0", () => {
    expect(calcularResumenRevendedor([], [])).toEqual({
      vendidoCentavos: 0,
      costoCentavos: 0,
      gananciaCentavos: 0,
      rendidoCentavos: 0,
      debeCentavos: 0,
      cantidadVentas: 0,
    });
  });

  it("ganancia positiva: vendido - costo", () => {
    const ventas: VentaRevendedorMonto[] = [
      { cantidad: 10, precioVentaCentavos: 5000, precioCostoCentavos: 3500 },
    ];
    const resumen = calcularResumenRevendedor(ventas, []);
    expect(resumen.vendidoCentavos).toBe(50000);
    expect(resumen.costoCentavos).toBe(35000);
    expect(resumen.gananciaCentavos).toBe(15000);
    expect(resumen.cantidadVentas).toBe(1);
  });

  it("debeCentavos positivo sin rendiciones (debe todo el costo)", () => {
    const ventas: VentaRevendedorMonto[] = [
      { cantidad: 4, precioVentaCentavos: 6000, precioCostoCentavos: 4000 },
    ];
    const resumen = calcularResumenRevendedor(ventas, []);
    expect(resumen.costoCentavos).toBe(16000);
    expect(resumen.rendidoCentavos).toBe(0);
    expect(resumen.debeCentavos).toBe(16000);
  });

  it("debeCentavos en 0 cuando las rendiciones cubren el costo total", () => {
    const ventas: VentaRevendedorMonto[] = [
      { cantidad: 4, precioVentaCentavos: 6000, precioCostoCentavos: 4000 },
    ];
    const rendiciones: RendicionMonto[] = [{ montoCentavos: 16000 }];
    const resumen = calcularResumenRevendedor(ventas, rendiciones);
    expect(resumen.debeCentavos).toBe(0);
  });

  it("varias ventas y rendiciones parciales", () => {
    const ventas: VentaRevendedorMonto[] = [
      { cantidad: 10, precioVentaCentavos: 5000, precioCostoCentavos: 3500 },
      { cantidad: 6, precioVentaCentavos: 5200, precioCostoCentavos: 3500 },
    ];
    const rendiciones: RendicionMonto[] = [
      { montoCentavos: 20000 },
      { montoCentavos: 10000 },
    ];
    const resumen = calcularResumenRevendedor(ventas, rendiciones);
    // vendido: 10×5000 + 6×5200 = 50000 + 31200 = 81200
    // costo: 10×3500 + 6×3500 = 16×3500 = 56000
    expect(resumen.vendidoCentavos).toBe(81200);
    expect(resumen.costoCentavos).toBe(56000);
    expect(resumen.gananciaCentavos).toBe(25200);
    expect(resumen.rendidoCentavos).toBe(30000);
    expect(resumen.debeCentavos).toBe(26000);
    expect(resumen.cantidadVentas).toBe(2);
  });

  it("venta a pérdida (precio_venta < precio_costo): ganancia negativa", () => {
    const ventas: VentaRevendedorMonto[] = [
      { cantidad: 3, precioVentaCentavos: 2000, precioCostoCentavos: 3500 },
    ];
    const resumen = calcularResumenRevendedor(ventas, []);
    expect(resumen.vendidoCentavos).toBe(6000);
    expect(resumen.costoCentavos).toBe(10500);
    expect(resumen.gananciaCentavos).toBe(-4500);
  });

  it("cantidadVentas cuenta filas de venta, no unidades vendidas", () => {
    const ventas: VentaRevendedorMonto[] = [
      { cantidad: 100, precioVentaCentavos: 5000, precioCostoCentavos: 3500 },
      { cantidad: 1, precioVentaCentavos: 5000, precioCostoCentavos: 3500 },
    ];
    expect(calcularResumenRevendedor(ventas, []).cantidadVentas).toBe(2);
  });
});

/**
 * Espejo de v_valor_stock_revendedor
 * (supabase/migrations/0051_valor_stock_revendedor.sql): "Valor en poder" +
 * "Total" en /revendedores. Ejemplo ilustrativo (valores inventados): una revendedora tiene 8 botellas de 250ml ($40.000,00 de
 * valor) + 7 de 500ml ($60.000,00) = 15 en poder / $100.000,00 de valor.
 */
describe("agruparValorStockPorVendedor", () => {
  it("sin filas, mapa vacío", () => {
    expect(agruparValorStockPorVendedor([]).size).toBe(0);
  });

  it("suma en_poder y valor por vendedor a través de varios productos", () => {
    const filas: ValorStockRevendedorFila[] = [
      { vendedorId: "sofi", enPoder: 8, valorEnPoderCentavos: 4_000_000 },
      { vendedorId: "sofi", enPoder: 7, valorEnPoderCentavos: 6_000_000 },
    ];
    const porVendedor = agruparValorStockPorVendedor(filas);
    expect(porVendedor.get("sofi")).toEqual({
      enPoder: 15,
      valorEnPoderCentavos: 10_000_000,
      valorEnPoderAnanjaCentavos: 10_000_000,
    });
  });

  it("no mezcla vendedores distintos", () => {
    const filas: ValorStockRevendedorFila[] = [
      { vendedorId: "sofi", enPoder: 8, valorEnPoderCentavos: 4_000_000 },
      { vendedorId: "martin", enPoder: 0, valorEnPoderCentavos: 0 },
    ];
    const porVendedor = agruparValorStockPorVendedor(filas);
    expect(porVendedor.get("sofi")).toEqual({
      enPoder: 8,
      valorEnPoderCentavos: 4_000_000,
      valorEnPoderAnanjaCentavos: 4_000_000,
    });
    expect(porVendedor.get("martin")).toEqual({
      enPoder: 0,
      valorEnPoderCentavos: 0,
      valorEnPoderAnanjaCentavos: 0,
    });
    expect(porVendedor.has("fran")).toBe(false);
  });

  it("usa valorEnPoderAnanjaCentavos por separado cuando viene de una revendedora de coordinador (0059)", () => {
    // Sofi (bajo Laura): se le cobra a precio de coordinador
    // (valorEnPoderCentavos) pero Ananja tiene en juego el costo real,
    // menor (valorEnPoderAnanjaCentavos) — ver
    // 0059_valor_stock_revendedor_costo_real.sql.
    const filas: ValorStockRevendedorFila[] = [
      { vendedorId: "sofi", enPoder: 8, valorEnPoderCentavos: 4_000_000, valorEnPoderAnanjaCentavos: 3_500_000 },
      { vendedorId: "sofi", enPoder: 7, valorEnPoderCentavos: 6_000_000, valorEnPoderAnanjaCentavos: 5_200_000 },
    ];
    const porVendedor = agruparValorStockPorVendedor(filas);
    expect(porVendedor.get("sofi")).toEqual({
      enPoder: 15,
      valorEnPoderCentavos: 10_000_000,
      valorEnPoderAnanjaCentavos: 8_700_000,
    });
  });
});

describe("calcularTotalRevendedor", () => {
  it("suma lo que debe más el valor en poder", () => {
    expect(calcularTotalRevendedor(16_000, 10_000_000)).toBe(10_016_000);
  });

  it("da lo mismo que debe cuando no tiene nada en poder", () => {
    expect(calcularTotalRevendedor(16_000, 0)).toBe(16_000);
  });

  it("da lo mismo que el valor en poder cuando no debe nada", () => {
    expect(calcularTotalRevendedor(0, 10_000_000)).toBe(10_000_000);
  });
});
