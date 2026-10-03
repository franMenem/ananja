import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import { PasswordForm } from "@/components/auth/password-form";
import { destinoPorRol, flagCuentaActivo, FLAG_MUST_CHANGE_PASSWORD } from "@/lib/dominio/invitaciones";
import { obtenerVendedorPorUserId } from "@/lib/rol-vendedor";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * `/cambiar-password` — tres entradas, mismo formulario (`PasswordForm`):
 *  1. Contraseña temporal (`FLAG_MUST_CHANGE_PASSWORD`, alta a mano o
 *     "crear cuenta con contraseña temporal" en `/revendedores/invitar`):
 *     el proxy fuerza esta pantalla.
 *  2. Link de recuperación ("¿Olvidaste tu contraseña?" →
 *     `/auth/confirm?type=recovery` deja la sesión y redirige acá).
 *  3. Cambio voluntario (link discreto al pie de /tareas, antes en
 *     /notificaciones — pantalla retirada 2026-09-16).
 * Después de guardar va al shell que le toca por rol (revendedora → `/mi`,
 * admin → `/`).
 */
export default async function CambiarPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const vendedor = await obtenerVendedorPorUserId(supabase, user.id);
  const temporal = flagCuentaActivo(user.app_metadata, user.user_metadata, FLAG_MUST_CHANGE_PASSWORD);

  return (
    <AuthShell
      tagline={
        temporal ? "Antes de empezar, definí una contraseña propia." : "Elegí una contraseña nueva."
      }
    >
      <PasswordForm
        etiqueta="Contraseña nueva"
        textoBoton="Guardar contraseña"
        destino={destinoPorRol(vendedor)}
      />
    </AuthShell>
  );
}
