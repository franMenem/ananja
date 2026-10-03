import { describe, expect, it } from "vitest";

import { calcularPrecioItem, convertirUsdAPesos } from "@/lib/dominio/calculos";

// Todos los valores de este archivo son inventados; los esperados salen de
// hacer la cuenta paso a paso a mano (con redondeo en cada paso).
describe("calcularPrecioItem", () => {
  it("ejemplo A, 500 ml — dólar 1000, USD 5/litro, IVA 21%, ganancia 30%", () => {
    const resultado = calcularPrecioItem({
      dolarCentavos: 100000,
      materiaPrimaUsdCentavos: 500,
      presentacionMl: 500,
      envaseCentavos: 150000,
      etiquetaCentavos: 30000,
      precioMinoristaCentavos: 1500000,
      transportePct: 8,
      ivaPct: 21,
      gananciaPct: 30,
      mayoristaPct: 20,
    });

    expect(resultado.materiaPrimaCentavos).toBe(250000);
    expect(resultado.subtotalCentavos).toBe(430000);
    expect(resultado.transporteCentavos).toBe(34400);
    expect(resultado.ivaCentavos).toBe(97524);
    // Costo y precio base: exactos, sin tolerancia.
    expect(resultado.costoCentavos).toBe(561924);
    expect(resultado.precioBaseCentavos).toBe(730501);
  });

  it("ejemplo A, 250 ml — mismos parámetros de versión, presentación distinta", () => {
    const resultado = calcularPrecioItem({
      dolarCentavos: 100000,
      materiaPrimaUsdCentavos: 500,
      presentacionMl: 250,
      envaseCentavos: 100000,
      etiquetaCentavos: 20000,
      precioMinoristaCentavos: 1000000,
      transportePct: 8,
      ivaPct: 21,
      gananciaPct: 30,
      mayoristaPct: 20,
    });

    expect(resultado.subtotalCentavos).toBe(245000);
    expect(resultado.costoCentavos).toBe(320166);
    expect(resultado.precioBaseCentavos).toBe(416216);
  });

  it("ejemplo B, 500 ml — dólar 1100, USD 4,50/litro, IVA 0% (\"IVA vacío\" ese mes)", () => {
    // Un transporte con decimales (9,25%), como el que se carga en la
    // columna `transporte_pct numeric(5,2)`.
    const resultado = calcularPrecioItem({
      dolarCentavos: 110000,
      materiaPrimaUsdCentavos: 450,
      presentacionMl: 500,
      envaseCentavos: 160000,
      etiquetaCentavos: 32000,
      precioMinoristaCentavos: 1500000,
      transportePct: 9.25,
      ivaPct: 0,
      gananciaPct: 30,
      mayoristaPct: 20,
    });

    expect(resultado.materiaPrimaCentavos).toBe(247500);
    expect(resultado.subtotalCentavos).toBe(439500);
    expect(resultado.transporteCentavos).toBe(40654);
    expect(resultado.ivaCentavos).toBe(0);
    expect(resultado.gananciaCentavos).toBe(144046);
    expect(resultado.precioBaseCentavos).toBe(624200);
  });

  it("ejemplo B, 250 ml — mismo criterio, verifica la otra presentación", () => {
    const resultado = calcularPrecioItem({
      dolarCentavos: 110000,
      materiaPrimaUsdCentavos: 450,
      presentacionMl: 250,
      envaseCentavos: 110000,
      etiquetaCentavos: 22000,
      precioMinoristaCentavos: 1000000,
      transportePct: 9.25,
      ivaPct: 0,
      gananciaPct: 30,
      mayoristaPct: 20,
    });

    expect(resultado.subtotalCentavos).toBe(255750);
    expect(resultado.transporteCentavos).toBe(23657);
    expect(resultado.gananciaCentavos).toBe(83822);
    expect(resultado.precioBaseCentavos).toBe(363229);
  });

  it("con IVA 21% y mayorista 20% sobre los insumos del ejemplo B (caso sintético, cubre esas dos ramas)", () => {
    const resultado = calcularPrecioItem({
      dolarCentavos: 110000,
      materiaPrimaUsdCentavos: 450,
      presentacionMl: 500,
      envaseCentavos: 160000,
      etiquetaCentavos: 32000,
      precioMinoristaCentavos: 1500000,
      transportePct: 9.25,
      ivaPct: 21,
      gananciaPct: 30,
      mayoristaPct: 20,
    });

    // con_transporte = 480154; iva 21% = round(480154*0.21) = 100832
    expect(resultado.ivaCentavos).toBe(100832);
    // costo = 580986; ganancia 30% = round(580986*0.30) = 174296
    expect(resultado.costoCentavos).toBe(580986);
    expect(resultado.gananciaCentavos).toBe(174296);
    // precio_base = 755282; mayorista 20% = round(755282*1.20) = 906338
    expect(resultado.precioBaseCentavos).toBe(755282);
    expect(resultado.precioMayoristaCentavos).toBe(906338);
  });

  it("precioMinoristaCentavos se devuelve tal cual, no se calcula", () => {
    const resultado = calcularPrecioItem({
      dolarCentavos: 100000,
      materiaPrimaUsdCentavos: 500,
      presentacionMl: 500,
      envaseCentavos: 150000,
      etiquetaCentavos: 30000,
      precioMinoristaCentavos: 1234567,
      transportePct: 8,
      ivaPct: 21,
      gananciaPct: 30,
      mayoristaPct: 20,
    });

    expect(resultado.precioMinoristaCentavos).toBe(1234567);
  });
});

describe("convertirUsdAPesos", () => {
  it("USD 1.000 al dólar 1.500 da $ 1.500.000", () => {
    expect(convertirUsdAPesos(100000, 150000)).toBe(150000000);
  });

  it("0 USD da 0 pesos sin importar la cotización", () => {
    expect(convertirUsdAPesos(0, 150000)).toBe(0);
  });

  it("redondea al centavo más cercano", () => {
    // 100 centavos USD (1 USD) a dólar 133,33 -> 133,33 pesos = 13333 centavos
    expect(convertirUsdAPesos(100, 13333)).toBe(13333);
  });
});
