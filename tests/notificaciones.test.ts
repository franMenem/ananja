import { describe, expect, it } from "vitest";

import { fraseDeAviso, grupoDeFecha } from "@/lib/dominio/notificaciones";

describe("fraseDeAviso", () => {
  it("stock_bajo con info completa: nombre + cantidad + mínimo", () => {
    const frase = fraseDeAviso(
      {
        tipo: "stock_bajo",
        titulo: "Stock bajo: Botella 500 ml",
        detalle: "Quedan 3 unidades",
        referencia_id: "prod-1",
      },
      new Map([["prod-1", { presentacion_ml: 500, umbral_minimo: 5 }]]),
      new Map(),
    );

    expect(frase).toBe(
      "500 ml quedó en 3 unidades, por debajo del mínimo de 5.",
    );
  });

  it("stock_bajo sin mínimo cargado: frase sin la cláusula de mínimo", () => {
    const frase = fraseDeAviso(
      {
        tipo: "stock_bajo",
        titulo: "Stock bajo: Botella 250 ml",
        detalle: "Quedan 1 unidades",
        referencia_id: "prod-2",
      },
      new Map([["prod-2", { presentacion_ml: 250, umbral_minimo: null }]]),
      new Map(),
    );

    expect(frase).toBe("250 ml quedó en 1 unidad.");
  });

  it("stock_bajo sin producto en el mapa: usa el nombre del título y sigue mostrando cantidad", () => {
    const frase = fraseDeAviso(
      {
        tipo: "stock_bajo",
        titulo: "Stock bajo: Botella 500 ml",
        detalle: "Quedan 2 unidades",
        referencia_id: "prod-inexistente",
      },
      new Map(),
      new Map(),
    );

    expect(frase).toBe("Botella 500 ml quedó en 2 unidades.");
  });

  it("stock_bajo sin poder leer una cantidad del detalle: cae al título", () => {
    const frase = fraseDeAviso(
      {
        tipo: "stock_bajo",
        titulo: "Stock bajo: Botella 500 ml",
        detalle: null,
        referencia_id: "prod-1",
      },
      new Map([["prod-1", { presentacion_ml: 500, umbral_minimo: 5 }]]),
      new Map(),
    );

    expect(frase).toBe("Stock bajo: Botella 500 ml");
  });

  it("gasto_nuevo con info completa: vendedor + monto + categoría + medio", () => {
    const frase = fraseDeAviso(
      {
        tipo: "gasto_nuevo",
        titulo: "Gasto nuevo",
        detalle: null,
        referencia_id: "gasto-1",
      },
      new Map(),
      new Map([
        [
          "gasto-1",
          {
            monto_centavos: 500000,
            medio_pago: "efectivo",
            categoria: "Envases",
            vendedor: "Fran",
          },
        ],
      ]),
    );

    expect(frase).toBe("Fran registró $ 5.000 en Envases, pagado en efectivo.");
  });

  it("gasto_nuevo sin vendedor ni categoría: cae a los genéricos", () => {
    const frase = fraseDeAviso(
      {
        tipo: "gasto_nuevo",
        titulo: "Gasto nuevo",
        detalle: null,
        referencia_id: "gasto-2",
      },
      new Map(),
      new Map([
        [
          "gasto-2",
          {
            monto_centavos: 120000,
            medio_pago: "mercado_pago",
            categoria: null,
            vendedor: null,
          },
        ],
      ]),
    );

    expect(frase).toBe(
      "Alguien registró $ 1.200 en un gasto, pagado por Mercado Pago.",
    );
  });

  it("gasto_nuevo sin fila de gasto en el mapa: cae al título", () => {
    const frase = fraseDeAviso(
      {
        tipo: "gasto_nuevo",
        titulo: "Gasto nuevo",
        detalle: null,
        referencia_id: "gasto-inexistente",
      },
      new Map(),
      new Map(),
    );

    expect(frase).toBe("Gasto nuevo");
  });
});

describe("grupoDeFecha", () => {
  const ahora = new Date("2026-09-16T15:00:00");

  it("una fecha de hoy agrupa como \"Hoy\"", () => {
    expect(grupoDeFecha("2026-09-16T08:00:00", ahora)).toBe("Hoy");
  });

  it("una fecha de ayer agrupa como \"Ayer\"", () => {
    expect(grupoDeFecha("2026-09-15T23:00:00", ahora)).toBe("Ayer");
  });

  it("una fecha más vieja agrupa por fecha larga en español, con mayúscula inicial", () => {
    expect(grupoDeFecha("2026-09-10T12:00:00", ahora)).toBe("10 de septiembre");
  });
});
