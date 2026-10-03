import { describe, expect, it } from "vitest";

import {
  agruparFacturasDeGastos,
  agruparGastosPorMes,
  mensajeErrorFacturaGasto,
  mesLabelGasto,
  rangoDeMes,
  resumenMesGastos,
  type FacturaGastoRow,
  type GastoParaAgrupar,
} from "@/lib/dominio/gastos";

describe("rangoDeMes", () => {
  it("da [inicio, fin) de un mes normal", () => {
    expect(rangoDeMes("2026-09")).toEqual({ desde: "2026-09-01", hasta: "2026-10-01" });
  });

  it("cruza el año en diciembre", () => {
    expect(rangoDeMes("2026-12")).toEqual({ desde: "2026-12-01", hasta: "2027-01-01" });
  });
});

describe("mesLabelGasto", () => {
  const ahora = new Date("2026-09-15T12:00:00Z");

  it("sin año si es el año en curso", () => {
    expect(mesLabelGasto("2026-09-05", ahora)).toBe("SEPTIEMBRE");
  });

  it("con año si no es el año en curso", () => {
    expect(mesLabelGasto("2025-08-01", ahora)).toBe("AGOSTO 2025");
  });
});

function gasto(extra: Partial<GastoParaAgrupar> = {}): GastoParaAgrupar {
  return { fecha: "2026-09-05", monto_centavos: 100000, categorias_gasto: { nombre: "Insumos" }, ...extra };
}

describe("resumenMesGastos", () => {
  it("suma el total y encuentra la categoría que más pesa", () => {
    const { totalCentavos, categoriaMasPesada } = resumenMesGastos([
      gasto({ monto_centavos: 100000, categorias_gasto: { nombre: "Insumos" } }),
      gasto({ monto_centavos: 300000, categorias_gasto: { nombre: "Envases" } }),
      gasto({ monto_centavos: 50000, categorias_gasto: { nombre: "Insumos" } }),
    ]);
    expect(totalCentavos).toBe(450000);
    expect(categoriaMasPesada).toBe("Envases");
  });

  it("agrupa sin categoría como 'Sin categoría'", () => {
    const { categoriaMasPesada } = resumenMesGastos([gasto({ categorias_gasto: null, monto_centavos: 1 })]);
    expect(categoriaMasPesada).toBe("Sin categoría");
  });

  it("sin gastos da total 0 y sin categoría más pesada", () => {
    expect(resumenMesGastos([])).toEqual({ totalCentavos: 0, categoriaMasPesada: null });
  });
});

describe("agruparGastosPorMes", () => {
  const ahora = new Date("2026-09-15T12:00:00Z");

  it("agrupa manteniendo el orden de entrada (fecha desc)", () => {
    const gastos = [
      gasto({ fecha: "2026-09-10" }),
      gasto({ fecha: "2026-09-01" }),
      gasto({ fecha: "2026-08-20" }),
    ];
    const grupos = agruparGastosPorMes(gastos, ahora);
    expect(grupos.map(([label]) => label)).toEqual(["SEPTIEMBRE", "AGOSTO"]);
    expect(grupos[0][1]).toHaveLength(2);
    expect(grupos[1][1]).toHaveLength(1);
  });
});

function facturaRow(extra: Partial<FacturaGastoRow> = {}): FacturaGastoRow {
  return {
    imagen_path: "gastos/2026/09/a.jpg",
    fecha: "2026-09-05",
    nota: null,
    categorias_gasto: { nombre: "Etiquetas" },
    ...extra,
  };
}

