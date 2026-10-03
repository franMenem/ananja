/**
 * Estado de un campo de números mientras el usuario escribe — lo que usa
 * `components/monto-input.tsx` para mostrar "= $ 100.000,00" debajo y para
 * reemplazar la cuenta por el resultado al salir del campo. Puro y testeable
 * (tests/calculo-monto.test.ts, tests/campo-numerico.test.ts).
 *
 * Cada tipo de campo se evalúa con las MISMAS reglas que su parser de
 * siempre, para que lo que se ve coincida con lo que se guarda:
 * - "monto": `parseMontoInput` (centavos, 2 decimales).
 * - "porcentaje": `parsePorcentaje` / `parsePctInput` (un separador siempre
 *   decimal; se muestra con hasta 2 decimales, como el `numeric(5,2)` de la base).
 * - "cantidad": `parseCantidadInput` (hasta 3 decimales, "1,500" = 1500).
 * - "entero": `parseEnteroInput` (la cuenta tiene que dar un entero exacto).
 */

import {
  bigintANumberSeguro,
  esExacto,
  evaluarCuenta,
  mensajeCuentaInvalida,
  redondearRacional,
  type ModoNumero,
  type MotivoCuentaInvalida,
} from "@/lib/dominio/calculo-monto";
import { formatMontoDisplay } from "@/lib/money";

export type TipoCampoNumerico = "monto" | "porcentaje" | "cantidad" | "entero";

const CONFIG: Record<TipoCampoNumerico, { modo: ModoNumero; decimales: number }> = {
  monto: { modo: "monto", decimales: 2 },
  porcentaje: { modo: "porcentaje", decimales: 2 },
  cantidad: { modo: "cantidad", decimales: 3 },
  entero: { modo: "monto", decimales: 0 },
};

/** Decimales con los que se guarda cada tipo de campo. */
export function decimalesDeTipo(tipo: TipoCampoNumerico): number {
  return CONFIG[tipo].decimales;
}

export type EstadoCampoNumerico =
  | { estado: "vacio" }
  | {
      estado: "valido";
      esCuenta: boolean;
      /** Valor redondeado a los decimales del tipo, como `number` "real" (no escalado). */
      valor: number;
      /** Resultado formateado para escribir en el input ("200.000,00", "8,5"). */
      textoFormateado: string;
      /** Si conviene mostrar "= …" debajo: hay una cuenta, o separadores que
       * se podrían leer de dos maneras ("12.345") y el texto no está ya formateado. */
      mostrarResultado: boolean;
      /** `false` si guardar implica redondear ("12,345" en un monto). */
      exacto: boolean;
    }
  | {
      estado: "invalido";
      esCuenta: boolean;
      motivo: MotivoCuentaInvalida | "no-entero" | "muy-grande";
      /** Aviso mientras el campo tiene el foco — `null` cuando no hay nada
       * que avisar todavía (número suelto a medio escribir). */
      mensaje: string | null;
      /** Aviso (en color de error) cuando el usuario ya salió del campo:
       * algo escrito que no se entiende no se puede guardar. */
      mensajeAlSalir: string;
    };

function mensajesInvalido(
  motivo: MotivoCuentaInvalida | "no-entero" | "muy-grande",
  esCuenta: boolean,
): { mensaje: string | null; mensajeAlSalir: string } {
  if (motivo === "no-entero") {
    const m = "Tiene que dar un número entero";
    return { mensaje: m, mensajeAlSalir: m };
  }
  if (motivo === "muy-grande") {
    const m = "Número demasiado grande";
    return { mensaje: m, mensajeAlSalir: m };
  }
  if (!esCuenta) return { mensaje: null, mensajeAlSalir: "Número inválido" };
  if (motivo === "incompleta") {
    return { mensaje: "Cuenta sin terminar", mensajeAlSalir: "Cuenta incompleta" };
  }
  const m = mensajeCuentaInvalida(motivo);
  return { mensaje: m, mensajeAlSalir: m };
}

function formatDecimalSinMiles(escalado: bigint, decimales: number, tipo: TipoCampoNumerico): string {
  const negativo = escalado < BigInt(0);
  const abs = negativo ? -escalado : escalado;
  const base = BigInt(10) ** BigInt(decimales);
  const enteros = (abs / base).toString();
  let fraccion = decimales > 0 ? (abs % base).toString().padStart(decimales, "0") : "";
  fraccion = fraccion.replace(/0+$/, "");
  // En "cantidad", un separador seguido de exactamente 3 dígitos se lee como
  // miles ("1,234" = 1234): con un cero más ("1,2340") se lee decimal. Con
  // parte entera 0 ("0,001") ya se lee decimal, no hace falta.
  if (tipo === "cantidad" && fraccion.length === 3 && enteros !== "0") fraccion += "0";
  const signo = negativo ? "-" : "";
  return fraccion ? `${signo}${enteros},${fraccion}` : `${signo}${enteros}`;
}

