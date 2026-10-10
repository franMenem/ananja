/**
 * "La coordinadora vendió N botellas"
 * (`registrar_venta_coordinador`, supabase/migrations/
 * 0073_venta_directa_y_venta_coordinador.sql): reglas de pantalla de la hoja
 * "Vendió ella" / "Vendí yo" y de la sección "Ventas propias" de su ficha.
 * Funciones puras, sin Supabase.
 *
 * Una venta de coordinadora es de UN lote (el servidor lo exige: así el
 * precio de venta es el costo de ESE lote y su margen queda en cero). Las
 * botellas bajan del depósito y a ella le suma N × costo Ananja a lo que
 * tiene que pasar a Ananja; el precio al que las vendió no importa.
 */

import { ERRORES_RPC_COMUNES, traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { leerDetalleError } from "@/lib/dominio/venta-directa";
import { formatFechaSinAnio } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";
import { NEGOCIO, envase } from "@/lib/negocio";

/** Un lote del que se puede vender, con lo que queda en el depósito. */
export interface LoteVentaCoordinador {
  loteId: string;
  /** `lotes_produccion.fecha` ("yyyy-mm-dd"): los lotes se rotulan por fecha. */
  fecha: string;
  quedan: number;
  /** Lo que se le suma por botella — solo lo conoce un admin. */
  costoAnanjaCentavos?: number | null;
}

/**
 * Lotes elegibles: con stock, del más viejo al más nuevo. Si `exigirCosto`
 * (lo ve un admin), se descartan los que todavía no tienen costos cargados:
 * el servidor los rechazaría con `COSTO_FALTANTE`. La coordinadora no ve
 * costos; su lista ya viene sin esos lotes de `lotes_disponibles_coordinador`.
 */
export function lotesParaVentaCoordinador(
  lotes: LoteVentaCoordinador[],
  exigirCosto: boolean,
): LoteVentaCoordinador[] {
  return lotes
    .filter((l) => l.quedan > 0)
    .filter((l) => !exigirCosto || (l.costoAnanjaCentavos != null && l.costoAnanjaCentavos > 0))
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
}

/** Lote preseleccionado: el más viejo con stock (el que se vende primero). */
export function loteInicialVentaCoordinador(lotes: LoteVentaCoordinador[]): LoteVentaCoordinador | null {
  return lotes[0] ?? null;
}

/** Rótulo de un lote: "Lote del 5/9 · quedan 12". */
export function rotuloLoteVenta(lote: LoteVentaCoordinador): string {
  return `Lote del ${formatFechaSinAnio(lote.fecha)} · quedan ${lote.quedan}`;
}

/** Cantidad válida: entera, de 1 hasta lo que queda del lote elegido. */
export function cantidadValidaVentaCoordinador(cantidad: number, lote: LoteVentaCoordinador | null): boolean {
  return lote !== null && Number.isInteger(cantidad) && cantidad >= 1 && cantidad <= lote.quedan;
}

/** Lo que se suma a lo que tiene que pasar a Ananja: N × costo del lote. */
export function montoVentaCoordinador(cantidad: number, costoAnanjaCentavos: number): number {
  return cantidad * costoAnanjaCentavos;
}

/** Aviso previo del admin, antes de guardar: qué va a pasar exactamente. */
export function avisoVentaCoordinadorAdmin(args: {
  cantidad: number;
  coordinadorNombre: string;
  costoAnanjaCentavos: number;
}): string {
  const monto = montoVentaCoordinador(args.cantidad, args.costoAnanjaCentavos);
  return `Salen ${args.cantidad} del depósito y se suman ${formatCentavos(monto)} a lo que ${args.coordinadorNombre} tiene que pasar a ${NEGOCIO.nombre}.`;
}

/** Aviso previo de la propia coordinadora: no ve costos, así que no hay monto
 * (se le muestra recién después de guardar, con lo que responde el servidor). */
export function avisoVentaCoordinadoraPropia(cantidad: number): string {
  return `Salen ${cantidad} del depósito y se suman a lo que tenés que pasar a ${NEGOCIO.nombre}.`;
}

export interface ResultadoVentaCoordinador {
  grupoId: string | null;
  entregaId: string | null;
  rendicionId: string | null;
  /** Lo que se sumó a lo que tiene que pasar a Ananja. */
  montoCentavos: number | null;
}

/** Respuesta JSON de `registrar_venta_coordinador` → forma de la app. */
export function leerResultadoVentaCoordinador(data: unknown): ResultadoVentaCoordinador {
  const d = (data ?? {}) as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    grupoId: texto(d.grupo_id),
    entregaId: texto(d.entrega_id),
    rendicionId: texto(d.rendicion_id),
    montoCentavos: typeof d.monto_centavos === "number" ? d.monto_centavos : null,
  };
}

/** Confirmación de la coordinadora después de guardar (ella no ve costos:
 * el monto sale de la respuesta del servidor). */
export function textoVentaPropiaGuardada(montoCentavos: number | null): string {
  return montoCentavos === null
    ? `Listo, quedó anotado. Se suma a lo que tenés que pasar a ${NEGOCIO.nombre}.`
    : `Listo. Se sumaron ${formatCentavos(montoCentavos)} a lo que tenés que pasar a ${NEGOCIO.nombre}.`;
}

