import type { Tables } from "@/lib/types";

export type StockInsumo = Tables<"v_stock_insumos">;
export type Insumo = Tables<"insumos">;
export type MovimientoInsumo = Tables<"movimientos_insumo">;
export type Receta = Tables<"recetas">;

export type TipoInsumo = "materia_prima" | "envase" | "etiqueta";
export type UnidadInsumo = "litro" | "kilo" | "unidad";

/**
 * Orden fijo de agrupación de `/stock/insumos` (spec §
 * /stock/insumos — listado): materia prima primero, después envases,
 * después etiquetas — NO alfabético ("envase" < "etiqueta" <
 * "materia_prima" alfabéticamente no es el orden que pidió Fran, que
 * sigue el flujo real de producción).
 */
export const ORDEN_TIPO_INSUMO: TipoInsumo[] = ["materia_prima", "envase", "etiqueta"];

export const TIPO_INSUMO_LABELS: Record<TipoInsumo, string> = {
  materia_prima: "Materia prima",
  envase: "Envases",
  etiqueta: "Etiquetas",
};

export const UNIDAD_INSUMO_LABELS: Record<UnidadInsumo, string> = {
  litro: "Litro",
  kilo: "Kilo",
  unidad: "Unidad",
};

/**
 * Agrupa las filas de `v_stock_insumos` según `ORDEN_TIPO_INSUMO`,
 * alfabético por nombre dentro de cada grupo — un tipo sin ningún
 * insumo activo no aparece (se filtra, no se muestra un grupo vacío).
 * Usado por `/stock/insumos`.
 */
export function agruparPorTipo(
  filas: StockInsumo[],
): { tipo: TipoInsumo; nombre: string; insumos: StockInsumo[] }[] {
  return ORDEN_TIPO_INSUMO.map((tipo) => ({
    tipo,
    nombre: TIPO_INSUMO_LABELS[tipo],
    insumos: filas
      .filter((f) => f.tipo === tipo)
      .sort((a, b) => (a.nombre ?? "").localeCompare(b.nombre ?? "")),
  })).filter((grupo) => grupo.insumos.length > 0);
}

/**
 * Formatea un número de insumo con hasta 3 decimales, sin ceros de más
 * ("0,5" en vez de "0,500") — las cantidades vienen de columnas
 * `numeric(12,3)` de Postgres, que supabase-js devuelve como `number`.
 */
export function formatNumeroInsumo(cantidad: number): string {
  return cantidad.toLocaleString("es-AR", { maximumFractionDigits: 3 });
}

/**
 * Cantidad + sufijo de unidad para mostrar en pantalla: "0,5 L" (litro),
 * "1 kg" (kilo), "100" (unidad — el nombre del insumo ya dice qué es:
 * "100 · Envase 500" no necesita repetir "unidad").
 */
export function formatCantidadConUnidad(
  cantidad: number,
  unidad: UnidadInsumo | string,
): string {
  const numero = formatNumeroInsumo(cantidad);
  if (unidad === "litro") return `${numero} L`;
  if (unidad === "kilo") return `${numero} kg`;
  return numero;
}

/** "frente"/"retro"/"reverso"/"anverso"/"dorso" al final del nombre — los
 * dos lados de una misma etiqueta (ver `supabase/migrations/0017_insumos.sql`
 * § seed: "Etiqueta chica frente"/"Etiqueta chica retro"). */
const SUFIJO_LADO_ETIQUETA = /\s+(frente|retro|reverso|anverso|dorso)$/i;

/** Nombre "base" de un insumo de etiqueta sin el lado — "Etiqueta chica
 * frente" -> "Etiqueta chica" (build "costos del pedido simple": un solo
 * campo de precio para frente + reverso de la misma presentación, ver
 * `agruparEtiquetasPorLado`). Un nombre sin ese sufijo (una etiqueta de un
 * solo lado) se devuelve tal cual — queda en un grupo de un solo miembro. */
