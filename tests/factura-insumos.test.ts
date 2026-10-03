import { describe, expect, it } from "vitest";

import {
  calcularFacturaInsumos,
  evaluarLineaFactura,
  formatCostoUnitario,
  importeLineaCentavos,
  repartirRestoMayor,
  validarLineaFactura,
} from "@/lib/dominio/factura-insumos";
import { elegirUltimasComprasPorInsumo } from "@/lib/dominio/insumos";

/**
 * Espejo de `registrar_compra_insumos_factura`
 * (supabase/migrations/0041_compra_insumos_factura.sql). Los dos primeros
 * casos son facturas de ejemplo (valores inventados) de etiquetas, con el
 * envío repartido por unidades (no 50/50); los resultados esperados están
 * calculados a mano.
 */

describe("factura A (ejemplo)", () => {
  const calculo = calcularFacturaInsumos({
    lineas: [
      { cantidad: 800, precioUnitarioCentavos: 10_000 }, // etiqueta 250 ml frente
      { cantidad: 1200, precioUnitarioCentavos: 15_000 }, // etiqueta 500 ml frente
    ],
    preciosSinIva: true,
    ivaPct: 21,
    envioCentavos: 2_000_000,
  });

  it("importes, subtotal, IVA y total de la factura", () => {
    expect(calculo.lineas.map((l) => l.importeCentavos)).toEqual([8_000_000, 18_000_000]);
    expect(calculo.subtotalCentavos).toBe(26_000_000);
    expect(calculo.ivaCentavos).toBe(5_460_000);
    expect(calculo.totalFacturaCentavos).toBe(31_460_000);
  });

  it("reparte el envío por unidades y da el total de cada línea al centavo", () => {
    expect(calculo.lineas.map((l) => l.ivaCentavos)).toEqual([1_680_000, 3_780_000]);
    expect(calculo.lineas.map((l) => l.envioCentavos)).toEqual([800_000, 1_200_000]);
    expect(calculo.lineas.map((l) => l.totalCentavos)).toEqual([10_480_000, 22_980_000]);
    expect(calculo.totalPagadoCentavos).toBe(33_460_000);
  });

  it("costo por unidad", () => {
    expect(Math.round(calculo.lineas[0].costoUnitarioCentavos)).toBe(13_100);
    expect(calculo.lineas[1].costoUnitarioCentavos).toBeCloseTo(19_150, 3);
    expect(formatCostoUnitario(calculo.lineas[1].costoUnitarioCentavos)).toBe("$ 191,50");
  });
});

describe("factura B (ejemplo)", () => {
  const calculo = calcularFacturaInsumos({
    lineas: [
      { cantidad: 600, precioUnitarioCentavos: 11_000 }, // 250 ml
      { cantidad: 1300, precioUnitarioCentavos: 16_000 }, // 500 ml
    ],
    preciosSinIva: true,
    ivaPct: 21,
    envioCentavos: 3_000_000,
  });

  it("importes, subtotal, IVA y total de la factura", () => {
    expect(calculo.lineas.map((l) => l.importeCentavos)).toEqual([6_600_000, 20_800_000]);
    expect(calculo.subtotalCentavos).toBe(27_400_000);
    expect(calculo.ivaCentavos).toBe(5_754_000);
    expect(calculo.totalFacturaCentavos).toBe(33_154_000);
  });

  it("el centavo que sobra del envío va a la línea con mayor fracción", () => {
    // 30.000 × 600/1900 = 9.473,684… y × 1300/1900 = 20.526,315…
    expect(calculo.lineas.map((l) => l.envioCentavos)).toEqual([947_368, 2_052_632]);
    expect(calculo.lineas.map((l) => l.ivaCentavos)).toEqual([1_386_000, 4_368_000]);
    expect(calculo.lineas.map((l) => l.totalCentavos)).toEqual([8_933_368, 27_220_632]);
    expect(calculo.totalPagadoCentavos).toBe(36_154_000);
  });

  it("costo por unidad", () => {
    expect(Math.round(calculo.lineas[0].costoUnitarioCentavos)).toBe(14_889);
    expect(calculo.lineas[1].costoUnitarioCentavos).toBeCloseTo(20_938.95, 2);
    expect(formatCostoUnitario(calculo.lineas[1].costoUnitarioCentavos)).toBe("$ 209,3895");
    expect(formatCostoUnitario(calculo.lineas[0].costoUnitarioCentavos)).toBe("$ 148,8895");
  });

  it("el precio de última compra (prefill de costos del pedido) sale con IVA y envío", () => {
    const [chica, grande] = calculo.lineas;
    const ultimas = elegirUltimasComprasPorInsumo([
      { insumo_id: "chica", cantidad: 600, gastos: { fecha: "2025-12-26", monto_centavos: chica.totalCentavos } },
      { insumo_id: "grande", cantidad: 1300, gastos: { fecha: "2025-12-26", monto_centavos: grande.totalCentavos } },
    ]);
    expect(ultimas.chica.precioUnitarioCentavos).toBe(14_889);
    expect(ultimas.grande.precioUnitarioCentavos).toBe(20_939);
  });
});

