"use client";

import { BotonAccion } from "@/components/boton-accion";
import { useCerrarSesion } from "@/components/auth/usar-cerrar-sesion";

/** Salida de `/bienvenida` para quien abrió un link que no era para él
 * (o quiere entrar con otra cuenta): cierra la sesión y vuelve a `/login`. */
export function SalirButton({ texto }: { texto: string }) {
  const { cerrarSesion, saliendo } = useCerrarSesion();

  return (
    <BotonAccion
      onClick={cerrarSesion}
      cargando={saliendo}
      textoCargando="Cerrando sesión…"
      className="flex min-h-11 items-center justify-center text-[14px] text-text-muted underline-offset-4 hover:text-primary hover:underline disabled:opacity-45"
    >
      {texto}
    </BotonAccion>
  );
}
