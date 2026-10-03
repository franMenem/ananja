import { describe, expect, it } from "vitest";

import {
  evaluarCuenta,
  parseEnteroInput,
  parseNumeroToken,
  redondearRacional,
  tieneOperador,
} from "@/lib/dominio/calculo-monto";
import { resolverCampoNumerico } from "@/lib/dominio/campo-numerico";
import { parsePctInput } from "@/lib/dominio/lotes";
import {
  formatMontoDisplay,
  parseCantidadInput,
  parseMontoInput,
  parsePorcentaje,
} from "@/lib/money";

const B = (n: number) => BigInt(n);

describe("parseMontoInput — ejemplos del dueño", () => {
  it("150000+50000", () => {
    expect(parseMontoInput("150000+50000")).toBe(20_000_000);
  });

  it("1.800*1,21 (miles con punto, decimal con coma)", () => {
    expect(parseMontoInput("1.800*1,21")).toBe(217_800);
  });

  it("(80000,5+20000,5)*1.21", () => {
    expect(parseMontoInput("(80000,5+20000,5)*1.21")).toBe(12_100_121);
  });
});

describe("parseMontoInput — separadores", () => {
  it("con punto y coma: el último es el decimal", () => {
    expect(parseMontoInput("1.800,50")).toBe(180_050);
    expect(parseMontoInput("1,800.50")).toBe(180_050);
    expect(parseMontoInput("1.234.567,89")).toBe(123_456_789);
    expect(parseMontoInput("1,234,567.89")).toBe(123_456_789);
  });

  it("con punto y coma: grupos de miles inválidos o decimal repetido → null", () => {
    expect(parseMontoInput("1.23,5")).toBeNull();
    expect(parseMontoInput("1234.567,8")).toBeNull();
    expect(parseMontoInput("1,000.000,5")).toBeNull();
    expect(parseMontoInput("1.000,000.5")).toBeNull();
  });

  it("solo una coma: siempre decimal (redondeado a centavos)", () => {
    expect(parseMontoInput("12,345")).toBe(1_235);
    expect(parseMontoInput("12,34")).toBe(1_234);
    expect(parseMontoInput("1,5")).toBe(150);
    expect(parseMontoInput("1234,567")).toBe(123_457);
  });

  it("varias comas con grupos de 3: miles", () => {
    expect(parseMontoInput("1,000,000")).toBe(100_000_000);
    expect(parseMontoInput("12,34,56")).toBeNull();
  });

  it("varios puntos con grupos de 3: miles", () => {
    expect(parseMontoInput("1.000.000")).toBe(100_000_000);
    expect(parseMontoInput("1.2.3")).toBeNull();
    expect(parseMontoInput("12.34.56")).toBeNull();
    expect(parseMontoInput("1.23.456")).toBeNull();
    expect(parseMontoInput("1234.567.890")).toBeNull();
  });

  it("un punto + exactamente 3 dígitos con parte entera de 1 a 3 dígitos: miles", () => {
    expect(parseMontoInput("1.800")).toBe(180_000);
    expect(parseMontoInput("40.000")).toBe(4_000_000);
    expect(parseMontoInput("999.999")).toBe(99_999_900);
  });

  it("caso ambiguo documentado: 12.345 se lee 98425", () => {
    expect(parseMontoInput("12.345")).toBe(1_234_500);
  });

  it("un punto en cualquier otro caso: decimal", () => {
    expect(parseMontoInput("12.34")).toBe(1_234);
    expect(parseMontoInput("4.5")).toBe(450);
    expect(parseMontoInput("1.23")).toBe(123);
    expect(parseMontoInput("1234.567")).toBe(123_457);
    expect(parseMontoInput("1.2345")).toBe(123);
  });

  it("números grandes", () => {
    expect(parseMontoInput("1.000.000.000,00")).toBe(100_000_000_000);
    expect(parseMontoInput("1,000,000,000.00")).toBe(100_000_000_000);
    expect(parseMontoInput("1000000000*1000")).toBe(100_000_000_000_000);
  });

  it("fuera del rango exacto de number → null", () => {
    expect(parseMontoInput("99999999999999999999")).toBeNull();
  });

  it("separadores mal ubicados → null", () => {
    expect(parseMontoInput("1234,")).toBeNull();
    expect(parseMontoInput(",56")).toBeNull();
    expect(parseMontoInput(".5")).toBeNull();
    expect(parseMontoInput("1..2")).toBeNull();
    expect(parseMontoInput("1,.2")).toBeNull();
  });
});

