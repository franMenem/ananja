"use client";

import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "@/components/ui/boton";
import { useMemo, useState } from "react";

import { CLASE_ETIQUETA, MensajeError } from "@/components/ui/campo";
import { BotonAccion } from "@/components/boton-accion";
import { AvisoCarga } from "@/components/ui/aviso-carga";
import { useCarga } from "@/components/ui/use-carga";
import { listarCategoriasActivas, obtenerCategoria, type CategoriaGasto } from "@/lib/data/gastos";
import { createClient } from "@/lib/supabase/client";

const NUEVA_VALUE = "__nueva__";

type CategoriaSelectProps = {
  /** Id de la categoría seleccionada, o `null` si todavía no hay selección. */
  value: string | null;
  /** Se llama con el id de la categoría elegida (o recién creada). */
  onChange: (categoriaId: string) => void;
  className?: string;
};

/**
 * Selector de categoría de gasto con alta rápida inline ("+ Nueva
 * categoría").
 *
 * `categorias_gasto` permite insert/update directo desde el cliente (ver
 * contracts/database.md), por eso el alta se hace acá sin pasar por RPC.
 */
export function CategoriaSelect({
  value,
  onChange,
  className,
}: CategoriaSelectProps) {
  // Categorías dadas de alta desde este selector (se suman a la lista cargada).
  const [nuevas, setNuevas] = useState<CategoriaGasto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  // Un fallo de la lista no se confunde con "no hay categorías": en el lugar
  // del select se avisa y se puede reintentar, sin trabar el resto del form.
  const { estado: carga, reintentar } = useCarga(async () => {
    const supabase = createClient();
    const { data, error: fetchError } = await listarCategoriasActivas(supabase);
    if (fetchError) return { data, error: "No se pudo cargar la lista de categorías." };
    let list = data;
    // Si la categoría actual (ej. en edición) ya no está activa, la
    // agregamos igual para no perderla de la lista.
    if (value && !list.some((c) => c.id === value)) {
      const current = await obtenerCategoria(supabase, value);
      if (current) list = [...list, current];
    }
    return { data: list, error: null };
  });
  const loading = carga.tipo === "cargando";
  const categorias = useMemo(() => {
    const base = carga.tipo === "listo" ? carga.datos : [];
    const ids = new Set(base.map((c) => c.id));
    return [...base, ...nuevas.filter((c) => !ids.has(c.id))].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [carga, nuevas]);

  function handleSelect(id: string) {
    if (id === NUEVA_VALUE) {
      setAdding(true);
      return;
    }
    onChange(id);
  }

  async function handleAdd() {
    const nombre = newName.trim();
    if (!nombre) return;

    setSaving(true);
    setError(null);

    const supabase = createClient();
    const { data, error: insertError } = await supabase.rpc("crear_categoria_gasto", { p_nombre: nombre });

    setSaving(false);

    if (insertError || !data) {
      setError("No se pudo agregar la categoría.");
      return;
    }

    setNuevas((prev) => [...prev, data]);
    setNewName("");
    setAdding(false);
    onChange(data.id);
  }

  return (
    <div className={className}>
      <label htmlFor="categoria-select" className={CLASE_ETIQUETA}>
        Categoría
      </label>

      {carga.tipo === "error" && !adding ? (
        <div className="mt-1.5">
          <AvisoCarga mensaje={carga.mensaje} onReintentar={reintentar} />
        </div>
      ) : !adding ? (
        <select
          id="categoria-select"
          required
          disabled={loading}
          value={value ?? ""}
          onChange={(event) => handleSelect(event.target.value)}
          className="mt-1.5 min-h-12 w-full border border-[#d0cec8] bg-surface px-3 text-[16px] text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60 rounded-xl"
        >
          <option value="" disabled>
            {loading ? "Cargando…" : "Seleccioná una categoría"}
          </option>
          {categorias.map((categoria) => (
            <option key={categoria.id} value={categoria.id}>
              {categoria.nombre}
            </option>
          ))}
          <option value={NUEVA_VALUE}>+ Nueva categoría</option>
        </select>
      ) : (
        <div className="mt-1.5 flex flex-wrap gap-2">
          <input
            autoFocus
            type="text"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Nombre de la categoría"
            className="min-h-12 min-w-0 flex-1 border border-[#d0cec8] bg-surface px-3 text-[16px] text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 rounded-xl"
          />
          <BotonAccion
            cargando={saving}
            textoCargando="Guardando…"
            type="button"
            onClick={handleAdd}
            disabled={!newName.trim()}
            className={`${BOTON_PRIMARIO} px-3 disabled:opacity-60`}
          >
            Agregar
          </BotonAccion>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setNewName("");
            }}
            className={`${BOTON_SECUNDARIO} px-3`}
          >
            Cancelar
          </button>
        </div>
      )}

      {error && (
        <div className="mt-1.5">
          <MensajeError>{error}</MensajeError>
        </div>
      )}
    </div>
  );
}