export function nombreBaseEtiqueta(nombre: string): string {
  return nombre.replace(SUFIJO_LADO_ETIQUETA, "").trim();
}

export interface EtiquetaInsumoNombre {
  insumoId: string;
  nombre: string;
}

export interface GrupoEtiquetas {
  /** `nombreBaseEtiqueta` en minúsculas — clave estable para `key` de React
   * y para el id del campo en pantalla. */
  clave: string;
  /** `nombreBaseEtiqueta` tal cual, para el rótulo del campo. */
  nombre: string;
  /** Uno (sin lado) o dos (frente + reverso) `insumoId`. */
  insumoIds: string[];
}

/**
 * Agrupa insumos de etiqueta por `nombreBaseEtiqueta`: frente y reverso de
 * la misma presentación quedan en un solo grupo — `CostosLoteCampos`
 * muestra un campo de precio por grupo en vez de uno por insumo (Fran:
 * "un solo campo para las chicas y uno solo para las grandes"). Conserva
 * el orden de aparición de `etiquetas`.
 */
export function agruparEtiquetasPorLado(etiquetas: EtiquetaInsumoNombre[]): GrupoEtiquetas[] {
  const grupos: GrupoEtiquetas[] = [];
  const porClave = new Map<string, GrupoEtiquetas>();
  for (const etiqueta of etiquetas) {
    const nombreBase = nombreBaseEtiqueta(etiqueta.nombre);
    const clave = nombreBase.toLowerCase();
    let grupo = porClave.get(clave);
    if (!grupo) {
      grupo = { clave, nombre: nombreBase, insumoIds: [] };
      porClave.set(clave, grupo);
      grupos.push(grupo);
    }
    grupo.insumoIds.push(etiqueta.insumoId);
  }
  return grupos;
}

/** Fila cruda del `select` de `obtenerUltimasComprasInsumos`
 * (`lib/data/insumos.ts`) — separada del fetch para que "quedarse con la
 * compra más reciente por insumo" sea testeable sin mockear supabase
 * (`tests/insumos.test.ts`). */
type FilaCompraInsumo = {
  insumo_id: string;
  cantidad: number;
  gastos: { fecha: string; monto_centavos: number } | null;
};

export type UltimaCompraInsumo = {
  /** `gasto.monto_centavos / movimiento.cantidad` de esa compra puntual —
   * no un promedio (a diferencia de `v_tanque_aceite`, que promedia TODAS
   * las compras de un insumo de materia prima). */
  precioUnitarioCentavos: number;
  /** Fecha (YYYY-MM-DD) del gasto de esa compra — para mostrar de dónde
   * salió el precio ("Precio de la última compra — 12/09"). */
  fecha: string;
};

/**
 * De todas las filas de ingreso-con-gasto de uno o más insumos, se queda
 * con la de fecha de gasto MÁS RECIENTE por `insumo_id` — precio =
 * `monto_centavos / cantidad` de esa compra puntual (no un promedio, a
 * diferencia de `v_tanque_aceite`). Una fila sin `gastos` (no debería
 * llegar acá, el `!inner` del query las filtra) o con `cantidad` 0/null se
 * ignora. Función pura, extraída de `obtenerUltimasComprasInsumos`
 * (`lib/data/insumos.ts`) para poder testearla sin supabase.
 */
export function elegirUltimasComprasPorInsumo(
  filas: FilaCompraInsumo[],
): Record<string, UltimaCompraInsumo> {
  const resultado: Record<string, UltimaCompraInsumo> = {};
  for (const fila of filas) {
    if (!fila.gastos || !fila.cantidad) continue;
    const actual = resultado[fila.insumo_id];
    if (actual && actual.fecha >= fila.gastos.fecha) continue;
    resultado[fila.insumo_id] = {
      precioUnitarioCentavos: Math.round(fila.gastos.monto_centavos / fila.cantidad),
      fecha: fila.gastos.fecha,
    };
  }
  return resultado;
}
