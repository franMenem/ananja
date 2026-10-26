"use server";

import { listarRevendedorasActivas } from "@/lib/data/revendedores";
import { obtenerProveedorNombre } from "@/lib/data/negocio";
import { esAdminAutenticado } from "@/lib/rol-vendedor";
import { createClient } from "@/lib/supabase/server";

export type DatosHojaCargar =
  | { ok: true; revendedoras: { id: string; nombre: string }[]; proveedorNombre: string | null }
  | { ok: false };

/**
 * Lo que necesita la hoja "¿Qué pasó?" del botón "+" y que antes leía el
 * layout de admin en CADA navegación: revendedoras activas (mismo criterio
 * que `/revendedores/[id]/carga`) y nombre del proveedor. Solo lectura. La
 * hoja la pide al abrirse y guarda la respuesta mientras dure la pestaña.
 *
 * Verifica en el servidor que quien llama es un admin activo (la hoja solo
 * existe en el shell de admin, que ya exige ese rol): se puede invocar por
 * POST directo, así que no se confía en que venga de esa pantalla.
 */
export async function cargarDatosHoja(): Promise<DatosHojaCargar> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !(await esAdminAutenticado(supabase, user.id))) return { ok: false };

    const [revendedoras, proveedorNombre] = await Promise.all([
      listarRevendedorasActivas(supabase),
      obtenerProveedorNombre(supabase),
    ]);
    if (revendedoras.error) return { ok: false };
    return { ok: true, revendedoras: revendedoras.data, proveedorNombre };
  } catch (error) {
    console.error("cargarDatosHoja", error);
    return { ok: false };
  }
}
