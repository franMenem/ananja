"use client";

import { BOTON_SECUNDARIO } from "@/components/ui/boton";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormHeaderDesktop } from "@/components/app/form-header-desktop";
import { BotonAccion } from "@/components/boton-accion";
import { AccionesForm } from "@/components/ui/acciones-form";
import { AreaTexto, Campo, Entrada, MensajeError } from "@/components/ui/campo";
import { SeccionForm } from "@/components/ui/seccion-form";
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
  const tituloPantalla = esEdicion ? material.titulo : "Agregar material";

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

      <p className="-mt-2 text-[15px] text-text-muted">
        {esEdicion ? "¿Qué querés cambiar de este material?" : "¿Qué querés que lean las revendedoras?"}
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <SeccionForm titulo="El mensaje">
          <Campo id="titulo" etiqueta="Título">
            <Entrada type="text" required value={titulo} onChange={(event) => setTitulo(event.target.value)} />
          </Campo>

          <Campo
            id="cuerpo"
            etiqueta="Cuerpo"
            ayuda={
              <>
                Línea en blanco separa párrafos · <code>#&nbsp;</code> subtítulo ·{" "}
                <code>-&nbsp;</code> lista
              </>
            }
          >
            <AreaTexto value={cuerpo} onChange={(event) => setCuerpo(event.target.value)} rows={12} />
          </Campo>
        </SeccionForm>

        <SeccionForm titulo="Así se va a ver">
          <div className="rounded-xl border border-border bg-background px-4 py-3">
            {cuerpo.trim() === "" ? (
              <p className="text-[16px] text-text-muted">
                La vista previa aparece acá a medida que escribís.
              </p>
            ) : (
              <TextoMaterial cuerpo={cuerpo} />
            )}
          </div>
        </SeccionForm>

        <SeccionForm titulo="¿Lo ven las revendedoras?">
          <label className="flex min-h-11 items-center gap-3 text-[16px] text-text">
            <input
              type="checkbox"
              checked={publicado}
              onChange={(event) => setPublicado(event.target.checked)}
              className="h-5 w-5 shrink-0 accent-[var(--color-primary)]"
            />
            Publicado
          </label>
          <p className="-mt-2 text-[14px] leading-snug text-text-muted">
            Sin publicar queda guardado, pero ninguna revendedora lo ve.
          </p>
        </SeccionForm>

        {error && <MensajeError>{error}</MensajeError>}

        <AccionesForm etiqueta="Guardar material" cargando={saving} cancelarHref="/material" fija />

        {esEdicion && (
          <button
            type="button"
            onClick={() => setConfirmarEliminar(true)}
            className="min-h-12 self-center px-4 text-[15px] font-semibold text-accent"
          >
            Eliminar este material
          </button>
        )}
      </form>

      {esEdicion && (
        <BottomSheet
          open={confirmarEliminar}
          ariaLabel="Borrar este material"
          variant="accent"
        >
          <h2 className="font-display text-[24px] text-text">¿Borrar este material?</h2>
          <p className="mt-2 text-[16px] text-text-muted">No se puede deshacer.</p>
          {errorEliminar && (
            <p role="alert" className="mt-3 text-[16px] text-accent">
              {errorEliminar}
            </p>
          )}
          <div className="mt-5 flex gap-2">
            <BotonAccion
              cargando={eliminando}
              textoCargando="Borrando…"
              type="button"
              onClick={handleEliminar}
              className="min-h-11 flex-[1.6] bg-accent px-4 text-[16px] font-medium text-primary-foreground disabled:opacity-45"
            >
              Sí, borrar
            </BotonAccion>
            <button
              type="button"
              onClick={() => !eliminando && setConfirmarEliminar(false)}
              disabled={eliminando}
              className={`${BOTON_SECUNDARIO} flex-1 px-4`}
            >
              Cancelar
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
