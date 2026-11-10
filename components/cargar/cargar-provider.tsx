"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { cargarDatosHoja } from "@/components/cargar/actions";
import { QuePasoSheet, type EstadoDatosHoja, type RevendedoraOpcion } from "@/components/cargar/que-paso-sheet";

type CargarContexto = {
  /** Abre la hoja "¿Qué pasó?". Se le pasa el botón que la abre para
   * devolverle el foco al cerrar. */
  abrir: (disparador?: HTMLElement | null) => void;
  /** Marca los datos de la hoja como vencidos: la próxima vez que se abra se vuelven a pedir. */
  invalidar: () => void;
};

const Contexto = createContext<CargarContexto>({ abrir: () => {}, invalidar: () => {} });

/** Pasado este tiempo, al abrir la hoja se vuelve a pedir la lista (la vieja se sigue viendo mientras tanto). */
export const VIGENCIA_DATOS_HOJA_MS = 5 * 60 * 1000;

type DatosHoja = { revendedoras: RevendedoraOpcion[]; proveedorNombre: string | null };

/**
 * Estado de los datos de la hoja, una sola unión:
 *   sin_pedir ──abrir──▶ cargando ──ok──▶ listo ──(vence o invalidar)──▶ (al abrir) pide de nuevo
 *                           └──falla──▶ error ──reintentar──▶ cargando
 * `listo` guarda `pedidoEn` (ms); `0` = invalidado a mano. Un re-pedido desde
 * `listo` no cambia la fase: la lista vieja sigue visible, y si el pedido
 * falla se queda con ella.
 */
type EstadoHoja =
  | { fase: "sin_pedir" }
  | { fase: "cargando" }
  | { fase: "listo"; datos: DatosHoja; pedidoEn: number }
  | { fase: "error" };

const SIN_DATOS: DatosHoja = { revendedoras: [], proveedorNombre: null };

function paraLaHoja(estado: EstadoHoja): EstadoDatosHoja {
  // Antes de pedir, la hoja (que solo se ve abierta, y abrir ya pide) muestra la espera.
  return estado.fase === "listo" ? "listo" : estado.fase === "error" ? "error" : "cargando";
}

/**
 * Dueño de la hoja "¿Qué pasó?" (botón "+" de la tab bar y del rail). Vive
 * en el layout de admin. Los datos de la hoja (revendedoras activas y
 * nombre del proveedor) no los lee el layout en cada navegación: se
 * piden al abrir la hoja (`cargarDatosHoja`, una server action de solo
 * lectura) y se guardan mientras dure la pestaña, hasta que vencen
 * (`VIGENCIA_DATOS_HOJA_MS`) o se invalidan (`invalidar()`; también al estar en
 * `/revendedores*`, donde se suman personas). Si falla, la hoja muestra el
 * error con "Reintentar".
 */
export function CargarProvider({ children }: { children: ReactNode }) {
  const [abierta, setAbierta] = useState(false);
  const [estado, setEstado] = useState<EstadoHoja>({ fase: "sin_pedir" });
  const disparador = useRef<HTMLElement | null>(null);
  // Espejo síncrono de `estado` (para decidir dentro de callbacks sin esperar el render) y candado del pedido en vuelo.
  const actual = useRef<EstadoHoja>(estado);
  const enVuelo = useRef(false);
  const invalidadoEnVuelo = useRef(false);
  const pathname = usePathname();

  const poner = useCallback((nuevo: EstadoHoja) => {
    actual.current = nuevo;
    setEstado(nuevo);
  }, []);

  const pedir = useCallback(async () => {
    if (enVuelo.current) return;
    enVuelo.current = true;
    invalidadoEnVuelo.current = false;
    const previo = actual.current;
    if (previo.fase !== "listo") poner({ fase: "cargando" });
    let nuevo: EstadoHoja | null = null;
    try {
      const respuesta = await cargarDatosHoja();
      if (respuesta.ok) {
        nuevo = {
          fase: "listo",
          datos: { revendedoras: respuesta.revendedoras, proveedorNombre: respuesta.proveedorNombre },
          // Si se invalidó mientras volaba el pedido, la respuesta ya nace vencida.
          pedidoEn: invalidadoEnVuelo.current ? 0 : Date.now(),
        };
      }
    } catch (error) {
      console.error("CargarProvider", error);
    }
    enVuelo.current = false;
    // Si ya había una lista y el re-pedido falla, se conserva la lista vieja.
    poner(nuevo ?? (previo.fase === "listo" ? previo : { fase: "error" }));
  }, [poner]);

  const abrir = useCallback(
    (el?: HTMLElement | null) => {
      disparador.current = el ?? (document.activeElement as HTMLElement | null);
      setAbierta(true);
      const e = actual.current;
      const vencido = e.fase === "listo" && Date.now() - e.pedidoEn > VIGENCIA_DATOS_HOJA_MS;
      if (e.fase === "sin_pedir" || vencido) void pedir();
    },
    [pedir],
  );

  const invalidar = useCallback(() => {
    invalidadoEnVuelo.current = true;
    const e = actual.current;
    if (e.fase === "listo") poner({ ...e, pedidoEn: 0 });
  }, [poner]);

  // Mientras se está en /revendedores* (donde se suman personas) la lista queda vencida.
  const enRevendedores = pathname?.startsWith("/revendedores") ?? false;
  useEffect(() => {
    if (enRevendedores) invalidar();
  }, [enRevendedores, invalidar]);

  const cerrar = useCallback(() => {
    setAbierta(false);
    const el = disparador.current;
    // Después del render que desmonta la hoja.
    queueMicrotask(() => el?.focus());
  }, []);

  const valor = useMemo(() => ({ abrir, invalidar }), [abrir, invalidar]);
  const datos = estado.fase === "listo" ? estado.datos : SIN_DATOS;

  return (
    <Contexto.Provider value={valor}>
      {children}
      <QuePasoSheet
        open={abierta}
        onClose={cerrar}
        revendedoras={datos.revendedoras}
        proveedorNombre={datos.proveedorNombre}
        estado={paraLaHoja(estado)}
        onReintentar={() => void pedir()}
      />
    </Contexto.Provider>
  );
}

export function useCargar(): CargarContexto {
  return useContext(Contexto);
}
