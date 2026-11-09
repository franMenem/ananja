import { MEDIO_PAGO_LABELS } from "@/lib/dominio/caja";
import { NOMBRES_MES } from "@/lib/fechas";
import type { Enums } from "@/lib/types";

/** Una venta tal como la cargó la revendedora (filas del mismo `grupo_id` juntas). */
export type VentaAgrupadaMi = {
  /** Primera fila del grupo: el detalle `/mi/ventas/[id]` trae el grupo entero. */
  id: string;
  fecha: string;
  productoNombre: string;
  cantidad: number;
  /** `null` = la venta todavía no tiene precio de venta cargado. */
  totalCentavos: number | null;
  medioPago: Enums<"medio_pago"> | null;
};

export type MesVentasMi = { periodo: string; ventas: VentaAgrupadaMi[] };

export type PeriodoVentasMi = "hoy" | "mes" | "todo" | "dia";
export type MedioFiltroMi = "todos" | Enums<"medio_pago"> | "sin_cargar";

export type FiltroVentasMi = {
  periodo: PeriodoVentasMi;
  medio: MedioFiltroMi;
  /** Día elegido ("YYYY-MM-DD"); solo cuenta cuando `periodo` es "dia". */
  dia?: string | null;
  /** Hoy en Argentina, "YYYY-MM-DD" (lo calcula el servidor). */
  hoy: string;
};

function coincide(v: VentaAgrupadaMi, { periodo, medio, hoy, dia }: FiltroVentasMi): boolean {
  if (periodo === "dia" && v.fecha !== dia) return false;
  if (periodo === "hoy" && v.fecha !== hoy) return false;
  if (periodo === "mes" && v.fecha.slice(0, 7) !== hoy.slice(0, 7)) return false;
  if (medio === "sin_cargar") return v.medioPago === null;
  if (medio !== "todos") return v.medioPago === medio;
  return true;
}

/** Filtra las ventas de cada mes y descarta los meses que quedan vacíos. No muta la entrada. */
export function filtrarVentasMi(meses: MesVentasMi[], filtro: FiltroVentasMi): MesVentasMi[] {
  return meses
    .map((m) => ({ periodo: m.periodo, ventas: m.ventas.filter((v) => coincide(v, filtro)) }))
    .filter((m) => m.ventas.length > 0);
}

/** ¿Hay alguna venta sin medio de pago cargado (para mostrar el chip "Sin cargar")? */
export function hayVentasSinMedio(meses: MesVentasMi[]): boolean {
  return meses.some((m) => m.ventas.some((v) => v.medioPago === null));
}

/** "2026-11-09" -> "9 de noviembre" (fecha pura, sin `Date`). */
export function formatDiaDeMes(fechaISO: string): string {
  const [, m, d] = fechaISO.split("-");
  const mes = (NOMBRES_MES[Number(m) - 1] ?? m).toLowerCase();
  return `${Number(d)} de ${mes}`;
}

function cuandoTexto(periodo: PeriodoVentasMi, dia?: string | null): string {
  if (periodo === "hoy") return " hoy";
  if (periodo === "mes") return " este mes";
  if (periodo === "dia" && dia) return ` el ${formatDiaDeMes(dia)}`;
  return "";
}

/** Texto del estado vacío según el filtro activo. */
export function mensajeSinVentas(periodo: PeriodoVentasMi, medio: MedioFiltroMi, dia?: string | null): string {
  if (periodo === "todo" && medio === "todos") return "Todavía no cargaste ventas.";
  const cuando = cuandoTexto(periodo, dia);
  if (medio === "sin_cargar") return `No hay ventas sin medio de pago cargado${cuando}.`;
  if (medio === "todos") return `No hay ventas${cuando}.`;
  return `No hay ventas en ${medio === "efectivo" ? "efectivo" : MEDIO_PAGO_LABELS[medio]}${cuando}.`;
}

/** Resumen del filtro activo para el renglón de arriba ("Todo el tiempo · Todos los medios"). */
export function resumenFiltroMi(periodo: PeriodoVentasMi, medio: MedioFiltroMi, dia?: string | null): string {
  const p =
    periodo === "hoy"
      ? "Hoy"
      : periodo === "mes"
        ? "Este mes"
        : periodo === "dia" && dia
          ? formatDiaDeMes(dia)
          : "Todo el tiempo";
  const m = medio === "todos" ? "Todos los medios" : medio === "sin_cargar" ? "Sin medio cargado" : MEDIO_PAGO_LABELS[medio];
  return `${p} · ${m}`;
}

export type ResumenVentasMi = {
  botellas: number;
  /** Suma solo de las ventas con precio. */
  totalCentavos: number;
  sinPrecio: number;
  porProducto: { productoNombre: string; cantidad: number }[];
};

/** Total de botellas, plata y desglose por producto de lo que se está viendo. */
export function resumenVentasMi(meses: MesVentasMi[]): ResumenVentasMi {
  let botellas = 0;
  let totalCentavos = 0;
  let sinPrecio = 0;
  const porNombre = new Map<string, number>();
  for (const m of meses) {
    for (const v of m.ventas) {
      botellas += v.cantidad;
      if (v.totalCentavos === null) sinPrecio += 1;
      else totalCentavos += v.totalCentavos;
      porNombre.set(v.productoNombre, (porNombre.get(v.productoNombre) ?? 0) + v.cantidad);
    }
  }
  const porProducto = [...porNombre.entries()]
    .map(([productoNombre, cantidad]) => ({ productoNombre, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad || a.productoNombre.localeCompare(b.productoNombre, "es"));
  return { botellas, totalCentavos, sinPrecio, porProducto };
}
