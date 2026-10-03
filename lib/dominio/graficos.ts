/**
 * Cálculo puro para el gráfico de líneas y el resumen de botellas vendidas
 * de `/ganancia` (originalmente "Gráficos de ventas" en `/ganancia/graficos`,
 * fundida ahí el 2026-09-16). Mismo rol que
 * `calcularGananciaPorPeriodo`/`calcularTareas`: funciones sin acceso a
 * Supabase, sobre filas ya traídas de las tablas, para poder testear con
 * fixtures puras y rápidas. Fechas siempre como string "YYYY-MM-DD"
 * recortado con `.slice()` — nunca `new Date()` para agrupar o filtrar.
 */

import { sumarPorPeriodo } from "@/lib/dominio/calculos";

export interface VentaConFecha {
  fecha: string; // "YYYY-MM-DD"
  monto_centavos: number;
}

/**
 * Agrupa ventas por año y mes: `{ [anio]: number[12] }`, índice 0 = enero.
 * Un mes sin ninguna venta queda en 0, no se omite — mismo criterio que
 * `calcularGananciaPorPeriodo`: un período sin datos se completa con 0 para
 * que el gráfico y la tabla tengan siempre los 12 puntos. La suma por mes
 * ("YYYY-MM", largoPeriodo 7) usa el mismo helper que
 * `calcularGananciaPorPeriodo` — acá solo se reacomoda en la forma
 * `{ [anio]: number[12] }` que espera el gráfico.
 */
export function ventasPorAnioMes(ventas: VentaConFecha[]): Record<number, number[]> {
  const porPeriodo = sumarPorPeriodo(ventas, 7);
  const porAnio: Record<number, number[]> = {};

  for (const [periodo, montoCentavos] of porPeriodo) {
    const anio = Number(periodo.slice(0, 4));
    const mes = Number(periodo.slice(5, 7)) - 1; // 0-11
    if (!porAnio[anio]) porAnio[anio] = new Array(12).fill(0);
    porAnio[anio][mes] += montoCentavos;
  }

  return porAnio;
}

/** Años con al menos un dato, orden descendente (más reciente primero) —
 * para armar `series` del gráfico de líneas en el orden que espera. */
export function aniosDisponibles(porAnioMes: Record<number, number[]>): number[] {
  return Object.keys(porAnioMes)
    .map(Number)
    .sort((a, b) => b - a);
}

/**
 * Selección inicial de años a mostrar activos: los `max` más recientes
 * (default 3, decisión 1 de la spec) de `anios` — que ya tiene que venir
 * ordenado desc (como lo devuelve `aniosDisponibles`). Si hay menos años
 * que `max` (negocio nuevo, un solo año de datos), devuelve todos los que
 * haya — no rellena con años vacíos.
 */
export function seleccionInicial(anios: number[], max = 3): number[] {
  return anios.slice(0, max);
}

/**
 * Redondea `valor` (positivo) al siguiente "número lindo" de la familia
 * 1/2/5 × 10^n — el paso de grilla clásico de cualquier librería de gráficos
 * (algoritmo de Heckbert). Ej.: 1.6 → 2, 3 → 5, 420 → 500, 4200 → 5000.
 * Interno de `ticksEjeY`, no exportado: no tiene sentido fuera de ese
 * contexto (asume `valor > 0`).
 */
function pasoLindo(valor: number): number {
  const exponente = Math.floor(Math.log10(valor));
  const fraccion = valor / 10 ** exponente;
  const fraccionLinda = fraccion <= 1 ? 1 : fraccion <= 2 ? 2 : fraccion <= 5 ? 5 : 10;
  return fraccionLinda * 10 ** exponente;
}

