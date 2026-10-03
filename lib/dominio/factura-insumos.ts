/**
 * Compra de insumos por factura (varias líneas en un mismo comprobante, ej.
 * la factura de etiquetas de la imprenta): cuánto cuesta de verdad cada
 * línea con el IVA y el envío incluidos.
 *
 * Espejo EXACTO (al centavo) del RPC `registrar_compra_insumos_factura`
 * (supabase/migrations/0041_compra_insumos_factura.sql) — si se cambia uno,
 * se cambia el otro. Puro, sin Supabase; tests en
 * `tests/factura-insumos.test.ts` con dos facturas reales.
 *
 * Reglas (todo en centavos enteros):
 * 1. Importe de cada línea = cantidad × precio unitario impreso, redondeado
 *    al centavo (medio centavo para arriba).
 * 2. IVA: se calcula UNA vez sobre el subtotal de la factura
 *    (`round(subtotal × IVA%)`), igual que lo imprime la factura, y ese
 *    total se reparte entre las líneas proporcional al importe con "resto
 *    mayor". Así el IVA total siempre coincide con el impreso (redondear
 *    línea por línea podría dar un centavo de diferencia) y la suma de las
 *    líneas da exacto. Ananja es monotributo: el IVA no se recupera, es
 *    costo. Si la factura ya trae los precios con IVA, IVA = 0.
 * 3. Envío (sin IVA): se reparte proporcional a la CANTIDAD de unidades de
 *    cada línea (no a partes iguales ni por importe), también con resto
 *    mayor.
 * 4. Resto mayor: cada línea recibe el piso de su parte exacta; los
 *    centavos que faltan van, de a uno, a las líneas con mayor fracción
 *    descartada; a igual fracción, a la que está primero en la factura.
 *    Resultado: total de cada línea = importe + IVA + envío, y la suma de
 *    las líneas = subtotal + IVA + envío, exacto.
 */

import { esExacto, evaluarCuenta } from "@/lib/dominio/calculo-monto";
import { parseCantidadInput, parseMontoInput } from "@/lib/money";

export type LineaFacturaInput = {
  /** Unidades del insumo (hasta 3 decimales, como `movimientos_insumo`). */
  cantidad: number;
  /** Precio unitario tal cual está impreso en la factura, en centavos. */
  precioUnitarioCentavos: number;
};

export type FacturaInsumosInput = {
  lineas: LineaFacturaInput[];
  /** `true` (lo habitual): los precios impresos NO incluyen IVA y se le
   * suma `ivaPct` al subtotal. `false`: ya lo incluyen, IVA = 0. */
  preciosSinIva: boolean;
  /** Porcentaje de IVA (ej. 21). Se redondea a 2 decimales. */
  ivaPct: number;
  /** Envío total pagado aparte, sin IVA. 0 si no hubo. */
  envioCentavos: number;
};

export type LineaFacturaCalculada = LineaFacturaInput & {
  importeCentavos: number;
  ivaCentavos: number;
  envioCentavos: number;
  totalCentavos: number;
  /** `totalCentavos / cantidad` SIN redondear (ej. 20938.9477…) — la UI
   * decide cuántos decimales mostrar. */
  costoUnitarioCentavos: number;
};

export type FacturaInsumosCalculada = {
  lineas: LineaFacturaCalculada[];
  subtotalCentavos: number;
  ivaCentavos: number;
  /** Subtotal + IVA: lo que dice la factura impresa (para comparar). */
  totalFacturaCentavos: number;
  envioCentavos: number;
  /** Total factura + envío: lo que sale de la caja en total. */
  totalPagadoCentavos: number;
};

/** Divide `a / b` (enteros no negativos, b > 0) redondeando el medio para
 * arriba — mismo resultado que `round()` de Postgres para positivos. */
function dividirRedondeando(a: bigint, b: bigint): bigint {
  return (a * BigInt(2) + b) / (BigInt(2) * b);
}

/**
 * Reparte `total` centavos entre partes proporcionales a `pesos` con el
 * método del resto mayor (ver regla 4 arriba). La suma del resultado es
 * exactamente `total`. Con todos los pesos en 0 devuelve todo 0.
 */
