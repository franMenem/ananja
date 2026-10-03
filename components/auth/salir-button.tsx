"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { resetVendedorActualCache } from "@/lib/vendedor-actual";

/** Salida de `/bienvenida` para quien abrió un link que no era para él
 * (o quiere entrar con otra cuenta): cierra la sesión y vuelve a `/login`. */
export function SalirButton({ texto }: { texto: string }) {
  const router = useRouter();
  const [saliendo, setSaliendo] = useState(false);

  async function salir() {
    setSaliendo(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    resetVendedorActualCache();
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={salir}
      disabled={saliendo}
      className="flex min-h-11 items-center justify-center text-[12px] tracking-[0.12em] text-text-muted underline-offset-4 hover:text-primary hover:underline disabled:opacity-45"
    >
      {saliendo ? "Cerrando sesión…" : texto}
    </button>
  );
}
