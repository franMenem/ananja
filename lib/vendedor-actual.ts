"use client";

import { useEffect, useState } from "react";

import { obtenerVendedorPorUserId } from "@/lib/rol-vendedor";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/types";

export type VendedorActual = Tables<"vendedores">;

/**
 * Vendedor vinculado al usuario de Supabase Auth logueado (cuentas
 * individuales — ver supabase/migrations/0007_vendedores_auth.sql). Ya no
 * hay selector: toda operación de escritura se atribuye automáticamente al
 * usuario de la sesión, resuelto también del lado del servidor (RPCs /
 * trigger de movimientos_stock) vía `auth.uid()`. Este helper es solo para
 * mostrarle al usuario "Registrando como {nombre}" en los formularios.
 *
 * Se cachea en memoria por sesión de la pestaña (no cambia mientras dura).
 */
let vendedorActualPromise: Promise<VendedorActual | null> | null = null;

function fetchVendedorActual(): Promise<VendedorActual | null> {
  if (!vendedorActualPromise) {
    vendedorActualPromise = (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;

      // Misma consulta que `lib/supabase/middleware.ts` y
      // `lib/revendedores.ts` (`obtenerMiRevendedor`) — resolución de rol
      // en un solo lugar, ver `lib/rol-vendedor.ts`.
      return obtenerVendedorPorUserId(supabase, user.id);
    })();
  }
  return vendedorActualPromise;
}

/** Limpia la caché en memoria (ej. tras cerrar sesión). */
export function resetVendedorActualCache() {
  vendedorActualPromise = null;
}

/**
 * Hook de conveniencia: `{ vendedor, loading }` del usuario logueado.
 * `vendedor` queda en `null` tanto mientras carga como si el usuario no
 * tiene una fila en `vendedores` (caso VENDEDOR_NO_REGISTRADO).
 */
export function useVendedorActual() {
  const [vendedor, setVendedor] = useState<VendedorActual | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetchVendedorActual().then((v) => {
      if (cancelled) return;
      setVendedor(v);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return { vendedor, loading };
}
