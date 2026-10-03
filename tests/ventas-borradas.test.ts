import { describe, expect, it } from "vitest";

import { formatDiaMes, formatDiaMesHora } from "@/lib/fechas";
import { agruparVentasBorradas, type FilaVentaBorrada } from "@/lib/dominio/ventas-revendedor";

/**
 * "Ventas borradas" de la ficha de la revendedora
 * (`ventas_revendedor_borradas`, supabase/migrations/0045_ventas_borradas_y_duplicados.sql § 1).
 */

const fila = (cambio: Partial<FilaVentaBorrada>): FilaVentaBorrada => ({
  grupo_id: "g1",
  fecha: "2026-08-27",
  producto_id: "p500",
  cantidad: 10,
  precio_venta_centavos: 800_000,
  borrada_por: "admin-1",
  borrada_at: "2026-09-15T18:20:00+00:00",
  ...cambio,
});

describe("agruparVentasBorradas", () => {
  it("una venta partida en dos entregas se muestra como una sola", () => {
    const resultado = agruparVentasBorradas([
      fila({ cantidad: 10 }),
      fila({ cantidad: 3, borrada_at: "2026-09-15T18:20:00.5+00:00" }),
    ]);
    expect(resultado).toEqual([
      {
        grupoId: "g1",
        fecha: "2026-08-27",
        productoId: "p500",
        cantidad: 13,
        precioVentaCentavos: 800_000,
        borradaPor: "admin-1",
        borradaAt: "2026-09-15T18:20:00.5+00:00",
      },
    ]);
  });

  it("la más recién borrada arriba", () => {
    const resultado = agruparVentasBorradas([
      fila({ grupo_id: "vieja", borrada_at: "2026-09-10T10:00:00+00:00" }),
      fila({ grupo_id: "nueva", borrada_at: "2026-09-15T10:00:00+00:00" }),
    ]);
    expect(resultado.map((v) => v.grupoId)).toEqual(["nueva", "vieja"]);
  });

  it("sin filas, nada", () => {
    expect(agruparVentasBorradas([])).toEqual([]);
  });
});

describe("formatDiaMes / formatDiaMesHora", () => {
  it("día y mes con ceros", () => {
    expect(formatDiaMes("2026-08-07")).toBe("07/08");
  });

  it("día y hora de Argentina de un timestamp", () => {
    expect(formatDiaMesHora("2026-09-15T18:20:00Z")).toBe("15/09 15:20");
    // 01:30 UTC del 16 = 22:30 del 15 en Argentina
    expect(formatDiaMesHora("2026-09-16T01:30:00Z")).toBe("15/09 22:30");
  });
});
