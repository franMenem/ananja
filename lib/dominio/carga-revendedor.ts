/**
 * "Cargar todo junto" (`/revendedores/[id]/carga`, solo admins): entrega +
 * ventas + pago de una revendedora en una sola operación
 * (supabase/migrations/0043_carga_unificada_revendedor.sql). Funciones
 * puras: precargas, resumen en vivo, reparto FIFO sobre el stock que ya
 * tiene MÁS la entrega que se está cargando, validación por sección,
 * armado del pedido para `registrar_carga_revendedor` y traducción de sus
 * errores. El RPC es la fuente de verdad al guardar; esto anticipa en
 * pantalla exactamente lo que va a guardar.
 */

import {
  atribuirVenta,
  costoTotalVenta,
  gananciaVenta,
  lotesConStockRevendedora,
  stockPorEntrega,
  type EntregaItemFifo,
  type TramoStock,
  type VentaAdminRevisada,
  type VentaFifo,
} from "@/lib/dominio/revendedor-stock";
import type { LoteConStockDeProducto } from "@/lib/dominio/lotes-disponibles";
import type { Enums, Json } from "@/lib/types";

export type MedioPago = Enums<"medio_pago">;
export type ViaPago = "encargado" | "directo_cuenta" | "cliente_directo";
export type SeccionCarga = "general" | "entrega" | "ventas" | "pago";

/** `entregaId` de los tramos de la entrega que se está cargando (todavía
 * no tiene id real). */
export const ENTREGA_NUEVA_ID = "nueva";

/** `created_at` de la entrega nueva: se inserta en la misma transacción,
 * después de todas las existentes, así que en el orden FIFO (fecha,
 * created_at, id) va última entre las de su misma fecha. */
const CREATED_AT_ENTREGA_NUEVA = "9999-12-31T23:59:59.999999+00:00";

export interface FilaEntregaCarga {
  productoId: string;
  /** Una sola fila (un lote) por presentación. `null` = sin lote. */
  loteId: string | null;
  cantidad: number;
  /** Le debe a Ananja por botella. `null` = vacío o mal escrito. */
  costoCentavos: number | null;
  /** Precio de venta sugerido. `null` = sin sugerido. */
  sugeridoCentavos: number | null;
  /** El texto del sugerido no se entiende (distinto de vacío). */
  sugeridoInvalido?: boolean;
}

export interface EntregaCarga {
  fecha: string;
  filas: FilaEntregaCarga[];
  permitirNegativo?: boolean;
}

/** Una línea de venta. Puede haber varias de la MISMA presentación (ej. 15
 * a $X y 10 sin precio): se guardan en este orden y cada una toma lo que
 * dejaron las anteriores — igual que el RPC. */
export interface FilaVentaCarga {
  productoId: string;
  cantidad: number;
  /** `null` = "No sé a cuánto la vendió" (o vacío, ver `sinPrecio`). */
  precioVentaCentavos: number | null;
  /** Marcó "No sé a cuánto la vendió". */
  sinPrecio: boolean;
  /** Lote elegido a mano (0062_venta_revendedor_elegir_lote.sql), o `null`
   * = "Automático (FIFO)" — mismo reparto de siempre entre todas las
   * entregas. Con un lote puntual, la venta sale SOLO de los tramos de ESE
   * lote (FIFO dentro del lote), aunque otro lote tenga stock de sobra. */
  loteId: string | null;
}

export interface VentasCarga {
  fecha: string;
  medioPago: MedioPago | null;
  filas: FilaVentaCarga[];
}

export interface PagoCarga {
  fecha: string;
  /** `null` = vacío o mal escrito. */
  montoCentavos: number | null;
  medioPago: MedioPago | null;
  via: ViaPago;
  nota: string;
}

export interface CargaInput {
  entrega: EntregaCarga | null;
  ventas: VentasCarga | null;
  pago: PagoCarga | null;
}

/** Lo que ya se sabe de la revendedora antes de cargar nada. */
export interface EstadoRevendedora {
  items: EntregaItemFifo[];
  ventas: VentaFifo[];
  /** Precio revendedor manual por producto (entregas anteriores a 0040). */
  preciosManuales: Record<string, number | null>;
  /** `v_deuda_vendedor.saldo_centavos` hoy. */
  deudaCentavos: number;
  /** "yyyy-mm-dd" de hoy en Argentina. */
  hoy: string;
}

