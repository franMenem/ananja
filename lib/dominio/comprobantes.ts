/**
 * Funciones puras del dominio Comprobantes — sin I/O, ver
 * `lib/data/comprobantes.ts` para las lecturas. Usado por
 * `app/(app)/comprobantes/page.tsx` para la franja de métricas del mes y por
 * `components/comprobante-form/*` (armado de ítems, validación y traducción
 * de errores del formulario, extraídos de `components/comprobante-form.tsx`
 * que superaba las 1200 líneas).
 */

import { fusionarFilasDuplicadas, hayDescuadre, type FilaLote } from "@/lib/dominio/lotes-split";
import { formatMontoDisplay, parseMontoInput } from "@/lib/money";
import { NEGOCIO, concordar, formatPresentacion } from "@/lib/negocio";
import type { Enums } from "@/lib/types";

type MedioPago = Enums<"medio_pago">;

export type ComprobanteParaResumenMes = {
  fecha: string;
  monto_centavos: number;
  medio_pago: MedioPago;
  comprobante_items: { cantidad: number }[];
};

export type ResumenMesComprobantes = {
  cantidad: number;
  totalCentavos: number;
  unidades: number;
  ticketPromedioCentavos: number;
  medioMasUsado: MedioPago | null;
};

/** Medio de pago con más comprobantes — `null` sin ningún comprobante.
 * Empate: se queda con el primero encontrado (mismo criterio que antes,
 * cuando esto vivía inline en la página). */
function medioMasUsadoDe(rows: { medio_pago: MedioPago }[]): MedioPago | null {
  const counts = new Map<MedioPago, number>();
  for (const r of rows) counts.set(r.medio_pago, (counts.get(r.medio_pago) ?? 0) + 1);

  let top: MedioPago | null = null;
  let max = 0;
  for (const [medio, count] of counts) {
    if (count > max) {
      max = count;
      top = medio;
    }
  }
  return top;
}

/** Total cobrado, unidades vendidas, ticket promedio y medio más usado del
 * mes indicado (`AAAA-MM`) — franja oliva de métricas de `/comprobantes`.
 * `rows` es la lista completa (sin filtrar); esta función filtra por mes. */
export function resumenMesComprobantes(
  rows: ComprobanteParaResumenMes[],
  mesActual: string,
): ResumenMesComprobantes {
  const rowsMes = rows.filter((r) => r.fecha.startsWith(mesActual));

  const totalCentavos = rowsMes.reduce((sum, r) => sum + r.monto_centavos, 0);
  const unidades = rowsMes.reduce(
    (sum, r) => sum + r.comprobante_items.reduce((s, item) => s + item.cantidad, 0),
    0,
  );
  const ticketPromedioCentavos = rowsMes.length > 0 ? Math.round(totalCentavos / rowsMes.length) : 0;

  return {
    cantidad: rowsMes.length,
    totalCentavos,
    unidades,
    ticketPromedioCentavos,
    medioMasUsado: medioMasUsadoDe(rowsMes),
  };
}

// ---------------------------------------------------------------------
// ComprobanteForm — ítems, validación del formulario y traducción de
// errores de `crear_comprobante`/`actualizar_comprobante`. Extraído tal
// cual (mismos mensajes, mismo orden de chequeos) de
// `components/comprobante-form.tsx`; ver `components/comprobante-form/*`
// para los hooks que las usan.
// ---------------------------------------------------------------------

type ProductoParaItems = { id: string };
type ProductoParaResumen = { id: string; presentacion_ml: number };

export type ItemComprobantePayload = {
  producto_id: string;
  cantidad: number;
  lote_id?: string;
  precio_unitario_centavos?: number;
};

/**
 * Arma `p_items` para `crear_comprobante`/`actualizar_comprobante`: cuando
 * el producto tiene un split por lote cargado (`SelectorLote`, vía
 * `handleLotesChange`), manda una fila por lote — `fusionarFilasDuplicadas`
 * por las dudas, la RPC rechaza dos filas con el mismo
 * `(producto_id, lote_id)` (ITEM_DUPLICADO). Sin split todavía (recién
 * montado, o producto sin ningún lote cargado), manda una sola fila sin
 * `lote_id`. Un solo precio por producto (si se cargó), repetido en cada
 * fila de ese producto.
 */
