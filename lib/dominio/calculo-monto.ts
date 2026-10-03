/**
 * Cuentas en los campos de números: "150000+50000", "1.800*1,21",
 * "(80000+20000)*1.21".
 *
 * Evalúa a mano (tokenizer + parser recursivo), NUNCA con `eval`/`Function`.
 * La aritmética es exacta: cada número es una fracción de `bigint`
 * (numerador/denominador), así "0,1+0,2" da exactamente 0,3 y una división
 * se redondea recién al final (`redondearRacional`), nunca a mitad de cuenta.
 *
 * Operadores: `+`, `-` (también "−" y "–"), `*` (también "x", "X", "×"),
 * `/` (también "÷") y paréntesis. Un "-" adelante de un número o paréntesis
 * es signo ("-500", "5*-3", "-(2+3)"), pero dos seguidos no ("--5" es
 * inválido, como antes). Se ignoran los espacios y los signos "$" y "%".
 *
 * Números (dígitos con "." y/o ","): "." y "," son intercambiables como
 * marca decimal. Reglas del modo "monto" (ver `separarGeneral`):
 * - Con "." y ",": el ÚLTIMO de los dos es el decimal y el otro es de miles
 *   ("1.800,50" y "1,800.50" → 1800,5). Los grupos de miles se validan
 *   (primer grupo de 1 a 3 dígitos, el resto de exactamente 3).
 * - Solo comas: una sola → decimal ("12,345" → 12,345); varias con grupos
 *   de 3 → miles ("1,000,000").
 * - Solo puntos: varios con grupos de 3 → miles ("1.000.000"); uno solo
 *   seguido de EXACTAMENTE 3 dígitos con parte entera de 1 a 3 dígitos que
 *   no empieza con 0 → miles ("1.800", "40.000" — así escribe la gente y así
 *   muestra la app los montos); si no, decimal ("12.34" → 12,34, "4.5" →
 *   4,5, "1234.567" → 1234,567, "0.500" → 0,5).
 * - CASO AMBIGUO: "12.345" se lee 98425 (miles), no 12,345. Por eso el
 *   campo (`components/monto-input.tsx`) muestra siempre el resultado
 *   interpretado debajo cuando hay separadores o una cuenta.
 *
 * Modo "porcentaje": un único separador es SIEMPRE decimal ("1.500" → 1,5,
 * nadie escribe 1500%), como hacían `parsePorcentaje`/`parsePctInput`.
 * Modo "cantidad": las reglas históricas de `parseCantidadInput` (un
 * separador seguido de exactamente 3 dígitos es de miles, con "." o ","
 * indistinto: "1,500" → 1500; ver `separarCantidad`).
 */

export type Racional = { num: bigint; den: bigint };

export type ModoNumero = "monto" | "porcentaje" | "cantidad";

export type MotivoCuentaInvalida =
  | "vacia"
  | "caracter-invalido"
  | "numero-invalido"
  | "incompleta"
  | "sintaxis"
  | "division-por-cero";

export type ResultadoCuenta =
  | { ok: true; valor: Racional; esCuenta: boolean }
  | { ok: false; motivo: MotivoCuentaInvalida; esCuenta: boolean };

type Operador = "+" | "-" | "*" | "/";

type Token =
  | { tipo: "numero"; texto: string }
  | { tipo: "op"; op: Operador }
  | { tipo: "abre" }
  | { tipo: "cierra" };

const CERO = BigInt(0);
const UNO = BigInt(1);
const DOS = BigInt(2);
const DIEZ = BigInt(10);

const SUMAR = new Set(["+"]);
const RESTAR = new Set(["-", "−", "–"]);
const MULTIPLICAR = new Set(["*", "x", "X", "×"]);
const DIVIDIR = new Set(["/", "÷"]);

/** Saca espacios (incluido el no separable) y los signos "$" y "%". */
function limpiar(texto: string): string {
  return texto.replace(/[\s$%]/g, "");
}

/**
 * `true` si el texto tiene una cuenta (algún operador o paréntesis), más
 * allá de un único "-" de signo adelante: "-500" no es cuenta, "5-3" sí.
 */
export function tieneOperador(texto: string): boolean {
  if (typeof texto !== "string") return false;
  const limpio = limpiar(texto);
  const sinSigno = RESTAR.has(limpio.charAt(0)) ? limpio.slice(1) : limpio;
  return /[+\-−–*xX×/÷()]/.test(sinSigno);
}

