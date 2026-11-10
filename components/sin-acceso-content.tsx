"use client";

import { AuthShell } from "@/components/auth-shell";
import { BotonAccion } from "@/components/boton-accion";
import { useCerrarSesion } from "@/components/auth/usar-cerrar-sesion";
import { NEGOCIO } from "@/lib/negocio";

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
 * necesita el cliente de Supabase del browser (vía `useCerrarSesion`).
 */
export function SinAccesoContent({ pendiente }: SinAccesoContentProps) {
  const { cerrarSesion, saliendo } = useCerrarSesion();

  return (
    <AuthShell
      tagline={
        pendiente
          ? "Tu cuenta está esperando aprobación."
          : "Tu usuario está desactivado."
      }
    >
      <div className="flex flex-col gap-5">
        <span className="text-[13px] text-text-muted">
          Sin acceso
        </span>
        <p className="text-[16px] text-text">
          {pendiente
            ? "Tu cuenta está esperando aprobación. Avisale a un admin para que te habilite."
            : `Tu usuario está desactivado. Hablá con ${NEGOCIO.nombre}.`}
        </p>
        <BotonAccion
          cargando={saliendo}
          textoCargando="Cerrando sesión…"
          type="button"
          onClick={() => void cerrarSesion()}
          className="mt-1 flex min-h-[54px] items-center justify-center bg-primary text-[16px] font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-45"
        >
          Cerrar sesión
        </BotonAccion>
      </div>
    </AuthShell>
  );
}
