import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import { PasswordForm } from "@/components/auth/password-form";
import { SalirButton } from "@/components/auth/salir-button";
import { destinoPorRol, flagCuentaActivo, FLAG_BIENVENIDA } from "@/lib/dominio/invitaciones";
import { NEGOCIO } from "@/lib/negocio";
import { obtenerVendedorPorUserId } from "@/lib/rol-vendedor";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * `/bienvenida` — primer acceso desde una invitación por email
 * (`/auth/confirm?type=invite` ya dejó la sesión iniciada). Saluda por
 * nombre y pide elegir la contraseña; después va al shell que le toca
 * (revendedora → `/mi`, admin → `/`).
 *
 * Mientras el flag de bienvenida siga en `true`, el proxy manda cualquier
 * ruta acá (`lib/supabase/middleware.ts`). Si alguien llega sin el flag
 * (ya eligió su contraseña), se lo manda directo a su shell.
 */
export default async function BienvenidaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?aviso=link");

  const vendedor = await obtenerVendedorPorUserId(supabase, user.id);
  const destino = destinoPorRol(vendedor);

  if (!flagCuentaActivo(user.app_metadata, user.user_metadata, FLAG_BIENVENIDA)) {
    redirect(destino);
  }

  const displayName =
    typeof user.user_metadata?.display_name === "string" ? user.user_metadata.display_name : "";
  const nombre = (vendedor?.nombre ?? displayName).trim().split(" ")[0];

  return (
    <AuthShell tagline={`${nombre ? `Hola, ${nombre}.` : "Hola."} Te damos la bienvenida a ${NEGOCIO.nombre}.`}>
      <div className="mb-6 flex flex-col gap-2">
        <h1 className="font-display text-[30px] leading-[1.1] text-primary">Elegí tu contraseña</h1>
        <p className="text-sm text-text-muted">
          Con tu email{user.email ? ` (${user.email})` : ""} y esta contraseña vas a entrar a la app
          desde cualquier celular o computadora.
        </p>
      </div>
      <PasswordForm etiqueta="Tu contraseña" textoBoton="Guardar y entrar" destino={destino} />
      <div className="mt-4 flex justify-center">
        <SalirButton texto={nombre ? `No soy ${nombre} · Cerrar sesión` : "No soy yo · Cerrar sesión"} />
      </div>
    </AuthShell>
  );
}
