import { describe, expect, it } from "vitest";
import {
  centavosToNumber,
  formatCentavos,
  formatMonto,
  parseCantidadInput,
  parseMontoInput,
  parsePorcentaje,
} from "@/lib/money";

describe("formatCentavos", () => {
  it("formatea cero", () => {
    expect(formatCentavos(0)).toBe("$ 0,00");
    expect(formatCentavos(BigInt(0))).toBe("$ 0,00");
  });

  it("formatea montos sin separador de miles", () => {
    expect(formatCentavos(100)).toBe("$ 1,00");
    expect(formatCentavos(150)).toBe("$ 1,50");
    expect(formatCentavos(5)).toBe("$ 0,05");
    expect(formatCentavos(99)).toBe("$ 0,99");
  });

  it("formatea montos con separador de miles", () => {
    expect(formatCentavos(123456)).toBe("$ 1.234,56");
    expect(formatCentavos(100000000)).toBe("$ 1.000.000,00");
    expect(formatCentavos(1000000)).toBe("$ 10.000,00");
  });

  it("formatea montos negativos", () => {
    expect(formatCentavos(-123456)).toBe("-$ 1.234,56");
    expect(formatCentavos(-5)).toBe("-$ 0,05");
  });

  it("no muestra signo negativo para -0", () => {
    expect(formatCentavos(-0)).toBe("$ 0,00");
  });

  it("acepta bigint directamente", () => {
    expect(formatCentavos(BigInt(123456789))).toBe("$ 1.234.567,89");
  });

  it("redondea numbers no enteros (defensivo)", () => {
    expect(formatCentavos(150.4)).toBe("$ 1,50");
    expect(formatCentavos(150.6)).toBe("$ 1,51");
  });
});

describe("parseMontoInput", () => {
  it("parsea enteros simples", () => {
    expect(parseMontoInput("1234")).toBe(123400);
    expect(parseMontoInput("0")).toBe(0);
    expect(parseMontoInput("1")).toBe(100);
  });

  it("parsea con separador de miles y decimales", () => {
    expect(parseMontoInput("1.234,56")).toBe(123456);
    expect(parseMontoInput("1.000.000,00")).toBe(100000000);
    expect(parseMontoInput("10.000")).toBe(1000000);
  });

  it("parsea con un solo decimal (decenas de centavo)", () => {
    expect(parseMontoInput("1234,5")).toBe(123450);
    expect(parseMontoInput("0,5")).toBe(50);
  });

  it("parsea con dos decimales", () => {
    expect(parseMontoInput("1234,56")).toBe(123456);
    expect(parseMontoInput("0,00")).toBe(0);
    expect(parseMontoInput("0,05")).toBe(5);
  });

  it("ignora el signo $ y espacios", () => {
    expect(parseMontoInput("$ 1.234")).toBe(123400);
    expect(parseMontoInput("$1.234,56")).toBe(123456);
    expect(parseMontoInput("  1234  ")).toBe(123400);
    expect(parseMontoInput("$ 1 234")).toBe(123400);
  });

  it("parsea montos negativos (ajustes, egresos)", () => {
    expect(parseMontoInput("-1234")).toBe(-123400);
    expect(parseMontoInput("-1.234,56")).toBe(-123456);
    expect(parseMontoInput("-$ 1.234,56")).toBe(-123456);
    expect(parseMontoInput("$ -1.234,56")).toBe(-123456);
  });

  it("normaliza -0 a 0 (sin signo negativo espurio)", () => {
    expect(parseMontoInput("-0")).toBe(0);
    expect(parseMontoInput("-0,00")).toBe(0);
    expect(Object.is(parseMontoInput("-0"), -0)).toBe(false);
  });

  it("devuelve null para entradas vacías o solo espacios", () => {
    expect(parseMontoInput("")).toBeNull();
    expect(parseMontoInput("   ")).toBeNull();
    expect(parseMontoInput("$")).toBeNull();
    expect(parseMontoInput("$  ")).toBeNull();
  });

  it("devuelve null para basura no numérica", () => {
    expect(parseMontoInput("abc")).toBeNull();
    expect(parseMontoInput("12a34")).toBeNull();
    expect(parseMontoInput("NaN")).toBeNull();
    expect(parseMontoInput("--123")).toBeNull();
    expect(parseMontoInput("12,34,56")).toBeNull();
    expect(parseMontoInput("1.2.3")).toBeNull();
  });

  it("devuelve null para agrupación de miles inválida", () => {
    expect(parseMontoInput("12.34.56")).toBeNull();
    expect(parseMontoInput("1.23.456")).toBeNull();
  });

  // Desde lib/calculo-monto.ts "." y "," son intercambiables como decimal:
  // "1.23" (antes null) es 1,23, y más de dos decimales (antes null) se
  // redondean a centavos. Casos completos en tests/calculo-monto.test.ts.
  it("un punto que no agrupa miles es decimal", () => {
    expect(parseMontoInput("1.23")).toBe(123);
  });

  it("más de dos decimales se redondean a centavos", () => {
    expect(parseMontoInput("1234,567")).toBe(123457);
    expect(parseMontoInput("1234,5678")).toBe(123457);
    expect(parseMontoInput("1234,564")).toBe(123456);
  });

  it("devuelve null para separadores decimales sin dígitos", () => {
    expect(parseMontoInput("1234,")).toBeNull();
    expect(parseMontoInput(",56")).toBeNull();
    expect(parseMontoInput(",")).toBeNull();
  });

  it("devuelve null para solo un signo", () => {
    expect(parseMontoInput("-")).toBeNull();
    expect(parseMontoInput("$-")).toBeNull();
  });

  it("acepta números grandes con múltiples grupos de miles", () => {
    expect(parseMontoInput("1.234.567,89")).toBe(123456789);
  });

  it("mantiene ceros a la izquierda dentro de un grupo", () => {
    expect(parseMontoInput("01")).toBe(100);
    expect(parseMontoInput("00")).toBe(0);
  });
});