describe("calcularFacturaInsumos — otros casos", () => {
  it("precios con IVA incluido: no suma IVA", () => {
    const calculo = calcularFacturaInsumos({
      lineas: [{ cantidad: 100, precioUnitarioCentavos: 1210 }],
      preciosSinIva: false,
      ivaPct: 21,
      envioCentavos: 0,
    });
    expect(calculo.ivaCentavos).toBe(0);
    expect(calculo.lineas[0].totalCentavos).toBe(121_000);
    expect(calculo.totalPagadoCentavos).toBe(121_000);
  });

  it("una sola línea se lleva todo el envío", () => {
    const calculo = calcularFacturaInsumos({
      lineas: [{ cantidad: 3, precioUnitarioCentavos: 100 }],
      preciosSinIva: true,
      ivaPct: 10.5,
      envioCentavos: 1001,
    });
    expect(calculo.ivaCentavos).toBe(32); // 300 × 10,5% = 31,5 → 32
    expect(calculo.lineas[0].totalCentavos).toBe(300 + 32 + 1001);
  });

  it("la suma de las líneas siempre da exacto (muchas líneas, restos parejos)", () => {
    const calculo = calcularFacturaInsumos({
      lineas: [
        { cantidad: 1, precioUnitarioCentavos: 333 },
        { cantidad: 1, precioUnitarioCentavos: 333 },
        { cantidad: 1, precioUnitarioCentavos: 333 },
      ],
      preciosSinIva: true,
      ivaPct: 21,
      envioCentavos: 100,
    });
    // envío 100 / 3 = 33,33 → el centavo de más va a la primera línea
    expect(calculo.lineas.map((l) => l.envioCentavos)).toEqual([34, 33, 33]);
    const suma = calculo.lineas.reduce((acc, l) => acc + l.totalCentavos, 0);
    expect(suma).toBe(calculo.totalPagadoCentavos);
  });

  it("cantidades con decimales: importe redondeado al centavo", () => {
    expect(importeLineaCentavos({ cantidad: 0.125, precioUnitarioCentavos: 1234 })).toBe(154); // 154,25
    expect(importeLineaCentavos({ cantidad: 0.5, precioUnitarioCentavos: 1 })).toBe(1); // 0,5 → 1
  });
});

