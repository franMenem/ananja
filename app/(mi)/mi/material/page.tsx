import Link from "next/link";

import { EncabezadoPantalla } from "@/components/ui/encabezado-pantalla";
import { ListaTarjeta } from "@/components/ui/fila";
import { Tarjeta } from "@/components/ui/tarjeta";
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
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5 pb-8">
      <EncabezadoPantalla titulo="Material" pregunta="¿Qué podés mostrar a tus clientes?" />

      {error && (
        <p role="alert" className="text-[16px] text-accent">
          {error}
        </p>
      )}

      {!error && materiales.length === 0 && (
        <Tarjeta>
          <p className="text-[16px] text-text-muted">
            Todavía no hay material. Pronto vas a encontrar acá información para vender.
          </p>
        </Tarjeta>
      )}

      {!error && materiales.length > 0 && (
        <ListaTarjeta>
          {materiales.map((material) => (
            <Link
              prefetch={false}
              key={material.id}
              href={`/mi/material/${material.id}`}
              className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-background"
            >
              <span className="min-w-0 break-words text-[16px] font-semibold text-text">{material.titulo}</span>
              <span aria-hidden="true" className="shrink-0 text-[20px] text-text-muted">
                ›
              </span>
            </Link>
          ))}
        </ListaTarjeta>
      )}
    </div>
  );
}
