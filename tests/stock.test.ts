import { describe, expect, it } from "vitest";
import {
  calcularBajoUmbral,
  calcularStock,
  type MovimientoStock,
} from "@/lib/dominio/calculos";

/**
 * Espejo de v_stock_actual (supabase/migrations/0002_views_rpcs.sql) —
 * ver contracts/database.md, invariante 4: el stock puede quedar negativo
 * solo cuando el movimiento se creó con `permitir_negativo = true` (la
 * vista no lo impide a nivel de base; es una regla de la capa de
 * aplicación que estos tests documentan con el caso límite).
 */

describe("calcularStock", () => {
  it("sin movimientos, stock es 0", () => {
    expect(calcularStock([])).toBe(0);
  });

  it("solo ingresos, suma directa", () => {
    const movimientos: MovimientoStock[] = [
      { tipo: "ingreso", cantidad: 50 },
      { tipo: "ingreso", cantidad: 30 },
    ];
    expect(calcularStock(movimientos)).toBe(80);
  });

  it("solo egresos, resulta negativo", () => {
    const movimientos: MovimientoStock[] = [
      { tipo: "egreso", cantidad: 10 },
      { tipo: "egreso", cantidad: 5 },
    ];
    expect(calcularStock(movimientos)).toBe(-15);
  });

  it("ingresos y egresos mezclados", () => {
    const movimientos: MovimientoStock[] = [
      { tipo: "ingreso", cantidad: 50 }, // producción
      { tipo: "egreso", cantidad: 2 }, // venta vía comprobante
      { tipo: "ingreso", cantidad: 10 }, // reposición
      { tipo: "egreso", cantidad: 3 }, // egreso manual
    ];
    expect(calcularStock(movimientos)).toBe(55);
  });

  it("caso del quickstart §US2: 50 ingresados, 2 vendidos por comprobante", () => {
    const movimientos: MovimientoStock[] = [
      { tipo: "ingreso", cantidad: 50 },
      { tipo: "egreso", cantidad: 2 },
    ];
    expect(calcularStock(movimientos)).toBe(48);
  });

  it("stock negativo permitido: un egreso manual mayor al disponible deja el stock en negativo", () => {
    // Disponible = 5 (por un ingreso previo); egreso manual de 8 con
    // permitir_negativo = true en la UI. La vista igual refleja -3: no hay
    // ningún CHECK de base de datos que lo impida.
    const movimientos: MovimientoStock[] = [
      { tipo: "ingreso", cantidad: 5 },
      { tipo: "egreso", cantidad: 8 },
    ];
    expect(calcularStock(movimientos)).toBe(-3);
  });

  it("borrar/reemplazar un movimiento (editar comprobante) recalcula sin el anterior", () => {
    // actualizar_comprobante borra los movimientos_stock del comprobante y
    // los vuelve a crear con los items nuevos; acá se simula pasando solo
    // los movimientos "vigentes" tras el reemplazo.
    const antesDeEditar: MovimientoStock[] = [
      { tipo: "ingreso", cantidad: 50 },
      { tipo: "egreso", cantidad: 2 }, // comprobante original: 2 unidades
    ];
    expect(calcularStock(antesDeEditar)).toBe(48);

    const despuesDeEditar: MovimientoStock[] = [
      { tipo: "ingreso", cantidad: 50 },
      { tipo: "egreso", cantidad: 5 }, // comprobante editado: ahora 5 unidades
    ];
    expect(calcularStock(despuesDeEditar)).toBe(45);
  });
});

describe("calcularBajoUmbral", () => {
  it("por debajo del umbral es true", () => {
    expect(calcularBajoUmbral(5, 10)).toBe(true);
  });

  it("igual al umbral NO es bajo (estrictamente menor)", () => {
    expect(calcularBajoUmbral(10, 10)).toBe(false);
  });

  it("por encima del umbral es false", () => {
    expect(calcularBajoUmbral(20, 10)).toBe(false);
  });

  it("stock negativo siempre está bajo umbral (salvo umbral también negativo)", () => {
    expect(calcularBajoUmbral(-3, 10)).toBe(true);
  });
});