function tokenizar(limpio: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < limpio.length) {
    const c = limpio[i];
    if (/[\d.,]/.test(c)) {
      let j = i;
      while (j < limpio.length && /[\d.,]/.test(limpio[j])) j++;
      tokens.push({ tipo: "numero", texto: limpio.slice(i, j) });
      i = j;
      continue;
    }
    if (SUMAR.has(c)) tokens.push({ tipo: "op", op: "+" });
    else if (RESTAR.has(c)) tokens.push({ tipo: "op", op: "-" });
    else if (MULTIPLICAR.has(c)) tokens.push({ tipo: "op", op: "*" });
    else if (DIVIDIR.has(c)) tokens.push({ tipo: "op", op: "/" });
    else if (c === "(") tokens.push({ tipo: "abre" });
    else if (c === ")") tokens.push({ tipo: "cierra" });
    else return null;
    i++;
  }
  return tokens;
}

// --- Números -------------------------------------------------------------

const GRUPO_INICIAL = /^\d{1,3}$/;
const GRUPO_MILES = /^\d{3}$/;

/** "1.000.000" (con `sep` ".") → "1000000"; `null` si los grupos no son
 * de miles (primero de 1 a 3 dígitos, el resto de exactamente 3). */
function unirGruposMiles(texto: string, sep: string): string | null {
  const grupos = texto.split(sep);
  if (grupos.length < 2) return null;
  const [primero, ...resto] = grupos;
  if (!GRUPO_INICIAL.test(primero)) return null;
  if (!resto.every((g) => GRUPO_MILES.test(g))) return null;
  return grupos.join("");
}

type Partes = { enteros: string; decimales: string };

function contar(texto: string, c: string): number {
  return texto.split(c).length - 1;
}

/** Reglas de los modos "monto" y "porcentaje" (ver comentario del módulo). */
function separarGeneral(texto: string, modo: ModoNumero): Partes | null {
  const puntos = contar(texto, ".");
  const comas = contar(texto, ",");

  if (puntos === 0 && comas === 0) return { enteros: texto, decimales: "" };

  if (puntos > 0 && comas > 0) {
    const ultimo = Math.max(texto.lastIndexOf("."), texto.lastIndexOf(","));
    const decimal = texto[ultimo];
    const miles = decimal === "." ? "," : ".";
    if (contar(texto, decimal) !== 1) return null;
    const enteros = unirGruposMiles(texto.slice(0, ultimo), miles);
    if (enteros === null) return null;
    return { enteros, decimales: texto.slice(ultimo + 1) };
  }

  const sep = puntos > 0 ? "." : ",";
  if (puntos + comas > 1) {
    const enteros = unirGruposMiles(texto, sep);
    return enteros === null ? null : { enteros, decimales: "" };
  }

  const [antes, despues] = texto.split(sep);
  // "0.500" nunca es 500: con parte entera 0 los 3 dígitos son decimales.
  if (
    modo === "monto" &&
    sep === "." &&
    despues.length === 3 &&
    antes.length <= 3 &&
    !antes.startsWith("0")
  ) {
    return { enteros: antes + despues, decimales: "" };
  }
  return { enteros: antes, decimales: despues };
}

/** `true` si el valor se escribe con `decimales` decimales sin redondear
 * ("12,34" con 2 sí; "12,345" con 2 no). */
export function esExacto(valor: Racional, decimales: number): boolean {
  return (valor.num * DIEZ ** BigInt(decimales)) % valor.den === CERO;
}

const CANTIDAD_UN_SEPARADOR = /^(\d+)([.,])(\d+)$/;
const CANTIDAD_DOS_SEPARADORES = /^(\d+)([.,])(\d{3})([.,])(\d+)$/;

/**
 * Reglas históricas de `parseCantidadInput` (antes `separarEnterosYDecimales`
 * en lib/money.ts), sin cambios para un número suelto:
 * - Un separador seguido de exactamente 3 dígitos: de miles ("1.500", "1,500").
 * - Un separador seguido de 1, 2 o 4+ dígitos: decimal.
 * - Dos separadores distintos: el primero de miles (grupo de 3), el segundo decimal.
 * Además (antes era inválido): varios separadores iguales con grupos de 3 → miles.
 */
