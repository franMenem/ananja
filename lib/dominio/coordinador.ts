import { fusionarFilasDuplicadas, hayDescuadre, repartirCantidadEntreLotes, type LoteConStock } from "@/lib/dominio/lotes-split";
import { formatPresentacion, NEGOCIO, type NegocioConfig } from "@/lib/negocio";

/**
 * Cálculos puros del coordinador (`0055_coordinador.sql`): reparte botellas
 * a un grupo de revendedoras y les cobra por Ananja, pero no es una
 * revendedora (sin stock propio, no vende) ni carga ventas/pagos — "solo
 * mirar y entregar" (pedido de Fran). Las lecturas/escrituras
 * (`listarMisRevendedoras`, `listarLotesDisponiblesCoordinador`,
 * `entregarComoCoordinador`) viven en `lib/coordinador.ts`.
 */

export type RevendedoraCoordinador = {
  id: string;
  nombre: string;
  /** Botellas en su poder ahora mismo, sumadas entre todos los productos
   * (`v_stock_revendedor.en_poder`, el mismo número que ya usa la ficha de
   * admin y `/mi` de la propia revendedora). */
  enPoder: number;
  /** Lo que le debe a Ananja, en pesos, al costo Ananja vigente (el
   * redondeado si está cargado, 0054) — `v_deuda_vendedor.saldo_centavos`,
   * el mismo número que ya usan `/revendedores/[id]` y `/mi`. */
  debeCentavos: number;
  /** Costo REAL de Ananja de lo que tiene sin vender todavía — sin
   * relación con `debeCentavos` (eso es lo YA vendido y no rendido). Es
   * `valor_en_poder_centavos` de `v_valor_stock_revendedor` (0059): al
   * precio DEL COORDINADOR (lo que él le cobra), no el costo real de
   * Ananja — es exactamente lo que esa revendedora le debe A ÉL si vende
   * todo lo que tiene en mano. */
  valorEnPoderCentavos: number;
};

export type FilaStockCoordinador = { vendedor_id: string | null; en_poder: number | null };
export type FilaDeudaCoordinador = { vendedor_id: string | null; saldo_centavos: number | null };
export type FilaValorStockCoordinador = { vendedor_id: string | null; valor_en_poder_centavos: number | null };
export type FilaRevendedoraCoordinador = { id: string; nombre: string };

/**
 * Une revendedoras + stock (por producto, a sumar) + deuda en las filas que
 * ve un coordinador — función PURA (testeada en `tests/coordinador.test.ts`),
 * espejo de `agruparValorStockPorVendedor` (`lib/dominio/calculos.ts`). Una
 * revendedora sin filas de stock/deuda todavía (recién asignada) queda en
 * 0/0, no se cae.
 */
export function armarRevendedorasCoordinador(
  revendedoras: FilaRevendedoraCoordinador[],
  stock: FilaStockCoordinador[],
  deudas: FilaDeudaCoordinador[],
  valorStock: FilaValorStockCoordinador[] = [],
): RevendedoraCoordinador[] {
  const enPoderPorVendedor = new Map<string, number>();
  for (const s of stock) {
    if (!s.vendedor_id) continue;
    enPoderPorVendedor.set(s.vendedor_id, (enPoderPorVendedor.get(s.vendedor_id) ?? 0) + (s.en_poder ?? 0));
  }
  const deudaPorVendedor = new Map(
    deudas
      .filter((d): d is typeof d & { vendedor_id: string } => d.vendedor_id !== null)
      .map((d) => [d.vendedor_id, d.saldo_centavos ?? 0]),
  );
  const valorEnPoderPorVendedor = new Map<string, number>();
  for (const v of valorStock) {
    if (!v.vendedor_id) continue;
    valorEnPoderPorVendedor.set(
      v.vendedor_id,
      (valorEnPoderPorVendedor.get(v.vendedor_id) ?? 0) + (v.valor_en_poder_centavos ?? 0),
    );
  }

  return revendedoras.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    enPoder: enPoderPorVendedor.get(r.id) ?? 0,
    debeCentavos: deudaPorVendedor.get(r.id) ?? 0,
    valorEnPoderCentavos: valorEnPoderPorVendedor.get(r.id) ?? 0,
  }));
}

/** Un ítem YA repartido a un lote puntual — lo que manda
 * `registrar_entrega_revendedor` (0055 exige `lote_id` siempre para un
 * coordinador, nunca elige sola: ver `armarItemsEntregaCoordinador`). */
export type ItemEntregaCoordinador = { productoId: string; loteId: string; cantidad: number };

export type FilaLoteDisponibleCoordinador = { lote_id: string; fecha: string; quedan: number };

/**
 * Traduce el resultado crudo de `lotes_disponibles_coordinador` — función
 * PURA (testeada en `tests/coordinador.test.ts`). Si el RPC falló, NO hay
 * que devolver `[]` en silencio: `armarItemsEntregaCoordinador` no puede
 * distinguir "este producto no tiene stock" de "no pudimos ni preguntar",
 * y terminaba mostrando "No hay stock suficiente… Avisale a un admin" —
 * mentira, y encima un coordinador nunca podía entregar nada (bug
 * encontrado en la prueba contra Postgres local, ver (11) en la
 * migración). Acá se devuelve un error EXPLÍCITO y distinto para que la
 * pantalla lo muestre aparte.
 */
