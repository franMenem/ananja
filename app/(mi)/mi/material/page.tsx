import Link from "next/link";

import { listarMaterialesPublicados } from "@/lib/data/material";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * `/mi/material` — listado de material publicado para el revendedor
 *, ordenado por `(orden, created_at)`. Solo lectura: sin
 * botones de reordenar/editar (esos viven en `/material`, admin). RLS ya
 * garantiza que un revendedor nunca recibe una fila con
 * `publicado = false` (ver invariante 12, `contracts/database.md`).
 */
export default async function MiMaterialPage() {
  const supabase = await createClient();
  const { data: materiales, error } = await listarMaterialesPublicados(supabase);

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 pb-8">
      <h1 className="font-display text-[30px] leading-[1.05] text-primary">Material</h1>

      {error && (
        <p role="alert" className="text-sm text-accent">
          {error}
        </p>
      )}

      {!error && materiales.length === 0 && (
        <p className="py-6 text-sm text-text-muted">
          Todavía no hay material. Pronto vas a encontrar acá información para vender.
        </p>
      )}

      {!error && materiales.length > 0 && (
        <div className="flex flex-col">
          {materiales.map((material) => (
            <Link
              key={material.id}
              href={`/mi/material/${material.id}`}
              className="flex items-center justify-between gap-3 border-b border-border py-4 hover:bg-border/30"
            >
              <span className="text-sm text-text">{material.titulo}</span>
              <span className="shrink-0 text-text-muted">→</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