const ERRORES_VENTA_COORDINADOR: Record<string, string> = {
  ...ERRORES_RPC_COMUNES,
  COORDINADOR_INVALIDO: "Esa persona ya no es coordinadora.",
  LOTE_INVALIDO: "Elegí de qué lote sale.",
  COSTO_FALTANTE: `Ese lote todavía no tiene precio cargado. Avisale a ${NEGOCIO.nombre} para que lo cargue.`,
  CANTIDAD_INVALIDA: "Revisá la cantidad.",
  FECHA_INVALIDA: "Revisá la fecha.",
  FECHA_FUTURA: "La fecha no puede ser posterior a hoy.",
};

/** Mensaje para el error de `registrar_venta_coordinador`. */
export function mensajeErrorVentaCoordinador(
  codigo: string | null | undefined,
  detalleCrudo: string | null | undefined,
): string {
  if (codigo === "DEPOSITO_INSUFICIENTE") {
    const d = leerDetalleError(detalleCrudo).disponible;
    const disponible = typeof d === "number" && Number.isFinite(d) ? Math.max(0, Math.floor(d)) : null;
    if (disponible === null) {
      return `En el depósito no hay tantas ${NEGOCIO.envase.plural} de ese lote. Cargá menos.`;
    }
    if (disponible === 0) return `En el depósito no quedan ${NEGOCIO.envase.plural} de ese lote.`;
    return `En ese lote del depósito quedan ${disponible}. Cargá hasta esa cantidad.`;
  }
  return traducirErrorRpc(codigo, ERRORES_VENTA_COORDINADOR, "No se pudo guardar. Probá de nuevo.");
}

/** Errores de `eliminar_venta_revendedor` (los de siempre más
 * `YA_PASO_LA_PLATA`, 0073: la venta de una coordinadora no se puede deshacer
 * si esa plata ya se depositó o está avisada). */
export const ERRORES_ELIMINAR_VENTA: Record<string, string> = {
  VENTA_NO_ENCONTRADA: "No encontramos esta venta.",
  NO_AUTORIZADO: "No tenés permiso para borrar esta venta.",
  YA_PASO_LA_PLATA: `No se puede eliminar: esa plata ya se pasó (o está avisada) a la cuenta de ${NEGOCIO.nombre}.`,
};

// ─── Sección "Ventas propias" de la ficha de la coordinadora (admin) ───

export interface VentaCrudaPropia {
  id: string;
  grupo_id: string;
  fecha: string;
  created_at: string;
  producto_id: string;
  lote_id: string | null;
  cantidad: number;
  /** En una venta de coordinadora, el precio de venta es el costo. */
  precio_costo_centavos: number;
}

export interface VentaPropiaFila {
  /** Id de la primera fila del grupo: lo que recibe `eliminar_venta_revendedor`
   * (borra todo el grupo). */
  ventaId: string;
  grupoId: string;
  fecha: string;
  createdAt: string;
  productoNombre: string;
  cantidad: number;
  loteId: string | null;
  loteFecha: string | null;
  /** Lo que sumó a lo que tiene que pasar a Ananja. */
  montoCentavos: number;
}

/**
 * Ventas propias de una coordinadora: una fila por venta (`grupo_id`), la
 * más nueva primero. Una venta que cruzó dos filas de `ventas_revendedor`
 * (mismo `grupo_id`) se suma en una sola; el monto es Σ cantidad × costo.
 */
export function agruparVentasPropias(
  ventas: VentaCrudaPropia[],
  nombrePorProducto: ReadonlyMap<string, string>,
  fechaPorLote: ReadonlyMap<string, string>,
): VentaPropiaFila[] {
  const porGrupo = new Map<string, VentaPropiaFila>();
  for (const v of ventas) {
    const existente = porGrupo.get(v.grupo_id);
    if (existente) {
      existente.cantidad += v.cantidad;
      existente.montoCentavos += v.cantidad * v.precio_costo_centavos;
      continue;
    }
    porGrupo.set(v.grupo_id, {
      ventaId: v.id,
      grupoId: v.grupo_id,
      fecha: v.fecha,
      createdAt: v.created_at,
      productoNombre: nombrePorProducto.get(v.producto_id) ?? "?",
      cantidad: v.cantidad,
      loteId: v.lote_id,
      loteFecha: v.lote_id ? (fechaPorLote.get(v.lote_id) ?? null) : null,
      montoCentavos: v.cantidad * v.precio_costo_centavos,
    });
  }
  return [...porGrupo.values()].sort((a, b) =>
    a.fecha !== b.fecha
      ? a.fecha < b.fecha
        ? 1
        : -1
      : a.createdAt !== b.createdAt
        ? a.createdAt < b.createdAt
          ? 1
          : -1
        : a.grupoId.localeCompare(b.grupoId),
  );
}

/** "3 × Botella 500 ml · Lote del 5/9" (sin el lote si no se conoce). */
export function descripcionVentaPropia(fila: Pick<VentaPropiaFila, "cantidad" | "productoNombre" | "loteFecha" | "loteId">): string {
  const lote = fila.loteFecha ? ` · Lote del ${formatFechaSinAnio(fila.loteFecha)}` : fila.loteId ? " · Lote" : "";
  return `${fila.cantidad} × ${fila.productoNombre}${lote}`;
}

/** Texto de confirmación para borrar una venta propia de la coordinadora. */
export function textoEliminarVentaCoordinadora(coordinadorNombre?: string): string {
  const quien = coordinadorNombre ?? "la coordinadora";
  return `Las ${envase(2)} vuelven al depósito y se le descuenta a ${quien} de lo que tiene que pasar a ${NEGOCIO.nombre}. No se puede deshacer.`;
}