describe("parseMontoInput — cuentas", () => {
  it("precedencia y asociatividad", () => {
    expect(parseMontoInput("2+3*4")).toBe(1_400);
    expect(parseMontoInput("(2+3)*4")).toBe(2_000);
    expect(parseMontoInput("10-2-3")).toBe(500);
    expect(parseMontoInput("100/4/5")).toBe(500);
    expect(parseMontoInput("2*(3+(4-1))")).toBe(1_200);
  });

  it("menos unario", () => {
    expect(parseMontoInput("-500")).toBe(-50_000);
    expect(parseMontoInput("2*-3")).toBe(-600);
    expect(parseMontoInput("-(2+3)")).toBe(-500);
    expect(parseMontoInput("5--3")).toBe(800);
    expect(parseMontoInput("-2*-3")).toBe(600);
  });

  it("dos menos seguidos o más unario → null (como antes)", () => {
    expect(parseMontoInput("--5")).toBeNull();
    expect(parseMontoInput("+5")).toBeNull();
  });

  it("otros símbolos de operación", () => {
    expect(parseMontoInput("2x3")).toBe(600);
    expect(parseMontoInput("2X3")).toBe(600);
    expect(parseMontoInput("2×3")).toBe(600);
    expect(parseMontoInput("6÷4")).toBe(150);
    expect(parseMontoInput("10 − 4")).toBe(600);
    expect(parseMontoInput("10 – 4")).toBe(600);
  });

  it("espacios, $ y % se ignoran", () => {
    expect(parseMontoInput(" $ 1.000 + $ 500 ")).toBe(150_000);
    expect(parseMontoInput("1.800 * 21%")).toBe(3_780_000);
  });

  it("aritmética exacta, sin error de coma flotante", () => {
    expect(parseMontoInput("0,1+0,2")).toBe(30);
    expect(parseMontoInput("1,15*100")).toBe(11_500);
    expect(parseMontoInput("0,07*3")).toBe(21);
  });

  it("redondeo a centavos al final, mitades hacia afuera del cero", () => {
    expect(parseMontoInput("10/3")).toBe(333);
    expect(parseMontoInput("20/3")).toBe(667);
    expect(parseMontoInput("1/8")).toBe(13);
    expect(parseMontoInput("-1/8")).toBe(-13);
    expect(parseMontoInput("0,005")).toBe(1);
    expect(parseMontoInput("-0,005")).toBe(-1);
    expect(parseMontoInput("0,004")).toBe(0);
    expect(parseMontoInput("(10/3)*3")).toBe(1_000);
  });

  it("cuentas inválidas → null", () => {
    expect(parseMontoInput("5+")).toBeNull();
    expect(parseMontoInput("(5+3")).toBeNull();
    expect(parseMontoInput("5++3")).toBeNull();
    expect(parseMontoInput("2)")).toBeNull();
    expect(parseMontoInput("()")).toBeNull();
    expect(parseMontoInput("2(3)")).toBeNull();
    expect(parseMontoInput("*5")).toBeNull();
    expect(parseMontoInput("5/0")).toBeNull();
    expect(parseMontoInput("5/(2-2)")).toBeNull();
    expect(parseMontoInput("5+a")).toBeNull();
  });

  it("nunca devuelve -0", () => {
    expect(Object.is(parseMontoInput("0*-1"), -0)).toBe(false);
    expect(Object.is(parseMontoInput("-0,001"), -0)).toBe(false);
  });
});