function filasEntregaConCantidad(entrega: EntregaCarga | null): FilaEntregaCarga[] {
  return entrega ? entrega.filas.filter((f) => f.cantidad > 0) : [];
}

/** Ítems de entrega existentes + los de la entrega nueva, con la forma que
 * espera `stockPorEntrega`. */
export function itemsConEntregaNueva(
  items: EntregaItemFifo[],
  entrega: EntregaCarga | null,
): EntregaItemFifo[] {
  const nuevos = filasEntregaConCantidad(entrega).map<EntregaItemFifo>((f) => ({
    id: `${ENTREGA_NUEVA_ID}:${f.productoId}`,
    entregaId: ENTREGA_NUEVA_ID,
    tipo: "entrega",
    fecha: entrega!.fecha,
    createdAt: CREATED_AT_ENTREGA_NUEVA,
    productoId: f.productoId,
    loteId: f.loteId,
    cantidad: f.cantidad,
    costoAnanjaUnitarioCentavos: f.costoCentavos,
    precioSugeridoCentavos: f.sugeridoCentavos,
  }));
  return [...items, ...nuevos];
}

/** Stock por entrega (FIFO) contando la entrega que se está cargando. */
export function stockConEntregaNueva(
  estado: Pick<EstadoRevendedora, "items" | "ventas">,
  entrega: EntregaCarga | null,
): TramoStock[] {
  return stockPorEntrega(itemsConEntregaNueva(estado.items, entrega), estado.ventas);
}

/** Botellas que va a tener de cada producto (lo que ya tiene + la entrega). */
export function disponiblePorProducto(tramos: TramoStock[]): Record<string, number> {
  const resultado: Record<string, number> = {};
  for (const t of tramos) {
    resultado[t.productoId] = (resultado[t.productoId] ?? 0) + t.quedan;
  }
  return resultado;
}

/** Botellas de cada producto en la entrega que se está cargando. */
export function entregadoPorProducto(entrega: EntregaCarga | null): Record<string, number> {
  const resultado: Record<string, number> = {};
  for (const f of filasEntregaConCantidad(entrega)) {
    resultado[f.productoId] = (resultado[f.productoId] ?? 0) + f.cantidad;
  }
  return resultado;
}

/** Fecha por defecto de las ventas: la de la entrega si se está cargando
 * una (no puede ser anterior a la entrega de la que salen), si no hoy. */
export function fechaVentasPorDefecto(entrega: EntregaCarga | null, hoy: string): string {
  return entrega && entrega.fecha ? entrega.fecha : hoy;
}

/** Precio con el que se precarga "¿A cuánto la vendió?": el sugerido de la
 * primera entrega de la que saldrían las botellas. */
export function precioSugeridoVenta(tramos: TramoStock[], productoId: string): number | null {
  const primero = tramos.find((t) => t.productoId === productoId && t.quedan > 0);
  return primero?.precioSugeridoCentavos ?? null;
}

/** Precarga del monto del pago: lo que va a deber después de estas ventas
 * menos lo que ya informó y todavía no se confirmó (si después se confirma,
 * no queda pagado dos veces), nunca negativo. */
export function montoPagoSugerido(
  deudaDespuesVentasCentavos: number,
  pendienteCentavos = 0,
): number {
  return Math.max(deudaDespuesVentasCentavos - pendienteCentavos, 0);
}

/** De las primeras `cantidad` botellas vendidas de un producto, cuántas
 * salen de stock que ya tenía antes de la entrega que se está cargando
 * (FIFO: las entregas más viejas se venden primero). */
export function yaTeniaAntesDeLaEntrega(
  tramos: TramoStock[],
  productoId: string,
  cantidad: number,
): number {
  return atribuirVenta(tramos, productoId, cantidad, null)
    .tramos.filter((t) => t.entregaId !== ENTREGA_NUEVA_ID)
    .reduce((acc, t) => acc + t.cantidad, 0);
}

/**
 * Lote precargado para una entrega fechada `fechaEntrega` (cargas
 * históricas): solo lotes producidos hasta esa fecha; entre ellos el más
 * viejo que todavía tiene stock y, si ninguno tiene, el más nuevo igual (sin
 * stock ahora: al guardar se ofrece "Guardar igual" en vez de cambiarlo por
 * otro lote). `null` si no hay ningún lote de esa presentación hasta esa
 * fecha.
 */
