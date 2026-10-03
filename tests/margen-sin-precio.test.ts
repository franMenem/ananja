import { describe, expect, it } from "vitest";

import {
  agruparMargenVendedorPorPeriodo,
  unidadesSinPrecioRevendedorDePeriodo,
  type FilaMargenPeriodo,
} from "@/lib/dominio/margen";

const fila = (f: Partial<FilaMargenPeriodo>): FilaMargenPeriodo => ({
  origen: "revendedor",
  fecha: "2026-09-10",
  vendedorId: "ana",
  cantidad: 1,
  margenAnanjaCentavos: null,
  margenVendedorCentavos: null,
  precioUnitarioVentaCentavos: null,
  costoEstimado: false,
  ...f,
});

describe("unidadesSinPrecioRevendedorDePeriodo — /ganancia § Ganancia de los vendedores", () => {
  const filas = [
    fila({ cantidad: 3 }),
    fila({ cantidad: 2, fecha: "2026-08-01" }),
    // con precio: cuenta en el margen, no acá
    fila({ cantidad: 5, precioUnitarioVentaCentavos: 1500, margenVendedorCentavos: 2500 }),
    // comprobante sin precio unitario: normal, no se avisa
    fila({ origen: "comprobante", cantidad: 7 }),
  ];

  it("cuenta solo botellas de revendedora sin precio del período", () => {
    expect(unidadesSinPrecioRevendedorDePeriodo(filas, "mes", "2026-09")).toBe(3);
    expect(unidadesSinPrecioRevendedorDePeriodo(filas, "anio", "2026")).toBe(5);
    expect(unidadesSinPrecioRevendedorDePeriodo(filas, "mes", "2026-07")).toBe(0);
  });

  it("esas filas no aparecen en la tabla por vendedor (por eso se avisan aparte)", () => {
    const porMes = agruparMargenVendedorPorPeriodo([fila({ cantidad: 3 })], "mes");
    expect(porMes.get("2026-09")).toBeUndefined();
  });
});
