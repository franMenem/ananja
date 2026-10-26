"use client";

import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "@/components/ui/boton";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { BottomSheet } from "@/components/bottom-sheet";
import { traducirErrorRpc } from "@/lib/dominio/errores-rpc";
import { createClient } from "@/lib/supabase/client";

type Coordinador = { id: string; nombre: string };

type EncargadoRevendedorProps = {
  vendedorId: string;
  /** Nombre de la revendedora, para el texto de la confirmación. */
  revendedorNombre: string;
  encargadoActualId: string | null;
  /** Admins y coordinadores activos elegibles (0055 — antes solo admins) —
   * se excluye a la propia persona (un admin con espacio de revendedor no
   * puede ser su propio coordinador, `ENCARGADO_INVALIDO` en
   * `asignar_encargado_revendedor`). */
  coordinadores: Coordinador[];
};

const ERRORES: Record<string, string> = {
  NO_AUTORIZADO: "No tenés permiso para esto.",
  REVENDEDOR_INVALIDO: "Este vendedor ya no es revendedor.",
  ENCARGADO_INVALIDO: "Elegí un admin o coordinador activo distinto de la propia persona.",
};

/**
 * Selector "Coordinador" del detalle de un revendedor (`/revendedores/[id]`)
 * — RPC `asignar_encargado_revendedor` (columna `encargado_id`, sin cambiar
 * de nombre: `supabase/migrations/0037_plata_en_manos.sql`, ampliada a
 * admin/coordinador por `0055_coordinador.sql`, ver memoria "Plata:
 * rediseño"): la persona a la que esta revendedora le rinde siempre.
 *
 * Colapsado por defecto (rediseño "de 10 bloques a 5", 2026-09-16): muestra
 * solo el nombre actual con un link "Cambiar"/"Asignar" — al tocarlo
 * aparece el mismo select de siempre. Elegir otra opción NO guarda: abre
 * una hoja de confirmación. Cambiar el coordinador cambia a quién le rinde
 * la plata de acá en adelante, pero los pagos que la revendedora ya
 * informó quedan con el coordinador anterior
 * (`pagos_revendedor.destinatario_id` se fija al informar). Si se vuelve
 * atrás, el select se cierra y regresa al coordinador actual. Un revendedor
 * puede operar sin coordinador — se lo advierte con un texto fijo, no se lo
 * bloquea.
 */
export function EncargadoRevendedor({
  vendedorId,
  revendedorNombre,
  encargadoActualId,
  coordinadores,
}: EncargadoRevendedorProps) {
  const router = useRouter();
  const actual = encargadoActualId ?? "";
  const [editando, setEditando] = useState(false);
  /** Opción elegida en el select y todavía no confirmada (`null` = nada
   * pendiente, el select muestra el coordinador actual). */
  const [propuesto, setPropuesto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const opciones = coordinadores.filter((a) => a.id !== vendedorId);

  function nombreDe(id: string): string {
    if (!id) return "sin encargado";
    return coordinadores.find((a) => a.id === id)?.nombre ?? "el encargado actual";
  }

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const valor = event.target.value;
    setError(null);
    setPropuesto(valor === actual ? null : valor);
  }

  function cancelar() {
    if (saving) return;
    setPropuesto(null);
    setError(null);
  }

  async function confirmar() {
    if (propuesto === null) return;
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("asignar_encargado_revendedor", {
      p_vendedor_id: vendedorId,
      p_encargado_id: propuesto || undefined,
    });

    if (rpcError) {
      setError(traducirErrorRpc(rpcError.message, ERRORES, "No se pudo guardar. Probá de nuevo."));
      setSaving(false);
      return;
    }

    setSaving(false);
    setPropuesto(null);
    setEditando(false);
    router.refresh();
  }

  const nombreActual = nombreDe(actual);
  const nombreNuevo = propuesto === null ? "" : nombreDe(propuesto);
  const titulo = !actual
    ? `¿Poner a ${nombreNuevo} como encargado de ${revendedorNombre}?`
    : !propuesto
      ? `¿Dejar a ${revendedorNombre} sin encargado?`
      : `¿Cambiar el encargado de ${revendedorNombre} de ${nombreActual} a ${nombreNuevo}?`;

  if (!editando) {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2 text-[15px] text-text-muted">
        {encargadoActualId ? `su encargado es ${nombreActual}` : "no tiene encargado"}
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="inline-flex min-h-11 items-center px-1 font-semibold text-primary underline-offset-2 hover:underline"
        >
          {encargadoActualId ? "Cambiar" : "Asignar"}
        </button>
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="encargado" className="text-[14px] text-text-muted">
        Encargado
      </label>
      <select
        id="encargado"
        value={propuesto ?? actual}
        onChange={handleChange}
        disabled={saving}
        className="min-h-12 w-full max-w-[320px] rounded-xl border border-border bg-surface px-3 text-base text-text focus:border-primary disabled:opacity-60"
      >
        <option value="">Sin encargado</option>
        {opciones.map((a) => (
          <option key={a.id} value={a.id}>
            {a.nombre}
          </option>
        ))}
      </select>
      {!encargadoActualId && <p className="text-[14px] text-text-muted">Todavía no tiene encargado.</p>}
      <button
        type="button"
        onClick={() => setEditando(false)}
        disabled={saving}
        className="inline-flex min-h-11 items-center self-start text-[15px] text-text-muted hover:text-primary"
      >
        Cerrar
      </button>

      <BottomSheet open={propuesto !== null} ariaLabel={titulo}>
        <h2 className="font-display text-[24px] leading-[1.25] text-text">{titulo}</h2>
        <p className="mt-2 text-[16px] text-text-muted">
          {propuesto
            ? `De acá en adelante ${revendedorNombre} le rinde la plata a ${nombreNuevo}.`
            : `${revendedorNombre} va a quedar sin nadie a quien rendirle la plata.`}
        </p>
        {actual && (
          <p className="mt-2 text-[16px] text-text-muted">
            Los pagos que {revendedorNombre} ya le informó a {nombreActual} siguen siendo de {nombreActual}: los
            confirma {nombreActual}.
          </p>
        )}

        {error && (
          <p role="alert" className="mt-3 text-[16px] text-accent">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <BotonAccion
            cargando={saving}
            textoCargando="Guardando…"
            onClick={() => void confirmar()}
            className={`${BOTON_PRIMARIO} flex-[1.6] px-4`}
          >
            {actual ? "Sí, cambiar" : "Sí, confirmar"}
          </BotonAccion>
          <button
            type="button"
            onClick={cancelar}
            disabled={saving}
            className={`${BOTON_SECUNDARIO} flex-1 px-4`}
          >
            Volver
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
