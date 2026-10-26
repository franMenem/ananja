"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { AccionesForm } from "@/components/ui/acciones-form";
import { AreaTexto, Campo, Entrada, MensajeError } from "@/components/ui/campo";
import { MasDatos, SeccionForm } from "@/components/ui/seccion-form";
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
      <SeccionForm titulo="¿Quién es?">
        <Campo id="cliente-nombre" etiqueta="Nombre o empresa">
          <Entrada
            type="text"
            required
            value={nombre}
            onChange={(event) => setNombre(event.target.value)}
            placeholder="Ej: Almacén San José"
          />
        </Campo>

        <Campo id="cliente-telefono" etiqueta="Teléfono" opcional>
          <Entrada
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={telefono}
            onChange={(event) => setTelefono(event.target.value)}
          />
        </Campo>
      </SeccionForm>

      <MasDatos abierto={direccion.trim() !== "" || email.trim() !== "" || nota.trim() !== ""}>
        <Campo id="cliente-direccion" etiqueta="Dirección" opcional>
          <Entrada
            type="text"
            autoComplete="street-address"
            value={direccion}
            onChange={(event) => setDireccion(event.target.value)}
          />
        </Campo>

        <Campo id="cliente-email" etiqueta="Email" opcional>
          <Entrada
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Campo>

        <Campo id="cliente-nota" etiqueta="Nota" opcional>
          <AreaTexto value={nota} onChange={(event) => setNota(event.target.value)} rows={3} />
        </Campo>
      </MasDatos>

      {formError && <MensajeError>{formError}</MensajeError>}

      <AccionesForm
        etiqueta="Guardar cliente"
        cargando={submitting}
        cancelarHref={mode === "editar" && clienteId ? `/clientes/${clienteId}` : "/clientes"}
      />
    </form>
  );
}
