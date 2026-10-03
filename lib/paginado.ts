/** Tope de filas por respuesta de PostgREST en Supabase (`max-rows`). */
export const TAMANO_PAGINA = 1000;

type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/**
 * Lee todas las filas de una consulta pidiendo páginas con `.range()` hasta
 * que una vuelve con menos de `tamano` filas — así una tabla que crece no
 * queda cortada en silencio a las 1000 filas. `pagina(desde, hasta)` tiene
 * que armar la consulta con un orden estable (ej. `.order("id")`) y
 * `.range(desde, hasta)`. Si una página falla, devuelve el error (y lo que
 * alcanzó a leer).
 */
export async function leerTodasLasPaginas<T>(
  pagina: (desde: number, hasta: number) => Pagina<T>,
  tamano = TAMANO_PAGINA,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += tamano) {
    const { data, error } = await pagina(desde, desde + tamano - 1);
    if (error) return { data: filas, error };
    const lote = data ?? [];
    filas.push(...lote);
    if (lote.length < tamano) return { data: filas, error: null };
  }
}
