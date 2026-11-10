/**
 * Filtro APLICADO de `/gastos` (el que vive en la URL: `?c=<categoria>&m=2026-11`).
 * Mismo molde que `filtro-ventas-mi.ts`: parser tolerante (cualquier valor
 * inválido se ignora, nunca rompe la pantalla) y serializador que solo
 * escribe lo que no es el default.
 */
export type FiltroGastos = {
  /** Id de categoría; "" = todas. */
  categoriaId: string;
  /** "YYYY-MM"; "" = todos los meses. */
  mes: string;
};

export const FILTRO_GASTOS_POR_DEFECTO: FiltroGastos = { categoriaId: "", mes: "" };

const ID_CATEGORIA = /^[0-9a-zA-Z-]{1,64}$/;
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export function parsearFiltroGastos(params: { get(nombre: string): string | null } | null | undefined): FiltroGastos {
  const c = params?.get("c") ?? "";
  const m = params?.get("m") ?? "";
  return { categoriaId: ID_CATEGORIA.test(c) ? c : "", mes: MES.test(m) ? m : "" };
}

/** Query string del filtro ("" si no hay nada que escribir). */
export function serializarFiltroGastos(filtro: FiltroGastos): string {
  const q = new URLSearchParams();
  if (filtro.categoriaId) q.set("c", filtro.categoriaId);
  if (filtro.mes) q.set("m", filtro.mes);
  return q.toString();
}

/**
 * La categoría del filtro solo vale si existe entre las cargadas: un id que
 * ya no existe (borrada, link viejo) se ignora en vez de dejar una lista
 * vacía. Con `categorias` en `null` (todavía no cargaron, o fallaron) no se
 * puede saber, así que se respeta lo que dice la URL.
 */
export function categoriaVigente(categoriaId: string, categorias: readonly { id: string }[] | null): string {
  if (!categoriaId || categorias === null) return categoriaId;
  return categorias.some((c) => c.id === categoriaId) ? categoriaId : "";
}
