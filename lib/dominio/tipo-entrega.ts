/**
 * Tipo de una entrega a una revendedora (`entregas_revendedor.tipo`):
 * `entrega` (le damos botellas) o `devolucion` (nos las devuelve). En la
 * base es un `text`, no un enum, así que cualquier valor desconocido se
 * trata como `entrega`: {@link normalizarTipoEntrega} es la ÚNICA forma de
 * pasar de un string de la base a este tipo (no compares strings a mano).
 */
export type TipoEntrega = "entrega" | "devolucion";

export function normalizarTipoEntrega(tipo: string | null | undefined): TipoEntrega {
  return tipo === "devolucion" ? "devolucion" : "entrega";
}