describe("agruparFacturasDeGastos", () => {
  it("sin filas da lista vacía", () => {
    expect(agruparFacturasDeGastos([])).toEqual([]);
  });

  it("ignora filas sin imagen_path", () => {
    expect(agruparFacturasDeGastos([facturaRow({ imagen_path: null })])).toEqual([]);
  });

  it("una fila por gasto sin factura compartida", () => {
    const rows = [
      facturaRow({ imagen_path: "a.jpg", fecha: "2026-09-05" }),
      facturaRow({ imagen_path: "b.jpg", fecha: "2026-09-01" }),
    ];
    const facturas = agruparFacturasDeGastos(rows);
    expect(facturas).toHaveLength(2);
    expect(facturas.map((f) => f.imagenPath)).toEqual(["a.jpg", "b.jpg"]);
    expect(facturas.every((f) => f.cantidadGastos === 1)).toBe(true);
  });

  it("agrupa por imagen_path — una misma factura cubre varios gastos", () => {
    // Ej. real: una factura de etiquetas grandes cubre "grande frente" Y
    // "grande retro", ambos gastos con el mismo `imagen_path`.
    const rows = [
      facturaRow({ imagen_path: "grandes.jpg", fecha: "2026-09-10", nota: "Etiqueta grande frente" }),
      facturaRow({ imagen_path: "grandes.jpg", fecha: "2026-09-10", nota: "Etiqueta grande retro" }),
    ];
    const facturas = agruparFacturasDeGastos(rows);
    expect(facturas).toHaveLength(1);
    expect(facturas[0]).toMatchObject({
      imagenPath: "grandes.jpg",
      cantidadGastos: 2,
      nota: "Etiqueta grande frente",
    });
  });

  it("la fila más reciente de cada grupo (primera, ya viene ordenada desc) aporta fecha/categoría/nota", () => {
    const rows = [
      facturaRow({
        imagen_path: "x.jpg",
        fecha: "2026-09-10",
        nota: "más reciente",
        categorias_gasto: { nombre: "Envases" },
      }),
      facturaRow({
        imagen_path: "x.jpg",
        fecha: "2026-08-01",
        nota: "más vieja",
        categorias_gasto: { nombre: "Otra" },
      }),
    ];
    const [factura] = agruparFacturasDeGastos(rows);
    expect(factura).toMatchObject({
      fecha: "2026-09-10",
      nota: "más reciente",
      categoriaNombre: "Envases",
      cantidadGastos: 2,
    });
  });

  it("preserva el orden de aparición del primer gasto de cada grupo (fecha desc)", () => {
    const rows = [
      facturaRow({ imagen_path: "reciente.jpg", fecha: "2026-09-10" }),
      facturaRow({ imagen_path: "vieja.jpg", fecha: "2026-08-01" }),
    ];
    const facturas = agruparFacturasDeGastos(rows);
    expect(facturas.map((f) => f.imagenPath)).toEqual(["reciente.jpg", "vieja.jpg"]);
  });

  it("sin categoría da categoriaNombre null", () => {
    const [factura] = agruparFacturasDeGastos([facturaRow({ categorias_gasto: null })]);
    expect(factura.categoriaNombre).toBeNull();
  });
});

describe("mensajeErrorFacturaGasto", () => {
  it("traduce NO_AUTORIZADO (código común)", () => {
    expect(mensajeErrorFacturaGasto("NO_AUTORIZADO")).toBe("No tenés permiso para esto.");
  });

  it("traduce GASTO_NO_ENCONTRADO", () => {
    expect(mensajeErrorFacturaGasto("GASTO_NO_ENCONTRADO")).toBe("Este gasto ya no existe.");
  });

  it("traduce PATH_INVALIDO", () => {
    expect(mensajeErrorFacturaGasto("PATH_INVALIDO")).toBe(
      "Ese archivo no es válido. Probá subiéndolo de nuevo.",
    );
  });

  it("cae al mensaje genérico con un código desconocido o sin código", () => {
    expect(mensajeErrorFacturaGasto("ALGO_RARO")).toBe(
      "No pudimos guardar la factura. Probá de nuevo.",
    );
    expect(mensajeErrorFacturaGasto(undefined)).toBe(
      "No pudimos guardar la factura. Probá de nuevo.",
    );
  });
});