export function repartirRestoMayor(total: number, pesos: number[]): number[] {
  const totalBig = BigInt(total);
  const pesosBig = pesos.map((p) => BigInt(p));
  const suma = pesosBig.reduce((acc, p) => acc + p, BigInt(0));
  if (suma === BigInt(0)) return pesos.map(() => 0);

  const partes = pesosBig.map((peso, indice) => ({
    indice,
    piso: (totalBig * peso) / suma,
    resto: (totalBig * peso) % suma,
  }));
  let faltan = totalBig - partes.reduce((acc, p) => acc + p.piso, BigInt(0));

  const orden = [...partes].sort((a, b) =>
    a.resto === b.resto ? a.indice - b.indice : a.resto > b.resto ? -1 : 1,
  );
  const resultado = partes.map((p) => p.piso);
  for (const parte of orden) {
    if (faltan <= BigInt(0)) break;
    resultado[parte.indice] += BigInt(1);
    faltan -= BigInt(1);
  }
  return resultado.map((v) => Number(v));
}

/** Cantidad en milésimas (enteras) — `movimientos_insumo.cantidad` es
 * `numeric(12,3)`. */
function cantidadEnMilesimas(cantidad: number): bigint {
  return BigInt(Math.round(cantidad * 1000));
}

/** Importe de una línea: cantidad × precio, redondeado al centavo. */
export function importeLineaCentavos(linea: LineaFacturaInput): number {
  const milesimas = cantidadEnMilesimas(linea.cantidad);
  return Number(
    dividirRedondeando(milesimas * BigInt(Math.round(linea.precioUnitarioCentavos)), BigInt(1000)),
  );
}

/**
 * Calcula la factura completa. Espera líneas ya validadas (cantidad > 0,
 * precio > 0, importe > 0 — ver `validarLineaFactura`); con líneas
 * inválidas el resultado no tiene sentido (el RPC las rechaza).
 */
export function calcularFacturaInsumos(input: FacturaInsumosInput): FacturaInsumosCalculada {
  const importes = input.lineas.map(importeLineaCentavos);
  const subtotal = importes.reduce((acc, v) => acc + v, 0);

  const ivaBasisPoints = input.preciosSinIva ? Math.round(input.ivaPct * 100) : 0;
  const ivaTotal = Number(
    dividirRedondeando(BigInt(subtotal) * BigInt(ivaBasisPoints), BigInt(10000)),
  );
  const ivas = repartirRestoMayor(ivaTotal, importes);

  const envioTotal = Math.max(0, Math.round(input.envioCentavos));
  const envios = repartirRestoMayor(
    envioTotal,
    input.lineas.map((l) => Number(cantidadEnMilesimas(l.cantidad))),
  );

  const lineas = input.lineas.map((linea, i) => {
    const totalCentavos = importes[i] + ivas[i] + envios[i];
    return {
      ...linea,
      importeCentavos: importes[i],
      ivaCentavos: ivas[i],
      envioCentavos: envios[i],
      totalCentavos,
      costoUnitarioCentavos: linea.cantidad > 0 ? totalCentavos / linea.cantidad : 0,
    };
  });

  return {
    lineas,
    subtotalCentavos: subtotal,
    ivaCentavos: ivaTotal,
    totalFacturaCentavos: subtotal + ivaTotal,
    envioCentavos: envioTotal,
    totalPagadoCentavos: subtotal + ivaTotal + envioTotal,
  };
}

/** Mismas validaciones por línea que el RPC (sin el insumo, que valida la
 * base). Devuelve el código de error del RPC o `null` si está bien. */
export function validarLineaFactura(
  linea: LineaFacturaInput,
): "CANTIDAD_INVALIDA" | "PRECIO_INVALIDO" | null {
  if (!(linea.cantidad > 0) || Math.round(linea.cantidad * 1000) / 1000 !== linea.cantidad) {
    return "CANTIDAD_INVALIDA";
  }
  if (!(linea.precioUnitarioCentavos > 0) || !Number.isInteger(linea.precioUnitarioCentavos)) {
    return "PRECIO_INVALIDO";
  }
  if (importeLineaCentavos(linea) <= 0) return "PRECIO_INVALIDO";
  return null;
}

