"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type TareasBadgeContexto = {
  cantidad: number;
  /** Vuelve a contar ya (después de confirmar un pago o depositar). */
  refrescar: () => void;
  /** Una pantalla que YA calculó el número de tareas (Hoy, Para hacer) se
   * lo pasa al badge: queda al día sin pedir nada y cuenta como recuento
   * reciente. */
  informar: (cantidad: number) => void;
};

const Contexto = createContext<TareasBadgeContexto>({ cantidad: 0, refrescar: () => {}, informar: () => {} });

/** Al navegar no se recuenta si el último dato (recuento o número informado
 * por una pantalla) es de hace menos de esto; `refrescar()` no espera. */
const MIN_MS_ENTRE_RECUENTOS = 120_000;

/** `true` si el último dato del badge es lo bastante viejo como para
 * volver a contar al navegar. */
export function hayQueRecontar(ahora: number, ultimoDato: number): boolean {
  return ahora - ultimoDato >= MIN_MS_ENTRE_RECUENTOS;
}

/**
 * Fuente ÚNICA del número de tareas del badge (antes el hook se montaba dos
 * veces — TabBar y AppRail — y nunca se actualizaba). Vive en el layout de
 * admin: cuenta al montar, al cambiar de ruta (si el último dato
 * tiene más de 2 minutos) y cuando una acción llama a `refrescar()`.
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
    if (!hayQueRecontar(Date.now(), ultimoExito.current)) return;
    void contar(false);
  }, [pathname, contar]);

  const refrescar = useCallback(() => {
    void contar(true);
  }, [contar]);
  const informar = useCallback((nuevaCantidad: number) => {
    setCantidad(nuevaCantidad);
    ultimoExito.current = Date.now();
  }, []);
  const valor = useMemo(() => ({ cantidad, refrescar, informar }), [cantidad, refrescar, informar]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/** Número del badge de Tareas (0 fuera del layout de admin). */
export function useTareasPendientes(): number {
  return useContext(Contexto).cantidad;
}

/** Pantalla que ya calculó el número de tareas: se lo pasa al badge para que
 * no tenga que pedirlo de nuevo. No renderiza nada. */
export function InformarTareasPendientes({ cantidad }: { cantidad: number }) {
  const { informar } = useContext(Contexto);
  useEffect(() => {
    informar(cantidad);
  }, [cantidad, informar]);
  return null;
}

/** Pedir un recuento del badge (no-op fuera del layout de admin). */
export function useRefrescarTareas(): () => void {
  return useContext(Contexto).refrescar;
}
