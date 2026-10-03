"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormHeaderDesktop } from "@/components/app/form-header-desktop";
import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { SetFormHeader } from "@/components/page-header-context";
import { TextoMaterial } from "@/components/texto-material";
import type { Material } from "@/lib/data/material";
import { actualizarMaterial, crearMaterial, eliminarMaterial } from "@/lib/material";
import { createClient } from "@/lib/supabase/client";

type MaterialFormProps = {
  /** `null`/`undefined` = modo alta (`/material/nuevo`). Con un material,
   * modo edición (`/material/[id]`) — habilita "Eliminar" y usa `update`
   * en vez de `insert`. */
  material?: Material | null;
  /** Próximo `orden` a asignar en modo alta (cantidad de piezas
   * existentes) — irrelevante en modo edición. */
  siguienteOrden?: number;
};

/**
 * Formulario compartido de alta/edición de "Material de venta"
 *: título, cuerpo (con ayuda de formato y vista previa en
 * vivo con `TextoMaterial`), toggle Publicado, y — solo en edición —
 * "Eliminar" con confirmación en `BottomSheet`. Sin RPC: `insert`/`update`/
 * `delete` directos (`lib/material.ts`), cerrados por RLS.
 *
 * `SetFormHeader` registra el título de la cabecera móvil; `FormHeaderDesktop`
 * (`components/app/form-header-desktop.tsx`) lee esa misma fuente para
 * escritorio, donde esa cabecera no se muestra (mismo patrón que
 * `components/stock/lote-form.tsx`).
 */
export function MaterialForm({ material = null, siguienteOrden = 0 }: MaterialFormProps) {
  const router = useRouter();
  const esEdicion = material !== null;
  const tituloPantalla = esEdicion ? material.titulo : "Nuevo material";

  const [titulo, setTitulo] = useState(material?.titulo ?? "");
  const [cuerpo, setCuerpo] = useState(material?.cuerpo ?? "");
  const [publicado, setPublicado] = useState(material?.publicado ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setError(null);

    if (titulo.trim() === "") {
      setError("Poné un título.");
      return;
    }

    setSaving(true);
    const supabase = createClient();

    const { error: dbError } = esEdicion
      ? await actualizarMaterial(supabase, material.id, {
          titulo: titulo.trim(),
          cuerpo,
          publicado,
        })
      : await crearMaterial(supabase, {
          titulo: titulo.trim(),
          cuerpo,
          orden: siguienteOrden,
          publicado,
        });

    if (dbError) {
      console.error("MaterialForm.handleSubmit", dbError);
      setError("No se pudo guardar el material.");
      setSaving(false);
      return;
    }

    setSaving(false);
    router.push("/material");
    router.refresh();
  }

  async function handleEliminar() {
    if (!material || eliminando) return;
    setEliminando(true);
    setErrorEliminar(null);

    const supabase = createClient();
    const { error: dbError } = await eliminarMaterial(supabase, material.id);

    if (dbError) {
      console.error("MaterialForm.handleEliminar", dbError);
      setErrorEliminar("No se pudo eliminar.");
      setEliminando(false);
      return;
    }

    setEliminando(false);
    setConfirmarEliminar(false);
    router.push("/material");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5 pb-8">
      <SetFormHeader
        title={tituloPantalla}
        backHref="/material"
        backLabel="Volver a material"
      />
      <FormHeaderDesktop />

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <label htmlFor="titulo" className="text-[10px] tracking-[0.18em] text-text-muted uppercase">
            Título
          </label>
          <input
            id="titulo"
            type="text"
            required
            value={titulo}
            onChange={(event) => setTitulo(event.target.value)}
            className="mt-1.5 min-h-12 w-full border border-border bg-surface px-3 text-base text-text focus:border-primary"
          />
        </div>

        <div>
          <label htmlFor="cuerpo" className="text-[10px] tracking-[0.18em] text-text-muted uppercase">
            Cuerpo
          </label>
          <textarea
            id="cuerpo"
            value={cuerpo}
            onChange={(event) => setCuerpo(event.target.value)}
            rows={12}
            className="mt-1.5 w-full border border-border bg-surface px-3 py-2 text-base text-text focus:border-primary"
          />
          <p className="mt-1 text-[11px] text-text-muted">
            Línea en blanco separa párrafos · <code>#&nbsp;</code> subtítulo ·{" "}
            <code>-&nbsp;</code> lista
          </p>
        </div>

        <div>
          <span className="text-[10px] tracking-[0.18em] text-text-muted uppercase">
            Vista previa
          </span>
          <div className="mt-1.5 border border-border bg-surface px-4 py-3">
            {cuerpo.trim() === "" ? (
              <p className="text-sm text-text-muted">
                La vista previa aparece acá a medida que escribís.
              </p>
            ) : (
              <TextoMaterial cuerpo={cuerpo} />
            )}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={publicado}
            onChange={(event) => setPublicado(event.target.checked)}
            className="h-5 w-5 accent-[var(--color-primary)]"
          />
          Publicado
        </label>

        {error && (
          <p role="alert" className="text-sm text-accent">
            {error}
          </p>
        )}

        <BotonAccion
          cargando={saving}
          textoCargando="Guardando…"
          type="submit"
          className="mt-1 flex min-h-[54px] items-center justify-center bg-primary text-[13px] font-medium tracking-[0.16em] text-background uppercase transition-colors hover:bg-primary-hover disabled:opacity-45"
        >
          Guardar
        </BotonAccion>

        {esEdicion && (
          <button
            type="button"
            onClick={() => setConfirmarEliminar(true)}
            className="text-[11px] tracking-[0.14em] text-accent uppercase"
          >
            Eliminar
          </button>
        )}
      </form>

      {esEdicion && (
        <BottomSheet
          open={confirmarEliminar}
          ariaLabel="Borrar este material"
          variant="accent"
        >
          <h2 className="font-display text-[24px] text-primary">¿Borrar este material?</h2>
          <p className="mt-2 text-sm text-text-muted">No se puede deshacer.</p>
          {errorEliminar && (
            <p role="alert" className="mt-3 text-sm text-accent">
              {errorEliminar}
            </p>
          )}
          <div className="mt-5 flex gap-2">
            <BotonAccion
              cargando={eliminando}
              textoCargando="Borrando…"
              type="button"
              onClick={handleEliminar}
              className="min-h-11 flex-[1.6] bg-accent px-4 text-[13px] font-medium tracking-[0.14em] text-background uppercase disabled:opacity-45"
            >
              Sí, borrar
            </BotonAccion>
            <button
              type="button"
              onClick={() => !eliminando && setConfirmarEliminar(false)}
              disabled={eliminando}
              className="min-h-11 flex-1 border border-border px-4 text-[13px] font-medium tracking-[0.14em] text-text-muted uppercase disabled:opacity-45"
            >
              Cancelar
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
