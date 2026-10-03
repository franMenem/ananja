import { describe, expect, it } from "vitest";

import {
  aniosDisponibles,
  formatCentavosCompacto,
  rangoPeriodo,
  resumenBotellasPorPresentacion,
  seleccionInicial,
  ticksEjeY,
  unidadesPorProducto,
  ventasPorAnioMes,
} from "@/lib/dominio/graficos";
import { PALETA_GRAFICOS } from "@/lib/paleta-graficos";

describe("ventasPorAnioMes", () => {
  it("agrupa una venta en el mes/año correcto (índice 0 = enero)", () => {
    const resultado = ventasPorAnioMes([{ fecha: "2026-01-15", monto_centavos: 100_000 }]);
    expect(resultado[2026][0]).toBe(100_000);
  });

  it("agrupa una venta de diciembre en el índice 11", () => {
    const resultado = ventasPorAnioMes([{ fecha: "2026-12-31", monto_centavos: 50_000 }]);
    expect(resultado[2026][11]).toBe(50_000);
  });

  it("suma varias ventas del mismo mes", () => {
    const resultado = ventasPorAnioMes([
      { fecha: "2026-03-01", monto_centavos: 10_000 },
      { fecha: "2026-03-20", monto_centavos: 20_000 },
    ]);
    expect(resultado[2026][2]).toBe(30_000);
  });

  it("separa años distintos en claves distintas", () => {
    const resultado = ventasPorAnioMes([
      { fecha: "2025-06-01", monto_centavos: 10_000 },
      { fecha: "2026-06-01", monto_centavos: 20_000 },
    ]);
    expect(resultado[2025][5]).toBe(10_000);
    expect(resultado[2026][5]).toBe(20_000);
  });

  it("un mes sin ventas queda en 0, no se omite (siempre 12 valores)", () => {
    const resultado = ventasPorAnioMes([{ fecha: "2026-01-01", monto_centavos: 1_000 }]);
    expect(resultado[2026]).toHaveLength(12);
    expect(resultado[2026][1]).toBe(0);
  });

  it("sin ventas, devuelve un objeto vacío", () => {
    expect(ventasPorAnioMes([])).toEqual({});
  });
});

describe("aniosDisponibles", () => {
  it("ordena los años de más reciente a más viejo", () => {
    const porAnio = {
      2024: new Array(12).fill(0),
      2026: new Array(12).fill(0),
      2025: new Array(12).fill(0),
    };
    expect(aniosDisponibles(porAnio)).toEqual([2026, 2025, 2024]);
  });

  it("sin años, devuelve un array vacío", () => {
    expect(aniosDisponibles({})).toEqual([]);
  });

  it("un solo año", () => {
    expect(aniosDisponibles({ 2026: new Array(12).fill(0) })).toEqual([2026]);
  });
});

describe("seleccionInicial", () => {
  it("con más de 3 años disponibles, elige los 3 más recientes (default)", () => {
    expect(seleccionInicial([2026, 2025, 2024, 2023])).toEqual([2026, 2025, 2024]);
  });

  it("con un solo año disponible, devuelve ese único año (una sola línea, decisión 1)", () => {
    expect(seleccionInicial([2026])).toEqual([2026]);
  });

  it("con exactamente `max` años, devuelve todos", () => {
    expect(seleccionInicial([2026, 2025], 2)).toEqual([2026, 2025]);
  });

  it("respeta un `max` distinto del default", () => {
    expect(seleccionInicial([2026, 2025, 2024, 2023, 2022], 5)).toEqual([
      2026, 2025, 2024, 2023, 2022,
    ]);
  });

  it("sin años disponibles, devuelve un array vacío", () => {
    expect(seleccionInicial([])).toEqual([]);
  });
});

