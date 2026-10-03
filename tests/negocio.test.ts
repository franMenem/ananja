import { describe, expect, it } from "vitest";
import {
  capitalizar,
  concordar,
  envase,
  formatPresentacion,
  type NegocioConfig,
} from "@/lib/negocio";

// Los helpers de lib/negocio.ts aceptan un `negocio` explícito (default
// `NEGOCIO`, resuelto de la env var) justamente para poder testear ambos
// negocios sin depender de NEXT_PUBLIC_NEGOCIO — ver comentario en
// formatPresentacion.
const ACEITE: Pick<NegocioConfig, "unidad"> = { unidad: "ml" };
const MIEL: Pick<NegocioConfig, "unidad"> = { unidad: "g" };

const BOTELLA: Pick<NegocioConfig, "envase"> = {
  envase: { singular: "botella", plural: "botellas", genero: "f" },
};
const FRASCO: Pick<NegocioConfig, "envase"> = {
  envase: { singular: "frasco", plural: "frascos", genero: "m" },
};

describe("formatPresentacion", () => {
  it("aceite (ml): siempre en ml, sin conversión", () => {
    expect(formatPresentacion(250, ACEITE)).toBe("250 ml");
    expect(formatPresentacion(1000, ACEITE)).toBe("1000 ml");
  });

  it("miel (g): gramos por debajo de 1000", () => {
    expect(formatPresentacion(500, MIEL)).toBe("500 g");
    expect(formatPresentacion(1, MIEL)).toBe("1 g");
  });

  it("miel (g): kg solo si es múltiplo exacto de 1000", () => {
    expect(formatPresentacion(1000, MIEL)).toBe("1 kg");
    expect(formatPresentacion(2000, MIEL)).toBe("2 kg");
    expect(formatPresentacion(1500, MIEL)).toBe("1500 g");
  });

  it("null/undefined da el placeholder de siempre", () => {
    expect(formatPresentacion(null, ACEITE)).toBe("?");
    expect(formatPresentacion(undefined, MIEL)).toBe("?");
  });
});

describe("envase", () => {
  it("singular/plural según la cantidad", () => {
    expect(envase(1, BOTELLA)).toBe("botella");
    expect(envase(2, BOTELLA)).toBe("botellas");
    expect(envase(0, BOTELLA)).toBe("botellas");
    expect(envase(1, FRASCO)).toBe("frasco");
    expect(envase(3, FRASCO)).toBe("frascos");
  });
});

describe("concordar", () => {
  it("elige femenino para Ananja (botella) y masculino para Germá (frasco)", () => {
    expect(concordar("cuántos", "cuántas", BOTELLA)).toBe("cuántas");
    expect(concordar("cuántos", "cuántas", FRASCO)).toBe("cuántos");
    expect(concordar("vendidos", "vendidas", BOTELLA)).toBe("vendidas");
    expect(concordar("vendidos", "vendidas", FRASCO)).toBe("vendidos");
  });
});

describe("capitalizar", () => {
  it("mayúscula solo en la primera letra", () => {
    expect(capitalizar("botellas")).toBe("Botellas");
    expect(capitalizar("frascos")).toBe("Frascos");
  });
});