export function loteParaEntrega(
  lotes: LoteConStockDeProducto[],
  productoId: string,
  fechaEntrega: string,
): LoteConStockDeProducto | null {
  const candidatos = lotes.filter(
    (l) => l.productoId === productoId && (!fechaEntrega || l.fecha <= fechaEntrega),
  );
  const conStock = candidatos
    .filter((l) => l.quedan > 0)
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  if (conStock.length > 0) return conStock[0];
  return [...candidatos].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))[0] ?? null;
}

/**
 * Reparto FIFO de las líneas de venta, EN ORDEN: cada línea se atribuye con
 * `atribuirVenta` sobre el stock que dejaron las anteriores — espejo del
 * loop de `registrar_carga_revendedor`, que llama a
 * `registrar_venta_revendedor_admin` línea por línea dentro de la misma
 * transacción (cada llamada vuelve a leer `stock_revendedor_por_entrega`).
 */
export function revisarVentasCarga(
  tramosStock: TramoStock[],
  filas: FilaVentaCarga[],
  preciosManuales: Record<string, number | null>,
  fechaVenta: string,
): VentaAdminRevisada[] {
  const restantes = tramosStock.map((t) => ({ ...t }));
  return filas
    .filter((f) => f.cantidad > 0)
    .map((f) => {
      const precioVentaCentavos = f.sinPrecio ? null : f.precioVentaCentavos;
      const { tramos, faltante, entregaPosterior } = atribuirVenta(
        restantes,
        f.productoId,
        f.cantidad,
        preciosManuales[f.productoId] ?? null,
        fechaVenta,
        f.loteId,
      );
      for (const tramo of tramos) {
        const r = restantes.find((x) => x.entregaItemId === tramo.entregaItemId);
        if (r) r.quedan -= tramo.cantidad;
      }
      const costoCentavos = costoTotalVenta(tramos);
      const gananciaCentavos =
        precioVentaCentavos !== null ? gananciaVenta(tramos, precioVentaCentavos) : null;
      return {
        productoId: f.productoId,
        cantidad: f.cantidad,
        precioVentaCentavos,
        loteId: f.loteId,
        tramos,
        faltante,
        entregaPosterior,
        costoCentavos,
        gananciaCentavos,
      };
    });
}

export interface ResumenCarga {
  botellasEntregadas: number;
  /** Si vende todo lo de esta entrega, cuánto le debería (con los costos cargados). */
  costoEntregaCentavos: number;
  ventas: VentaAdminRevisada[];
  vendidasConPrecio: number;
  vendidasSinPrecio: number;
  deudaAntesCentavos: number;
  /** Lo que suman las ventas a la deuda (tramos sin costo cuentan 0). */
  costoVentasCentavos: number;
  deudaDespuesVentasCentavos: number;
  /** Ganancia de las ventas con precio (las sin precio no suman). */
  gananciaConPrecioCentavos: number;
  pagoCentavos: number;
  /** Lo que queda debiendo después de todo (negativo = pagó de más). */
  saldoFinalCentavos: number;
}

/** Resumen en vivo de lo que se está cargando (y de lo que se va a guardar). */
export function resumirCarga(estado: EstadoRevendedora, input: CargaInput): ResumenCarga {
  const filasEntrega = filasEntregaConCantidad(input.entrega);
  const botellasEntregadas = filasEntrega.reduce((acc, f) => acc + f.cantidad, 0);
  const costoEntregaCentavos = filasEntrega.reduce(
    (acc, f) => acc + (f.costoCentavos ?? 0) * f.cantidad,
    0,
  );

  const tramos = stockConEntregaNueva(estado, input.entrega);
  const ventas = input.ventas
    ? revisarVentasCarga(tramos, input.ventas.filas, estado.preciosManuales, input.ventas.fecha)
    : [];

  let vendidasConPrecio = 0;
  let vendidasSinPrecio = 0;
  let costoVentasCentavos = 0;
  let gananciaConPrecioCentavos = 0;
  for (const v of ventas) {
    if (v.precioVentaCentavos !== null) vendidasConPrecio += v.cantidad;
    else vendidasSinPrecio += v.cantidad;
    for (const t of v.tramos) costoVentasCentavos += (t.costoUnitarioCentavos ?? 0) * t.cantidad;
    if (v.gananciaCentavos !== null) gananciaConPrecioCentavos += v.gananciaCentavos;
  }

  const deudaAntesCentavos = estado.deudaCentavos;
  const deudaDespuesVentasCentavos = deudaAntesCentavos + costoVentasCentavos;
  const pagoCentavos = input.pago?.montoCentavos ?? 0;

  return {
    botellasEntregadas,
    costoEntregaCentavos,
    ventas,
    vendidasConPrecio,
    vendidasSinPrecio,
    deudaAntesCentavos,
    costoVentasCentavos,
    deudaDespuesVentasCentavos,
    gananciaConPrecioCentavos,
    pagoCentavos,
    saldoFinalCentavos: deudaDespuesVentasCentavos - pagoCentavos,
  };
}