describe("ticksEjeY", () => {
  it("sin ventas (max <= 0), devuelve un único tick en 0", () => {
    expect(ticksEjeY(0)).toEqual([0]);
    expect(ticksEjeY(-100)).toEqual([0]);
  });

  it("siempre arranca en 0 y el último tick alcanza o supera el máximo", () => {
    const ticks = ticksEjeY(1_234_567_00); // $1.234.567
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(1_234_567_00);
  });

  it("da entre 3 y 6 ticks en total (pide '3-4 gridlines', el algoritmo de número lindo puede necesitar uno más)", () => {
    const ticks = ticksEjeY(3_400_000_00);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks.length).toBeLessThanOrEqual(6);
  });

  it("los ticks quedan equiespaciados (mismo paso entre consecutivos)", () => {
    const ticks = ticksEjeY(5_000_000_00);
    const paso = ticks[1] - ticks[0];
    for (let i = 2; i < ticks.length; i++) {
      expect(ticks[i] - ticks[i - 1]).toBe(paso);
    }
  });

  it("un máximo de $1.000.000 da un paso redondo (no un número arbitrario)", () => {
    // $1.000.000 / 3 intervalos ~ $333.333 -> se redondea a $500.000
    expect(ticksEjeY(1_000_000_00)).toEqual([0, 500_000_00, 1_000_000_00]);
  });
});

describe("formatCentavosCompacto", () => {
  it("cero", () => {
    expect(formatCentavosCompacto(0)).toBe("$ 0");
  });

  it("menos de mil pesos: monto entero sin abreviar", () => {
    expect(formatCentavosCompacto(350_00)).toBe("$ 350");
  });

  it("miles redondos: '$ 500 mil'", () => {
    expect(formatCentavosCompacto(500_000_00)).toBe("$ 500 mil");
  });

  it("miles con decimal: '$ 1,2 mil'", () => {
    expect(formatCentavosCompacto(1_234_00)).toBe("$ 1,2 mil");
  });

  it("millón redondo: '$ 1 M' (no '$ 1,0 M')", () => {
    expect(formatCentavosCompacto(1_000_000_00)).toBe("$ 1 M");
  });

  it("millón con decimal: '$ 1,5 M'", () => {
    expect(formatCentavosCompacto(1_500_000_00)).toBe("$ 1,5 M");
  });

  it("negativo: signo antes del '$'", () => {
    expect(formatCentavosCompacto(-1_500_000_00)).toBe("-$ 1,5 M");
  });
});

describe("rangoPeriodo", () => {
  const HOY = "2026-09-10";

  it("este_mes: desde el 1 del mes de hoy hasta hoy", () => {
    expect(rangoPeriodo("este_mes", HOY)).toEqual({ desde: "2026-09-01", hasta: HOY });
  });

  it("este_anio: desde el 1 de enero del año de hoy hasta hoy", () => {
    expect(rangoPeriodo("este_anio", HOY)).toEqual({ desde: "2026-01-01", hasta: HOY });
  });

  it("anio_anterior: el año calendario completo anterior", () => {
    expect(rangoPeriodo("anio_anterior", HOY)).toEqual({
      desde: "2025-01-01",
      hasta: "2025-12-31",
    });
  });

  it("ultimos_12_meses: desde el primer día del mes 11 meses atrás hasta hoy", () => {
    // Hoy es septiembre de 2026 (mes índice 8, 0-11). 11 meses atrás: octubre 2025.
    expect(rangoPeriodo("ultimos_12_meses", HOY)).toEqual({
      desde: "2025-10-01",
      hasta: HOY,
    });
  });

  it("ultimos_12_meses cruza el cambio de año correctamente (hoy en enero)", () => {
    expect(rangoPeriodo("ultimos_12_meses", "2026-01-15")).toEqual({
      desde: "2025-02-01",
      hasta: "2026-01-15",
    });
  });

  it("ultimos_12_meses con hoy en diciembre no cruza de año (11 meses atrás sigue en el mismo año)", () => {
    expect(rangoPeriodo("ultimos_12_meses", "2026-12-25")).toEqual({
      desde: "2026-01-01",
      hasta: "2026-12-25",
    });
  });

  it("todo: sin cota en ninguno de los dos extremos", () => {
    expect(rangoPeriodo("todo", HOY)).toEqual({ desde: null, hasta: null });
  });
});

