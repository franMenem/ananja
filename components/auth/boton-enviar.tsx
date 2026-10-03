"use client";

import { useFormStatus } from "react-dom";

/** Botón principal de un `<form action={serverAction}>` de las pantallas
 * de auth, deshabilitado mientras se envía (evita doble envío). */
export function BotonEnviar({ texto, textoEnviando }: { texto: string; textoEnviando: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 flex min-h-[54px] items-center justify-center bg-primary text-[13px] font-medium tracking-[0.16em] text-background uppercase transition-colors hover:bg-primary-hover disabled:opacity-45"
    >
      {pending ? textoEnviando : texto}
    </button>
  );
}
