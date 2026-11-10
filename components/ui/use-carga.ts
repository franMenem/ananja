"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Carga de datos de una pantalla cliente, modelada como UN estado en vez de
 * `loading` + `error` + `data` sueltos (que tratan un fallo de red/RLS como
 * "no hay datos").
 *
 *   cargando ──ok──▶ listo{datos}
 *       │  ▲             │
 *      falla │        cambia `clave`, `reintentar()` o se vuelve a activar
 *       ▼  └─────────────┘
 *     error{mensaje} ──reintentar()──▶ cargando
 *
 * - `cargar` devuelve `{ data, error }` como las funciones de `lib/data/*`.
 *   `error` con texto, o una excepción (corte de red), lleva a `error`.
 * - Cada pedido nuevo (cambio de `clave`, `reintentar()`, `activo` pasando a
 *   true) vuelve a `cargando` y numera la respuesta: una respuesta vieja que
 *   llega tarde se descarta, y tras desmontar no se hace `setState`.
 * - `clave` es lo que identifica QUÉ se carga (p. ej. los filtros): al
 *   cambiar se vuelve a pedir. `cargar` puede cambiar de identidad en cada
 *   render sin disparar nada: se usa siempre la versión más reciente.
 * - `activo: false` pospone la carga (p. ej. un selector que carga recién al
 *   abrirse); el estado queda en `cargando` hasta que se active.
 */
export type EstadoCarga<T> =
  | { tipo: "cargando" }
  | { tipo: "listo"; datos: T }
  | { tipo: "error"; mensaje: string };

export type ResultadoCarga<T> = { data: T; error?: string | null };

const MENSAJE_POR_DEFECTO = "No se pudo cargar.";

export function useCarga<T>(
  cargar: () => Promise<ResultadoCarga<T>>,
  { clave = "", activo = true }: { clave?: string; activo?: boolean } = {},
): { estado: EstadoCarga<T>; reintentar: () => void } {
  const [estado, setEstado] = useState<EstadoCarga<T>>({ tipo: "cargando" });
  const [intento, setIntento] = useState(0);
  const cargarRef = useRef(cargar);
  const secuencia = useRef(0);

  useEffect(() => {
    cargarRef.current = cargar;
  });

  useEffect(() => {
    if (!activo) return;
    const numero = ++secuencia.current;
    let vivo = true;
    const vigente = () => vivo && numero === secuencia.current;

    async function load() {
      setEstado({ tipo: "cargando" });
      try {
        const { data, error } = await cargarRef.current();
        if (!vigente()) return;
        setEstado(error ? { tipo: "error", mensaje: error } : { tipo: "listo", datos: data });
      } catch (err) {
        console.error("useCarga", err);
        if (!vigente()) return;
        setEstado({ tipo: "error", mensaje: MENSAJE_POR_DEFECTO });
      }
    }

    void load();
    return () => {
      vivo = false;
    };
  }, [clave, activo, intento]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  return { estado, reintentar };
}
