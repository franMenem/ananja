"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import { QuePasoSheet, type RevendedoraOpcion } from "@/components/cargar/que-paso-sheet";

type CargarContexto = {
  /** Abre la hoja "¿Qué pasó?". Se le pasa el botón que la abre para
   * devolverle el foco al cerrar. */
  abrir: (disparador?: HTMLElement | null) => void;
};

const Contexto = createContext<CargarContexto>({ abrir: () => {} });

/**
 * Dueño de la hoja "¿Qué pasó?" (botón "+" de la tab bar y del rail). Vive
 * en el layout de admin: ahí se lee, una sola vez, la lista de revendedoras
 * activas y el nombre del proveedor, y se pasan acá como props.
 */
export function CargarProvider({
  revendedoras,
  proveedorNombre,
  children,
}: {
  revendedoras: RevendedoraOpcion[];
  proveedorNombre: string | null;
  children: ReactNode;
}) {
  const [abierta, setAbierta] = useState(false);
  const disparador = useRef<HTMLElement | null>(null);

  const abrir = useCallback((el?: HTMLElement | null) => {
    disparador.current = el ?? (document.activeElement as HTMLElement | null);
    setAbierta(true);
  }, []);

  const cerrar = useCallback(() => {
    setAbierta(false);
    const el = disparador.current;
    // Después del render que desmonta la hoja.
    queueMicrotask(() => el?.focus());
  }, []);

  const valor = useMemo(() => ({ abrir }), [abrir]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      <QuePasoSheet
        open={abierta}
        onClose={cerrar}
        revendedoras={revendedoras}
        proveedorNombre={proveedorNombre}
      />
    </Contexto.Provider>
  );
}

export function useCargar(): CargarContexto {
  return useContext(Contexto);
}