describe("unidadesPorProducto", () => {
  it("suma cantidades por producto_id dentro del rango, con porcentaje (fracción 0-1)", () => {
    const items = [
      { fecha: "2026-03-01", producto_id: "p500", cantidad: 6 },
      { fecha: "2026-03-15", producto_id: "p500", cantidad: 4 },
      { fecha: "2026-03-20", producto_id: "p250", cantidad: 10 },
    ];
    const resultado = unidadesPorProducto(items, "2026-01-01", "2026-12-31");
    expect(resultado).toEqual([
      { producto_id: "p500", unidades: 10, porcentaje: 0.5 },
      { producto_id: "p250", unidades: 10, porcentaje: 0.5 },
    ]);
  });

  it("ordena de mayor a menor unidades", () => {
    const items = [
      { fecha: "2026-01-01", producto_id: "chico", cantidad: 1 },
      { fecha: "2026-01-01", producto_id: "grande", cantidad: 9 },
    ];
    const resultado = unidadesPorProducto(items, null, null);
    expect(resultado.map((r) => r.producto_id)).toEqual(["grande", "chico"]);
  });

  it("excluye ítems fuera del rango (desde/hasta inclusive en los bordes)", () => {
    const items = [
      { fecha: "2025-12-31", producto_id: "p1", cantidad: 5 }, // antes del rango
      { fecha: "2026-01-01", producto_id: "p1", cantidad: 3 }, // límite desde, incluido
      { fecha: "2026-12-31", producto_id: "p1", cantidad: 2 }, // límite hasta, incluido
      { fecha: "2027-01-01", producto_id: "p1", cantidad: 7 }, // después del rango
    ];
    const resultado = unidadesPorProducto(items, "2026-01-01", "2026-12-31");
    expect(resultado).toEqual([{ producto_id: "p1", unidades: 5, porcentaje: 1 }]);
  });

  it("desde/hasta null no filtra por ese lado (equivalente a período 'todo')", () => {
    const items = [
      { fecha: "2020-01-01", producto_id: "p1", cantidad: 1 },
      { fecha: "2030-01-01", producto_id: "p1", cantidad: 1 },
    ];
    const resultado = unidadesPorProducto(items, null, null);
    expect(resultado).toEqual([{ producto_id: "p1", unidades: 2, porcentaje: 1 }]);
  });

  it("sin ítems en el rango, devuelve un array vacío", () => {
    expect(unidadesPorProducto([], "2026-01-01", "2026-12-31")).toEqual([]);
  });

  it("sin ítems en absoluto, devuelve un array vacío", () => {
    expect(unidadesPorProducto([], null, null)).toEqual([]);
  });
});

describe("resumenBotellasPorPresentacion", () => {
  it("combina por presentación (dos productos pueden compartirla) y calcula el % entero", () => {
    const porProducto = unidadesPorProducto(
      [
        { fecha: "2026-09-01", producto_id: "p500-a", cantidad: 6 },
        { fecha: "2026-09-02", producto_id: "p500-b", cantidad: 5 },
        { fecha: "2026-09-03", producto_id: "p250", cantidad: 9 },
      ],
      null,
      null,
    );
    const presentacionPorProducto = new Map([
      ["p500-a", 500],
      ["p500-b", 500],
      ["p250", 250],
    ]);
    expect(resumenBotellasPorPresentacion(porProducto, presentacionPorProducto)).toEqual({
      total: 20,
      partes: [
        { presentacionMl: 500, unidades: 11, porcentajePct: 55 },
        { presentacionMl: 250, unidades: 9, porcentajePct: 45 },
      ],
    });
  });

  it("un producto sin presentación resuelta se omite, no rompe el resumen", () => {
    const porProducto = unidadesPorProducto(
      [
        { fecha: "2026-09-01", producto_id: "conocido", cantidad: 3 },
        { fecha: "2026-09-01", producto_id: "sin-resolver", cantidad: 7 },
      ],
      null,
      null,
    );
    const resultado = resumenBotellasPorPresentacion(porProducto, new Map([["conocido", 500]]));
    expect(resultado).toEqual({ total: 3, partes: [{ presentacionMl: 500, unidades: 3, porcentajePct: 100 }] });
  });

  it("sin ventas en el período, total 0 y sin partes", () => {
    expect(resumenBotellasPorPresentacion([], new Map())).toEqual({ total: 0, partes: [] });
  });
});

describe("PALETA_GRAFICOS", () => {
  it("tiene exactamente 10 colores, todos hex de 6 dígitos y únicos", () => {
    expect(PALETA_GRAFICOS).toHaveLength(10);
    for (const color of PALETA_GRAFICOS) {
      expect(color).toMatch(/^#[0-9A-F]{6}$/);
    }
    expect(new Set(PALETA_GRAFICOS).size).toBe(10);
  });
});
