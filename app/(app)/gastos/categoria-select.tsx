"use client";

import { useEffect, useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
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
  const [categorias, setCategorias] = useState<CategoriaGasto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const supabase = createClient();
      const { data, error: fetchError } = await listarCategoriasActivas(supabase);

      if (cancelled) return;

      let list = data;

      // Si la categoría actual (ej. en edición) ya no está activa, la
      // agregamos igual para no perderla de la lista.
      if (value && !list.some((c) => c.id === value)) {
        const current = await obtenerCategoria(supabase, value);
        if (current) {
          list = [...list, current].sort((a, b) =>
            a.nombre.localeCompare(b.nombre),
          );
        }
      }

      if (cancelled) return;

      if (fetchError) {
        setError("No se pudo cargar la lista de categorías.");
        setLoading(false);
        return;
      }

      setCategorias(list);
      setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const { data, error: insertError } = await supabase
      .from("categorias_gasto")
      .insert({ nombre })
      .select()
      .single();

    setSaving(false);

    if (insertError || !data) {
      setError("No se pudo agregar la categoría.");
      return;
    }

    setCategorias((prev) =>
      [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    );
    setNewName("");
    setAdding(false);
    onChange(data.id);
  }

  return (
    <div className={className}>
      <label
        htmlFor="categoria-select"
        className="text-[10px] tracking-[0.18em] text-text-muted uppercase"
      >
        Categoría
      </label>

      {!adding ? (
        <select
          id="categoria-select"
          required
          disabled={loading}
          value={value ?? ""}
          onChange={(event) => handleSelect(event.target.value)}
          className="mt-1.5 min-h-12 w-full border border-border bg-surface px-3 text-base text-text focus:border-primary disabled:opacity-60"
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
        <div className="mt-1.5 flex gap-2">
          <input
            autoFocus
            type="text"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Nombre de la categoría"
            className="min-h-12 flex-1 border border-border bg-surface px-3 text-base text-text focus:border-primary"
          />
          <BotonAccion
            cargando={saving}
            textoCargando="Guardando…"
            type="button"
            onClick={handleAdd}
            disabled={!newName.trim()}
            className="min-h-12 bg-primary px-3 text-[13px] font-medium tracking-[0.1em] text-background uppercase transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            Agregar
          </BotonAccion>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setNewName("");
            }}
            className="min-h-12 border border-border px-3 text-[13px] font-medium text-text-muted uppercase"
          >
            Cancelar
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-1 text-sm text-accent">
          {error}
        </p>
      )}
    </div>
  );
}