export interface ProblemaCarga {
  seccion: SeccionCarga;
  productoId?: string;
  mensaje: string;
}

export interface TextosCarga {
  /** Nombre por producto, para los mensajes. */
  nombres: Record<string, string>;
  /** "Ananja" */
  negocio: string;
  /** "botellas" */
  envasePlural: string;
  /** Formatea "yyyy-mm-dd" para mostrar. */
  formatFecha: (fecha: string) => string;
}

/**
 * Todo lo que hay que corregir antes de "Revisá todo", por sección. Lista
 * vacía = se puede revisar y guardar. Mismas reglas que el RPC (más las de
 * esta pantalla: una sola sección como mínimo, fechas no futuras).
 */
export function validarCarga(
  estado: EstadoRevendedora,
  input: CargaInput,
  textos: TextosCarga,
): ProblemaCarga[] {
  const problemas: ProblemaCarga[] = [];
  const nombre = (id: string) => textos.nombres[id] ?? "un producto";

  if (!input.entrega && !input.ventas && !input.pago) {
    return [
      {
        seccion: "general",
        mensaje: "Sumá al menos una parte: la entrega, las ventas o el pago.",
      },
    ];
  }

  if (input.entrega) {
    const e = input.entrega;
    if (!e.fecha) {
      problemas.push({ seccion: "entrega", mensaje: "Elegí la fecha de la entrega." });
    } else if (e.fecha > estado.hoy) {
      problemas.push({
        seccion: "entrega",
        mensaje: "La fecha de la entrega no puede ser posterior a hoy.",
      });
    }
    const filas = filasEntregaConCantidad(e);
    if (filas.length === 0) {
      problemas.push({
        seccion: "entrega",
        mensaje: `Cargá cuántas ${textos.envasePlural} le entregaste, o sacá la entrega.`,
      });
    }
    for (const f of filas) {
      if (f.costoCentavos === null || f.costoCentavos <= 0) {
        problemas.push({
          seccion: "entrega",
          productoId: f.productoId,
          mensaje: `Completá cuánto le cobrás por cada una en ${nombre(f.productoId)}.`,
        });
      }
      if (f.sugeridoInvalido || (f.sugeridoCentavos !== null && f.sugeridoCentavos <= 0)) {
        problemas.push({
          seccion: "entrega",
          productoId: f.productoId,
          mensaje: `Revisá el precio de venta sugerido de ${nombre(f.productoId)}.`,
        });
      }
    }
  }

  if (input.ventas) {
    const v = input.ventas;
    if (!v.fecha) {
      problemas.push({ seccion: "ventas", mensaje: "Elegí la fecha de las ventas." });
    } else if (v.fecha > estado.hoy) {
      problemas.push({
        seccion: "ventas",
        mensaje: "La fecha de las ventas no puede ser posterior a hoy.",
      });
    }
    const filas = v.filas.filter((f) => f.cantidad > 0);
    if (filas.length === 0) {
      problemas.push({
        seccion: "ventas",
        mensaje: `Cargá cuántas ${textos.envasePlural} vendió, o sacá las ventas.`,
      });
    }
    for (const f of filas) {
      if (!f.sinPrecio && (f.precioVentaCentavos === null || f.precioVentaCentavos <= 0)) {
        problemas.push({
          seccion: "ventas",
          productoId: f.productoId,
          mensaje: `Cargá a cuánto vendió ${nombre(f.productoId)}, o marcá «No sé a cuánto la vendió».`,
        });
      }
    }
    if (v.fecha) {
      const resumen = resumirCarga(estado, { ...input, pago: null });
      const tramosVenta = stockConEntregaNueva(estado, input.entrega);
      const disponible = disponiblePorProducto(tramosVenta);
      const lotesPorProducto = new Map<string, ReturnType<typeof lotesConStockRevendedora>>();
      const avisadoFaltante = new Set<string>();
      for (const r of resumen.ventas) {
        if (r.faltante > 0) {
          // Automático (loteId null) comparte pool entre líneas del mismo
          // producto: un solo aviso alcanza. Con lote elegido, cada lote es
          // un pool aparte (dos líneas del mismo producto pero distinto
          // lote pueden faltar cada una por su lado).
          const clave = `${r.productoId}:${r.loteId ?? "auto"}`;
          if (avisadoFaltante.has(clave)) continue;
          avisadoFaltante.add(clave);
          const total = filas
            .filter((f) => f.productoId === r.productoId && f.loteId === r.loteId)
            .reduce((acc, f) => acc + f.cantidad, 0);
          let disponibleEnPool = disponible[r.productoId] ?? 0;
          if (r.loteId !== null) {
            if (!lotesPorProducto.has(r.productoId)) {
              lotesPorProducto.set(r.productoId, lotesConStockRevendedora(tramosVenta, r.productoId));
            }
            disponibleEnPool =
              lotesPorProducto.get(r.productoId)!.find((l) => l.loteId === r.loteId)?.quedan ?? 0;
          }
          problemas.push({
            seccion: "ventas",
            productoId: r.productoId,
            mensaje: `${nombre(r.productoId)}: ${
              r.loteId !== null ? "en ese lote " : ""
            }va a tener ${disponibleEnPool} y cargaste ${total} vendidas.`,
          });
        } else if (r.entregaPosterior !== null) {
          const esNueva = r.tramos.some(
            (t) => t.entregaId === ENTREGA_NUEVA_ID && t.fecha === r.entregaPosterior,
          );
          problemas.push({
            seccion: "ventas",
            productoId: r.productoId,
            mensaje: `${nombre(r.productoId)}: las ventas son del ${textos.formatFecha(v.fecha)} pero salen de ${
              esNueva ? "la entrega que estás cargando" : "una entrega"
            } del ${textos.formatFecha(r.entregaPosterior)}. Cambiá la fecha de las ventas.`,
          });
        } else if (r.costoCentavos === null) {
          problemas.push({
            seccion: "ventas",
            productoId: r.productoId,
            mensaje: `${nombre(r.productoId)}: esas ${textos.envasePlural} no tienen costo aprobado ni precio manual, no se sabe cuánto le debe a ${textos.negocio}.`,
          });
        }
      }
    }
  }

  if (input.pago) {
    const p = input.pago;
    if (p.montoCentavos === null || p.montoCentavos <= 0) {
      problemas.push({ seccion: "pago", mensaje: "Cargá el monto del pago, o sacá el pago." });
    }
    if (p.medioPago === null) {
      problemas.push({ seccion: "pago", mensaje: "Elegí el medio de pago." });
    } else if (p.medioPago === "efectivo" && p.via !== "encargado") {
      problemas.push({
        seccion: "pago",
        mensaje:
          "Si la plata fue directo a la cuenta no puede ser Efectivo: elegí Mercado Pago o Banco.",
      });
    }
    if (!p.fecha) {
      problemas.push({ seccion: "pago", mensaje: "Elegí la fecha del pago." });
    } else if (p.fecha > estado.hoy) {
      problemas.push({
        seccion: "pago",
        mensaje: "La fecha del pago no puede ser posterior a hoy.",
      });
    }
  }

  return problemas;
}

