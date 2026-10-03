import { redirect } from "next/navigation";

import { FormPage } from "@/components/app/form-page";
import { AltaForm } from "@/components/invitaciones/alta-form";
import { InvitacionesPendientes } from "@/components/invitaciones/invitaciones-pendientes";
import { listarEncargadosPosibles } from "@/lib/data/revendedores";
import type { InvitacionPendiente } from "@/lib/dominio/invitaciones";
import { exigirAdmin, listarInvitacionesPendientes } from "@/lib/invitaciones-server";
import { createAdminClient, ServiceRoleNoConfigurada } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * `/revendedores/invitar` — "Sumar persona" (solo admins): alta de una
 * revendedora o un admin sin pasar por el dashboard de Supabase, con
 * contraseña temporal (sin mail) o invitación por mail. El rol queda
 * asignado en el momento, así que la persona aparece enseguida en
 * `/revendedores` (no en Pendientes). Abajo, las invitaciones por mail que
 * todavía no terminaron y las cuentas con contraseña temporal que nunca se
 * usaron (para poder cancelar una creada por error).
 *
 * Toda la lógica con la service role vive en server actions
 * (`./actions.ts`) y `lib/invitaciones-server.ts`; esta página solo pasa
 * datos serializables a los Client Components.
 */
export default async function InvitarPage() {
  const caller = await exigirAdmin();
  if (!caller) redirect("/");

  const supabase = await createClient();
  // Opciones de "Coordinador" para una revendedora nueva: admins Y
  // coordinadores activos (0055 — antes solo admins podían ser encargado).
  const { data: coordinadores } = await listarEncargadosPosibles(supabase);

  let invitaciones: InvitacionPendiente[] = [];
  let servicio: "ok" | "sin_clave" | "error" = "ok";
  try {
    invitaciones = await listarInvitacionesPendientes(createAdminClient());
  } catch (error) {
    servicio = error instanceof ServiceRoleNoConfigurada ? "sin_clave" : "error";
    if (servicio === "error") console.error("listarInvitacionesPendientes", (error as { code?: string }).code);
  }

  return (
    <FormPage
      title="Sumar persona"
      backHref="/revendedores"
      backLabel="Volver a revendedores"
      gap={8}
      pb
    >
      {servicio === "sin_clave" && (
        <p role="alert" className="border-l-2 border-accent pl-3 text-sm text-accent">
          Falta configurar la clave SUPABASE_SERVICE_ROLE_KEY en Vercel: sin ella la app no puede crear
          cuentas.
        </p>
      )}

      <AltaForm coordinadores={coordinadores ?? []} />

      <section className="flex flex-col gap-3">
        <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
          Pendientes de entrar
        </span>
        {servicio === "error" ? (
          <p className="text-sm text-accent">No se pudieron cargar las invitaciones. Recargá la página.</p>
        ) : (
          <InvitacionesPendientes invitaciones={invitaciones} />
        )}
      </section>
    </FormPage>
  );
}
