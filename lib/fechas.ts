/**
 * Helpers de fecha compartidos — antes duplicados en varias páginas y
 * formularios (`formatFecha`, `NOMBRES_MES`, `labelDeMes`/`labelDePeriodo`,
 * `todayISO`, `formatFechaCorta`, `formatFechaHora`, `NOMBRES_MES_MAYUS`).
 * El formato de `formatFecha` es el que ya usaba `/gastos` (dd/mm/aaaa, año
 * completo).
 */

/**
 * Zona horaria del negocio (Aimogasta, La Rioja, Argentina) — UTC−3 todo el
 * año, sin horario de verano. Vercel y Postgres corren en UTC, así que
 * cualquier "hoy"/"esta hora" calculado en un Server Component con
 * `new Date()` + `getFullYear`/`getMonth`/`getDate`/`getHours`/
 * `toISOString()` da la fecha/hora de UTC, no la de Argentina —
 * `toISOString()` en particular es siempre UTC por especificación del
 * lenguaje, no hay variable de entorno que lo cambie. Los helpers de acá
 * abajo (`hoyEnArgentina`, `partesFechaHoraArgentina`) usan `Intl` con este
 * `timeZone` explícito para dar el resultado correcto sin importar en qué
 * huso corra el proceso.
 */
const TIMEZONE_ARGENTINA = "America/Argentina/Buenos_Aires";

export const NOMBRES_MES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

/** `NOMBRES_MES` en mayúsculas (antes duplicado como `MESES` en /gastos). */
export const NOMBRES_MES_MAYUS = NOMBRES_MES.map((nombre) => nombre.toUpperCase());

/** `NOMBRES_MES` abreviado a 3 letras minúsculas ("ene", "feb", …, "dic") —
 * eje X de `GraficoLineas` (`components/graficos/grafico-lineas.tsx`). */
export const NOMBRES_MES_ABREV = NOMBRES_MES.map((nombre) => nombre.slice(0, 3).toLowerCase());