export interface PedidoCarga {
  p_entrega: Json;
  p_ventas: Json;
  p_pago: Json;
}

/**
 * Parámetros de `registrar_carga_revendedor`. Determinístico: el mismo
 * formulario arma siempre el mismo pedido, así un reintento con la misma
 * clave es idéntico y el RPC devuelve lo ya guardado en vez de duplicar.
 * `permitir_negativo` viaja pero el RPC no lo compara: un reintento después
 * de "Guardar igual" con o sin esa marca es la misma carga.
 */
export function armarPedidoCarga(input: CargaInput): PedidoCarga {
  const entrega = input.entrega
    ? {
        fecha: input.entrega.fecha,
        permitir_negativo: input.entrega.permitirNegativo ?? false,
        items: filasEntregaConCantidad(input.entrega).map((f) => ({
          producto_id: f.productoId,
          lote_id: f.loteId,
          cantidad: f.cantidad,
          costo_ananja_unitario_centavos: f.costoCentavos,
          precio_sugerido_centavos: f.sugeridoCentavos,
        })),
      }
    : null;

  const ventas = input.ventas
    ? {
        fecha: input.ventas.fecha,
        medio_pago: input.ventas.medioPago,
        items: input.ventas.filas
          .filter((f) => f.cantidad > 0)
          .map((f) => ({
            producto_id: f.productoId,
            cantidad: f.cantidad,
            precio_venta_centavos: f.sinPrecio ? null : f.precioVentaCentavos,
            lote_id: f.loteId,
          })),
      }
    : null;

  const pago = input.pago
    ? {
        fecha: input.pago.fecha,
        monto_centavos: input.pago.montoCentavos,
        medio_pago: input.pago.medioPago,
        via: input.pago.via,
        nota: input.pago.nota.trim() || null,
      }
    : null;

  return { p_entrega: entrega, p_ventas: ventas, p_pago: pago };
}

