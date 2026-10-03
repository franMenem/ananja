import { describe, expect, it } from "vitest";

import { PALETA_GRAFICOS } from "@/lib/paleta-graficos";

/** Fondo contra el que se pintan los gráficos (`--color-background`,
 * `app/globals.css`, tema Ananja). */
const FONDO = "#F4EFEA";

/** Luminancia relativa WCAG (https://www.w3.org/TR/WCAG21/#dfn-relative-luminance),
 * sobre un hex de 6 dígitos. */
function luminanciaRelativa(hex: string): number {
  const [r, g, b] = (hex.match(/[0-9a-fA-F]{2}/g) ?? []).map((h) => parseInt(h, 16) / 255);
  const linealizar = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linealizar(r) + 0.7152 * linealizar(g) + 0.0722 * linealizar(b);
}

/** Ratio de contraste WCAG entre dos colores hex (siempre ≥ 1). */
function contraste(hexA: string, hexB: string): number {
  const lA = luminanciaRelativa(hexA);
  const lB = luminanciaRelativa(hexB);
  const [claro, oscuro] = lA >= lB ? [lA, lB] : [lB, lA];
  return (claro + 0.05) / (oscuro + 0.05);
}

describe("PALETA_GRAFICOS — contraste contra el fondo", () => {
  it("las 10 tienen contraste ≥ 3:1 contra --color-background (#F4EFEA)", () => {
    for (const color of PALETA_GRAFICOS) {
      expect(contraste(color, FONDO)).toBeGreaterThanOrEqual(3);
    }
  });

  it("son únicas (10 colores distintos, ninguno repetido)", () => {
    expect(new Set(PALETA_GRAFICOS).size).toBe(PALETA_GRAFICOS.length);
  });
});