export function construirItemsPayloadComprobante<P extends ProductoParaItems>(
  productos: P[],
  cantidades: Record<string, number>,
  lotesPorProducto: Record<string, FilaLote[]>,
  precios: Record<string, string>,
): ItemComprobantePayload[] {
  const items: ItemComprobantePayload[] = [];

  for (const p of productos) {
    const cantidad = cantidades[p.id] ?? 0;
    if (cantidad <= 0) continue;

    const precioInput = precios[p.id];
    const precioParseado =
      precioInput && precioInput.trim() !== "" ? parseMontoInput(precioInput) : null;
    const precioUnitarioCentavos =
      precioParseado !== null && precioParseado > 0 ? precioParseado : undefined;

    const filas = lotesPorProducto[p.id];
    if (filas && filas.length > 0) {
      for (const fila of fusionarFilasDuplicadas(filas)) {
        if (fila.cantidad <= 0) continue;
        items.push({
          producto_id: p.id,
          cantidad: fila.cantidad,
          lote_id: fila.loteId ?? undefined,
          precio_unitario_centavos: precioUnitarioCentavos,
        });
      }
    } else {
      items.push({ producto_id: p.id, cantidad, precio_unitario_centavos: precioUnitarioCentavos });
    }
  }

  return items;
}

/**
 * Producto con un split por lote descuadrado (el dueño movió cantidades
 * entre lotes y el total ya no da igual al del stepper) — bloquea el
 * guardado. `null` si ninguno tiene descuadre (o ninguno tiene split
 * cargado todavía).
 */
export function buscarProductoConLotesDescuadrados<P extends { id: string }>(
  productos: P[],
  cantidades: Record<string, number>,
  lotesPorProducto: Record<string, FilaLote[]>,
): P | null {
  for (const p of productos) {
    const filas = lotesPorProducto[p.id];
    if (!filas || filas.length === 0) continue;
    if (hayDescuadre(filas, cantidades[p.id] ?? 0)) return p;
  }
  return null;
}

/** "2×750ml y 1×500ml" — resumen de lo que se va a descontar del depósito
 * (texto de ayuda bajo el botón de guardar), de mayor a menor
 * presentación. */
export function construirResumenDescuentoComprobante<P extends ProductoParaResumen>(
  productos: P[],
  cantidades: Record<string, number>,
): string {
  return [...productos]
    .filter((p) => (cantidades[p.id] ?? 0) > 0)
    .sort((a, b) => b.presentacion_ml - a.presentacion_ml)
    .map((p) => `${cantidades[p.id]}×${formatPresentacion(p.presentacion_ml)}`)
    .join(" y ");
}

/** Total en vivo de "cantidad × precio por botella" de los ítems con precio
 * cargado — `null` si ninguno tiene precio todavía (no hay nada que
 * mostrar ni comparar contra el monto de la venta). */
export function calcularTotalPreciosComprobante<P extends ProductoParaItems>(
  productos: P[],
  cantidades: Record<string, number>,
  precios: Record<string, string>,
): number | null {
  let total = 0;
  let algunPrecio = false;
  for (const p of productos) {
    const cantidad = cantidades[p.id] ?? 0;
    if (cantidad <= 0) continue;
    const input = precios[p.id];
    if (!input || input.trim() === "") continue;
    const valor = parseMontoInput(input);
    if (valor === null) continue;
    algunPrecio = true;
    total += valor * cantidad;
  }
  return algunPrecio ? total : null;
}

/**
 * Mientras el dueño no haya tocado el precio de un producto a mano
 * (`preciosTocados`), lo mantiene sincronizado con el precio minorista
 * sugerido del PRIMER lote elegido para ese producto (recalcula solo si no
 * está "tocado"). Devuelve el mismo objeto `prev` sin cambios cuando no hay
 * nada para actualizar, para no disparar un re-render de más.
 */
export function sincronizarPreciosSugeridosComprobante<P extends ProductoParaItems>(
  prev: Record<string, string>,
  productos: P[],
  cantidades: Record<string, number>,
  lotesPorProducto: Record<string, FilaLote[]>,
  preciosTocados: Record<string, boolean>,
  precioSugeridoPorLoteProducto: Map<string, number>,
): Record<string, string> {
  let cambio = false;
  const next = { ...prev };
  for (const p of productos) {
    if (preciosTocados[p.id]) continue;
    if ((cantidades[p.id] ?? 0) <= 0) continue;

    const primerLoteId = lotesPorProducto[p.id]?.[0]?.loteId ?? null;
    const sugeridoCentavos =
      primerLoteId !== null
        ? precioSugeridoPorLoteProducto.get(`${primerLoteId}:${p.id}`)
        : undefined;
    if (sugeridoCentavos === undefined) continue;

    const formateado = formatMontoDisplay(sugeridoCentavos);
    if (next[p.id] !== formateado) {
      next[p.id] = formateado;
      cambio = true;
    }
  }
  return cambio ? next : prev;
}

