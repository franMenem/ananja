import { describe, expect, it } from "vitest";

import {
  calcularCierreFeria,
  diferenciaPlata,
  ERRORES_FERIA,
  medioDeMontos,
  mensajeErrorFeria,
  type ProductoCierreFeria,
} from "@/lib/dominio/feria";

const A: ProductoCierreFeria = { productoId: "a", nombre: "500 ml", entregadas: 10, precioCentavos: 10_000 };
const B: ProductoCierreFeria = { productoId: "b", nombre: "250 ml", entregadas: 6, precioCentavos: 6_000 };

describe("calcularCierreFeria", () => {
  it("vendidas = llevadas - devueltas - degustadas, con precio de feria", () => {
    const r = calcularCierreFeria([A, B], { a: 2 }, { a: 1, b: 1 }, {});
    expect(r.errores).toEqual([]);
    expect(r.filas[0]).toMatchObject({ vendidas: 7, subtotalCentavos: 70_000, precioCentavos: 10_000 });
    expect(r.filas[1]).toMatchObject({ vendidas: 5, subtotalCentavos: 30_000 });
    expect(r.totalCentavos).toBe(100_000);
  });

  it("el precio corregido por ella manda sobre el de la feria", () => {
    const r = calcularCierreFeria([A], {}, {}, { a: 9_000 });
    expect(r.filas[0].precioCentavos).toBe(9_000);
    expect(r.totalCentavos).toBe(90_000);
  });

  it("devolver y degustar más de lo llevado es un error y no suma", () => {
    const r = calcularCierreFeria([A], { a: 8 }, { a: 3 }, {});
    expect(r.filas[0].vendidas).toBe(-1);
    expect(r.errores).toHaveLength(1);
    expect(r.totalCentavos).toBe(0);
  });

  it("vender algo sin precio es un error", () => {
    const sinPrecio = { ...A, precioCentavos: null };
    const r = calcularCierreFeria([sinPrecio], { a: 5 }, {}, {});
    expect(r.errores).toEqual(["Falta el precio de 500 ml."]);
    expect(r.totalCentavos).toBe(0);
  });

  it("sin precio pero sin vender nada no es error", () => {
    const sinPrecio = { ...A, precioCentavos: null };
    const r = calcularCierreFeria([sinPrecio], { a: 10 }, {}, {});
    expect(r.errores).toEqual([]);
    expect(r.filas[0].vendidas).toBe(0);
  });

  it("cantidades negativas o con decimales son un error", () => {
    expect(calcularCierreFeria([A], { a: -1 }, {}, {}).errores.length).toBeGreaterThan(0);
    expect(calcularCierreFeria([A], { a: 1.5 }, {}, {}).errores.length).toBeGreaterThan(0);
  });

  it("una feria sin productos cierra en cero", () => {
    expect(calcularCierreFeria([], {}, {}, {})).toEqual({ filas: [], totalCentavos: 0, errores: [] });
  });
});

describe("calcularCierreFeria con ventas previas", () => {
  it("descuenta las ya vendidas de las vendidas nuevas", () => {
    const r = calcularCierreFeria([{ ...A, yaVendidas: 2 }], { a: 3 }, { a: 1 }, {});
    expect(r.errores).toEqual([]);
    expect(r.filas[0]).toMatchObject({ yaVendidas: 2, vendidas: 4, subtotalCentavos: 40_000 });
    expect(r.totalCentavos).toBe(40_000);
  });
  it("avisa si devuelve más de lo que le queda sin vender", () => {
    const r = calcularCierreFeria([{ ...A, yaVendidas: 8 }], { a: 3 }, {}, {});
    expect(r.errores.length).toBeGreaterThan(0);
  });
});

describe("medioDeMontos", () => {
  it("un solo monto > 0 da ese medio", () => {
    expect(medioDeMontos(100, 0, 0)).toBe("efectivo");
    expect(medioDeMontos(0, 100, 0)).toBe("mercado_pago");
    expect(medioDeMontos(0, 0, 100)).toBe("banco");
  });
  it("ninguno o varios dan null", () => {
    expect(medioDeMontos(0, 0, 0)).toBeNull();
    expect(medioDeMontos(100, 100, 0)).toBeNull();
    expect(medioDeMontos(100, 100, 100)).toBeNull();
  });
});

describe("diferenciaPlata", () => {
  it("cobrado - total", () => {
    expect(diferenciaPlata(100_000, 100_000)).toBe(0);
    expect(diferenciaPlata(100_000, 90_000)).toBe(-10_000);
    expect(diferenciaPlata(100_000, 120_000)).toBe(20_000);
  });
});

describe("mensajeErrorFeria", () => {
  it("traduce los códigos de la feria", () => {
    expect(mensajeErrorFeria("FERIA_CERRADA")).toBe("Esta feria ya está cerrada.");
    expect(mensajeErrorFeria("PARTICIPACION_CERRADA")).toBe("Ya cerraste tu participación en esta feria.");
    expect(mensajeErrorFeria("PARTICIPANTES_PENDIENTES")).toBe("Todavía hay participantes sin cerrar.");
    expect(mensajeErrorFeria("CANTIDAD_INVALIDA")).toBe("Estás devolviendo más de lo que se llevó.");
    expect(mensajeErrorFeria("PRECIO_NO_ASIGNADO")).toBe("Falta el precio de feria de un producto.");
    expect(ERRORES_FERIA.PARTICIPANTE_CON_MOVIMIENTOS).toBeTruthy();
    expect(ERRORES_FERIA.VENTA_DE_FERIA).toContain("reabra tu participación");
  });
  it("un código desconocido cae al mensaje por defecto", () => {
    expect(mensajeErrorFeria("XYZ")).toBe("No se pudo guardar. Probá de nuevo.");
    expect(mensajeErrorFeria(null)).toBe("No se pudo guardar. Probá de nuevo.");
  });
});
