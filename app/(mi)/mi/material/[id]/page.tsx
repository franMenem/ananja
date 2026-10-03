import { TextoMaterial } from "@/components/texto-material";
import { VolverLink } from "@/components/volver-link";
import { obtenerMaterial } from "@/lib/data/material";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * `/mi/material/[id]` — detalle de solo lectura. Sin `SetFormHeader` (el shell `(mi)` no tiene esa
 * variante, ver `components/mi-header.tsx`) — link "← Volver a material"
 * simple, mismo patrón que `/mi/ventas/[id]`. RLS acota `obtenerMaterial`
 * a lo que este revendedor puede ver (`publicado = true`, o nada si el
 * `id` no existe / ya no es visible).
 */
export default async function MiMaterialDetallePage({
  params,
}: PageProps<"/mi/material/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const material = await obtenerMaterial(supabase, id);

  if (!material) {
    return (
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 pb-8">
        <VolverLink href="/mi/material" label="material" hover={false} />
        <p className="text-sm text-text-muted">No encontramos este material.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 pb-8">
      <VolverLink href="/mi/material" label="material" hover={false} />

      <h1 className="font-display text-[28px] text-primary">{material.titulo}</h1>

      <TextoMaterial cuerpo={material.cuerpo} />
    </div>
  );
}
