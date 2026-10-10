/**
 * Reglas de los movimientos de stock que se deciden en pantalla
 * (`/stock/movimientos`) antes de llamar a la RPC. Funciones puras, sin
 * acceso a la base ni a React.
 *
 * `supabase/migrations/0072_eliminar_movimiento_stock.sql` es la fuente de
 * verdad de qué se puede borrar; {@link esMovimientoStockBorrable} es su
 * espejo exacto — si una cambia, la otra también.
 */

import { formatFechaSinAnio } from "@/lib/fechas";

/** Motivos de un egreso manual de stock (`movimientos_stock.motivo`, columna
 * `text` con `check`, 0029). "Ajuste" existe en la base pero no se ofrece en
 * el formulario de egreso manual (los ajustes tienen su propio flujo). */
export type MotivoMovimientoStock = "venta" | "degustacion" | "rotura" | "regalo" | "ajuste" | "otro";

const ETIQUETA_MOTIVO: Record<MotivoMovimientoStock, string> = {
  venta: "Venta",
  degustacion: "Degustación",
  rotura: "Rotura",
  regalo: "Regalo",
  ajuste: "Ajuste",
  otro: "Otro",
};

/** Motivos que ofrece el formulario de egreso manual
 * (`components/stock/movimiento-form.tsx`), con las mismas etiquetas que se
 * muestran en el historial. */
export const MOTIVOS_EGRESO_MANUAL: { value: Exclude<MotivoMovimientoStock, "ajuste">; label: string }[] = (
  ["venta", "degustacion", "rotura", "regalo", "otro"] as const
).map((value) => ({ value, label: ETIQUETA_MOTIVO[value] }));

/** Etiqueta de un motivo, o `null` si no hay motivo (`null` = legado) o no se
 * reconoce. */
export function etiquetaMotivo(motivo: string | null | undefined): string | null {
  if (!motivo) return null;
  return ETIQUETA_MOTIVO[motivo as MotivoMovimientoStock] ?? null;
}

/** Lo mínimo de una fila de `movimientos_stock` para decidir si se puede borrar. */
export interface MovimientoStockParaBorrar {
  tipo: string;
  comprobante_id: string | null;
  entrega_id: string | null;
  feria_id: string | null;
}

/**
 * ¿Es un movimiento MANUAL que se puede eliminar? Espejo exacto de la regla
 * de `eliminar_movimiento_stock` (0072): un egreso sin comprobante (venta),
 * sin entrega (revendedora) y sin feria. Ninguna RPC genera un egreso así,
 * así que solo puede venir del formulario de egreso manual.
 *
 * Los ingresos nunca se pueden borrar desde acá: no se distinguen con
 * certeza de los de producción (ver la cabecera de 0072).
 */
export function esMovimientoStockBorrable(m: MovimientoStockParaBorrar): boolean {
  return m.tipo === "egreso" && m.comprobante_id === null && m.entrega_id === null && m.feria_id === null;
}

/**
 * Texto de confirmación al eliminar un egreso manual (`EliminarMovimientoStockAccion`).
 * Borrar un egreso hace que esas botellas vuelvan a figurar en el depósito
 * (y en el lote, si el movimiento lo tenía).
 *
 * `fechaLote` es la fecha ("yyyy-mm-dd") del lote del que salió, o `null` si
 * el movimiento no tiene lote.
 */
export function mensajeEliminarMovimientoStock(
  cantidad: number,
  producto: string,
  fechaLote: string | null,
): string {
  const del = fechaLote ? ` del lote del ${formatFechaSinAnio(fechaLote)}` : "";
  const vuelve =
    cantidad === 1
      ? "Esa botella vuelve a figurar en el depósito."
      : "Esas botellas vuelven a figurar en el depósito.";
  return `Vas a eliminar el egreso de ${cantidad} × ${producto}${del}. ${vuelve}`;
}
