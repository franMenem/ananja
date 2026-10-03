import { describe, expect, it } from "vitest";

import { esExacto, evaluarCuenta, parseEnteroInput } from "@/lib/dominio/calculo-monto";
import {
  campoNumericoInvalido,
  resolverCampoNumerico,
  textoInicialCampoNumerico,
} from "@/lib/dominio/campo-numerico";
import {
  camposCostosLoteInvalidos,
  costosLoteStateVacio,
  mensajeCamposInvalidos,
} from "@/lib/dominio/lotes";
import { formatMontoDisplay, parseCantidadInput, parseMontoInput } from "@/lib/money";

describe("textoInicialCampoNumerico: la precarga se vuelve a leer igual", () => {
  it("cantidad con 3 decimales no se confunde con miles", () => {
    expect(textoInicialCampoNumerico(1.125, "cantidad")).toBe("1,1250");
    expect(parseCantidadInput(textoInicialCampoNumerico(1.125, "cantidad"))).toBe(1.125);
  });

  it("cantidad con menos decimales, cero y enteros", () => {
    expect(textoInicialCampoNumerico(0.5, "cantidad")).toBe("0,5");
    expect(textoInicialCampoNumerico(0.125, "cantidad")).toBe("0,125");
    expect(textoInicialCampoNumerico(0, "cantidad")).toBe("0");
    expect(textoInicialCampoNumerico(1500, "cantidad")).toBe("1500");
    for (const n of [0.125, 1.125, 2.5, 12, 1500, 1234.567]) {
      expect(parseCantidadInput(textoInicialCampoNumerico(n, "cantidad"))).toBe(n);
    }
  });

  it("entero y monto", () => {
    expect(textoInicialCampoNumerico(12, "entero")).toBe("12");
    expect(parseEnteroInput(textoInicialCampoNumerico(12, "entero"))).toBe(12);
    expect(textoInicialCampoNumerico(123456, "monto")).toBe(formatMontoDisplay(123456));
    expect(parseMontoInput(textoInicialCampoNumerico(123456, "monto"))).toBe(123456);
  });

  it("no finito queda vacío", () => {
    expect(textoInicialCampoNumerico(Number.NaN, "cantidad")).toBe("");
  });
});

/** Arreglos de la revisión de feature/inputs-calculadora. */

describe("montos: '0.' + 3 dígitos es decimal, no miles", () => {
  it("0.500 y 0.750", () => {
    expect(parseMontoInput("0.500")).toBe(50);
    expect(parseMontoInput("0.750")).toBe(75);
    expect(parseMontoInput("0.750*4")).toBe(300);
  });

  it("con parte entera distinta de 0 sigue siendo miles", () => {
    expect(parseMontoInput("1.800")).toBe(180_000);
    expect(parseMontoInput("40.000")).toBe(4_000_000);
  });
});

describe("negativos con un solo signo", () => {
  it("formatMontoDisplay", () => {
    expect(formatMontoDisplay(-500)).toBe("-5,00");
    expect(formatMontoDisplay(-123_456)).toBe("-1.234,56");
    expect(formatMontoDisplay(500)).toBe("5,00");
    expect(parseMontoInput(formatMontoDisplay(-123_456))).toBe(-123_456);
  });

  it("el campo escribe '-5,00' al resolver", () => {
    expect(resolverCampoNumerico("5-10", "monto")).toMatchObject({ textoFormateado: "-5,00" });
  });
});

describe("cantidades con parte entera 0: sin cero de más", () => {
  it("0,001 y 1,001", () => {
    expect(resolverCampoNumerico("0,0005*2", "cantidad")).toMatchObject({ textoFormateado: "0,001" });
    expect(resolverCampoNumerico("1,0005*1", "cantidad")).toMatchObject({ textoFormateado: "1,0010" });
  });
});

describe("avisos de cuentas sin terminar", () => {
  it("con foco: gris 'Cuenta sin terminar'; al salir: 'Cuenta incompleta'", () => {
    expect(resolverCampoNumerico("1520*", "monto")).toMatchObject({
      estado: "invalido",
      motivo: "incompleta",
      mensaje: "Cuenta sin terminar",
      mensajeAlSalir: "Cuenta incompleta",
    });
  });

  it("número suelto inválido: nada mientras escribe, 'Número inválido' al salir", () => {
    expect(resolverCampoNumerico("12a", "monto")).toMatchObject({
      mensaje: null,
      mensajeAlSalir: "Número inválido",
    });
  });

  it("campoNumericoInvalido: vacío no, algo que no se entiende sí", () => {
    expect(campoNumericoInvalido("")).toBe(false);
    expect(campoNumericoInvalido("  ")).toBe(false);
    expect(campoNumericoInvalido("150000")).toBe(false);
    expect(campoNumericoInvalido("150000+")).toBe(true);
    expect(campoNumericoInvalido("21+", "porcentaje")).toBe(true);
    expect(campoNumericoInvalido("abc", "cantidad")).toBe(true);
  });
});

describe("exactitud", () => {
  it("esExacto", () => {
    const valor = (t: string) => {
      const r = evaluarCuenta(t);
      if (!r.ok) throw new Error(t);
      return r.valor;
    };
    expect(esExacto(valor("12,34"), 2)).toBe(true);
    expect(esExacto(valor("12,345"), 2)).toBe(false);
    expect(esExacto(valor("12,345"), 3)).toBe(true);
    expect(esExacto(valor("10/3"), 2)).toBe(false);
  });

  it("resolverCampoNumerico informa si hubo que redondear", () => {
    expect(resolverCampoNumerico("12,34", "monto")).toMatchObject({ exacto: true });
    expect(resolverCampoNumerico("12,345", "monto")).toMatchObject({ exacto: false, valor: 12.35 });
    expect(resolverCampoNumerico("12,34*1,21", "monto")).toMatchObject({ exacto: false, esCuenta: true });
  });
});

describe("costos del pedido: campos que frenan el guardado", () => {
  it("estado vacío (con los % por defecto): nada inválido", () => {
    expect(camposCostosLoteInvalidos(costosLoteStateVacio(), ["p250"], ["et1"])).toEqual([]);
  });

  it("cuentas sin terminar en dólar, envase, etiqueta y %", () => {
    const state = {
      ...costosLoteStateVacio(),
      dolar: "1000*",
      envasePorProducto: { p250: "150000+", p500: "abc" },
      etiquetasPorInsumo: { et1: { precioUnitario: "12,34", envio: "20000/", precioCosto: "" } },
      gananciaPct: "21+",
    };
    expect(camposCostosLoteInvalidos(state, ["p250"], ["et1"])).toEqual([
      "el precio del dólar",
      "el envío de una etiqueta",
      "el precio por envase",
      "la ganancia %",
    ]);
  });

  it("transporte: solo cuenta el modo elegido", () => {
    const base = { ...costosLoteStateVacio(), transportePct: "8*", transporteFijo: "abc" };
    expect(camposCostosLoteInvalidos({ ...base, transporteModo: "porcentaje" }, [])).toEqual([
      "el transporte %",
    ]);
    expect(camposCostosLoteInvalidos({ ...base, transporteModo: "fijo" }, [])).toEqual([
      "el transporte",
    ]);
  });

  it("mensaje", () => {
    expect(mensajeCamposInvalidos(["el precio del dólar"])).toBe(
      "Revisá el precio del dólar: hay una cuenta sin terminar o un número que no se entiende.",
    );
    expect(mensajeCamposInvalidos(["a", "b", "c"])).toMatch(/^Revisá a, b y c:/);
  });
});