/**
 * Ticks "lindos" para el eje Y del gráfico de líneas (`GraficoLineas`,
 * decisión de UX del 2026-09-11: el gráfico no explicaba nada sin números
 * ni eje). Siempre arranca en 0 y el último tick es mayor o igual a
 * `maxCentavos`, así ninguna línea queda por encima de la grilla. El
 * redondeo ocurre en la escala de **pesos** (`maxCentavos / 100`), no de
 * centavos — un paso de grilla en centavos sueltos ("$ 0,03") no tendría
 * sentido para este negocio.
 *
 * `intervalos` es una meta, no una garantía: el algoritmo de "número
 * lindo" puede necesitar uno más o uno menos para que el último tick
 * alcance a `maxCentavos` (en la práctica da 3 a 5 ticks totales, que es
 * el rango que pide la spec — "3–4 gridlines").
 *
 * `maxCentavos <= 0` (sin ventas) devuelve `[0]`: no hay escala que
 * "inventar" sin datos.
 */
export function ticksEjeY(maxCentavos: number, intervalos = 3): number[] {
  if (maxCentavos <= 0) return [0];

  const maxPesos = maxCentavos / 100;
  const paso = pasoLindo(maxPesos / intervalos);
  const cantidadTicks = Math.ceil(maxPesos / paso);

  return Array.from({ length: cantidadTicks + 1 }, (_, i) => Math.round(i * paso * 100));
}

/**
 * Formatea centavos como un monto compacto en pesos argentinos, para el
 * eje Y y las etiquetas de punto de `GraficoLineas` (donde `formatCentavos`
 * completo — "$ 1.234.567,00" — no entra ni hace falta esa precisión):
 * "$ 0", "$ 350" (menos de mil), "$ 500 mil", "$ 1 M", "$ 1,5 M". Un
 * decimal como máximo, y solo si no es entero ("$ 1 M", no "$ 1,0 M").
 */
export function formatCentavosCompacto(centavos: number): string {
  const pesos = centavos / 100;
  const abs = Math.abs(pesos);
  const signo = pesos < 0 ? "-" : "";

  if (abs === 0) return "$ 0";
  if (abs >= 1_000_000) return `${signo}$ ${conUnDecimal(abs / 1_000_000)} M`;
  if (abs >= 1_000) return `${signo}$ ${conUnDecimal(abs / 1_000)} mil`;
  return `${signo}$ ${Math.round(abs).toLocaleString("es-AR")}`;
}

/** "1" (no "1,0") o "3,4" — coma como separador decimal (es-AR), un solo
 * decimal, omitido cuando el redondeo da un entero. Interno de
 * `formatCentavosCompacto`. */
function conUnDecimal(valor: number): string {
  const redondeado = Math.round(valor * 10) / 10;
  return Number.isInteger(redondeado) ? String(redondeado) : redondeado.toFixed(1).replace(".", ",");
}

export type PeriodoTorta = "este_mes" | "este_anio" | "anio_anterior" | "ultimos_12_meses" | "todo";

/**
 * Rango `[desde, hasta]` (inclusive, strings "YYYY-MM-DD") para cada opción
 * de período del gráfico de torta (y, desde el rediseño de `/ganancia`
 * 2026-09-16, del resumen "Botellas vendidas" de esa pantalla — mismos
 * períodos "Este mes"/"Este año" de los chips de arriba), relativo a `hoy`
 * ("YYYY-MM-DD", parámetro explícito — nunca `new Date()` adentro, para que
 * la función sea pura y testeable con una fecha fija). `"todo"` no tiene
 * cota: `{ desde: null, hasta: null }`.
 */
export function rangoPeriodo(
  periodo: PeriodoTorta,
  hoy: string,
): { desde: string | null; hasta: string | null } {
  const anio = Number(hoy.slice(0, 4));

  if (periodo === "este_mes") {
    return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };
  }

  if (periodo === "este_anio") {
    return { desde: `${anio}-01-01`, hasta: hoy };
  }

  if (periodo === "anio_anterior") {
    return { desde: `${anio - 1}-01-01`, hasta: `${anio - 1}-12-31` };
  }

  if (periodo === "ultimos_12_meses") {
    // Primer día del mes que quedó 11 meses atrás del mes de `hoy` — así la
    // ventana cubre el mes actual (parcial) + los 11 anteriores completos.
    // Aritmética entera sobre "total de meses desde el año 0" (año*12 + mes
    // en base 0-11), sin Date — evita cualquier problema de huso horario.
    const mesHoy = Number(hoy.slice(5, 7)) - 1; // 0-11
    const totalMeses = anio * 12 + mesHoy - 11;
    const anioDesde = Math.floor(totalMeses / 12);
    const mesDesde = totalMeses - anioDesde * 12; // 0-11
    return {
      desde: `${anioDesde}-${String(mesDesde + 1).padStart(2, "0")}-01`,
      hasta: hoy,
    };
  }

  // "todo"
  return { desde: null, hasta: null };
}

