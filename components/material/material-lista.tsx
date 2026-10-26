"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ListaTarjeta } from "@/components/ui/fila";
import { Pastilla } from "@/components/ui/pastilla";
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
        <p role="alert" className="mb-4 text-[16px] text-accent">
          {error}
        </p>
      )}

      <ListaTarjeta>
        {materiales.map((material, index) => (
          <div key={material.id} className="flex items-center gap-2 pr-3">
            <Link
              href={`/material/${material.id}`}
              className="flex min-h-14 min-w-0 flex-1 items-center justify-between gap-3 py-2 pl-4 hover:bg-background"
            >
              <span className="text-[16px] font-semibold break-words text-text">{material.titulo}</span>
              <Pastilla variante={material.publicado ? "ok" : "neutra"}>
                {material.publicado ? "Publicado" : "Borrador"}
              </Pastilla>
            </Link>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={() => handleMover(material.id, "subir")}
                disabled={index === 0 || moviendo !== null}
                aria-label={`Subir "${material.titulo}"`}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[#d0cec8] bg-surface text-[18px] text-text disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => handleMover(material.id, "bajar")}
                disabled={index === materiales.length - 1 || moviendo !== null}
                aria-label={`Bajar "${material.titulo}"`}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[#d0cec8] bg-surface text-[18px] text-text disabled:opacity-30"
              >
                ↓
              </button>
            </div>
          </div>
        ))}
      </ListaTarjeta>
    </>
  );
}
