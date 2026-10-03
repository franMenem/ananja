/**
 * Utilidades de dinero.
 *
 * Todos los montos se manejan internamente en CENTAVOS (enteros) para evitar
 * errores de redondeo. Este módulo centraliza el formateo al estilo argentino
 * ("$ 1.234,56" — "." como separador de miles, "," como separador decimal) y
 * el parseo de la entrada del usuario hacia centavos.
 *
 * Los parsers (`parseMontoInput`, `parsePorcentaje`, `parseCantidadInput`)
 * aceptan también cuentas ("150000+50000", "1.800*1,21") y "." o "," como
 * decimal indistintamente — las reglas están en `lib/calculo-monto.ts`.
 */

import { evaluarCuenta, evaluarNumero, bigintANumberSeguro, redondearRacional } from "@/lib/dominio/calculo-monto";

/**
 * Convierte centavos (bigint o number) a un `number` de JavaScript.
 * Útil para operaciones aritméticas simples cuando el valor viene de
 * Supabase como bigint.
 */
export function centavosToNumber(centavos: bigint | number): number {
  return typeof centavos === "bigint" ? Number(centavos) : centavos;
}

/**
 * Formatea centavos como un monto en pesos argentinos: "$ 1.234,56".
 * Los negativos se muestran como "-$ 1.234,56".
 */
export function formatCentavos(centavos: bigint | number): string {
  const asBigInt =
    typeof centavos === "bigint" ? centavos : BigInt(Math.round(centavos));

  const zero = BigInt(0);
  const hundred = BigInt(100);

  const negative = asBigInt < zero;
  const abs = negative ? -asBigInt : asBigInt;

  const pesos = abs / hundred;
  const cents = abs % hundred;

  const pesosStr = pesos.toString();
  const grouped = pesosStr.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const centsStr = cents.toString().padStart(2, "0");

  const sign = negative && abs !== zero ? "-" : "";
  return `${sign}$ ${grouped},${centsStr}`;
}

/**
 * Parsea la entrada de un usuario (formato argentino) a centavos (entero).
 *
 * Acepta, por ejemplo: "1234", "1.234,56", "1234,5", "$ 1.234", "-1.234,56",
 * y además cuentas y "." decimal: "12.34", "1,800.50", "150000+50000",
 * "(80000+20000)*1.21" (reglas en `lib/calculo-monto.ts`). El resultado
 * se redondea a centavos al final, mitades hacia afuera del cero.
 * Devuelve `null` si la entrada no es un monto o una cuenta válida (o divide
 * por cero).
 */
export function parseMontoInput(input: string): number | null {
  if (typeof input !== "string") return null;
  const resultado = evaluarCuenta(input, "monto");
  if (!resultado.ok) return null;
  return bigintANumberSeguro(redondearRacional(resultado.valor, 2));
}

/**
 * Parsea un porcentaje ingresado por el usuario ("8", "8,5" o "8.5", o una
 * cuenta como "10,5+2") a un `number`. A diferencia de `parseMontoInput`,
 * no hay centavos y un único separador es siempre decimal ("1.500" → 1,5):
 * los porcentajes de `PrecioForm` (transporte, IVA, ganancia, mayorista)
 * son valores no negativos con hasta unos pocos decimales. El resultado se
 * redondea a 2 decimales para coincidir con el `numeric(5,2)` de
 * `versiones_precio` en la base. Devuelve `null` si la entrada no es un
 * número válido o es negativa.
 */
export function parsePorcentaje(input: string): number | null {
  if (typeof input !== "string") return null;
  const value = evaluarNumero(input, "porcentaje", 2);
  if (value === null || value < 0) return null;
  return value;
}

/**
 * Formatea centavos para un `<input>` de monto: igual que `formatCentavos`
 * pero sin el "$ " inicial — el signo se muestra aparte, en su propio
 * elemento (design/handoff README § /comprobantes/nuevo). `parseMontoInput` ya tolera que
 * el usuario lo vuelva a escribir, así que no hace falta simetría exacta.
 * Usado por `components/comprobante-form.tsx`,
 * `components/comprobante-cobro-campos.tsx` y `components/monto-input.tsx`.
 */
export function formatMontoDisplay(centavos: number): string {
  // Negativos: "-5,00" (no "-$ 5,00" — el "$" ya lo muestra el campo).
  return formatCentavos(centavos).replace(/^(-?)\$\s*/, "$1");
}

/**
 * Formatea un monto de deuda según su moneda: en USD antepone "USD " (sin
 * el signo "$" de `formatCentavos`), en ARS delega directo en
 * `formatCentavos`. Espejo de las tres implementaciones repetidas del
 * bloque "Deudas" (`/plata`, `/plata/deudas` y `MarcarSaldadaButton`).
 */
export function formatMonto(moneda: "USD" | "ARS", centavos: number): string {
  return moneda === "USD"
    ? `USD ${formatCentavos(centavos).replace("$ ", "")}`
    : formatCentavos(centavos);
}

/**
 * Parsea una cantidad de insumo ingresada por el usuario ("0,5", "0.5",
 * "12", "1.500" para mil quinientos, o una cuenta como "3*250") a un
 * `number`. A diferencia de `parseMontoInput`, no hay centavos ni signo, y
 * el separador de miles puede ser "." o "," indistintamente (un separador
 * seguido de exactamente 3 dígitos es de miles: "1,500" = 1500 — ver
 * `separarCantidad` en `lib/calculo-monto.ts`): las cantidades de
 * `lib/insumos.ts` son valores no negativos con hasta tres decimales, que es
 * lo que soporta el `numeric(12,3)` de `movimientos_insumo`/`insumos` en la
 * base — el resultado se redondea a 3 decimales para coincidir. Devuelve
 * `null` si la entrada no es un número válido o es negativa.
 */
export function parseCantidadInput(input: string): number | null {
  if (typeof input !== "string") return null;
  const value = evaluarNumero(input, "cantidad", 3);
  if (value === null || value < 0) return null;
  return value;
}
