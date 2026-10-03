import { MaterialForm } from "@/components/material/material-form";
import { VolverLink } from "@/components/volver-link";
import { obtenerMaterial } from "@/lib/data/material";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * `/material/[id]` — edición. Mismo patrón de "no encontrado" que
 * `/precios/[id]`: id inexistente, o (si algún día un admin deja de ser
 * admin a mitad de sesión) una fila que RLS ya no le deja ver.
 */
export default async function MaterialDetallePage({
  params,
}: PageProps<"/material/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const material = await obtenerMaterial(supabase, id);

  if (!material) {
    return (
      <div className="flex flex-col gap-6 pb-8">
        <VolverLink href="/material" label="material" />
        <p className="text-sm text-text-muted">No encontramos este material.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <MaterialForm material={material} />
    </div>
  );
}