describe("centavosToNumber", () => {
  it("convierte bigint a number", () => {
    expect(centavosToNumber(BigInt(123456))).toBe(123456);
  });

  it("devuelve number sin cambios", () => {
    expect(centavosToNumber(123456)).toBe(123456);
  });
});

describe("parsePorcentaje", () => {
  it("parsea enteros", () => {
    expect(parsePorcentaje("8")).toBe(8);
    expect(parsePorcentaje("0")).toBe(0);
    expect(parsePorcentaje("100")).toBe(100);
  });

  it("parsea con coma decimal", () => {
    expect(parsePorcentaje("8,5")).toBe(8.5);
  });

  it("parsea con punto decimal", () => {
    expect(parsePorcentaje("8.5")).toBe(8.5);
  });

  it("ignora espacios", () => {
    expect(parsePorcentaje(" 8,5 ")).toBe(8.5);
  });

  it("devuelve null para entrada vacía o solo espacios", () => {
    expect(parsePorcentaje("")).toBeNull();
    expect(parsePorcentaje("   ")).toBeNull();
  });

  it("devuelve null para basura no numérica", () => {
    expect(parsePorcentaje("abc")).toBeNull();
    expect(parsePorcentaje("8a")).toBeNull();
  });

  it("devuelve null para negativos", () => {
    expect(parsePorcentaje("-1")).toBeNull();
    expect(parsePorcentaje("-1,5")).toBeNull();
  });

  it("redondea a 2 decimales (numeric(5,2) de la base)", () => {
    expect(parsePorcentaje("8,555")).toBe(8.56);
    expect(parsePorcentaje("8,554")).toBe(8.55);
    expect(parsePorcentaje("8,1")).toBe(8.1);
  });
});

describe("parseCantidadInput", () => {
  it("parsea con coma decimal", () => {
    expect(parseCantidadInput("0,5")).toBe(0.5);
  });

  it("parsea con punto decimal", () => {
    expect(parseCantidadInput("0.5")).toBe(0.5);
  });

  it("parsea enteros", () => {
    expect(parseCantidadInput("12")).toBe(12);
    expect(parseCantidadInput("0")).toBe(0);
  });

  it("ignora espacios", () => {
    expect(parseCantidadInput(" 12 ")).toBe(12);
  });

  it("redondea a 3 decimales (numeric(12,3) de la base)", () => {
    expect(parseCantidadInput("1,2344")).toBe(1.234);
    expect(parseCantidadInput("1,2346")).toBe(1.235);
  });

  it("devuelve null para entrada vacía o solo espacios", () => {
    expect(parseCantidadInput("")).toBeNull();
    expect(parseCantidadInput("   ")).toBeNull();
  });

  it("devuelve null para negativos", () => {
    expect(parseCantidadInput("-1")).toBeNull();
    expect(parseCantidadInput("-0,5")).toBeNull();
  });

  it("devuelve null para basura no numérica", () => {
    expect(parseCantidadInput("abc")).toBeNull();
    expect(parseCantidadInput("12a")).toBeNull();
  });

  it("un separador seguido de exactamente 3 dígitos es separador de miles", () => {
    expect(parseCantidadInput("1.500")).toBe(1500);
    expect(parseCantidadInput("1,500")).toBe(1500);
  });

  it("un separador seguido de 1-2 dígitos es decimal", () => {
    expect(parseCantidadInput("1.5")).toBe(1.5);
    expect(parseCantidadInput("0,25")).toBe(0.25);
  });

  it("dos separadores distintos: el último es decimal", () => {
    expect(parseCantidadInput("1.500,5")).toBe(1500.5);
    expect(parseCantidadInput("1,500.5")).toBe(1500.5);
  });
});

describe("formatMonto", () => {
  it("formatea USD sin el signo $, con el prefijo USD", () => {
    expect(formatMonto("USD", 182400)).toBe("USD 1.824,00");
    expect(formatMonto("USD", 0)).toBe("USD 0,00");
  });

  it("formatea ARS igual que formatCentavos", () => {
    expect(formatMonto("ARS", 123456)).toBe("$ 1.234,56");
    expect(formatMonto("ARS", 0)).toBe("$ 0,00");
  });
});

describe("round-trip formatCentavos(parseMontoInput(...))", () => {
  it.each([
    ["1234", "$ 1.234,00"],
    ["1.234,56", "$ 1.234,56"],
    ["1234,5", "$ 1.234,50"],
    ["$ 1.234", "$ 1.234,00"],
    ["0", "$ 0,00"],
  ])("parsea %s y formatea %s", (input, expected) => {
    const cents = parseMontoInput(input);
    expect(cents).not.toBeNull();
    expect(formatCentavos(cents as number)).toBe(expected);
  });
});