/** Resultado de `validarComprobanteForm`: `ok: true` con los centavos ya
 * parseados y el medio de pago ya no-nulo (para no repetir el parseo ni el
 * chequeo de null al armar el payload), o `ok: false` con el mensaje a
 * mostrar. */
export type ValidacionComprobanteResultado =
  | { ok: true; montoCentavos: number; cobradoCentavos: number; medioPago: MedioPago }
  | { ok: false; error: string };

export type ValidacionComprobanteInput<P extends { id: string; nombre: string }> = {
  uploading: boolean;
  montoInput: string;
  cobradoCentavos: number | null;
  clienteId: string | null;
  medioPago: MedioPago | null;
  itemsCount: number;
  productos: P[];
  cantidades: Record<string, number>;
  precios: Record<string, string>;
  lotesPorProducto: Record<string, FilaLote[]>;
};

/**
 * Validaciones de `ComprobanteForm` antes de pegarle a
 * `crear_comprobante`/`actualizar_comprobante` — mismo orden y mismos
 * mensajes que antes (varios se repiten a propósito, ver
 * `interpretarErrorComprobante`, que traduce el mismo caso cuando lo
 * rechaza la RPC en vez del formulario).
 */
export function validarComprobanteForm<P extends { id: string; nombre: string }>(
  input: ValidacionComprobanteInput<P>,
): ValidacionComprobanteResultado {
  const {
    uploading,
    montoInput,
    cobradoCentavos,
    clienteId,
    medioPago,
    itemsCount,
    productos,
    cantidades,
    precios,
    lotesPorProducto,
  } = input;

  if (uploading) {
    return { ok: false, error: "Esperá a que termine de subir la foto." };
  }

  const montoCentavos = parseMontoInput(montoInput);
  if (montoCentavos === null || montoCentavos <= 0) {
    return { ok: false, error: "Ingresá un monto válido." };
  }

  if (cobradoCentavos === null) {
    return {
      ok: false,
      error:
        "Revisá lo cobrado ahora: hay una cuenta sin terminar o un número que no se entiende.",
    };
  }
  if (cobradoCentavos === null || cobradoCentavos < 0 || cobradoCentavos > montoCentavos) {
    return { ok: false, error: "Lo cobrado no puede superar el monto." };
  }

  if (cobradoCentavos < montoCentavos && !clienteId) {
    return { ok: false, error: "Para dejar saldo a cobrar elegí un cliente." };
  }

  if (!medioPago) {
    return { ok: false, error: "Elegí un medio de pago." };
  }

  if (itemsCount === 0) {
    return {
      ok: false,
      error: `Indicá ${concordar("cuántos", "cuántas")} ${NEGOCIO.envase.plural} se vendieron.`,
    };
  }

  const productoDescuadrado = buscarProductoConLotesDescuadrados(
    productos,
    cantidades,
    lotesPorProducto,
  );
  if (productoDescuadrado) {
    return {
      ok: false,
      error: `Revisá de qué lote sale ${productoDescuadrado.nombre}: las cantidades por lote no suman ${cantidades[productoDescuadrado.id] ?? 0}.`,
    };
  }

  for (const p of productos) {
    if ((cantidades[p.id] ?? 0) <= 0) continue;
    const inputPrecio = precios[p.id];
    if (!inputPrecio || inputPrecio.trim() === "") continue;
    const valor = parseMontoInput(inputPrecio);
    if (valor === null || valor <= 0) {
      return {
        ok: false,
        error: `El precio por botella de ${p.nombre} tiene que ser mayor a $ 0.`,
      };
    }
  }

  return { ok: true, montoCentavos, cobradoCentavos, medioPago };
}

/** Alerta de stock insuficiente (`STOCK_INSUFICIENTE`/`STOCK_LOTE_INSUFICIENTE`)
 * — datos para la hoja "Guardar igual" de `ComprobanteForm`. */
export type StockAlertComprobante = { producto: string; disponible: number };

export type ResultadoErrorComprobante =
  | { tipo: "error"; mensaje: string }
  | { tipo: "stock"; alerta: StockAlertComprobante };

/**
 * Traduce un error de `crear_comprobante`/`actualizar_comprobante` a un
 * mensaje, o -en los dos casos de stock insuficiente- a los datos de la
 * hoja "Guardar igual". Extraído tal cual de
 * `ComprobanteForm.handleRpcError` (mismo texto, mismos códigos); los tres
 * casos de Ferias son de comprobantes viejos, de cuando existía esa
 * sección, y no tienen ninguna forma de resolverse desde esta pantalla.
 */
