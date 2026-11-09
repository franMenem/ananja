"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { olvidarReenlacePush } from "@/lib/push-client";
import { resetVendedorActualCache } from "@/lib/vendedor-actual";

/**
 * Cierra la sesión y lleva a `/login`. Lo usan todos los botones "Cerrar
 * sesión" (rails, cabecera de `/mi` y la salida de `/bienvenida`);
 * `saliendo` es `true` desde el clic hasta que la navegación toma el
 * relevo, para que el botón muestre el loader y no se pueda tocar dos veces.
 */
export function useCerrarSesion() {
  const router = useRouter();
  const [saliendo, setSaliendo] = useState(false);

  async function cerrarSesion() {
    if (saliendo) return;
    setSaliendo(true);
    try {
      olvidarReenlacePush();
      await createClient().auth.signOut();
      resetVendedorActualCache();
      router.replace("/login");
      router.refresh();
    } catch {
      setSaliendo(false);
    }
  }

  return { cerrarSesion, saliendo };
}
