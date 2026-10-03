/**
 * Aviso de carga repetida (supabase/migrations/0045_ventas_borradas_y_duplicados.sql
 * § 2, RPC `buscar_cargas_parecidas`): antes de guardar una entrega, ventas o
 * un pago de una revendedora ("Entregar", "Cargar todo junto", "Cargar
 * ventas", "Registrar pago"), se busca si ya hay algo muy parecido cargado y
 * se avisa con "Guardar igual" / "Revisar". Es solo un aviso: el servidor no
 * bloquea nada.
 *
 * Funciones puras: armado de la búsqueda desde cada formulario, firma para
 * no volver a preguntar lo mismo después de "Guardar igual", lectura de la
 * respuesta y texto del aviso.
 */

import type { CargaInput } from "@/lib/dominio/carga-revendedor";
import { diasEntre, fechaArgentinaDeTimestamp, formatDiaMes, formatHora } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";
import type { Json } from "@/lib/types";

export interface ItemEntregaParecida {
  productoId: string;
  /** `null` = sin lote. */
  loteId: string | null;
  cantidad: number;
}

export interface ItemVentaParecida {
  productoId: string;
  cantidad: number;
  /** Id de la venta que se está por guardar (reintento idempotente de
   * "Cargar ventas"): no se compara contra sí misma. No cuenta para la firma. */
  grupoId?: string;
}

/** Lo que se está por guardar, solo con lo que decide si es "parecido". */
export interface BusquedaParecidas {
  entrega: { fecha: string; items: ItemEntregaParecida[] } | null;
  ventas: { fecha: string; items: ItemVentaParecida[] } | null;
  pago: { fecha: string; montoCentavos: number } | null;
}

export type SeccionParecida = "entrega" | "venta" | "pago";

/** Una carga ya guardada que se parece a lo que se está por guardar. */
export interface CargaParecida {
  seccion: SeccionParecida;
  id: string;
  productoNombre: string | null;
  cantidad: number | null;
  montoCentavos: number | null;
  /** Fecha de la entrega/venta/pago ("yyyy-mm-dd"). */
  fecha: string;
  /** Cuándo se cargó (timestamp). */
  createdAt: string;
}

const VACIA: BusquedaParecidas = { entrega: null, ventas: null, pago: null };

/** "Entregar": los ítems que van a `registrar_entrega_revendedor`. */
export function busquedaDeEntrega(fecha: string, items: ItemEntregaParecida[]): BusquedaParecidas {
  return { ...VACIA, entrega: { fecha, items } };
}

/** "Cargar ventas": una venta por presentación. */
export function busquedaDeVentas(fecha: string, items: ItemVentaParecida[]): BusquedaParecidas {
  return { ...VACIA, ventas: { fecha, items } };
}

/** "Registrar pago". */
export function busquedaDePago(fecha: string, montoCentavos: number): BusquedaParecidas {
  return { ...VACIA, pago: { fecha, montoCentavos } };
}

/** "Cargar todo junto": las mismas filas que arma `armarPedidoCarga`. */
export function busquedaDeCarga(input: CargaInput): BusquedaParecidas {
  return {
    entrega: input.entrega
      ? {
          fecha: input.entrega.fecha,
          items: input.entrega.filas
            .filter((f) => f.cantidad > 0)
            .map((f) => ({ productoId: f.productoId, loteId: f.loteId, cantidad: f.cantidad })),
        }
      : null,
    ventas: input.ventas
      ? {
          fecha: input.ventas.fecha,
          items: input.ventas.filas
            .filter((f) => f.cantidad > 0)
            .map((f) => ({ productoId: f.productoId, cantidad: f.cantidad })),
        }
      : null,
    pago:
      input.pago && input.pago.montoCentavos !== null
        ? { fecha: input.pago.fecha, montoCentavos: input.pago.montoCentavos }
        : null,
  };
}

function hayAlgoParaBuscar(b: BusquedaParecidas): boolean {
  return (b.entrega?.items.length ?? 0) > 0 || (b.ventas?.items.length ?? 0) > 0 || b.pago !== null;
}

/**
 * Identifica una búsqueda por lo único que decide si hay algo parecido
 * (fechas, productos, lotes, cantidades, monto), sin importar el orden de
 * las filas. Cambiar una nota o un precio no cambia la firma: el aviso
 * sería exactamente el mismo.
 */
export function firmaBusqueda(b: BusquedaParecidas): string {
  const entrega = b.entrega
    ? {
        fecha: b.entrega.fecha,
        items: b.entrega.items
          .map((i) => `${i.productoId}|${i.loteId ?? ""}|${i.cantidad}`)
          .sort(),
      }
    : null;
  const ventas = b.ventas
    ? {
        fecha: b.ventas.fecha,
        items: b.ventas.items.map((i) => `${i.productoId}|${i.cantidad}`).sort(),
      }
    : null;
  const pago = b.pago ? { fecha: b.pago.fecha, monto: b.pago.montoCentavos } : null;
  return JSON.stringify({ entrega, ventas, pago });
}

