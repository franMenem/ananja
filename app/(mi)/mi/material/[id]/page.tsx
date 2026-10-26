import { TextoMaterial } from "@/components/texto-material";
import { EncabezadoPantalla } from "@/components/ui/encabezado-pantalla";
import { Tarjeta } from "@/components/ui/tarjeta";
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
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5 pb-8">
        <VolverLink href="/mi/material" label="material" hover={false} corto />
        <p className="text-[16px] text-text-muted">No encontramos este material.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5 pb-8">
      <VolverLink href="/mi/material" label="material" hover={false} corto />

      <EncabezadoPantalla titulo={material.titulo} pregunta="Para mostrar a tus clientes" />

      <Tarjeta>
        <TextoMaterial cuerpo={material.cuerpo} />
      </Tarjeta>
    </div>
  );
}