export function mapearLotesDisponibles(
  data: FilaLoteDisponibleCoordinador[] | null,
  error: { message: string } | null,
): { data: LoteConStock[]; error: string | null } {
  if (error) {
    return { data: [], error: "No pudimos consultar el stock disponible. Probá de nuevo." };
  }
  return {
    data: (data ?? []).map((l) => ({ loteId: l.lote_id, fecha: l.fecha, quedan: l.quedan })),
    error: null,
  };
}

/**
 * Arma los ítems de una entrega de coordinador repartiendo cada cantidad
 * entre los lotes disponibles de ESE producto — función PURA (testeada en
 * `tests/coordinador.test.ts`), REUSA `repartirCantidadEntreLotes`
 * (`lib/dominio/lotes-split.ts`, la misma función que ya arma el reparto
 * por defecto de un admin en `SelectorLote`, "más viejo primero"): si un
 * pedido no entra en un solo lote, lo divide entre varios (decisión de
 * Fran, 2026-09-17) en vez de fallar. Si el stock TOTAL entre todos los
 * lotes de un producto no alcanza para la cantidad pedida, devuelve un
 * error nombrando ese producto — no manda una entrega parcial en
 * silencio.
 */
export function armarItemsEntregaCoordinador(
  cantidades: Record<string, number>,
  lotesPorProducto: Record<string, LoteConStock[]>,
  nombrePorProducto: Map<string, string>,
): { items: ItemEntregaCoordinador[]; error: null } | { items: null; error: string } {
  const items: ItemEntregaCoordinador[] = [];

  for (const [productoId, cantidad] of Object.entries(cantidades)) {
    if (cantidad <= 0) continue;

    const lotes = lotesPorProducto[productoId] ?? [];
    const filas = fusionarFilasDuplicadas(repartirCantidadEntreLotes(cantidad, lotes));

    if (hayDescuadre(filas, cantidad) || filas.some((f) => f.loteId === null)) {
      const nombre = nombrePorProducto.get(productoId) ?? "un producto";
      return {
        items: null,
        error: `No hay stock suficiente de ${nombre} para entregar esa cantidad. Avisale a un admin.`,
      };
    }

    for (const fila of filas) {
      // `hayDescuadre`/el filtro de arriba ya garantizan loteId !== null acá.
      items.push({ productoId, loteId: fila.loteId as string, cantidad: fila.cantidad });
    }
  }

  if (items.length === 0) {
    return { items: null, error: "Cargá al menos una cantidad." };
  }

  return { items, error: null };
}

/** Mapeo de errores del RPC a mensajes en español — subconjunto de
 * `components/revendedores/entrega-form.tsx` § `ERRORES_RPC`, más los
 * nuevos de 0055 (`COSTO_FALTANTE`, y `STOCK_LOTE_INSUFICIENTE`/
 * `LOTE_INVALIDO` con el texto propio del coordinador: acá nunca hay
 * "Guardar igual", porque `registrar_entrega_revendedor` fuerza
 * `p_permitir_negativo = false` para un coordinador — son siempre casos
 * de "el stock cambió entre que lo viste y lo confirmaste", avisale a un
 * admin y listo). */
export const ERRORES_ENTREGA_COORDINADOR: Record<string, string> = {
  NO_AUTORIZADO: "No tenés permiso para esto.",
  REVENDEDOR_INVALIDO: "Esta persona ya no es una revendedora tuya.",
  COSTO_FALTANTE: "Ese lote todavía no tiene el costo cargado. Avisale a un admin.",
  LOTE_INVALIDO: "El stock cambió justo ahora. Probá de nuevo.",
  STOCK_LOTE_INSUFICIENTE: "El stock cambió justo ahora. Probá de nuevo.",
  STOCK_INSUFICIENTE: "No hay stock suficiente en el depósito. Avisale a un admin.",
};

/**
 * Total disponible de UN producto — suma de `quedan` entre los lotes que
 * devuelve `lotes_disponibles_coordinador` (ya sin los que no tienen costo
 * cargado). Pura, testeada. Usado para mostrar "Disponible: X" ANTES de
 * entregar y como tope del stepper (0057_coordinador_plata_stock.sql,
 * pedido de Fran: "sabiendo cuántas hay").
 */
export function totalDisponible(lotes: LoteConStock[]): number {
  return lotes.reduce((acc, l) => acc + l.quedan, 0);
}

export type DisponiblePorProducto = { presentacionMl: number | null; disponible: number };

/**
 * "Disponible: 199 de 500 ml · 99 de 250 ml" — une el disponible de cada
 * presentación, de mayor a menor (mismo orden que
 * `formatCantidadesPorPresentacion`, `lib/negocio.ts`). Pura, testeada.
 * Sin precios ni costos ni lotes: solo la cantidad y la presentación.
 */
export function formatDisponiblePorPresentacion(
  disponibles: DisponiblePorProducto[],
  negocio: Pick<NegocioConfig, "unidad"> = NEGOCIO,
): string {
  return [...disponibles]
    .sort((a, b) => (b.presentacionMl ?? 0) - (a.presentacionMl ?? 0))
    .map((d) => `${d.disponible} de ${formatPresentacion(d.presentacionMl, negocio)}`)
    .join(" · ");
}