/**
 * ¿Hay que preguntarle al servidor antes de guardar? No, si no hay nada para
 * comparar o si ya se eligió "Guardar igual" para exactamente esto. Si se
 * editó el formulario (otra firma), se vuelve a buscar.
 */
export function hayQueBuscarParecidas(b: BusquedaParecidas, firmaAceptada: string | null): boolean {
  if (!hayAlgoParaBuscar(b)) return false;
  return firmaBusqueda(b) !== firmaAceptada;
}

export interface ParametrosBusquedaParecidas {
  p_vendedor_id: string;
  p_entrega: Json;
  p_ventas: Json;
  p_pago: Json;
  p_clave?: string;
}

/** Parámetros de `buscar_cargas_parecidas`. */
export function parametrosBusquedaParecidas(
  vendedorId: string,
  b: BusquedaParecidas,
  clave?: string,
): ParametrosBusquedaParecidas {
  return {
    p_vendedor_id: vendedorId,
    p_entrega: b.entrega
      ? {
          fecha: b.entrega.fecha,
          items: b.entrega.items.map((i) => ({
            producto_id: i.productoId,
            lote_id: i.loteId,
            cantidad: i.cantidad,
          })),
        }
      : null,
    p_ventas: b.ventas
      ? {
          fecha: b.ventas.fecha,
          items: b.ventas.items.map((i) => ({
            producto_id: i.productoId,
            cantidad: i.cantidad,
            grupo_id: i.grupoId ?? null,
          })),
        }
      : null,
    p_pago: b.pago ? { fecha: b.pago.fecha, monto_centavos: b.pago.montoCentavos } : null,
    ...(clave ? { p_clave: clave } : {}),
  };
}

function numeroONull(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

/** Respuesta JSON del RPC → forma de la app. Descarta filas mal formadas. */
export function leerCargasParecidas(data: unknown): CargaParecida[] {
  if (!Array.isArray(data)) return [];
  const resultado: CargaParecida[] = [];
  for (const fila of data) {
    if (!fila || typeof fila !== "object") continue;
    const d = fila as Record<string, unknown>;
    if (d.seccion !== "entrega" && d.seccion !== "venta" && d.seccion !== "pago") continue;
    if (typeof d.id !== "string" || typeof d.fecha !== "string" || typeof d.created_at !== "string") {
      continue;
    }
    resultado.push({
      seccion: d.seccion,
      id: d.id,
      productoNombre: typeof d.producto_nombre === "string" ? d.producto_nombre : null,
      cantidad: numeroONull(d.cantidad),
      montoCentavos: numeroONull(d.monto_centavos),
      fecha: d.fecha,
      createdAt: d.created_at,
    });
  }
  return resultado;
}

/** Cuándo se cargó, en horario de Argentina: "hoy a las 14:46", "ayer a las
 * 09:05", "el 27/08 a las 14:46". */
export function cuandoSeCargo(createdAt: string, hoy: string): string {
  const dia = fechaArgentinaDeTimestamp(createdAt);
  const hora = formatHora(createdAt);
  const dias = diasEntre(dia, hoy);
  if (dias === 0) return `hoy a las ${hora}`;
  if (dias === 1) return `ayer a las ${hora}`;
  return `el ${formatDiaMes(dia)} a las ${hora}`;
}

function queEs(c: CargaParecida): string {
  const producto = c.productoNombre ?? "un producto";
  if (c.seccion === "pago") return `un pago de ${formatCentavos(c.montoCentavos ?? 0)}`;
  const tipo = c.seccion === "entrega" ? "una entrega" : "una venta";
  return `${tipo} de ${c.cantidad ?? "?"} × ${producto}`;
}

function lineaParecida(c: CargaParecida, hoy: string): string {
  return `${queEs(c)} con fecha ${formatDiaMes(c.fecha)} (${cuandoSeCargo(c.createdAt, hoy)})`;
}

export interface AvisoParecidas {
  /** El aviso completo si hay una sola coincidencia; si hay varias, el
   * encabezado y la pregunta (el detalle va en `detalle`). */
  resumen: string;
  detalle: string[];
}

/**
 * Texto del aviso. Una coincidencia: "Ojo: ya hay cargada una entrega de 13
 * × Botella 500 ml con fecha 27/08 (hoy a las 14:46). ¿No la estás cargando
 * dos veces?". Varias: un encabezado y una línea por cada una.
 */
export function textoCargasParecidas(lista: CargaParecida[], hoy: string): AvisoParecidas {
  if (lista.length === 1) {
    const c = lista[0];
    const esPago = c.seccion === "pago";
    return {
      resumen: `Ojo: ya hay ${esPago ? "cargado" : "cargada"} ${lineaParecida(c, hoy)}. ¿No ${
        esPago ? "lo" : "la"
      } estás cargando dos veces?`,
      detalle: [],
    };
  }
  return {
    resumen: "Ojo: ya hay cargado algo muy parecido. ¿No lo estás cargando dos veces?",
    detalle: lista.map((c) => {
      const linea = lineaParecida(c, hoy);
      return linea.charAt(0).toUpperCase() + linea.slice(1);
    }),
  };
}
