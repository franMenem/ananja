"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { BotonAccion } from "@/components/boton-accion";
import { createClient } from "@/lib/supabase/client";

export type ClienteFormInitial = {
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  email: string | null;
  nota: string | null;
};

type ClienteFormProps = {
  mode: "crear" | "editar";
  clienteId?: string;
  initial?: ClienteFormInitial;
};

/**
 * Ficha de cliente (US7). Único campo obligatorio: nombre (persona o
 * empresa) — decisión del dueño. El resto (teléfono, dirección, email,
 * nota) es opcional y se puede completar en cualquier momento.
 */
export function ClienteForm({ mode, clienteId, initial }: ClienteFormProps) {
  const router = useRouter();

  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [telefono, setTelefono] = useState(initial?.telefono ?? "");
  const [direccion, setDireccion] = useState(initial?.direccion ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [nota, setNota] = useState(initial?.nota ?? "");

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const nombreTrim = nombre.trim();
    if (!nombreTrim) {
      setFormError("Ingresá el nombre o la empresa del cliente.");
      return;
    }

    setSubmitting(true);

    const supabase = createClient();
    const payload = {
      nombre: nombreTrim,
      telefono: telefono.trim() || null,
      direccion: direccion.trim() || null,
      email: email.trim() || null,
      nota: nota.trim() || null,
    };

    const { data, error } =
      mode === "crear"
        ? await supabase.from("clientes").insert(payload).select("id").single()
        : await supabase
            .from("clientes")
            .update(payload)
            .eq("id", clienteId!)
            .select("id")
            .single();

    setSubmitting(false);

    if (error || !data) {
      setFormError("No se pudo guardar. Probá de nuevo.");
      return;
    }

    router.push(`/clientes/${data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 pb-8">
      <div className="flex flex-col gap-2">
        <label
          htmlFor="cliente-nombre"
          className="text-[10px] tracking-[0.18em] text-text-muted uppercase"
        >
          Nombre o empresa
        </label>
        <input
          id="cliente-nombre"
          type="text"
          required
          value={nombre}
          onChange={(event) => setNombre(event.target.value)}
          placeholder="Ej: Almacén San José"
          className="min-h-11 border border-border bg-surface px-3.5 text-base text-text focus:border-primary"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="cliente-telefono"
          className="text-[10px] tracking-[0.18em] text-text-muted uppercase"
        >
          Teléfono (opcional)
        </label>
        <input
          id="cliente-telefono"
          type="tel"
          value={telefono}
          onChange={(event) => setTelefono(event.target.value)}
          className="min-h-11 border border-border bg-surface px-3.5 text-base text-text focus:border-primary"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="cliente-direccion"
          className="text-[10px] tracking-[0.18em] text-text-muted uppercase"
        >
          Dirección (opcional)
        </label>
        <input
          id="cliente-direccion"
          type="text"
          value={direccion}
          onChange={(event) => setDireccion(event.target.value)}
          className="min-h-11 border border-border bg-surface px-3.5 text-base text-text focus:border-primary"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="cliente-email"
          className="text-[10px] tracking-[0.18em] text-text-muted uppercase"
        >
          Email (opcional)
        </label>
        <input
          id="cliente-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="min-h-11 border border-border bg-surface px-3.5 text-base text-text focus:border-primary"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="cliente-nota"
          className="text-[10px] tracking-[0.18em] text-text-muted uppercase"
        >
          Nota (opcional)
        </label>
        <textarea
          id="cliente-nota"
          value={nota}
          onChange={(event) => setNota(event.target.value)}
          rows={3}
          className="border border-border bg-surface px-3.5 py-2.5 text-base text-text focus:border-primary"
        />
      </div>

      {formError && (
        <p role="alert" className="text-xs text-accent">
          {formError}
        </p>
      )}

      <BotonAccion
        cargando={submitting}
        textoCargando="Guardando…"
        type="submit"
        className="min-h-14 bg-primary text-[13px] font-medium tracking-[0.14em] text-background uppercase transition-colors hover:bg-primary-hover disabled:opacity-45"
      >
        Guardar cliente
      </BotonAccion>
    </form>
  );
}
