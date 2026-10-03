/**
 * Configuración del negocio editable desde la app — capa `lib/data`
 * (convención en `lib/data/README.md`). Por ahora, el nombre del proveedor
 * del aceite (`configuracion_negocio`, migración 0069).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizarNombreProveedor } from "@/lib/dominio/proveedor";
import type { Database } from "@/lib/types";

type Supa = SupabaseClient<Database>;

/**
 * Nombre del proveedor configurado, o `null` si no hay ninguno.
 *
 * TOLERANTE a propósito: la migración 0069 se aplica en producción
 * DESPUÉS del deploy, así que mientras tanto la tabla no existe. Ante
 * cualquier error (tabla inexistente, sin permiso, conexión) se loguea y
 * devuelve `null` — la interfaz muestra "proveedor" y la página nunca se
 * rompe por esto.
 */
export async function obtenerProveedorNombre(supabase: Supa): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("configuracion_negocio")
      .select("proveedor_nombre")
      .maybeSingle();
    if (error) {
      console.error("obtenerProveedorNombre:", error.message);
      return null;
    }
    return normalizarNombreProveedor(data?.proveedor_nombre);
  } catch (e) {
    console.error("obtenerProveedorNombre:", e);
    return null;
  }
}