function formatear(escalado: bigint, tipo: TipoCampoNumerico): string | null {
  if (tipo === "monto") {
    const centavos = bigintANumberSeguro(escalado);
    return centavos === null ? null : formatMontoDisplay(centavos);
  }
  return formatDecimalSinMiles(escalado, CONFIG[tipo].decimales, tipo);
}

/** Valor escalado (redondeado) de un texto, o `null`. Solo para la verificación de ida y vuelta. */
function escaladoDe(texto: string, tipo: TipoCampoNumerico): bigint | null {
  const r = evaluarCuenta(texto, CONFIG[tipo].modo);
  return r.ok ? redondearRacional(r.valor, CONFIG[tipo].decimales) : null;
}

export function resolverCampoNumerico(texto: string, tipo: TipoCampoNumerico): EstadoCampoNumerico {
  const { modo, decimales } = CONFIG[tipo];
  const resultado = evaluarCuenta(texto, modo);

  if (!resultado.ok) {
    if (resultado.motivo === "vacia") return { estado: "vacio" };
    return {
      estado: "invalido",
      esCuenta: resultado.esCuenta,
      motivo: resultado.motivo,
      ...mensajesInvalido(resultado.motivo, resultado.esCuenta),
    };
  }

  const { valor: racional, esCuenta } = resultado;
  if (tipo === "entero" && racional.den !== BigInt(1)) {
    return { estado: "invalido", esCuenta, motivo: "no-entero", ...mensajesInvalido("no-entero", esCuenta) };
  }

  const escalado = redondearRacional(racional, decimales);
  const escaladoNumber = bigintANumberSeguro(escalado);
  const textoFormateado = formatear(escalado, tipo);
  if (escaladoNumber === null || textoFormateado === null) {
    return { estado: "invalido", esCuenta, motivo: "muy-grande", ...mensajesInvalido("muy-grande", esCuenta) };
  }

  // Ida y vuelta: el texto formateado tiene que volver a leerse igual. Si
  // no (no debería pasar), se deja lo que escribió el usuario tal cual.
  const idaYVuelta = escaladoDe(textoFormateado, tipo) === escalado;
  const limpio = texto.trim();
  const mostrarResultado = esCuenta || (/[.,]/.test(limpio) && textoFormateado !== limpio);

  return {
    estado: "valido",
    esCuenta,
    valor: escaladoNumber / 10 ** decimales,
    textoFormateado: idaYVuelta ? textoFormateado : limpio,
    mostrarResultado,
    exacto: esExacto(racional, decimales),
  };
}

/**
 * `true` si el campo tiene algo escrito que no se entiende (cuenta sin
 * terminar como "1520*", texto inválido). Un campo vacío NO es inválido.
 * Los formularios lo usan para frenar el guardado en vez de tratar ese
 * texto como "no cargado".
 */
export function campoNumericoInvalido(texto: string, tipo: TipoCampoNumerico = "monto"): boolean {
  return resolverCampoNumerico(texto, tipo).estado === "invalido";
}

/**
 * Texto con el que se PRECARGA un campo a partir de un número ya guardado
 * (un umbral de la base, un precio anterior), escrito con las mismas reglas
 * con las que el campo lo va a volver a leer. No usar `String(numero)`:
 * `String(1.125)` da "1.125", que en un campo de cantidad se lee como mil
 * ciento veinticinco. Acá sale "1,1250" (con un cero más, para que no se
 * confunda con miles), en un monto "1.234,56", en un entero "12".
 *
 * En "monto" `valor` va en centavos (como el resto de la app); en los
 * demás tipos, el número real. Devuelve "" si no es un número finito.
 */
export function textoInicialCampoNumerico(valor: number, tipo: TipoCampoNumerico): string {
  if (!Number.isFinite(valor)) return "";
  if (tipo === "monto") return formatMontoDisplay(Math.round(valor));
  const { decimales } = CONFIG[tipo];
  const escalado = BigInt(Math.round(valor * 10 ** decimales));
  return formatDecimalSinMiles(escalado, decimales, tipo);
}