export interface ResultadoCarga {
  clave: string;
  entregaId: string | null;
  grupoIds: string[];
  rendicionId: string | null;
  /** La misma clave ya se había guardado: no se insertó nada nuevo. */
  yaExistia: boolean;
}

/** Respuesta JSON del RPC → forma de la app. */
export function leerResultadoCarga(data: unknown): ResultadoCarga {
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    clave: String(d.clave ?? ""),
    entregaId: typeof d.entrega_id === "string" ? d.entrega_id : null,
    grupoIds: Array.isArray(d.grupo_ids) ? d.grupo_ids.map(String) : [],
    rendicionId: typeof d.rendicion_id === "string" ? d.rendicion_id : null,
    yaExistia: d.ya_existia === true,
  };
}

export interface ErrorCarga {
  seccion: SeccionCarga;
  codigo: string;
  productoId: string | null;
  mensaje: string;
  /** Falta stock en el depósito o en el lote: se puede "Guardar igual". */
  permiteGuardarIgual: boolean;
  /** Botellas disponibles según el detalle del error, si vino. */
  disponible: number | null;
}

const MENSAJES_GENERALES: Record<string, string> = {
  NO_AUTORIZADO: "No tenés permiso para esto.",
  CLAVE_INVALIDA: "Hubo un problema con el formulario. Recargá la página y probá de nuevo.",
  CARGA_VACIA: "Sumá al menos una parte: la entrega, las ventas o el pago.",
  REVENDEDOR_INVALIDO: "Esta persona ya no es revendedora.",
  CARGA_YA_GUARDADA:
    "Esta carga ya se había guardado antes (se cortó la conexión) y después la cambiaste. Volvé a la ficha para ver cómo quedó antes de cargar algo más.",
};

const MENSAJES_SECCION: Record<Exclude<SeccionCarga, "general">, Record<string, string>> = {
  entrega: {
    FECHA_INVALIDA: "Revisá la fecha de la entrega.",
    FECHA_FUTURA: "La fecha de la entrega no puede ser posterior a hoy.",
    SIN_ITEMS: "La entrega no tiene cantidades.",
    COSTO_FALTANTE: "Falta cuánto le cobrás por cada una.",
    COSTO_INVALIDO: "Lo que le cobrás por cada una tiene que ser mayor a cero.",
    PRECIO_SUGERIDO_INVALIDO: "Revisá el precio de venta sugerido: tiene que ser mayor a cero.",
    LOTE_INVALIDO: "El lote elegido no tiene esa presentación. Elegí otro lote.",
    ITEM_DUPLICADO: "Hay una presentación repetida en la entrega.",
    STOCK_INSUFICIENTE: "No hay tantas en el depósito.",
    STOCK_LOTE_INSUFICIENTE: "No quedan tantas en ese lote.",
    REVENDEDOR_INVALIDO: "Esta persona ya no es revendedora.",
    NO_AUTORIZADO: "No tenés permiso para esto.",
  },
  ventas: {
    FECHA_INVALIDA: "Revisá la fecha de las ventas.",
    FECHA_FUTURA: "La fecha de las ventas no puede ser posterior a hoy.",
    FECHA_ANTERIOR_A_ENTREGA:
      "La fecha de las ventas es anterior a la entrega de donde salen. Cambiá la fecha.",
    SIN_ITEMS: "Las ventas no tienen cantidades.",
    STOCK_REVENDEDOR_INSUFICIENTE: "No va a tener tantas para vender.",
    STOCK_INSUFICIENTE_LOTE: "No quedan tantas en ese lote.",
    PRECIO_NO_ASIGNADO:
      "Esas botellas no tienen costo aprobado ni precio manual: no se sabe cuánto le debe a Ananja.",
    PRECIO_INVALIDO: "Revisá el precio de venta.",
    CANTIDAD_INVALIDA: "Revisá las cantidades vendidas.",
    PRODUCTO_INVALIDO: "Hubo un problema con una presentación. Recargá la página.",
    REVENDEDOR_INVALIDO: "Esta persona ya no es revendedora.",
    NO_AUTORIZADO: "No tenés permiso para esto.",
  },
  pago: {
    FECHA_INVALIDA: "Revisá la fecha del pago.",
    FECHA_FUTURA: "La fecha del pago no puede ser posterior a hoy.",
    MONTO_INVALIDO: "Revisá el monto del pago.",
    MEDIO_FALTANTE: "Elegí el medio de pago.",
    VIA_INVALIDA: "Elegí cómo te dio la plata.",
    MEDIO_INVALIDO: "Si la plata fue directo a la cuenta no puede ser Efectivo: elegí Mercado Pago o Banco.",
    REVENDEDOR_INVALIDO: "Esta persona ya no es revendedora.",
    NO_AUTORIZADO: "No tenés permiso para esto.",
  },
};