/** "2026-09-05" -> "05/09/2026". */
export function formatFecha(fechaISO: string): string {
  const [y, m, d] = fechaISO.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * "2026-09-05" -> "05/09/26". Antes se calculaba en cada página con
 * `new Date(\`${iso}T00:00:00\`).toLocaleDateString("es-AR", {...})`
 * (dependiente del locale/TZ del entorno que ejecuta el render). Como la
 * fecha de entrada no lleva hora, el resultado es el mismo parseando el
 * string directamente — ahora es determinista, sin pasar por `Date`/`Intl`.
 */
export function formatFechaCorta(fechaISO: string): string {
  const [y, m, d] = fechaISO.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

/**
 * "2026-09-05T14:07:00Z" -> "05/09/26, 11:07 a. m." (hora de Argentina,
 * explícita vía `timeZone`, sin importar el huso del entorno que ejecuta el
 * render — red de seguridad si esto se llegara a llamar desde un Server
 * Component). Formato que ya usaban `/plata/cuenta/[medio]` y `/stock/movimientos`.
 * A diferencia de `formatFechaCorta`, acá sí importa la hora real del
 * timestamp, así que se mantiene el paso por `Date`/`Intl` (no se puede
 * volver determinista sin cambiar el comportamiento: la conversión de hora
 * es intencional).
 */
export function formatFechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    timeZone: TIMEZONE_ARGENTINA,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * "2026-09-05T14:07:00Z" -> "11:07" (24hs, sin AM/PM). Antes duplicada en
 * varias pantallas sin `timeZone` — dependían del huso del entorno que
 * ejecuta el render, así que en Vercel (UTC) mostraban la hora adelantada
 * 3 horas respecto a Argentina.
 */
export function formatHora(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: TIMEZONE_ARGENTINA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/**
 * "2026-09-05T14:07:00Z" -> "5/9, 11:07 a. m." (sin año; día y mes sin
 * cero a la izquierda). Formato que ya usaban `/stock` y
 * `/stock/insumos/[id]` para el historial de movimientos — es un quirk de
 * `Intl.DateTimeFormat` al omitir `year` (deja de rellenar día/mes con
 * cero), no un formato elegido a propósito, pero se replica igual para no
 * cambiar el copy visible. `timeZone` explícito por el mismo motivo que
 * `formatFechaHora`.
 */
export function formatFechaHoraSinAnio(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    timeZone: TIMEZONE_ARGENTINA,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "2026-09" -> "Septiembre 2026". */
export function labelDeMes(periodo: string): string {
  const [anio, mes] = periodo.split("-").map(Number);
  return `${NOMBRES_MES[mes - 1]} ${anio}`;
}

/** Como {@link labelDeMes}, pero también acepta un período de AÑO ("2026",
 * 4 caracteres) y lo devuelve tal cual — usado donde un mismo período puede
 * venir como "YYYY-MM" o "YYYY" según el chip elegido (ej. el bloque oliva
 * de `/ganancia`, `lib/margen.ts`). */
export function labelDePeriodo(periodo: string): string {
  return periodo.length === 4 ? periodo : labelDeMes(periodo);
}

/**
 * "2026-09-05" -> "5/9" (sin ceros a la izquierda, sin año) — usado en
 * `components/lotes/selector-lote.tsx` ("Lote del 5/9"). A diferencia de
 * `formatFechaHoraSinAnio`, `fechaISO` es una fecha pura (sin hora): pasarla
 * por `Date`/`Intl` correría riesgo de corrimiento de huso horario (mismo
 * motivo por el que `formatFecha`/`formatFechaCorta` parsean el string a
 * mano en vez de usar `Date`).
 */
export function formatFechaSinAnio(fechaISO: string): string {
  const [, m, d] = fechaISO.split("-");
  return `${Number(d)}/${Number(m)}`;
}

/** "2026-10-01" -> "1 oct" (día sin cero, mes abreviado, sin año) — fecha pura, sin `Date`. */
export function formatDiaMesAbrev(fechaISO: string): string {
  const [, m, d] = fechaISO.split("-");
  return `${Number(d)} ${NOMBRES_MES_ABREV[Number(m) - 1] ?? m}`;
}

/**
 * Rótulo del grupo de un listado agrupado por período ("Hoy" / "Septiembre"
 * / "Diciembre 2025"): hoy es un grupo aparte, el resto se agrupa por mes
 * (con el año si no es el actual). `fecha` y `hoy` son "yyyy-mm-dd".
 */
export function rotuloGrupoFecha(fecha: string, hoy: string): string {
  if (fecha === hoy) return "Hoy";
  const [year, month] = fecha.split("-");
  const nombreMes = NOMBRES_MES[Number(month) - 1] ?? month;
  return year === hoy.slice(0, 4) ? nombreMes : `${nombreMes} ${year}`;
}

/** "2026-08-27" -> "27/08" (con ceros, sin año) — fecha pura, sin `Date`. */
export function formatDiaMes(fechaISO: string): string {
  const [, m, d] = fechaISO.split("-");
  return `${d}/${m}`;
}

/** "2026-09-15T18:20:00Z" -> "15/09 15:20" (día y hora de Argentina). */
export function formatDiaMesHora(iso: string): string {
  return `${formatDiaMes(fechaArgentinaDeTimestamp(iso))} ${formatHora(iso)}`;
}

/**
 * Fecha de hoy en Argentina (`TIMEZONE_ARGENTINA`), como "yyyy-mm-dd" — el
 * locale "en-CA" da directamente ese formato con `Intl.DateTimeFormat`. A
 * diferencia de construir el string a mano con `getFullYear`/`getMonth`/
 * `getDate` (correcto solo si el proceso corre en horario de Argentina, lo
 * que vale para el navegador de Fran pero no para un Server Component en
 * Vercel/UTC), esto da la fecha argentina sin importar dónde corra.
 */
export function hoyEnArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE_ARGENTINA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Año, mes (0-11, como `Date#getMonth`) y hora (0-23) de una fecha/hora en
 * Argentina, sin depender del huso del runtime — para reemplazar
 * `ahora.getFullYear()`/`getMonth()`/`getHours()` en Server Components
 * (Vercel corre en UTC). `hour12: false` puede devolver "24" para la
 * medianoche en algunas versiones de ICU; el `% 24` lo normaliza a 0.
 */
export function partesFechaHoraArgentina(fecha: Date = new Date()): {
  anio: number;
  mes: number;
  hora: number;
} {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE_ARGENTINA,
    year: "numeric",
    month: "numeric",
    hour: "numeric",
    hour12: false,
  }).formatToParts(fecha);
  const valor = (tipo: "year" | "month" | "hour") =>
    Number(partes.find((p) => p.type === tipo)?.value);
  return {
    anio: valor("year"),
    mes: valor("month") - 1,
    hora: valor("hour") % 24,
  };
}

/** Fecha de hoy en horario de Argentina, como "yyyy-mm-dd" — ver
 * `hoyEnArgentina`. Antes calculaba con `getFullYear`/`getMonth`/`getDate`
 * del runtime, correcto solo en el navegador (en un Server Component sobre
 * Vercel/UTC daba la fecha de UTC, no la de Argentina). */
export function hoyISO(): string {
  return hoyEnArgentina();
}

/**
 * Comparador para listar movimientos (historial de Plata: `/plata`,
 * `/plata/cuenta/[medio]`) por `fecha` descendente (más reciente arriba),
 * usando `createdAt` como desempate cuando dos movimientos comparten
 * `fecha` — mismo criterio, en sentido opuesto, que
 * `compararPorFechaYDesempate` de `lib/margen.ts` (ahí ascendente, para
 * atribución FIFO por lote).
 *
 * Antes el historial de Caja ordenaba únicamente por `createdAt`
 * (`created_at` de cada tabla), a pesar de que ya mostraba la `fecha`
 * propia de cada movimiento (gastos/comprobantes/deudas/transferencias ya
 * admiten cargarse con una `fecha` distinta a cuándo se registraron, vía
 * `p_fecha` en su RPC de alta) — con eso, un movimiento recién cargado
 * pero fechado en el pasado podía aparecer arriba de uno más reciente.
 * `ajustes_caja` sumó su propia `fecha` en
 * `supabase/migrations/0033_fecha_ajuste_caja.sql`; este comparador ordena
 * el historial unificado por la fecha real del movimiento, no por cuándo
 * se cargó.
 */
export function compararPorFechaDesc(
  a: { fecha: string; createdAt: string },
  b: { fecha: string; createdAt: string },
): number {
  if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
  return b.createdAt.localeCompare(a.createdAt);
}

/** Días completos entre dos fechas "yyyy-mm-dd" — en UTC para no depender
 * del huso del runtime (son fechas puras, sin hora). */
export function diasEntre(desde: string, hasta: string): number {
  const [y1, m1, d1] = desde.split("-").map(Number);
  const [y2, m2, d2] = hasta.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/**
 * Día de Argentina ("yyyy-mm-dd") de un timestamp (`created_at`,
 * `resuelto_en`) — sin depender del huso del runtime.
 */
export function fechaArgentinaDeTimestamp(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE_ARGENTINA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/**
 * Rango [desde, hasta) de un día de Argentina para filtrar columnas
 * `timestamptz` (`created_at >= desde and created_at < hasta`). Argentina
 * es UTC−3 todo el año (sin horario de verano), así que el offset es fijo.
 * Reemplaza filtros como `created_at >= 'yyyy-mm-ddT00:00:00'`, que
 * Postgres interpreta en UTC y corría el día 3 horas.
 */
export function rangoDiaArgentina(fechaISO: string): { desde: string; hasta: string } {
  const [y, m, d] = fechaISO.split("-").map(Number);
  const siguienteISO = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return { desde: `${fechaISO}T00:00:00-03:00`, hasta: `${siguienteISO}T00:00:00-03:00` };
}
