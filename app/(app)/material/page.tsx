import Link from "next/link";

import { MaterialLista } from "@/components/material/material-lista";
import { BOTON_SECUNDARIO } from "@/components/ui/boton";
import { EncabezadoPantalla } from "@/components/ui/encabezado-pantalla";
import { listarMaterialesAdmin } from "@/lib/data/material";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * `/material` — listado admin, ordenado por `(orden, created_at)`: título, chip de estado
 * (Publicado/Borrador), y botones "↑"/"↓" para reordenar (sin RPC —
 * `moverMaterial`, `lib/material.ts`). Server component (mismo patrón que
 * `/revendedores`): la carga inicial se resuelve con `lib/supabase/server.ts`
 * y `loading.tsx` cubre el estado de espera; solo el reordenamiento vive en
 * un client component chico (`MaterialLista`), que refresca con
 * `router.refresh()` en vez de releer manualmente.
 */
export default async function MaterialPage() {
  const supabase = await createClient();
  const { data: materiales, error } = await listarMaterialesAdmin(supabase);

  return (
    <div className="flex flex-col gap-6 pb-8">
      <EncabezadoPantalla
        titulo="Material"
        pregunta="¿Qué les mostramos a las revendedoras?"
        acciones={
          <Link prefetch={false} href="/material/nuevo" className={`${BOTON_SECUNDARIO} flex px-4`}>
            + Nuevo material
          </Link>
        }
      />

      {error && (
        <p role="alert" className="text-[16px] text-accent">
          {error}
        </p>
      )}

      {!error && materiales.length === 0 && (
        <p className="py-6 text-[16px] text-text-muted">Todavía no cargaste ningún material.</p>
      )}

      {!error && materiales.length > 0 && <MaterialLista materiales={materiales} />}
    </div>
  );
}
