"use client";

import { useFormStatus } from "react-dom";

import { BotonAccion } from "@/components/boton-accion";

/** Botón principal de un `<form action={serverAction}>` de las pantallas
 * de auth, con loader y deshabilitado mientras se envía (evita doble envío). */
export function BotonEnviar({ texto, textoEnviando }: { texto: string; textoEnviando: string }) {
  const { pending } = useFormStatus();

  return (
    <BotonAccion
      type="submit"
      cargando={pending}
      textoCargando={textoEnviando}
      className="mt-1 flex min-h-[54px] items-center justify-center bg-primary text-[16px] font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-45"
    >
      {texto}
    </BotonAccion>
  );
}
