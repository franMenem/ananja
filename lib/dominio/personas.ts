/**
 * Funciones puras del sector Personas (rediseño 2026-10, fase 5): lista de
 * revendedores, ficha y clientes. Sin I/O ni JSX; solo ordenan, resumen y
 * deciden qué estado mostrar. Los números salen de las mismas fuentes que
 * ya leían las pantallas.
 */

import type { MovimientoPago } from "@/lib/dominio/pagos-revendedor";
import type { MovimientoRevendedor } from "@/lib/dominio/movimientos-revendedor";
import { formatFecha } from "@/lib/fechas";
import { formatCentavos } from "@/lib/money";
import { envase } from "@/lib/negocio";

/** Minúsculas y sin acentos, para buscar por nombre. */
export function sinAcentos(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** "Laura Pérez" -> "LP"; "Teresa" -> "T"; vacío -> "?". */
export function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return "?";
  const letras = palabras.length === 1 ? [palabras[0]] : [palabras[0], palabras[1]];
  return letras
    .map((p) => Array.from(p)[0] ?? "")
    .join("")
    .toLocaleUpperCase("es-AR");
}

export type EstadoPersona = {
  variante: "debe" | "confirmar" | "ok";
  /** Texto de la pastilla: "Debe $X", "$X por confirmar" o "Al día". */
  texto: string;
  /** Si debe Y además tiene un pago por confirmar, esto va en el detalle. */
  detalleExtra: string | null;
};

/**
 * Un solo estado por persona: debe (rojo) > por confirmar (azul) > al día
 * (verde). Una deuda en 0 o a favor nunca es "debe".
 */
export function estadoPersona(debeCentavos: number, porConfirmarCentavos: number): EstadoPersona {
  const porConfirmar = porConfirmarCentavos > 0 ? `${formatCentavos(porConfirmarCentavos)} por confirmar` : null;
  if (debeCentavos > 0) {
    return { variante: "debe", texto: `Debe ${formatCentavos(debeCentavos)}`, detalleExtra: porConfirmar };
  }
  if (porConfirmar) return { variante: "confirmar", texto: porConfirmar, detalleExtra: null };
  return { variante: "ok", texto: "Al día", detalleExtra: null };
}

export type FilaRevendedor = {
  id: string;
  nombre: string;
  esCoordinadora: boolean;
  esAdmin: boolean;
  /** Botellas que tiene hoy. */
  enPoder: number;
  /** Revendedoras a su cargo (solo coordinadoras). */
  aCargo: number;
  /** Costo Ananja de lo que tiene sin vender. */
  valorEnPoderCentavos: number;
  debeCentavos: number;
  porConfirmarCentavos: number;
};

/** Mayor deuda primero; los que no deben, por nombre. */
export function ordenarPorDeuda<T extends { nombre: string; debeCentavos: number }>(filas: T[]): T[] {
  return [...filas].sort((a, b) => {
    const da = Math.max(a.debeCentavos, 0);
    const db = Math.max(b.debeCentavos, 0);
    if (da !== db) return db - da;
    return a.nombre.localeCompare(b.nombre, "es");
  });
}

/** "Entre todos deben $X y tienen N botellas": solo suma lo que se debe (> 0). */
export function resumenEquipo(filas: Pick<FilaRevendedor, "debeCentavos" | "enPoder">[]): {
  debeCentavos: number;
  botellas: number;
} {
  return filas.reduce(
    (acc, f) => ({
      debeCentavos: acc.debeCentavos + Math.max(f.debeCentavos, 0),
      botellas: acc.botellas + f.enPoder,
    }),
    { debeCentavos: 0, botellas: 0 },
  );
}

/** Botellas vendidas en el mes de `hoy` ("yyyy-mm-dd"). */
export function botellasVendidasEnMes(ventas: { fecha: string; cantidad: number }[], hoy: string): number {
  const mes = hoy.slice(0, 7);
  return ventas.filter((v) => v.fecha.slice(0, 7) === mes).reduce((acc, v) => acc + v.cantidad, 0);
}

export type ItemLineaDeTiempo =
  | { clase: "movimiento"; movimiento: MovimientoRevendedor }
  | { clase: "pago"; pago: MovimientoPago };

/**
 * Une el hilo de entregas/devoluciones/ventas con los pagos en una sola
 * línea de tiempo, más reciente primero. Cada lista ya viene ordenada; se
 * intercalan por fecha y, a igual fecha, va primero el movimiento.
 */
export function armarLineaDeTiempo(
  movimientos: MovimientoRevendedor[],
  pagos: MovimientoPago[],
): ItemLineaDeTiempo[] {
  const salida: ItemLineaDeTiempo[] = [];
  let i = 0;
  let j = 0;
  while (i < movimientos.length || j < pagos.length) {
    const m = movimientos[i];
    const p = pagos[j];
    if (m && (!p || m.fecha >= p.fecha)) {
      salida.push({ clase: "movimiento", movimiento: m });
      i += 1;
    } else if (p) {
      salida.push({ clase: "pago", pago: p });
      j += 1;
    }
  }
  return salida;
}

/** Cuántas botellas mueve una entrega o devolución. */
export function botellasDeMovimiento(m: MovimientoRevendedor): number {
  return m.tipo === "venta" ? m.cantidad : m.items.reduce((acc, it) => acc + it.cantidad, 0);
}

/** Etiqueta de una cantidad de botellas: "1 botella", "5 botellas". */
export function textoBotellas(n: number): string {
  return `${n} ${envase(n)}`;
}

/** Detalle de una fila de `/clientes`: "3 compras · última 12/09/2026" o "Sin compras". */
export function detalleCliente(c: { cantidadCompras: number; ultimaCompra: string | null }): string {
  if (c.cantidadCompras === 0 || !c.ultimaCompra) return "Sin compras";
  const compras = `${c.cantidadCompras} ${c.cantidadCompras === 1 ? "compra" : "compras"}`;
  return `${compras} · última ${formatFecha(c.ultimaCompra)}`;
}
