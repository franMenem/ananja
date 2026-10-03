import Link from "next/link";

import { MaterialLista } from "@/components/material/material-lista";
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
    <div className="flex flex-col pb-8">
      <div className="flex items-center justify-between py-6">
        <h1 className="font-display text-[30px] leading-[1.05] text-primary md:text-[38px]">
          Material
        </h1>
        <Link
          href="/material/nuevo"
          className="flex min-h-11 items-center gap-2 bg-primary px-5 text-xs font-medium tracking-[0.12em] text-background uppercase transition-colors hover:bg-primary-hover"
        >
          + Nuevo material
        </Link>
      </div>

      {error && (
        <p role="alert" className="mb-4 text-sm text-accent">
          {error}
        </p>
      )}

      {!error && materiales.length === 0 && (
        <p className="py-6 text-sm text-text-muted">Todavía no cargaste ningún material.</p>
      )}

      {!error && materiales.length > 0 && <MaterialLista materiales={materiales} />}
    </div>
  );
}