function separarCantidad(texto: string): Partes | null {
  if (!/[.,]/.test(texto)) return { enteros: texto, decimales: "" };

  const dos = CANTIDAD_DOS_SEPARADORES.exec(texto);
  if (dos) {
    const [, iniciales, sepMiles, grupo, sepDecimal, decimales] = dos;
    if (sepMiles !== sepDecimal) return { enteros: iniciales + grupo, decimales };
  }

  const uno = CANTIDAD_UN_SEPARADOR.exec(texto);
  if (uno) {
    const [, enteros, , decimales] = uno;
    // "0,750" nunca es 750: con parte entera 0 los 3 dígitos son decimales
    // (antes daba 750 — único cambio respecto de las reglas históricas).
    return decimales.length === 3 && !enteros.startsWith("0")
      ? { enteros: enteros + decimales, decimales: "" }
      : { enteros, decimales };
  }

  const puntos = contar(texto, ".");
  const comas = contar(texto, ",");
  if (puntos > 1 && comas === 0) {
    const enteros = unirGruposMiles(texto, ".");
    return enteros === null ? null : { enteros, decimales: "" };
  }
  if (comas > 1 && puntos === 0) {
    const enteros = unirGruposMiles(texto, ",");
    return enteros === null ? null : { enteros, decimales: "" };
  }
  return null;
}