describe("parseMontoInput — compatibilidad con lo que ya aceptaba", () => {
  const casos: [string, number][] = [
    ["1234", 123_400],
    ["0", 0],
    ["1", 100],
    ["1.234,56", 123_456],
    ["1.000.000,00", 100_000_000],
    ["10.000", 1_000_000],
    ["1234,5", 123_450],
    ["0,5", 50],
    ["1234,56", 123_456],
    ["0,00", 0],
    ["0,05", 5],
    ["$ 1.234", 123_400],
    ["$1.234,56", 123_456],
    ["  1234  ", 123_400],
    ["$ 1 234", 123_400],
    ["-1234", -123_400],
    ["-1.234,56", -123_456],
    ["-$ 1.234,56", -123_456],
    ["$ -1.234,56", -123_456],
    ["-0", 0],
    ["-0,00", 0],
    ["1.234.567,89", 123_456_789],
    ["01", 100],
    ["00", 0],
    // "0.500" antes daba $ 500; ahora es $ 0,50 (tests/campo-numerico.test.ts).
    ["200.000,00", 20_000_000],
  ];
  it.each(casos)("%s", (entrada, esperado) => {
    expect(parseMontoInput(entrada)).toBe(esperado);
  });

  it("sigue rechazando lo que no es un monto", () => {
    for (const entrada of ["", "   ", "$", "$  ", "abc", "12a34", "NaN", "-", "$-", ",", "--123"]) {
      expect(parseMontoInput(entrada)).toBeNull();
    }
  });

  it("ida y vuelta con formatMontoDisplay", () => {
    for (const c of [0, 1, 5, 99, 100, 150, 123_456, 180_050, 100_000_000_000, -123_456]) {
      expect(parseMontoInput(formatMontoDisplay(c))).toBe(c);
    }
  });
});

describe("evaluarCuenta", () => {
  it("motivos de error", () => {
    expect(evaluarCuenta("")).toMatchObject({ ok: false, motivo: "vacia" });
    expect(evaluarCuenta(" $ ")).toMatchObject({ ok: false, motivo: "vacia" });
    expect(evaluarCuenta("5/0")).toMatchObject({ ok: false, motivo: "division-por-cero" });
    expect(evaluarCuenta("5+")).toMatchObject({ ok: false, motivo: "incompleta" });
    expect(evaluarCuenta("(5")).toMatchObject({ ok: false, motivo: "incompleta" });
    expect(evaluarCuenta("5)")).toMatchObject({ ok: false, motivo: "sintaxis" });
    expect(evaluarCuenta("5a")).toMatchObject({ ok: false, motivo: "caracter-invalido" });
    expect(evaluarCuenta("1..2")).toMatchObject({ ok: false, motivo: "numero-invalido" });
  });

  it("esCuenta: solo con operadores o paréntesis (un menos de signo no cuenta)", () => {
    expect(evaluarCuenta("-500").esCuenta).toBe(false);
    expect(evaluarCuenta("$ -1.234,56").esCuenta).toBe(false);
    expect(evaluarCuenta("1.500,00").esCuenta).toBe(false);
    expect(evaluarCuenta("5-3").esCuenta).toBe(true);
    expect(evaluarCuenta("(5)").esCuenta).toBe(true);
    expect(evaluarCuenta("5+").esCuenta).toBe(true);
    expect(tieneOperador("2x3")).toBe(true);
    expect(tieneOperador("abc")).toBe(false);
  });

  it("resultado exacto como fracción reducida", () => {
    expect(evaluarCuenta("10/4")).toMatchObject({ ok: true, valor: { num: B(5), den: B(2) } });
    expect(evaluarCuenta("1/3+1/6")).toMatchObject({ ok: true, valor: { num: B(1), den: B(2) } });
  });
});

