import { parseMontoInput } from "@/lib/money";

/** Mismo parser que el resto de la app (formato argentino, "." miles / ","
 * decimales) — un campo vacío o inválido queda `null` ("no cargado"), igual
 * criterio que `construirPCostosLote` (lib/lotes.ts). */
export function parseCampo(valor: string): number | null {
  return valor.trim() ? parseMontoInput(valor) : null;
}

export type ProductoLoteItem = {
  productoId: string;
  nombre: string;
  presentacionMl: number;
  cantidad: number;
};

/** Un insumo de etiqueta (frente o reverso, por presentación) usado por
 * alguna de las `items` del pedido — ver `supabase/migrations/0017_insumos.sql`
 * § seed ("Etiqueta chica frente", "Etiqueta chica retro", etc.). En
 * pantalla `agruparEtiquetasPorLado` (lib/insumos.ts) junta frente + reverso
 * de la misma presentación en un solo campo — cada uno sigue siendo una
 * fila propia de `lote_costos` al guardar. */
export type EtiquetaInsumoLote = {
  insumoId: string;
  nombre: string;
};

/** El promedio ponderado vigente de `v_tanque_aceite` — para prefijar el
 * hint "según lo que compraste (quedan X L)" debajo del precio de aceite.
 * `null` cuando el negocio todavía no cargó ninguna compra. */
export type TanqueAceiteHint = {
  costoPromedioCentavosPorLitro: number | null;
  litrosRestantes: number;
} | null;

/** Dólar/USD del litro de aceite del lote de referencia MÁS RECIENTE —
 * el que otro pedido (`/stock/lotes/nuevo`) o el que ESTE MISMO pedido antes
 * de tocar nada (`/stock/lotes/[id]/costos`, comparado contra el pedido
 * anterior) podría haber heredado en silencio (`crear_lote`/
 * `fijar_costos_lote`, `supabase/migrations/0030_dolar_por_lote.sql`). A
 * diferencia de los % (ganancia/mayorista/minorista/transporte/IVA), que son
 * "poné una vez y listo", el dólar se desactualiza — por eso, mientras el
 * valor en pantalla siga siendo IGUAL al de acá, `CostosLoteCampos` muestra
 * un aviso "¿lo actualizás?" en vez de dejarlo pasar en silencio. `null`: no
 * hay pedido de referencia con dólar/USD cargado, no hay nada que avisar. */
export type AceiteHeredado = {
  /** Fecha (YYYY-MM-DD) del pedido de referencia — para nombrar la fuente
   * en el aviso ("del pedido del 05/08/2026"). */
  fecha: string;
  dolarCentavos: number | null;
  usdCentavos: number | null;
} | null;

/** Última compra (`obtenerUltimasComprasInsumos`, `lib/insumos.ts`) de cada
 * insumo de etiqueta, para mostrar de dónde salió el precio prefijado
 * ("Precio de la última compra — 12/09") mientras el campo siga IGUAL a
 * ese valor — mismo criterio que el aviso de dólar heredado (desaparece en
 * cuanto el dueño lo edita, ver `dolarEsHeredado` más abajo). */
export type UltimasComprasEtiquetas = Record<
  string,
  { precioUnitarioCentavos: number; fecha: string }
> | null;
