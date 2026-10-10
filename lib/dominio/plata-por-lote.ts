/**
 * Desglose POR LOTE de lo que una coordinadora tiene que pasar a Ananja
 * (pantalla "En manos de {nombre}", `/plata/en-manos/[id]`).
 *
 * La parte Ananja de cada rendición ya la calcula la vista
 * `v_rendiciones_ananja` (0061, espejo `calcularParteAnanjaFifo` en
 * `lib/dominio/plata.ts`) y es la fuente de verdad: acá NO se recalcula.
 * Lo que agrega este archivo es de QUÉ LOTE es cada pedacito de esa parte:
 *
 *  1. Cada rendición se reparte entre los lotes de los tramos FIFO que
 *     cubre (el recorrido es el mismo `recorrerFranjasFifo` que usa
 *     `calcularParteAnanjaFifo`, así que no pueden divergir). El excedente
 *     (pago por encima de lo vendido) y las ventas sin lote van a
 *     `loteId = null`. El reparto es en centavos enteros con resto mayor y
 *     suma EXACTAMENTE el `monto_ananja_centavos` de esa rendición.
 *  2. Los depósitos a la Cuenta Ananja no tienen lote: se descuentan FIFO,
 *     primero de "Sin lote asignado" y después de los lotes del más viejo
 *     al más nuevo.
 *  3. Se arman las líneas (recibido / pasado / pendiente por lote); si su
 *     suma no cierra con el total de la pantalla, una línea "Otros
 *     movimientos" muestra la diferencia en vez de esconderla.
 *
 * Funciones puras, sin Supabase: la lectura vive en `lib/data/plata-por-lote.ts`.
 */

import {
  recorrerFranjasFifo,
  type RendicionEncargado,
  type VentaCostoAnanjaRevendedor,
} from "@/lib/dominio/plata";

/** Una venta con el lote del que salió: `coalesce(ventas_revendedor.lote_id,
 * entrega_items.lote_id)`. El orden del array es el de la vista SQL
 * (`fecha, created_at, id`) — ver `VentaCostoAnanjaRevendedor`. */
export interface VentaConLote extends VentaCostoAnanjaRevendedor {
  loteId: string | null;
}

/** Una rendición `via = 'encargado'` con su parte Ananja ya calculada por
 * `v_rendiciones_ananja`. El orden del array es `created_at, id` (ver
 * `RendicionEncargado`). */
export interface RendicionConParteAnanja extends RendicionEncargado {
  id: string;
  montoAnanjaCentavos: number;
}

export interface LoteFecha {
  id: string;
  /** "YYYY-MM-DD" (`lotes_produccion.fecha`). */
  fecha: string;
}

/** Aporte de una rendición a un lote (`loteId = null`: sin lote asignado). */
export interface AporteLote {
  loteId: string | null;
  centavos: number;
}

export interface RepartoRendicion {
  rendicionId: string;
  tenedorId: string;
  /** Suma de `centavos` = `montoAnanjaCentavos` de la rendición (o vacío si ese monto es 0). */
  aportes: AporteLote[];
}

/**
 * Reparte `total` (entero) entre las claves de `pesos` en proporción a su
 * peso, con resto mayor: cada clave recibe el piso de su parte exacta y los
 * centavos que sobran van a las de mayor parte decimal (empate: la que
 * aparece primero). La suma devuelta es EXACTAMENTE `total`.
 */
export function repartirEnterosRestoMayor<K>(total: number, pesos: Map<K, number>): Map<K, number> {
  const resultado = new Map<K, number>();
  const claves = [...pesos.keys()];
  const pesoTotal = [...pesos.values()].reduce((acc, p) => acc + p, 0);
  if (claves.length === 0 || total <= 0 || pesoTotal <= 0) return resultado;

  const exactos = claves.map((k) => (total * (pesos.get(k) ?? 0)) / pesoTotal);
  const pisos = exactos.map((e) => Math.floor(e));
  let sobran = total - pisos.reduce((acc, p) => acc + p, 0);

  const porDecimalDesc = exactos
    .map((e, i) => ({ i, decimal: e - pisos[i] }))
    .sort((a, b) => b.decimal - a.decimal || a.i - b.i);
  for (const { i } of porDecimalDesc) {
    if (sobran <= 0) break;
    pisos[i] += 1;
    sobran -= 1;
  }
  claves.forEach((k, i) => resultado.set(k, pisos[i]));
  return resultado;
}

/**
 * Reparte la parte Ananja de CADA rendición entre los lotes que cubre —
 * mismo recorrido FIFO que `calcularParteAnanjaFifo`. Los pesos de cada
 * tramo son su parte Ananja exacta (no lo cobrado a la revendedora), así
 * que un coordinador con margen propio reparte lo que de verdad le
 * corresponde a Ananja. Si la rendición no tiene tramos (o pesan 0) y su
 * parte Ananja es > 0, todo va a `loteId = null`.
 *
 * `rendiciones` tiene que incluir las de TODOS los tenedores de cada
 * revendedora (el FIFO es por revendedora), ordenadas por `created_at, id`.
 */