export function interpretarErrorComprobante<P extends { id: string; nombre: string }>(
  error: { message?: string; details?: string },
  productos: P[],
): ResultadoErrorComprobante {
  const message = error.message;

  if (message === "SIN_ITEMS") {
    return {
      tipo: "error",
      mensaje: `Indicá ${concordar("cuántos", "cuántas")} ${NEGOCIO.envase.plural} se vendieron.`,
    };
  }

  if (message === "MONTO_INVALIDO") {
    return { tipo: "error", mensaje: "Ingresá un monto válido." };
  }

  if (message === "IMAGEN_REQUERIDA") {
    return { tipo: "error", mensaje: "Falta la foto del comprobante." };
  }

  if (message === "COMPROBANTE_NO_ENCONTRADO") {
    return { tipo: "error", mensaje: "Este comprobante ya no existe." };
  }

  if (message === "VENDEDOR_NO_REGISTRADO") {
    return {
      tipo: "error",
      mensaje: "Tu usuario no está vinculado a un vendedor. Pedile al dueño que te dé de alta.",
    };
  }

  if (message === "CLIENTE_INVALIDO") {
    return {
      tipo: "error",
      mensaje: 'El cliente elegido ya no está disponible. Elegí otro o dejá "Sin cliente".',
    };
  }

  if (message === "COBRADO_INVALIDO") {
    return { tipo: "error", mensaje: "Lo cobrado no puede superar el monto." };
  }

  if (message === "CREDITO_REQUIERE_CLIENTE") {
    return { tipo: "error", mensaje: "Para dejar saldo a cobrar elegí un cliente." };
  }

  if (message === "MONTO_MENOR_A_COBRADO") {
    return { tipo: "error", mensaje: "El monto no puede ser menor a lo ya cobrado." };
  }

  if (message === "FERIA_CERRADA") {
    return {
      tipo: "error",
      mensaje: "Esta venta pertenece a una feria que ya cerró y no se puede editar.",
    };
  }

  if (message === "FERIA_NO_ENCONTRADA" || message === "FERIA_NO_MODIFICABLE") {
    return {
      tipo: "error",
      mensaje: "No se pudo guardar: esta venta quedó asociada a una feria de forma inconsistente.",
    };
  }

  if (message === "PRECIO_UNITARIO_INVALIDO") {
    return { tipo: "error", mensaje: "El precio por botella tiene que ser mayor a $ 0." };
  }

  if (message === "LOTE_INVALIDO" || message === "ITEM_DUPLICADO") {
    return {
      tipo: "error",
      mensaje:
        "Hubo un problema con el lote elegido. Revisá el split por lote de cada producto y probá de nuevo.",
    };
  }

  if (message === "STOCK_INSUFICIENTE") {
    try {
      const detail = JSON.parse(error.details ?? "{}") as {
        producto?: string;
        disponible?: number;
      };
      return {
        tipo: "stock",
        alerta: { producto: detail.producto ?? "el producto", disponible: detail.disponible ?? 0 },
      };
    } catch {
      return { tipo: "stock", alerta: { producto: "el producto", disponible: 0 } };
    }
  }

  if (message === "STOCK_LOTE_INSUFICIENTE") {
    try {
      const detail = JSON.parse(error.details ?? "{}") as {
        producto_id?: string;
        disponible?: number;
      };
      const producto = productos.find((p) => p.id === detail.producto_id);
      return {
        tipo: "stock",
        alerta: { producto: producto?.nombre ?? "el producto", disponible: detail.disponible ?? 0 },
      };
    } catch {
      return { tipo: "stock", alerta: { producto: "el producto", disponible: 0 } };
    }
  }

  return {
    tipo: "error",
    mensaje:
      "No se pudo guardar por un problema de conexión. Los datos quedaron cargados: revisá tu conexión e intentá de nuevo.",
  };
}

// --- Pestañas de `/comprobantes` ------------------------------------------

export type TabComprobantes = "ventas" | "pagos";

/**
 * Pestaña elegida en `?tab=` — "pagos" solo si dice exactamente eso;
 * cualquier otro valor (ausente, repetido, desconocido) cae en "ventas", la
 * vista de siempre.
 */
export function tabComprobantesDeParam(valor: string | string[] | undefined): TabComprobantes {
  const primero = Array.isArray(valor) ? valor[0] : valor;
  return primero === "pagos" ? "pagos" : "ventas";
}
