"use client";

import { useEffect, useMemo, useState } from "react";

import { BotonAccion } from "@/components/boton-accion";
import { listarClientesActivosCompletos, obtenerCliente, type Cliente } from "@/lib/data/clientes";
import { createClient } from "@/lib/supabase/client";

export type { Cliente };

type ClienteSelectProps = {
  value: string | null;
  onChange: (clienteId: string | null, cliente: Cliente | null) => void;
};

/**
 * Selector OPCIONAL de cliente para el formulario de comprobante (US7).
 * Decisión del dueño: el cliente es "en caso de ser necesario" — nunca
 * bloquea guardar. Permite buscar entre los clientes activos o dar de alta
 * uno nuevo con solo el nombre (el resto de la ficha se completa después
 * desde /clientes/[id]).
 */
export function ClienteSelect({ value, onChange }: ClienteSelectProps) {
  const [open, setOpen] = useState(false);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Cliente | null>(null);

  // --- Alta rápida inline -------------------------------------------
  const [creating, setCreating] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [creatingError, setCreatingError] = useState<string | null>(null);
  const [savingNuevo, setSavingNuevo] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function load() {
      setLoading(true);

      const supabase = createClient();
      const { data } = await listarClientesActivosCompletos(supabase);

      if (cancelled) return;
      setClientes(data);
      setLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [open]);

  // Al editar un comprobante que ya tiene cliente asignado, `value` llega
  // con un id pero todavía no tenemos el objeto para mostrar el nombre en
  // el botón — se resuelve una sola vez al montar.
  useEffect(() => {
    if (!value) return;
    let cancelled = false;

    const supabase = createClient();
    obtenerCliente(supabase, value).then((data) => {
      if (cancelled || !data) return;
      setSelected(data);
    });

    return () => {
      cancelled = true;
    };
    // Solo al montar: si el usuario cambia el cliente desde el picker, el
    // estado ya queda actualizado por handleSelect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter((c) => c.nombre.toLowerCase().includes(q));
  }, [clientes, query]);

  function handleSelect(cliente: Cliente | null) {
    setSelected(cliente);
    onChange(cliente?.id ?? null, cliente);
    setOpen(false);
    setQuery("");
    setCreating(false);
    setNuevoNombre("");
    setCreatingError(null);
  }

  async function handleCrearCliente() {
    const nombre = nuevoNombre.trim();
    if (!nombre) {
      setCreatingError("Ingresá un nombre.");
      return;
    }

    setSavingNuevo(true);
    setCreatingError(null);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("clientes")
      .insert({ nombre })
      .select("*")
      .single();

    setSavingNuevo(false);

    if (error || !data) {
      setCreatingError("No se pudo crear el cliente. Probá de nuevo.");
      return;
    }

    setClientes((prev) =>
      [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    );
    handleSelect(data);
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] tracking-[0.18em] text-text-muted uppercase">
        Cliente (opcional)
      </span>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-11 items-center justify-between border border-border bg-surface px-3.5 text-base text-text"
      >
        <span className={selected ? "text-text" : "text-text-muted"}>
          {selected ? selected.nombre : "Sin cliente"}
        </span>
        <span className="text-xs font-medium tracking-[0.1em] text-primary uppercase">
          {selected ? "Cambiar" : "Elegir"}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Elegir cliente"
          className="fixed inset-0 z-50 flex items-end justify-center bg-scrim px-0 sm:items-center sm:px-4"
        >
          <div className="paper-texture flex max-h-[80dvh] w-full flex-col gap-3 border-t-2 border-mark px-5 py-[22px] sm:max-w-sm sm:border-t-2">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-[22px] text-primary">
                Elegir cliente
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[11px] tracking-[0.14em] text-text-muted uppercase"
              >
                Cerrar
              </button>
            </div>

            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar cliente…"
              autoFocus
              className="min-h-11 border border-border bg-surface px-3.5 text-base text-text focus:border-primary"
            />

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
              <button
                type="button"
                onClick={() => handleSelect(null)}
                className="flex min-h-11 items-center border-b border-border px-1 text-left text-sm text-text hover:bg-surface-raised"
              >
                Sin cliente
              </button>

              {loading ? (
                <p className="px-1 py-3 text-sm text-text-muted">Cargando…</p>
              ) : filtered.length === 0 ? (
                <p className="px-1 py-3 text-sm text-text-muted">
                  No hay clientes que coincidan.
                </p>
              ) : (
                filtered.map((cliente) => (
                  <button
                    key={cliente.id}
                    type="button"
                    onClick={() => handleSelect(cliente)}
                    className="flex min-h-11 items-center border-b border-border px-1 text-left text-sm text-text hover:bg-surface-raised"
                  >
                    {cliente.nombre}
                  </button>
                ))
              )}
            </div>

            <div className="pt-1">
              {!creating ? (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="min-h-11 w-full border border-border px-3 text-xs font-medium tracking-[0.1em] text-primary uppercase"
                >
                  + Nuevo cliente
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    value={nuevoNombre}
                    onChange={(event) => setNuevoNombre(event.target.value)}
                    placeholder="Nombre o empresa"
                    autoFocus
                    className="min-h-11 border border-border bg-surface px-3.5 text-base text-text focus:border-primary"
                  />
                  {creatingError && (
                    <p role="alert" className="text-xs text-accent">
                      {creatingError}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCreating(false);
                        setNuevoNombre("");
                        setCreatingError(null);
                      }}
                      className="min-h-11 flex-1 border border-border px-3 text-xs font-medium tracking-[0.1em] text-text uppercase"
                    >
                      Cancelar
                    </button>
                    <BotonAccion
                      cargando={savingNuevo}
                      textoCargando="Creando…"
                      type="button"
                      onClick={() => void handleCrearCliente()}
                      className="min-h-11 flex-1 bg-primary px-3 text-xs font-medium tracking-[0.1em] text-background uppercase disabled:opacity-45"
                    >
                      Crear y usar
                    </BotonAccion>
                  </div>
                  <p className="text-xs text-text-muted">
                    El resto de los datos del cliente se puede completar
                    después desde su ficha.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