const TITULO_SECCION: Record<SeccionCarga, string> = {
  general: "",
  entrega: "Entrega",
  ventas: "Ventas",
  pago: "Pago",
};

function parsearJson(texto: string | null | undefined): Record<string, unknown> {
  if (!texto) return {};
  try {
    const valor = JSON.parse(texto);
    return valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Error de `registrar_carga_revendedor` → sección, producto y mensaje en
 * castellano simple. El mensaje llega como `<seccion>:<CODIGO>` (o solo
 * `CODIGO` para los generales) y el detalle trae el del RPC interno.
 * Nada se guardó cuando hay error.
 */
export function traducirErrorCarga(
  message: string | null | undefined,
  details: string | null | undefined,
  textos: Pick<TextosCarga, "nombres" | "formatFecha">,
): ErrorCarga {
  const texto = message ?? "";
  const separador = texto.indexOf(":");
  const posibleSeccion = separador > 0 ? texto.slice(0, separador) : "";
  const seccion: SeccionCarga =
    posibleSeccion === "entrega" || posibleSeccion === "ventas" || posibleSeccion === "pago"
      ? posibleSeccion
      : "general";
  const codigo = seccion === "general" ? texto : texto.slice(separador + 1);

  const detalle = parsearJson(details);
  const interno = parsearJson(typeof detalle.detalle === "string" ? detalle.detalle : null);
  const productoId =
    (typeof interno.producto_id === "string" ? interno.producto_id : null) ??
    (typeof detalle.producto_id === "string" ? detalle.producto_id : null);
  const disponible = typeof interno.disponible === "number" ? interno.disponible : null;

  let mensaje =
    seccion === "general"
      ? MENSAJES_GENERALES[codigo]
      : MENSAJES_SECCION[seccion][codigo];

  if (seccion === "ventas" && codigo === "FECHA_ANTERIOR_A_ENTREGA" && typeof interno.entrega_fecha === "string") {
    mensaje = `Las ventas salen de una entrega del ${textos.formatFecha(interno.entrega_fecha)}, posterior a la fecha de las ventas. Cambiá la fecha.`;
  }
  if (disponible !== null && (codigo.startsWith("STOCK_"))) {
    mensaje = `${mensaje} Quedan ${disponible}.`;
  }

  if (!mensaje) {
    mensaje =
      seccion === "general"
        ? "No se pudo guardar. Revisá la conexión y probá de nuevo: si ya se había guardado, no se duplica."
        : "No se pudo guardar esta parte. No se guardó nada; revisala y probá de nuevo.";
  }

  const nombre = productoId ? textos.nombres[productoId] : undefined;
  const prefijo = seccion === "general" ? "" : `${TITULO_SECCION[seccion]}${nombre ? ` · ${nombre}` : ""}: `;

  return {
    seccion,
    codigo,
    productoId,
    mensaje: `${prefijo}${mensaje}`,
    permiteGuardarIgual:
      seccion === "entrega" && (codigo === "STOCK_INSUFICIENTE" || codigo === "STOCK_LOTE_INSUFICIENTE"),
    disponible,
  };
}