describe("parseNumeroToken por modo", () => {
  it("monto", () => {
    expect(parseNumeroToken("1.800")).toEqual({ num: B(1800), den: B(1) });
    expect(parseNumeroToken("1800.5")).toEqual({ num: B(3601), den: B(2) });
  });

  it("porcentaje: un separador siempre decimal", () => {
    expect(parseNumeroToken("1.500", "porcentaje")).toEqual({ num: B(3), den: B(2) });
    expect(parseNumeroToken("1,500", "porcentaje")).toEqual({ num: B(3), den: B(2) });
    expect(parseNumeroToken("1.000.000", "porcentaje")).toEqual({ num: B(1_000_000), den: B(1) });
  });

  it("cantidad: reglas históricas (un separador + 3 dígitos = miles)", () => {
    expect(parseNumeroToken("1,500", "cantidad")).toEqual({ num: B(1500), den: B(1) });
    expect(parseNumeroToken("1234.567", "cantidad")).toEqual({ num: B(1_234_567), den: B(1) });
    expect(parseNumeroToken("1.500,5", "cantidad")).toEqual({ num: B(3001), den: B(2) });
    expect(parseNumeroToken("1,2340", "cantidad")).toEqual({ num: B(617), den: B(500) });
    expect(parseNumeroToken("1.000.000", "cantidad")).toEqual({ num: B(1_000_000), den: B(1) });
    expect(parseNumeroToken("1.5.5", "cantidad")).toBeNull();
  });

  it("cantidad: con parte entera 0, los 3 dígitos son decimales ('0,750' no es 750)", () => {
    expect(parseNumeroToken("0,750", "cantidad")).toEqual({ num: B(3), den: B(4) });
    expect(parseNumeroToken("0.734", "cantidad")).toEqual({ num: B(367), den: B(500) });
    expect(parseCantidadInput("0,750")).toBe(0.75);
  });
});

describe("redondearRacional", () => {
  it("mitades hacia afuera del cero", () => {
    expect(redondearRacional({ num: B(5), den: B(1000) }, 2)).toBe(B(1));
    expect(redondearRacional({ num: B(-5), den: B(1000) }, 2)).toBe(B(-1));
    expect(redondearRacional({ num: B(1), den: B(3) }, 2)).toBe(B(33));
    expect(redondearRacional({ num: B(2), den: B(3) }, 2)).toBe(B(67));
    expect(redondearRacional({ num: B(5), den: B(2) }, 0)).toBe(B(3));
    expect(redondearRacional({ num: B(-5), den: B(2) }, 0)).toBe(B(-3));
  });
});

describe("parsePorcentaje / parsePctInput / parseCantidadInput / parseEnteroInput con cuentas", () => {
  it("parsePorcentaje", () => {
    expect(parsePorcentaje("10,5+2")).toBe(12.5);
    expect(parsePorcentaje("1.500")).toBe(1.5);
    expect(parsePorcentaje("21%")).toBe(21);
    expect(parsePorcentaje("100/3")).toBe(33.33);
    expect(parsePorcentaje("5-10")).toBeNull();
    expect(parsePorcentaje("5/0")).toBeNull();
  });

  it("parsePctInput (lib/lotes.ts): mismo parseo, sin rechazar negativos ni redondear a 2", () => {
    expect(parsePctInput("30")).toBe(30);
    expect(parsePctInput("20,5")).toBe(20.5);
    expect(parsePctInput("10.5")).toBe(10.5);
    expect(parsePctInput(" 8 ")).toBe(8);
    expect(parsePctInput("")).toBeNull();
    expect(parsePctInput("abc")).toBeNull();
    expect(parsePctInput("-5")).toBe(-5);
    expect(parsePctInput("8,555")).toBe(8.555);
    expect(parsePctInput("100/3")).toBe(33.333333);
    expect(parsePctInput("15+15")).toBe(30);
  });

  it("parseCantidadInput", () => {
    expect(parseCantidadInput("3*250")).toBe(750);
    expect(parseCantidadInput("0,5+0,25")).toBe(0.75);
    expect(parseCantidadInput("1.000.000")).toBe(1_000_000);
    expect(parseCantidadInput("1,2340")).toBe(1.234);
    expect(parseCantidadInput("1-2")).toBeNull();
    expect(parseCantidadInput("10/3")).toBe(3.333);
  });

  it("parseEnteroInput: la cuenta tiene que dar un entero exacto", () => {
    expect(parseEnteroInput("2*12")).toBe(24);
    expect(parseEnteroInput("10/5")).toBe(2);
    expect(parseEnteroInput("1.500")).toBe(1500);
    expect(parseEnteroInput("-3")).toBe(-3);
    expect(parseEnteroInput("10/4")).toBeNull();
    expect(parseEnteroInput("1,5")).toBeNull();
    expect(parseEnteroInput("")).toBeNull();
    expect(parseEnteroInput("abc")).toBeNull();
  });
});

