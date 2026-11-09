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
export function sePuedeQuitar(p: { estado: string | null; entregadas: number | null }): boolean {
  return p.estado !== "cerrada" && (p.entregadas ?? 0) === 0;
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
