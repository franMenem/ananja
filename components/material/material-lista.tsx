"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { Material } from "@/lib/data/material";
import { moverMaterial } from "@/lib/material";
import { createClient } from "@/lib/supabase/client";

type MaterialListaProps = {
  materiales: Material[];
};

/**
 * Subcomponente client de `/material` (server component) — la lista en sí
 * se renderiza server-side; esto solo maneja "subir"/"bajar" (`moverMaterial`,
 * sin RPC) y el `router.refresh()` posterior para releer desde el server la
 * lista ya reordenada (mismo patrón que `AsignarRolButton` en
 * `/revendedores`).
 */
export function MaterialLista({ materiales }: MaterialListaProps) {
  const router = useRouter();
  const [moviendo, setMoviendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleMover(id: string, direccion: "subir" | "bajar") {
    if (moviendo !== null) return;
    setMoviendo(id);
    setError(null);

    const supabase = createClient();
    const resultado = await moverMaterial(supabase, materiales, id, direccion);
    if (resultado?.error) {
      setError(resultado.error);
    } else {
      router.refresh();
    }
    setMoviendo(null);
  }

  return (
    <>
      {error && (
        <p role="alert" className="mb-4 text-sm text-accent">
          {error}
        </p>
      )}

      <div className="flex flex-col">
        {materiales.map((material, index) => (
          <div
            key={material.id}
            className="flex items-center justify-between gap-3 border-b border-border py-3.5"
          >
            <Link href={`/material/${material.id}`} className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm text-text">{material.titulo}</span>
              <span className="text-[11px] text-text-muted">
                {material.publicado ? "Publicado" : "Borrador"}
              </span>
            </Link>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={() => handleMover(material.id, "subir")}
                disabled={index === 0 || moviendo !== null}
                aria-label={`Subir "${material.titulo}"`}
                className="flex min-h-11 min-w-11 items-center justify-center border border-border text-text disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => handleMover(material.id, "bajar")}
                disabled={index === materiales.length - 1 || moviendo !== null}
                aria-label={`Bajar "${material.titulo}"`}
                className="flex min-h-11 min-w-11 items-center justify-center border border-border text-text disabled:opacity-30"
              >
                ↓
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