describe("repartirRestoMayor", () => {
  it("suma exacta y desempate por orden", () => {
    expect(repartirRestoMayor(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(repartirRestoMayor(0, [5, 7])).toEqual([0, 0]);
    expect(repartirRestoMayor(5, [0, 0])).toEqual([0, 0]);
  });
});

describe("validarLineaFactura", () => {
  it("rechaza cantidades y precios inválidos", () => {
    expect(validarLineaFactura({ cantidad: 0, precioUnitarioCentavos: 100 })).toBe("CANTIDAD_INVALIDA");
    expect(validarLineaFactura({ cantidad: 1.0001, precioUnitarioCentavos: 100 })).toBe("CANTIDAD_INVALIDA");
    expect(validarLineaFactura({ cantidad: 1, precioUnitarioCentavos: 0 })).toBe("PRECIO_INVALIDO");
    expect(validarLineaFactura({ cantidad: 0.001, precioUnitarioCentavos: 1 })).toBe("PRECIO_INVALIDO");
    expect(validarLineaFactura({ cantidad: 960, precioUnitarioCentavos: 1234 })).toBeNull();
  });
});

describe("evaluarLineaFactura", () => {
  const base = { insumoId: "et-250", cantidad: "960", precio: "12,34" };

  it("línea completa y válida", () => {
    expect(evaluarLineaFactura(base)).toEqual({
      linea: { insumoId: "et-250", cantidad: 960, precioUnitarioCentavos: 1234 },
      errorCantidad: null,
      errorPrecio: null,
      incompleta: false,
    });
    expect(evaluarLineaFactura({ ...base, cantidad: "1.500", precio: "$ 1.234,5" }).linea).toEqual({
      insumoId: "et-250",
      cantidad: 1500,
      precioUnitarioCentavos: 123_450,
    });
  });

  it("precio con más de 2 decimales: error claro, la línea no se descarta en silencio", () => {
    const estado = evaluarLineaFactura({ ...base, precio: "12,345" });
    expect(estado.errorPrecio).toBe("El precio admite hasta 2 decimales.");
    expect(estado.linea).toBeNull();
    expect(estado.incompleta).toBe(false);
  });

  it("precio con punto decimal (vale igual que la coma), cuentas, inválido o en cero", () => {
    expect(evaluarLineaFactura({ ...base, precio: "12.34" })).toMatchObject({
      errorPrecio: null,
      linea: { precioUnitarioCentavos: 1234 },
    });
    expect(evaluarLineaFactura({ ...base, precio: "12.3456" }).errorPrecio).toBe(
      "El precio admite hasta 2 decimales.",
    );
    // Una cuenta se redondea al centavo, como en todos los campos (el campo
    // muestra el resultado): 12,34 × 1,21 = 14,9314 → $ 14,93.
    expect(evaluarLineaFactura({ ...base, precio: "12,34*1,21" }).linea?.precioUnitarioCentavos).toBe(
      1493,
    );
    expect(evaluarLineaFactura({ ...base, precio: "1520*" }).errorPrecio).toMatch(/cuenta/);
    expect(evaluarLineaFactura({ ...base, precio: "abc" }).errorPrecio).toMatch(/Revisá el precio/);
    expect(evaluarLineaFactura({ ...base, precio: "0" }).errorPrecio).toMatch(/mayor a cero/);
  });

  it("cantidad con más de 3 decimales, inválida, cuenta o en cero", () => {
    expect(evaluarLineaFactura({ ...base, cantidad: "1,0005" }).errorCantidad).toBe(
      "La cantidad admite hasta 3 decimales.",
    );
    expect(evaluarLineaFactura({ ...base, cantidad: "abc" }).errorCantidad).toMatch(/Revisá/);
    expect(evaluarLineaFactura({ ...base, cantidad: "0" }).errorCantidad).toMatch(/mayor a cero/);
    expect(evaluarLineaFactura({ ...base, cantidad: "3*320" }).linea?.cantidad).toBe(960);
    expect(evaluarLineaFactura({ ...base, cantidad: "320*" }).errorCantidad).toMatch(/cuenta/);
  });

  it("importe de menos de un centavo", () => {
    // 0,25 × $ 0,01 = 0,25 centavos → 0.
    expect(evaluarLineaFactura({ ...base, cantidad: "0,25", precio: "0,01" }).errorPrecio).toMatch(
      /menos de un centavo/,
    );
    // "0,001" es una milésima (con parte entera 0 no es separador de miles).
    expect(evaluarLineaFactura({ ...base, cantidad: "0,001", precio: "0,01" }).errorPrecio).toMatch(
      /menos de un centavo/,
    );
  });

  it("campos vacíos: incompleta, sin error", () => {
    const estado = evaluarLineaFactura({ insumoId: "", cantidad: "", precio: "" });
    expect(estado).toEqual({ linea: null, errorCantidad: null, errorPrecio: null, incompleta: true });
    expect(evaluarLineaFactura({ ...base, insumoId: "" }).incompleta).toBe(true);
  });
});
