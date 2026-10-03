import { cache } from "react";

import { obtenerProveedorNombre } from "@/lib/data/negocio";
import { formasProveedor } from "@/lib/dominio/proveedor";
import { createClient } from "@/lib/supabase/server";

/**
 * Nombre del proveedor para Server Components. `cache()` de React la
 * memoiza por request, así el layout de `/stock` y la página que se esté
 * mostrando comparten UNA sola lectura (ver `lib/data/README.md` §
 * Performance). Tolerante: si la base todavía no tiene la tabla, devuelve
 * `null` (ver `obtenerProveedorNombre`).
 */
export const leerProveedorNombre = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  return obtenerProveedorNombre(supabase);
});

/** Las formas gramaticales ya armadas — atajo para páginas de servidor. */
export async function leerFormasProveedor() {
  return formasProveedor(await leerProveedorNombre());
}
