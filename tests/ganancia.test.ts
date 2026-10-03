import { describe, expect, it } from "vitest";

import { calcularGananciaPorPeriodo } from "@/lib/dominio/calculos";

describe("calcularGananciaPorPeriodo", () => {
  it("un mes con ventas y costos: ganancia = ventas - costos", () => {
    const filas = calcularGananciaPorPeriodo(
      [{ fecha: "2026-09-05", monto_centavos: 100_000 }],
      [{ fecha: "2026-09-10", monto_centavos: 30_000 }],
      "mes",
    );

    expect(filas).toEqual([
      {
        periodo: "2026-09",
        ventasCentavos: 100_000,
        costosCentavos: 30_000,
        gananciaCentavos: 70_000,
      },
    ]);
  });

  it("un mes solo con costos: ganancia negativa, ventas en 0", () => {
    const filas = calcularGananciaPorPeriodo(
      [],
      [{ fecha: "2026-09-10", monto_centavos: 30_000 }],
      "mes",
    );

    expect(filas).toEqual([
      {
        periodo: "2026-09",
        ventasCentavos: 0,
        costosCentavos: 30_000,
        gananciaCentavos: -30_000,
      },
    ]);
  });

  it("un mes solo con ventas también aparece, con costos en 0", () => {
    const filas = calcularGananciaPorPeriodo(
      [{ fecha: "2026-09-05", monto_centavos: 50_000 }],
      [],
      "mes",
    );

    expect(filas).toEqual([
      {
        periodo: "2026-09",
        ventasCentavos: 50_000,
        costosCentavos: 0,
        gananciaCentavos: 50_000,
      },
    ]);
  });

  it("agrupa por año cuando granularidad es 'anio'", () => {
    const filas = calcularGananciaPorPeriodo(
      [
        { fecha: "2026-01-15", monto_centavos: 100_000 },
        { fecha: "2026-09-05", monto_centavos: 200_000 },
      ],
      [{ fecha: "2026-03-01", monto_centavos: 90_000 }],
      "anio",
    );

    expect(filas).toEqual([
      {
        periodo: "2026",
        ventasCentavos: 300_000,
        costosCentavos: 90_000,
        gananciaCentavos: 210_000,
      },
    ]);
  });

  it("sin comprobantes ni gastos, devuelve []", () => {
    expect(calcularGananciaPorPeriodo([], [], "mes")).toEqual([]);
    expect(calcularGananciaPorPeriodo([], [], "anio")).toEqual([]);
  });

  it("ordena los períodos de forma descendente (más reciente primero)", () => {
    const filas = calcularGananciaPorPeriodo(
      [
        { fecha: "2026-01-05", monto_centavos: 10_000 },
        { fecha: "2026-09-05", monto_centavos: 20_000 },
        { fecha: "2025-12-05", monto_centavos: 5_000 },
      ],
      [],
      "mes",
    );

    expect(filas.map((f) => f.periodo)).toEqual([
      "2026-09",
      "2026-01",
      "2025-12",
    ]);
  });

  it("ordena los años de forma descendente", () => {
    const filas = calcularGananciaPorPeriodo(
      [
        { fecha: "2024-06-01", monto_centavos: 1_000 },
        { fecha: "2026-06-01", monto_centavos: 1_000 },
        { fecha: "2025-06-01", monto_centavos: 1_000 },
      ],
      [],
      "anio",
    );

    expect(filas.map((f) => f.periodo)).toEqual(["2026", "2025", "2024"]);
  });
});

describe("calcularGananciaPorPeriodo — ventas de revendedor", () => {
  it("ventas de revendedor solas (sin comprobantes/gastos) generan una fila de ventas", () => {
    const filas = calcularGananciaPorPeriodo(
      [],
      [],
      "mes",
      [{ fecha: "2026-09-12", monto_centavos: 70_000 }],
    );

    expect(filas).toEqual([
      {
        periodo: "2026-09",
        ventasCentavos: 70_000,
        costosCentavos: 0,
        gananciaCentavos: 70_000,
      },
    ]);
  });

  it("ventas de revendedor combinadas con comprobantes normales suman al mismo período", () => {
    const filas = calcularGananciaPorPeriodo(
      [{ fecha: "2026-09-05", monto_centavos: 100_000 }],
      [{ fecha: "2026-09-10", monto_centavos: 30_000 }],
      "mes",
      [{ fecha: "2026-09-20", monto_centavos: 45_000 }],
    );

    expect(filas).toEqual([
      {
        periodo: "2026-09",
        ventasCentavos: 145_000,
        costosCentavos: 30_000,
        gananciaCentavos: 115_000,
      },
    ]);
  });

  it("la venta de un revendedor cuenta en el período de SU venta, no en otro mes", () => {
    const filas = calcularGananciaPorPeriodo(
      [],
      [],
      "mes",
      [
        { fecha: "2026-08-30", monto_centavos: 10_000 },
        { fecha: "2026-09-01", monto_centavos: 20_000 },
      ],
    );

    expect(filas.map((f) => f.periodo)).toEqual(["2026-09", "2026-08"]);
  });

  it("sin pasar el cuarto parámetro, calcularGananciaPorPeriodo funciona igual que antes (default [])", () => {
    const filas = calcularGananciaPorPeriodo(
      [{ fecha: "2026-09-05", monto_centavos: 50_000 }],
      [],
      "mes",
    );
    expect(filas).toEqual([
      {
        periodo: "2026-09",
        ventasCentavos: 50_000,
        costosCentavos: 0,
        gananciaCentavos: 50_000,
      },
    ]);
  });
});
