import { MEDIO_PAGO_LABELS } from "@/lib/dominio/caja";
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

export type PeriodoVentasMi = "hoy" | "mes" | "todo";
export type MedioFiltroMi = "todos" | Enums<"medio_pago"> | "sin_cargar";

export type FiltroVentasMi = {
  periodo: PeriodoVentasMi;
  medio: MedioFiltroMi;
  /** Hoy en Argentina, "YYYY-MM-DD" (lo calcula el servidor). */
  hoy: string;
};

function coincide(v: VentaAgrupadaMi, { periodo, medio, hoy }: FiltroVentasMi): boolean {
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

/** Texto del estado vacío según el filtro activo. */
export function mensajeSinVentas(periodo: PeriodoVentasMi, medio: MedioFiltroMi): string {
  if (periodo === "todo" && medio === "todos") return "Todavía no cargaste ventas.";
  if (medio === "sin_cargar") {
    const cuando = periodo === "hoy" ? " hoy" : periodo === "mes" ? " este mes" : "";
    return `No hay ventas sin medio de pago cargado${cuando}.`;
  }
  const cuando = periodo === "hoy" ? " hoy" : periodo === "mes" ? " este mes" : "";
  if (medio === "todos") return `No hay ventas${cuando}.`;
  return `No hay ventas en ${medio === "efectivo" ? "efectivo" : MEDIO_PAGO_LABELS[medio]}${cuando}.`;
}
