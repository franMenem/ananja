/**
 * La versión vigente es la de `fecha` más reciente, `created_at` como
 * desempate — función pura para poder testearla con fixtures sin
 * depender de la base. Antes también ordenaba el listado de `/precios`
 * (pantalla retirada 2026-09-16);
 * ahora es un paso interno de `obtenerVersionVigente` (`lib/precios.ts`).
 */
export function ordenarVersiones<T extends { fecha: string; created_at: string }>(
  versiones: T[],
): T[] {
  return [...versiones].sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
    return a.created_at < b.created_at ? 1 : -1;
  });
}
