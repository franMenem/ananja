"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import { cargarDatosHoja } from "@/components/cargar/actions";
import { QuePasoSheet, type EstadoDatosHoja, type RevendedoraOpcion } from "@/components/cargar/que-paso-sheet";

type CargarContexto = {
  /** Abre la hoja "¿Qué pasó?". Se le pasa el botón que la abre para
   * devolverle el foco al cerrar. */
  abrir: (disparador?: HTMLElement | null) => void;
};

const Contexto = createContext<CargarContexto>({ abrir: () => {} });

/**
 * Dueño de la hoja "¿Qué pasó?" (botón "+" de la tab bar y del rail). Vive
 * en el layout de admin. Los datos de la hoja (revendedoras activas y
 * nombre del proveedor) ya no los lee el layout en cada navegación: se
 * piden la primera vez que se abre la hoja (`cargarDatosHoja`, una server
 * action de solo lectura) y se guardan mientras dure la pestaña. Si falla,
 * la hoja muestra el error con "Reintentar".
 */
export function CargarProvider({ children }: { children: ReactNode }) {
  const [abierta, setAbierta] = useState(false);
  const [estado, setEstado] = useState<EstadoDatosHoja>("cargando");
  const [datos, setDatos] = useState<{ revendedoras: RevendedoraOpcion[]; proveedorNombre: string | null }>({
    revendedoras: [],
    proveedorNombre: null,
  });
  const disparador = useRef<HTMLElement | null>(null);
  const pedido = useRef<"nunca" | "en curso" | "listo">("nunca");

  const cargar = useCallback(async () => {
    if (pedido.current !== "nunca") return;
    pedido.current = "en curso";
    setEstado("cargando");
    try {
      const respuesta = await cargarDatosHoja();
      if (respuesta.ok) {
        setDatos({ revendedoras: respuesta.revendedoras, proveedorNombre: respuesta.proveedorNombre });
        setEstado("listo");
        pedido.current = "listo";
        return;
      }
    } catch (error) {
      console.error("CargarProvider", error);
    }
    setEstado("error");
    pedido.current = "nunca";
  }, []);

  const abrir = useCallback(
    (el?: HTMLElement | null) => {
      disparador.current = el ?? (document.activeElement as HTMLElement | null);
      setAbierta(true);
      void cargar();
    },
    [cargar],
  );

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
        revendedoras={datos.revendedoras}
        proveedorNombre={datos.proveedorNombre}
        estado={estado}
        onReintentar={() => void cargar()}
      />
    </Contexto.Provider>
  );
}

export function useCargar(): CargarContexto {
  return useContext(Contexto);
}