describe("resolverCampoNumerico", () => {
  it("vacío", () => {
    expect(resolverCampoNumerico("", "monto")).toEqual({ estado: "vacio" });
    expect(resolverCampoNumerico("  ", "porcentaje")).toEqual({ estado: "vacio" });
  });

  it("monto con cuenta: resultado formateado y visible", () => {
    expect(resolverCampoNumerico("150000+50000", "monto")).toEqual({
      estado: "valido",
      esCuenta: true,
      valor: 200_000,
      textoFormateado: "200.000,00",
      mostrarResultado: true,
      exacto: true,
    });
  });

  it("monto sin cuenta: muestra el resultado solo si los separadores se podrían leer distinto", () => {
    expect(resolverCampoNumerico("1500", "monto")).toMatchObject({
      textoFormateado: "1.500,00",
      mostrarResultado: false,
    });
    expect(resolverCampoNumerico("12.345", "monto")).toMatchObject({
      textoFormateado: "12.345,00",
      mostrarResultado: true,
    });
    expect(resolverCampoNumerico("1.500,00", "monto")).toMatchObject({ mostrarResultado: false });
  });

  it("mensajes de cuenta inválida", () => {
    expect(resolverCampoNumerico("5+", "monto")).toMatchObject({
      estado: "invalido",
      mensaje: "Cuenta sin terminar",
    });
    expect(resolverCampoNumerico("5/0", "monto")).toMatchObject({
      mensaje: "No se puede dividir por cero",
    });
    expect(resolverCampoNumerico("5++3", "monto")).toMatchObject({ mensaje: "Cuenta inválida" });
    // Número suelto inválido: sin aviso mientras escribe (valida el formulario).
    expect(resolverCampoNumerico("abc", "monto")).toMatchObject({ estado: "invalido", mensaje: null });
    expect(resolverCampoNumerico("99999999999999999999", "monto")).toMatchObject({
      estado: "invalido",
      motivo: "muy-grande",
    });
  });

  it("porcentaje: sin miles, hasta 2 decimales", () => {
    expect(resolverCampoNumerico("10,5*2", "porcentaje")).toMatchObject({ valor: 21, textoFormateado: "21" });
    expect(resolverCampoNumerico("8.5", "porcentaje")).toMatchObject({
      valor: 8.5,
      textoFormateado: "8,5",
      mostrarResultado: true,
    });
    expect(resolverCampoNumerico("100/3", "porcentaje")).toMatchObject({ textoFormateado: "33,33" });
  });

  it("cantidad: 3 decimales se escriben con un cero más para no leerse como miles", () => {
    const estado = resolverCampoNumerico("0,5+0,734", "cantidad");
    expect(estado).toMatchObject({ valor: 1.234, textoFormateado: "1,2340" });
    expect(parseCantidadInput("1,2340")).toBe(1.234);
    expect(resolverCampoNumerico("3*250", "cantidad")).toMatchObject({ textoFormateado: "750" });
    expect(resolverCampoNumerico("0,5", "cantidad")).toMatchObject({ textoFormateado: "0,5" });
  });

  it("entero", () => {
    expect(resolverCampoNumerico("2*12", "entero")).toMatchObject({ valor: 24, textoFormateado: "24" });
    expect(resolverCampoNumerico("10/4", "entero")).toMatchObject({
      estado: "invalido",
      mensaje: "Tiene que dar un número entero",
    });
  });

  it("el texto formateado siempre se vuelve a leer igual", () => {
    const casos: [string, "monto" | "porcentaje" | "cantidad" | "entero"][] = [
      ["(80000,5+20000,5)*1.21", "monto"],
      ["-1/8", "monto"],
      ["1.000.000.000,00", "monto"],
      ["100/7", "porcentaje"],
      ["1000/3", "cantidad"],
      ["1,5*1000", "cantidad"],
      ["3*333", "entero"],
    ];
    for (const [texto, tipo] of casos) {
      const estado = resolverCampoNumerico(texto, tipo);
      if (estado.estado !== "valido") throw new Error(`${texto} debería ser válido`);
      expect(resolverCampoNumerico(estado.textoFormateado, tipo)).toMatchObject({ valor: estado.valor });
    }
  });
});
