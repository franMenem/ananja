"use client";

import { useCallback, useReducer, useRef } from "react";

/**
 * Máquina de estados de una hoja de confirmación (`BottomSheet`) que dispara
 * una acción que tarda y puede fallar: "Eliminar", "Rechazar", "Marcar
 * saldada", etc. Reemplaza al trío suelto `open` + `saving` + `error`, que
 * dejaba el error viejo a la vista al cancelar y reabrir.
 *
 * ESTADOS (`EstadoConfirmacion`, unión discriminada por `fase`):
 *   cerrada     la hoja no se ve. No hay error: nada sobrevive acá.
 *   confirmando la hoja está abierta y esperando el toque; `error` tiene el
 *               mensaje del último intento fallido (o null si no hubo).
 *   enviando    la acción está en vuelo: la hoja no se puede cerrar ni
 *               reenviar.
 *   hecha       la acción salió bien Y el botón navega a otra pantalla
 *               (`seguirOcupada`): la hoja queda abierta y ocupada hasta que
 *               la navegación desmonte el componente. No admite eventos.
 *
 * TRANSICIONES (`siguienteEstado`, función pura):
 *   cerrada     --abrir-->    confirmando (error: null, SIEMPRE)
 *   confirmando --cancelar--> cerrada     (se descarta el error)
 *   confirmando --enviar-->   enviando
 *   enviando    --fallo-->    confirmando (error: mensaje)  ← puede reintentar o cancelar
 *   enviando    --exito-->    cerrada                       ← el botón se queda en la página
 *   enviando    --exito + seguirOcupada--> hecha            ← el botón navega afuera
 *   Cualquier otro evento en cualquier otra fase se ignora.
 *
 * USO: `const c = useConfirmacion();` y
 *   - disparador:    `onClick={c.abrir}`
 *   - hoja:          `<BottomSheet open={c.abierta} ...>`, error en `c.error`
 *   - cancelar:      `onClick={c.cancelar}` (no hace nada mientras `c.ocupada`),
 *                    con `disabled={c.ocupada}`
 *   - confirmar:     `<BotonAccion cargando={c.ocupada} onClick={() => void c.confirmar(accion, opciones)}>`
 * `accion` es `() => Promise<string | null>`: devuelve el mensaje de error
 * YA TRADUCIDO, o `null` si salió bien. Si lanza, el mensaje es
 * `MENSAJE_SIN_CONEXION`. `opciones.alExito` corre después de pasar de
 * estado (acá va `router.refresh()` / `router.push(...)`); con
 * `opciones.seguirOcupada` el botón queda ocupado en vez de cerrarse.
 *
 * CANDADO: `confirmar` toma un candado síncrono (un ref, no el estado) para
 * que dos toques seguidos, antes de que React re-renderice, no disparen la
 * acción dos veces.
 */
export type EstadoConfirmacion =
  | { fase: "cerrada" }
  | { fase: "confirmando"; error: string | null }
  | { fase: "enviando" }
  | { fase: "hecha" };

export type EventoConfirmacion =
  | { tipo: "abrir" }
  | { tipo: "cancelar" }
  | { tipo: "enviar" }
  | { tipo: "fallo"; mensaje: string }
  | { tipo: "exito"; seguirOcupada: boolean };

export const MENSAJE_SIN_CONEXION = "No se pudo conectar. Verificá tu conexión e intentá de nuevo.";

export function siguienteEstado(estado: EstadoConfirmacion, evento: EventoConfirmacion): EstadoConfirmacion {
  switch (evento.tipo) {
    case "abrir":
      return estado.fase === "cerrada" ? { fase: "confirmando", error: null } : estado;
    case "cancelar":
      return estado.fase === "confirmando" ? { fase: "cerrada" } : estado;
    case "enviar":
      return estado.fase === "confirmando" ? { fase: "enviando" } : estado;
    case "fallo":
      return estado.fase === "enviando" ? { fase: "confirmando", error: evento.mensaje } : estado;
    case "exito":
      if (estado.fase !== "enviando") return estado;
      return evento.seguirOcupada ? { fase: "hecha" } : { fase: "cerrada" };
  }
}

export type OpcionesConfirmar = {
  /** Corre después de que la acción salió bien y el estado ya cambió. */
  alExito?: () => void;
  /** El botón navega afuera: queda abierto y ocupado hasta que se desmonte. */
  seguirOcupada?: boolean;
};

export function useConfirmacion() {
  const [estado, dispatch] = useReducer(siguienteEstado, { fase: "cerrada" } as EstadoConfirmacion);
  const candado = useRef(false);

  const abrir = useCallback(() => dispatch({ tipo: "abrir" }), []);
  const cancelar = useCallback(() => dispatch({ tipo: "cancelar" }), []);

  const confirmar = useCallback(async (accion: () => Promise<string | null>, opciones: OpcionesConfirmar = {}) => {
    if (candado.current) return;
    candado.current = true;
    dispatch({ tipo: "enviar" });

    let mensaje: string | null;
    try {
      mensaje = await accion();
    } catch {
      mensaje = MENSAJE_SIN_CONEXION;
    }

    if (mensaje !== null) {
      candado.current = false;
      dispatch({ tipo: "fallo", mensaje });
      return;
    }

    const seguirOcupada = opciones.seguirOcupada ?? false;
    if (!seguirOcupada) candado.current = false;
    dispatch({ tipo: "exito", seguirOcupada });
    opciones.alExito?.();
  }, []);

  return {
    estado,
    /** La hoja se ve (confirmando, enviando o hecha). */
    abierta: estado.fase !== "cerrada",
    /** Hay una acción en vuelo. */
    enviando: estado.fase === "enviando",
    /** No se puede cerrar ni reenviar: enviando, o hecha esperando la navegación. */
    ocupada: estado.fase === "enviando" || estado.fase === "hecha",
    error: estado.fase === "confirmando" ? estado.error : null,
    abrir,
    cancelar,
    confirmar,
  };
}
