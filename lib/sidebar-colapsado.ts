/**
 * Estado "colapsado" del rail de escritorio (`components/app-rail.tsx`),
 * persistido en `localStorage`. Expuesto como un mini store externo para
 * `useSyncExternalStore` (en vez de `useState` + `useEffect` leyendo
 * `localStorage`) — así React aplica el valor real del cliente en el
 * commit de hidratación, antes del primer paint, sin el flash
 * expandido→colapsado que produciría leer el storage recién en un efecto.
 *
 * `try/catch` alrededor de `localStorage` porque puede fallar (ej. Safari
 * en modo privado); en ese caso el rail simplemente no recuerda la
 * preferencia entre sesiones.
 */
const STORAGE_KEY = "sidebar-colapsado";

type Listener = () => void;
const listeners = new Set<Listener>();

/** Snapshot en memoria, para que `leerSidebarColapsado` (usado como
 * `getSnapshot` de `useSyncExternalStore`) devuelva siempre el mismo valor
 * mientras no cambie — `useSyncExternalStore` entra en loop si `getSnapshot`
 * recalcula algo inestable en cada llamada. Se calcula una sola vez, de
 * forma perezosa (recién cuando el rail lo pide, nunca en el servidor). */
let cache: boolean | undefined;

function leerStorage(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** `getSnapshot` de `useSyncExternalStore`: la preferencia real del
 * cliente, cacheada. `false` (expandido) si nunca se guardó nada o si
 * `localStorage` no está disponible. */
export function leerSidebarColapsado(): boolean {
  if (cache === undefined) cache = leerStorage();
  return cache;
}

/**
 * `subscribe` de `useSyncExternalStore`. Nada fuera de este módulo puede
 * cambiar la preferencia (no hay otra pestaña ni otro proceso escribiendo
 * esta clave) — la única vía es `guardarSidebarColapsado`, que notifica acá
 * mismo a quien esté suscripto (el propio rail) para que se vuelva a
 * renderizar con el valor nuevo.
 */
export function suscribirseSidebarColapsado(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Persiste la preferencia de colapso del rail y notifica a los suscriptores. */
export function guardarSidebarColapsado(colapsado: boolean): void {
  cache = colapsado;
  try {
    localStorage.setItem(STORAGE_KEY, colapsado ? "1" : "0");
  } catch {
    // localStorage no disponible (ej. Safari en modo privado) — se ignora,
    // el rail simplemente no recuerda la preferencia entre sesiones.
  }
  listeners.forEach((listener) => listener());
}
