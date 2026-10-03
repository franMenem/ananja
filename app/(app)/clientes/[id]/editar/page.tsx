import { notFound } from "next/navigation";

import { FormPage } from "@/components/app/form-page";
import { ClienteForm } from "@/components/cliente-form";
import { obtenerCliente } from "@/lib/data/clientes";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EditarClientePage({
  params,
}: PageProps<"/clientes/[id]/editar">) {
  const { id } = await params;
  const supabase = await createClient();

  const cliente = await obtenerCliente(supabase, id);

  if (!cliente) notFound();

  return (
    <FormPage
      title="Editar cliente"
      backHref={`/clientes/${cliente.id}`}
      backLabel="Volver al cliente"
    >
      <ClienteForm
        mode="editar"
        clienteId={cliente.id}
        initial={{
          nombre: cliente.nombre,
          telefono: cliente.telefono,
          direccion: cliente.direccion,
          email: cliente.email,
          nota: cliente.nota,
        }}
      />
    </FormPage>
  );
}
