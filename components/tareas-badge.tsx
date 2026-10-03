"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type TareasBadgeContexto = {
  cantidad: number;
  /** Vuelve a contar ya (después de confirmar un pago o depositar). */
  refrescar: () => void;
};

const Contexto = createContext<TareasBadgeContexto>({ cantidad: 0, refrescar: () => {} });

/** Al navegar no se recuenta si el último recuento EXITOSO fue hace menos
 * de esto; `refrescar()` no espera. */
const MIN_MS_ENTRE_RECUENTOS = 20_000;

/**
 * Fuente ÚNICA del número de tareas del badge (antes el hook se montaba dos
 * veces — TabBar y AppRail — y nunca se actualizaba). Vive en el layout de
 * admin: cuenta al montar, al cambiar de ruta (si el último recuento
 * exitoso tiene más de 20 s) y cuando una acción llama a `refrescar()`.
 *
 * Un solo `fetch` a `/api/tareas-count` (antes: ~15 consultas livianas
 * desde el navegador contra Supabase, una batería completa solo para
 * contar) — el servidor corre la MISMA lógica de conteo
 * (`lib/tareas-datos.ts` + `lib/tareas.ts`, ver `app/api/tareas-count/route.ts`)
 * con su propia sesión (cookies), así que ya no hace falta que este
 * provider resuelva ni cachee el `vendedores.id` de quien mira.
 *
 * - Un recuento en curso NO se cancela al navegar: su resultado se usa
 *   igual (solo se ignora si el provider se desmontó).
 * - Nunca corren dos recuentos a la vez: si llega un `refrescar()` durante
 *   uno, se repite al terminar; una navegación durante uno se ignora.
 */
export function TareasBadgeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [cantidad, setCantidad] = useState(0);
  const ultimoExito = useRef(0);
  const enCurso = useRef(false);
  const repetir = useRef(false);
  const montado = useRef(false);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const contar = useCallback(async (forzado: boolean) => {
    if (enCurso.current) {
      if (forzado) repetir.current = true;
      return;
    }
    enCurso.current = true;
    try {
      do {
        repetir.current = false;
        const respuesta = await fetch("/api/tareas-count", { cache: "no-store" });
        if (!montado.current) return;
        if (respuesta.ok) {
          const { count } = (await respuesta.json()) as { count: number };
          setCantidad(count);
          ultimoExito.current = Date.now();
        } else if (respuesta.status !== 401) {
          // 401 = sin sesión (ej. justo después de cerrar sesión, mientras
          // este provider todavía no se desmontó) — no es un error real,
          // el badge simplemente queda en su último número.
          console.error("TareasBadgeProvider", respuesta.status);
        }
      } while (repetir.current && montado.current);
    } catch (error) {
      // Secundario: si falla, se loguea y queda el último número (y como no
      // se guarda la hora, la próxima navegación reintenta).
      console.error("TareasBadgeProvider", error);
    } finally {
      enCurso.current = false;
    }
  }, []);

  useEffect(() => {
    if (Date.now() - ultimoExito.current < MIN_MS_ENTRE_RECUENTOS) return;
    void contar(false);
  }, [pathname, contar]);

  const refrescar = useCallback(() => {
    void contar(true);
  }, [contar]);
  const valor = useMemo(() => ({ cantidad, refrescar }), [cantidad, refrescar]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/** Número del badge de Tareas (0 fuera del layout de admin). */
export function useTareasPendientes(): number {
  return useContext(Contexto).cantidad;
}

/** Pedir un recuento del badge (no-op fuera del layout de admin). */
export function useRefrescarTareas(): () => void {
  return useContext(Contexto).refrescar;
}
