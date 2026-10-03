"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import { BotonAccion } from "@/components/boton-accion";
import { NEGOCIO } from "@/lib/negocio";
import { createClient } from "@/lib/supabase/client";

type SinAccesoContentProps = {
  /** `true` si el usuario tiene fila con `rol = 'pendiente'` (alta
   * automática sin aprobar todavía) en vez de estar desactivado — ver
   * `0026_roles_pendiente_espacio_revendedor.sql` y
   * `app/(auth)/sin-acceso/page.tsx`. */
  pendiente: boolean;
};

/**
 * Contenido de `/sin-acceso` — separado de la página (server component,
 * `app/(auth)/sin-acceso/page.tsx`) porque el botón "Cerrar sesión"
 * necesita `useState`/`useRouter`/el cliente de Supabase del browser.
 */
export function SinAccesoContent({ pendiente }: SinAccesoContentProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleCerrarSesion() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <AuthShell
      tagline={
        pendiente
          ? "Tu cuenta está esperando aprobación."
          : "Tu usuario está desactivado."
      }
    >
      <div className="flex flex-col gap-5">
        <span className="text-[10px] tracking-[0.22em] text-text-muted uppercase">
          Sin acceso
        </span>
        <p className="text-sm text-text">
          {pendiente
            ? "Tu cuenta está esperando aprobación. Avisale a un admin para que te habilite."
            : `Tu usuario está desactivado. Hablá con ${NEGOCIO.nombre}.`}
        </p>
        <BotonAccion
          cargando={loading}
          textoCargando="Cerrando sesión…"
          type="button"
          onClick={() => void handleCerrarSesion()}
          className="mt-1 flex min-h-[54px] items-center justify-center bg-primary text-[13px] font-medium tracking-[0.16em] text-background uppercase transition-colors hover:bg-primary-hover disabled:opacity-45"
        >
          Cerrar sesión
        </BotonAccion>
      </div>
    </AuthShell>
  );
}
