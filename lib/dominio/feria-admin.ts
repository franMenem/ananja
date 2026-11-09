/**
 * Feria de revendedoras, lado admin — cálculos puros (sin Supabase ni React):
 * orden de la lista, totales de una feria y qué acciones admite cada
 * participante. Los cálculos del cierre están en `lib/dominio/feria.ts`.
 */

export type EstadoFeria = "abierta" | "cerrada";

/** Abiertas primero; dentro de cada grupo, la fecha más reciente arriba. */
export function ordenarFerias<T extends { estado: string; fecha: string }>(ferias: T[]): T[] {
  return [...ferias].sort((a, b) => {
    if (a.estado !== b.estado) return a.estado === "abierta" ? -1 : 1;
    return b.fecha.localeCompare(a.fecha);
  });
}

type FilaParticipante = {
  estado: string | null;
  entregadas: number | null;
  vendidas: number | null;
  devueltas: number | null;
  degustadas: number | null;
  faltan: number | null;
  total_vendido_centavos: number | null;
  efectivo_centavos: number | null;
  mercado_pago_centavos: number | null;
  banco_centavos: number | null;
};

export type TotalesFeria = {
  participantes: number;
  pendientes: number;
  cerradas: number;
  entregadas: number;
  vendidas: number;
  devueltas: number;
  degustadas: number;
  faltan: number;
  totalVendidoCentavos: number;
  declaradoCentavos: number;
};

/** Suma de la feria entera a partir de las filas de `v_feria_participantes`. */
export function totalesFeria(participantes: FilaParticipante[]): TotalesFeria {
  const t: TotalesFeria = {
    participantes: participantes.length,
    pendientes: 0,
    cerradas: 0,
    entregadas: 0,
    vendidas: 0,
    devueltas: 0,
    degustadas: 0,
    faltan: 0,
    totalVendidoCentavos: 0,
    declaradoCentavos: 0,
  };
  for (const p of participantes) {
    if (p.estado === "cerrada") t.cerradas += 1;
    else t.pendientes += 1;
    t.entregadas += p.entregadas ?? 0;
    t.vendidas += p.vendidas ?? 0;
    t.devueltas += p.devueltas ?? 0;
    t.degustadas += p.degustadas ?? 0;
    t.faltan += p.faltan ?? 0;
    t.totalVendidoCentavos += p.total_vendido_centavos ?? 0;
    t.declaradoCentavos +=
      (p.efectivo_centavos ?? 0) + (p.mercado_pago_centavos ?? 0) + (p.banco_centavos ?? 0);
  }
  return t;
}

/** Solo se puede sacar a alguien pendiente y sin botellas cargadas. */
export function sePuedeQuitar(p: {
  estado: string | null;
  entregadas: number | null;
  /** Degustación cargada de antemano: también hay que quitarla antes (0079). */
  degustadas_carga?: number | null;
}): boolean {
  return p.estado !== "cerrada" && (p.entregadas ?? 0) === 0 && (p.degustadas_carga ?? 0) === 0;
}

/** La feria se puede cerrar si está abierta y nadie queda pendiente. */
export function sePuedeCerrarFeria(feriaEstado: string, pendientes: number): boolean {
  return feriaEstado === "abierta" && pendientes === 0;
}

/** "1 participante" / "3 participantes". */
export function textoParticipantes(n: number): string {
  return n === 1 ? "1 participante" : `${n} participantes`;
}

/** Revendedoras que todavía no están en la feria. */
export function revendedorasDisponibles<T extends { id: string }>(
  activas: T[],
  participantes: { vendedor_id: string | null }[],
): T[] {
  const ya = new Set(participantes.map((p) => p.vendedor_id));
  return activas.filter((r) => !ya.has(r.id));
}

/** Item de degustación para `feriaCargarDegustacion`. */
export type ItemDegustacionFeria = { productoId: string; cantidad: number; loteId: string | null };

/**
 * Arma los items de degustación a cargar junto con las botellas de una
 * feria. `degustacion` es `productoId -> cantidad`; `itemsEntrega` son las
 * filas de la entrega ya armada (con su pedido, si se eligió): la degustación
 * de un producto sale del PRIMER pedido que se eligió para ese producto en la
 * entrega; si no hay (o no se eligió), `loteId` va `null` y el servidor toma
 * el pedido más viejo con stock. Ignora cantidades en cero o inválidas.
 */
export function itemsDegustacionFeria(
  degustacion: Record<string, number>,
  itemsEntrega: { producto_id: string; lote_id?: string | null }[],
): ItemDegustacionFeria[] {
  const items: ItemDegustacionFeria[] = [];
  for (const [productoId, cantidad] of Object.entries(degustacion)) {
    if (!Number.isInteger(cantidad) || cantidad <= 0) continue;
    const primerConLote = itemsEntrega.find((i) => i.producto_id === productoId && i.lote_id);
    items.push({ productoId, cantidad, loteId: primerConLote?.lote_id ?? null });
  }
  return items;
}

/** Total de botellas para degustación de un `productoId -> cantidad`. */
export function totalDegustacion(degustacion: Record<string, number>): number {
  return Object.values(degustacion).reduce((a, n) => a + (Number.isInteger(n) && n > 0 ? n : 0), 0);
}

/** "5 para vender · 2 para degustación (a cargo de Ananja)". */
export function textoParaVenderYDegustar(paraVender: number, paraDegustar: number): string {
  const partes = [`${paraVender} para vender`];
  if (paraDegustar > 0) partes.push(`${paraDegustar} para degustación (a cargo de Ananja)`);
  return partes.join(" · ");
}

/**
 * Degustación de una participante, desglosada por origen: "3 cargadas",
 * "1 en el cierre" o "4 (3 cargadas · 1 en el cierre)". `null` si no hay.
 */
export function textoDegustacion(carga: number | null, cierre: number | null): string | null {
  const c = carga ?? 0;
  const k = cierre ?? 0;
  const cargadas = c === 1 ? "1 cargada" : `${c} cargadas`;
  if (c > 0 && k > 0) return `${c + k} (${cargadas} · ${k} en el cierre)`;
  if (c > 0) return cargadas;
  if (k > 0) return `${k} en el cierre`;
  return null;
}