function mcd(a: bigint, b: bigint): bigint {
  let x = a < CERO ? -a : a;
  let y = b < CERO ? -b : b;
  while (y !== CERO) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

function normalizar(num: bigint, den: bigint): Racional {
  if (den < CERO) {
    num = -num;
    den = -den;
  }
  const d = mcd(num, den);
  return d > UNO ? { num: num / d, den: den / d } : { num, den };
}

/** Parsea un número suelto (sin signo ni operadores). `null` si no es válido. */
export function parseNumeroToken(texto: string, modo: ModoNumero = "monto"): Racional | null {
  // Tiene que empezar y terminar con dígito ("1234," y ",56" no valen) y
  // no puede tener dos separadores seguidos.
  if (!/^\d(?:[\d.,]*\d)?$/.test(texto) || /[.,]{2}/.test(texto)) return null;
  const partes = modo === "cantidad" ? separarCantidad(texto) : separarGeneral(texto, modo);
  if (!partes || !/^\d+$/.test(partes.enteros) || !/^\d*$/.test(partes.decimales)) {
    return null;
  }
  const num = BigInt(partes.enteros + partes.decimales);
  const den = DIEZ ** BigInt(partes.decimales.length);
  return normalizar(num, den);
}

// --- Parser -------------------------------------------------------------

class CuentaInvalida extends Error {
  constructor(readonly motivo: MotivoCuentaInvalida) {
    super(motivo);
  }
}

function operar(a: Racional, op: Operador, b: Racional): Racional {
  switch (op) {
    case "+":
      return normalizar(a.num * b.den + b.num * a.den, a.den * b.den);
    case "-":
      return normalizar(a.num * b.den - b.num * a.den, a.den * b.den);
    case "*":
      return normalizar(a.num * b.num, a.den * b.den);
    case "/":
      if (b.num === CERO) throw new CuentaInvalida("division-por-cero");
      return normalizar(a.num * b.den, a.den * b.num);
  }
}

function evaluarTokens(tokens: Token[], modo: ModoNumero): Racional {
  let pos = 0;

  const actual = (): Token | undefined => tokens[pos];

  function expresion(): Racional {
    let valor = termino();
    for (let t = actual(); t?.tipo === "op" && (t.op === "+" || t.op === "-"); t = actual()) {
      pos++;
      valor = operar(valor, t.op, termino());
    }
    return valor;
  }

  function termino(): Racional {
    let valor = factor();
    for (let t = actual(); t?.tipo === "op" && (t.op === "*" || t.op === "/"); t = actual()) {
      pos++;
      valor = operar(valor, t.op, factor());
    }
    return valor;
  }

  function factor(): Racional {
    const t = actual();
    if (t?.tipo === "op" && t.op === "-") {
      pos++;
      const v = primario();
      return { num: -v.num, den: v.den };
    }
    return primario();
  }

  function primario(): Racional {
    const t = actual();
    if (!t) throw new CuentaInvalida("incompleta");
    if (t.tipo === "numero") {
      pos++;
      const v = parseNumeroToken(t.texto, modo);
      if (!v) throw new CuentaInvalida("numero-invalido");
      return v;
    }
    if (t.tipo === "abre") {
      pos++;
      const v = expresion();
      const cierre = actual();
      if (!cierre) throw new CuentaInvalida("incompleta");
      if (cierre.tipo !== "cierra") throw new CuentaInvalida("sintaxis");
      pos++;
      return v;
    }
    throw new CuentaInvalida("sintaxis");
  }

  const valor = expresion();
  if (pos < tokens.length) throw new CuentaInvalida("sintaxis");
  return valor;
}

/**
 * Evalúa lo que escribió el usuario: un número suelto o una cuenta.
 * `esCuenta` dice si había algún operador (para mostrar el resultado).
 */
export function evaluarCuenta(texto: string, modo: ModoNumero = "monto"): ResultadoCuenta {
  if (typeof texto !== "string") return { ok: false, motivo: "vacia", esCuenta: false };
  const esCuenta = tieneOperador(texto);
  const limpio = limpiar(texto);
  if (limpio === "") return { ok: false, motivo: "vacia", esCuenta };

  const tokens = tokenizar(limpio);
  if (!tokens) return { ok: false, motivo: "caracter-invalido", esCuenta };

  try {
    return { ok: true, valor: evaluarTokens(tokens, modo), esCuenta };
  } catch (err) {
    if (err instanceof CuentaInvalida) return { ok: false, motivo: err.motivo, esCuenta };
    throw err;
  }
}

// --- Redondeo y conversión ---------------------------------------------------

/**
 * Redondea a `decimales` y devuelve el valor ESCALADO como entero
 * (decimales=2 → centavos). Mitades hacia afuera del cero ("half-up" por
 * magnitud: 0,005 → 1; -0,005 → -1), igual que `round()` de Postgres
 * para `numeric`.
 */
export function redondearRacional(valor: Racional, decimales: number): bigint {
  const escalado = valor.num * DIEZ ** BigInt(decimales);
  const negativo = escalado < CERO;
  const abs = negativo ? -escalado : escalado;
  let cociente = abs / valor.den;
  const resto = abs % valor.den;
  if (resto * DOS >= valor.den) cociente += UNO;
  return negativo ? -cociente : cociente;
}

const MAX_SEGURO = BigInt(Number.MAX_SAFE_INTEGER);

/** `bigint` → `number`, o `null` si se pasa del rango exacto de `number`. */
export function bigintANumberSeguro(valor: bigint): number | null {
  const abs = valor < CERO ? -valor : valor;
  if (abs > MAX_SEGURO) return null;
  // `Number(-0n)` ya es 0, nunca -0.
  return Number(valor);
}

/** Evalúa y redondea a `decimales`; devuelve el número "real" (no escalado). */
export function evaluarNumero(
  texto: string,
  modo: ModoNumero,
  decimales: number,
): number | null {
  const resultado = evaluarCuenta(texto, modo);
  if (!resultado.ok) return null;
  const escalado = bigintANumberSeguro(redondearRacional(resultado.valor, decimales));
  if (escalado === null) return null;
  // División exacta: `escalado` es entero y 10^decimales es exacto en double.
  return escalado / 10 ** decimales;
}

/**
 * Número entero (cantidades de unidades, umbrales): la cuenta tiene que dar
 * un entero EXACTO ("2*12" → 24; "10/4" o "1,5" → `null`). No redondea para
 * no cambiar en silencio una cantidad de stock.
 */
export function parseEnteroInput(texto: string): number | null {
  const resultado = evaluarCuenta(texto, "monto");
  if (!resultado.ok || resultado.valor.den !== UNO) return null;
  return bigintANumberSeguro(resultado.valor.num);
}

/** Mensaje en castellano para mostrar debajo de un campo con una cuenta mal escrita. */
export function mensajeCuentaInvalida(motivo: MotivoCuentaInvalida): string {
  switch (motivo) {
    case "division-por-cero":
      return "No se puede dividir por cero";
    case "incompleta":
      return "Cuenta sin terminar";
    case "vacia":
      return "";
    default:
      return "Cuenta inválida";
  }
}