export interface ItemVendido {
  fecha: string; // "YYYY-MM-DD"
  producto_id: string;
  cantidad: number;
}

export interface UnidadesPorProducto {
  producto_id: string;
  unidades: number;
  /** Fracción 0-1 del total del período (no 0-100: el formateo a "%" es
   * responsabilidad de la UI, mismo criterio que los centavos crudos en
   * `lib/calculos.ts`). */
  porcentaje: number;
}

/**
 * Unidades vendidas por `producto_id` dentro de `[desde, hasta]` (inclusive;
 * `null` en cualquiera de los dos = sin cota de ese lado — usar el
 * resultado de `rangoPeriodo`), con el porcentaje que representa cada
 * producto sobre el total del período. Orden descendente por unidades.
 *
 * Agrupa por `producto_id`, no por presentación — esta función no conoce
 * `productos` ni `presentacion_ml`; combinar los `producto_id` que
 * comparten presentación en una sola porción es {@link resumenBotellasPorPresentacion},
 * más abajo.
 */
export function unidadesPorProducto(
  items: ItemVendido[],
  desde: string | null,
  hasta: string | null,
): UnidadesPorProducto[] {
  const enRango = items.filter(
    (i) => (desde === null || i.fecha >= desde) && (hasta === null || i.fecha <= hasta),
  );

  const porProducto = new Map<string, number>();
  for (const i of enRango) {
    porProducto.set(i.producto_id, (porProducto.get(i.producto_id) ?? 0) + i.cantidad);
  }

  const total = Array.from(porProducto.values()).reduce((acc, n) => acc + n, 0);

  return Array.from(porProducto.entries())
    .map(([producto_id, unidades]) => ({
      producto_id,
      unidades,
      porcentaje: total === 0 ? 0 : unidades / total,
    }))
    .sort((a, b) => b.unidades - a.unidades);
}

export interface ParteBotellas {
  presentacionMl: number;
  unidades: number;
  /** Porcentaje ENTERO (0-100, ya redondeado — a diferencia de la
   * `porcentaje` fracción 0-1 de {@link UnidadesPorProducto}) sobre el
   * total del período. */
  porcentajePct: number;
}

export interface ResumenBotellas {
  total: number;
  /** Orden descendente por unidades. */
  partes: ParteBotellas[];
}

/**
 * Combina las filas de {@link unidadesPorProducto} (agrupadas por
 * `producto_id`) en porciones por PRESENTACIÓN — dos productos pueden
 * compartir presentación — con el porcentaje entero de cada una sobre el
 * total, para el resumen "Botellas vendidas" de `/ganancia`
 * (`components/ganancia/botellas-vendidas.tsx`). Un `producto_id` sin
 * presentación resuelta en `presentacionPorProducto` se omite, no rompe el
 * resumen.
 */
export function resumenBotellasPorPresentacion(
  porProducto: UnidadesPorProducto[],
  presentacionPorProducto: Map<string, number>,
): ResumenBotellas {
  const porPresentacion = new Map<number, number>();
  for (const fila of porProducto) {
    const presentacion = presentacionPorProducto.get(fila.producto_id);
    if (presentacion === undefined) continue;
    porPresentacion.set(presentacion, (porPresentacion.get(presentacion) ?? 0) + fila.unidades);
  }

  const total = Array.from(porPresentacion.values()).reduce((acc, n) => acc + n, 0);
  const partes = Array.from(porPresentacion.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([presentacionMl, unidades]) => ({
      presentacionMl,
      unidades,
      porcentajePct: total === 0 ? 0 : Math.round((unidades / total) * 100),
    }));

  return { total, partes };
}
