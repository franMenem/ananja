import { MaterialForm } from "@/components/material/material-form";
import { listarMaterialesAdmin } from "@/lib/data/material";
import { siguienteOrden } from "@/lib/dominio/material";
import { createClient } from "@/lib/supabase/server";

/**
 * `/material/nuevo` — alta. `siguienteOrden` es `max(orden) + 1` entre
 * las piezas existentes, así una pieza nueva queda al final de la lista
 * por default (el admin la puede subir después con los botones de
 * `/material`) sin colisionar con el `orden` de ninguna existente (a
 * diferencia de usar `materiales.length`, que colisiona si los seeds no
 * arrancan en 1 sin huecos).
 */
export default async function NuevoMaterialPage() {
  const supabase = await createClient();
  const { data: materiales } = await listarMaterialesAdmin(supabase);

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <MaterialForm siguienteOrden={siguienteOrden(materiales)} />
    </div>
  );
}