export function repartirRendicionesPorLote(
  ventas: VentaConLote[],
  rendiciones: RendicionConParteAnanja[],
): RepartoRendicion[] {
  const recorridos = recorrerFranjasFifo(ventas, rendiciones);

  return rendiciones.map((r, i) => {
    const pesos = new Map<string | null, number>();
    for (const tramo of recorridos[i].tramos) {
      const loteId = tramo.venta?.loteId ?? null;
      pesos.set(loteId, (pesos.get(loteId) ?? 0) + tramo.parteExacta);
    }

    const monto = r.montoAnanjaCentavos;
    let reparto = repartirEnterosRestoMayor(monto, pesos);
    if (monto > 0 && reparto.size === 0) reparto = new Map([[null, monto]]);
    // Un monto negativo no debería existir (parte Ananja >= 0); si pasara,
    // no se pierde: va entero a "sin lote" y el "Otros movimientos" lo muestra.
    if (monto < 0) reparto = new Map([[null, monto]]);

    return {
      rendicionId: r.id,
      tenedorId: r.tenedorId,
      aportes: [...reparto].map(([loteId, centavos]) => ({ loteId, centavos })),
    };
  });
}

/** Total recibido por lote (suma de los aportes de las rendiciones de `tenedorId`). */
export function recibidoPorLote(repartos: RepartoRendicion[], tenedorId: string): Map<string | null, number> {
  const recibido = new Map<string | null, number>();
  for (const reparto of repartos) {
    if (reparto.tenedorId !== tenedorId) continue;
    for (const a of reparto.aportes) {
      recibido.set(a.loteId, (recibido.get(a.loteId) ?? 0) + a.centavos);
    }
  }
  return recibido;
}

export interface LineaLote {
  loteId: string | null;
  /** Fecha del lote ("YYYY-MM-DD"); `null` para "Sin lote asignado" (o un lote que no figura en `lotes`). */
  fecha: string | null;
  recibidoCentavos: number;
  pasadoCentavos: number;
  pendienteCentavos: number;
}

/**
 * Descuenta los depósitos FIFO: primero "Sin lote asignado" (si existe) y
 * después los lotes del más viejo al más nuevo (`fecha` asc, desempate por
 * id; un lote que no figura en `lotes` va al final). Devuelve una línea por
 * cada lote con algo recibido, en ese orden. Si los depósitos superan todo
 * lo recibido, el sobrante no se imputa a nada (todas las líneas quedan en 0).
 */
export function imputarDepositos(
  recibido: Map<string | null, number>,
  depositosCentavos: number,
  lotes: LoteFecha[],
): LineaLote[] {
  const fechaPorLote = new Map(lotes.map((l) => [l.id, l.fecha]));

  const orden = [...recibido.keys()].sort((a, b) => {
    if (a === null) return b === null ? 0 : -1;
    if (b === null) return 1;
    const fa = fechaPorLote.get(a);
    const fb = fechaPorLote.get(b);
    if (fa !== undefined && fb !== undefined) return fa < fb ? -1 : fa > fb ? 1 : a < b ? -1 : a > b ? 1 : 0;
    if (fa !== undefined) return -1;
    if (fb !== undefined) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });

  let porDescontar = Math.max(depositosCentavos, 0);
  return orden.map((loteId) => {
    const recibidoCentavos = recibido.get(loteId) ?? 0;
    const pasadoCentavos = Math.min(porDescontar, Math.max(recibidoCentavos, 0));
    porDescontar -= pasadoCentavos;
    return {
      loteId,
      fecha: loteId === null ? null : (fechaPorLote.get(loteId) ?? null),
      recibidoCentavos,
      pasadoCentavos,
      pendienteCentavos: recibidoCentavos - pasadoCentavos,
    };
  });
}

export interface EntradaLineasPorLote {
  tenedorId: string;
  ventas: VentaConLote[];
  rendiciones: RendicionConParteAnanja[];
  /** Suma de `depositos_cuenta.monto_centavos` del tenedor. */
  depositosCentavos: number;
  lotes: LoteFecha[];
}

/** Todo el cálculo puro: de las ventas/rendiciones/depósitos crudos a las
 * líneas por lote (recibido, pasado, pendiente) de `tenedorId`. */
export function calcularLineasPorLote(entrada: EntradaLineasPorLote): LineaLote[] {
  const repartos = repartirRendicionesPorLote(entrada.ventas, entrada.rendiciones);
  return imputarDepositos(
    recibidoPorLote(repartos, entrada.tenedorId),
    entrada.depositosCentavos,
    entrada.lotes,
  );
}

export interface DesglosePorLote {
  /** Solo lotes con pendiente > 0, en el orden de imputación (sin lote primero, después del más viejo al más nuevo). */
  lineas: LineaLote[];
  /** `total − Σ pendiente`: lo que el desglose por lote no explica (0 si cierra). */
  otrosMovimientosCentavos: number;
}

/**
 * Arma lo que muestra la pantalla: las líneas con pendiente > 0 y, si su
 * suma no da `totalCentavos` (el total grande de la pantalla, de
 * `v_plata_en_manos`), la diferencia como "Otros movimientos" — en vez de
 * esconderla. Devuelve `null` (no mostrar la sección) si el total no es
 * positivo (incluye depósitos que superan lo recibido) o si no hay ninguna
 * línea con pendiente > 0.
 */
export function armarDesglose(lineas: LineaLote[], totalCentavos: number): DesglosePorLote | null {
  if (totalCentavos <= 0) return null;
  const conPendiente = lineas.filter((l) => l.pendienteCentavos > 0);
  if (conPendiente.length === 0) return null;
  const suma = conPendiente.reduce((acc, l) => acc + l.pendienteCentavos, 0);
  return { lineas: conPendiente, otrosMovimientosCentavos: totalCentavos - suma };
}