export type EstadoLineaFactura = {
  /** La línea lista para calcular y mandar, o `null` si le falta algo o
   * tiene un error. */
  linea: (LineaFacturaInput & { insumoId: string }) | null;
  /** Mensaje para mostrar debajo del campo, o `null`. */
  errorCantidad: string | null;
  errorPrecio: string | null;
  /** Falta el insumo, la cantidad o el precio (todavía no se cargó: no es
   * un error, pero la línea no entra en la cuenta). */
  incompleta: boolean;
};

/**
 * Lee lo que el dueño tipeó en una línea de la factura y dice si sirve o
 * por qué no — así ninguna línea queda afuera de la cuenta sin avisar.
 * Usa los mismos parsers que el resto de la app (`parseMontoInput`,
 * `parseCantidadInput`, que aceptan "." o "," como decimal y cuentas):
 * acá solo se detectan antes los casos que esos parsers rechazan o
 * redondean en silencio. Un número suelto con más decimales de los que se
 * guardan (precio con 3+, cantidad con 4+) es un error — el campo
 * (`MontoInput` con `exigirExacto`) tampoco lo redondea al salir —; una
 * cuenta ("12,34*1,21") se redondea al centavo como en toda la app.
 */
export function evaluarLineaFactura(texto: {
  insumoId: string;
  cantidad: string;
  precio: string;
}): EstadoLineaFactura {
  const cantidadTexto = texto.cantidad.replace(/\s+/g, "");
  const precioTexto = texto.precio.replace(/\$/g, "").replace(/\s+/g, "");

  let cantidad: number | null = null;
  let errorCantidad: string | null = null;
  if (cantidadTexto !== "") {
    const cuenta = evaluarCuenta(cantidadTexto, "cantidad");
    cantidad = parseCantidadInput(cantidadTexto);
    if (cuenta.ok && !cuenta.esCuenta && !esExacto(cuenta.valor, 3)) {
      errorCantidad = "La cantidad admite hasta 3 decimales.";
    } else if (cantidad === null && cuenta.esCuenta && !cuenta.ok) {
      errorCantidad = "La cuenta de la cantidad está sin terminar o mal escrita.";
    } else if (cantidad === null && !cuenta.ok) {
      errorCantidad = "Revisá la cantidad (ej. 960 o 0,5).";
    } else if (cantidad === null || cantidad <= 0) {
      errorCantidad = "La cantidad tiene que ser mayor a cero.";
    }
  }

  let precio: number | null = null;
  let errorPrecio: string | null = null;
  if (precioTexto !== "") {
    const cuenta = evaluarCuenta(precioTexto, "monto");
    precio = parseMontoInput(precioTexto);
    if (cuenta.ok && !cuenta.esCuenta && !esExacto(cuenta.valor, 2)) {
      errorPrecio = "El precio admite hasta 2 decimales.";
    } else if (precio === null && cuenta.esCuenta && !cuenta.ok) {
      errorPrecio = "La cuenta del precio está sin terminar o mal escrita.";
    } else if (precio === null) {
      errorPrecio = "Revisá el precio (ej. 12,34).";
    } else if (precio <= 0) {
      errorPrecio = "El precio tiene que ser mayor a cero.";
    }
  }

  const incompleta = !texto.insumoId || cantidadTexto === "" || precioTexto === "";

  if (!errorCantidad && !errorPrecio && cantidad !== null && precio !== null) {
    const validacion = validarLineaFactura({ cantidad, precioUnitarioCentavos: precio });
    if (validacion === "PRECIO_INVALIDO") {
      errorPrecio = "Cantidad × precio da menos de un centavo.";
    } else if (validacion === "CANTIDAD_INVALIDA") {
      errorCantidad = "Revisá la cantidad.";
    }
  }

  const linea =
    !incompleta && !errorCantidad && !errorPrecio && cantidad !== null && precio !== null
      ? { insumoId: texto.insumoId, cantidad, precioUnitarioCentavos: precio }
      : null;

  return { linea, errorCantidad, errorPrecio, incompleta };
}

/**
 * Costo por unidad para mostrar: "$ 125,75" o, si tiene más precisión,
 * hasta 4 decimales ("$ 209,3895"). Recibe centavos con fracción
 * (`costoUnitarioCentavos`).
 */
export function formatCostoUnitario(centavos: number): string {
  const pesos = centavos / 100;
  return `$ ${pesos.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })}`;
}
