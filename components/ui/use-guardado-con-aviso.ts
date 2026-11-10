"use client";

import { useReducer } from "react";

import { useEnvio } from "@/components/ui/use-envio";

/**
 * Máquina del flujo "guardar → aviso → Guardar igual → reintento con permiso"
 * de un formulario (stock insuficiente, insumo insuficiente, saldo
 * insuficiente…), CONSTRUIDA SOBRE `useEnvio`: el candado contra el doble
 * toque (síncrono, un ref) es el de `useEnvio`; esta capa agrega, como dato
 * del estado, el aviso pendiente y el último error (con su marca
 * "fue un error de conexión"). Reemplaza al trío suelto `alerta` + `error` +
 * `permitirNegativoRef` y a la detección de "error de conexión" por prefijo
 * de texto.
 *
 * ESTADOS (`EstadoGuardado<A>`, unión discriminada por `fase`; `A` es el
 * payload del aviso, p. ej. `{ producto, disponible }`):
 *   quieto    se puede enviar. `error` es el último fallo (o null).
 *   enviando  hay una llamada en vuelo (botón ocupado). `conPermiso` dice si
 *             es el reintento con permiso ("Guardar igual"); `aviso` es el
 *             aviso desde el que se reintentó (null si se vino de `quieto`),
 *             por si la pantalla quiere dejar la hoja abierta con el loader
 *             en el botón que se tocó (`avisoVisible`).
 *   aviso     el servidor avisó ("hay 3, vas a quedar en -2") y se espera la
 *             decisión: `empezar(true)` = Guardar igual, `descartarAviso()` =
 *             volver a editar. `error` conserva el de antes, si había.
 *   enviado   TERMINAL: salió bien y se navegó. El botón sigue ocupado hasta
 *             que la pantalla se desmonte (igual que en `useEnvio`).
 *
 * TRANSICIONES (`siguienteEstadoGuardado`, función pura):
 *   quieto   --empezar(conPermiso)--> enviando  (el error se descarta SALVO que
 *                                                sea de conexión: queda a la
 *                                                vista mientras se reintenta)
 *   aviso    --empezar(true)-------> enviando   (idem; `aviso` queda retenido)
 *   enviando --avisar(aviso)-------> aviso      (el error previo se conserva)
 *   enviando --fallar(msg, deConexion)-> quieto con error { mensaje, deConexion }
 *   quieto|aviso --fallar(msg)-----> quieto con error (validaciones previas)
 *   enviando --completar()---------> enviado
 *   enviando --liberar()-----------> quieto     (éxito que NO navega, o salida
 *                                                sin error; seguro en un finally)
 *   aviso    --descartarAviso()----> quieto
 *   quieto|aviso --limpiarError()--> mismo, sin error
 *   Cualquier otro evento en cualquier otra fase se ignora.
 *
 * ERROR DE CONEXIÓN: `fallar(mensaje, { deConexion: true })` guarda en el
 * error si el último envío iba `conPermiso`; `reintento` lo expone para que
 * "Reintentar" repita exactamente el mismo envío. Mostrar el botón
 * "Reintentar" = `error?.deConexion`.
 *
 * USO:
 *   const g = useGuardadoConAviso<StockAlert>();
 *   async function guardar(conPermiso: boolean) {
 *     if (!g.empezar(conPermiso)) return;           // candado síncrono
 *     try {
 *       const { error } = await rpc(...);
 *       if (esStock(error)) { g.avisar(alerta); return; }
 *       if (error)          { g.fallar(traducir(error)); return; }
 *       g.completar();                                // éxito y se navega
 *       router.push(...);
 *     } catch {
 *       g.fallar("No se pudo conectar…", { deConexion: true });
 *     } finally {
 *       g.liberar();                                  // no-op si ya salió de `enviando`
 *     }
 *   }
 *   // Hoja: open={g.avisoVisible !== null} (o `g.aviso` para cerrarla al
 *   // tocar Guardar igual); "Guardar igual" = guardar(true); "Revisar" =
 *   // g.descartarAviso(); botón del formulario: cargando={g.ocupado}.
 */
export type ErrorGuardado =
  | { deConexion: false; mensaje: string }
  | { deConexion: true; mensaje: string; conPermiso: boolean };

export type EstadoGuardado<A> =
  | { fase: "quieto"; error: ErrorGuardado | null }
  | { fase: "enviando"; conPermiso: boolean; aviso: A | null; error: ErrorGuardado | null }
  | { fase: "aviso"; aviso: A; error: ErrorGuardado | null }
  | { fase: "enviado" };

export type EventoGuardado<A> =
  | { tipo: "empezar"; conPermiso: boolean }
  | { tipo: "avisar"; aviso: A }
  | { tipo: "fallar"; mensaje: string; deConexion: boolean }
  | { tipo: "completar" }
  | { tipo: "liberar" }
  | { tipo: "descartarAviso" }
  | { tipo: "limpiarError" };

export function siguienteEstadoGuardado<A>(estado: EstadoGuardado<A>, evento: EventoGuardado<A>): EstadoGuardado<A> {
  switch (evento.tipo) {
    case "empezar": {
      if (estado.fase !== "quieto" && estado.fase !== "aviso") return estado;
      return {
        fase: "enviando",
        conPermiso: evento.conPermiso,
        aviso: estado.fase === "aviso" ? estado.aviso : null,
        error: estado.error?.deConexion ? estado.error : null,
      };
    }
    case "avisar":
      return estado.fase === "enviando" ? { fase: "aviso", aviso: evento.aviso, error: estado.error } : estado;
    case "fallar": {
      if (estado.fase === "enviado") return estado;
      const error: ErrorGuardado = evento.deConexion
        ? { deConexion: true, mensaje: evento.mensaje, conPermiso: estado.fase === "enviando" && estado.conPermiso }
        : { deConexion: false, mensaje: evento.mensaje };
      return { fase: "quieto", error };
    }
    case "completar":
      return estado.fase === "enviando" ? { fase: "enviado" } : estado;
    case "liberar":
      return estado.fase === "enviando" ? { fase: "quieto", error: estado.error } : estado;
    case "descartarAviso":
      return estado.fase === "aviso" ? { fase: "quieto", error: estado.error } : estado;
    case "limpiarError":
      return estado.fase === "quieto" || estado.fase === "aviso" ? { ...estado, error: null } : estado;
  }
}

export function useGuardadoConAviso<A>() {
  const envio = useEnvio();
  const [estado, dispatch] = useReducer(siguienteEstadoGuardado<A>, { fase: "quieto", error: null });

  /** `quieto|aviso → enviando`. `false` (sin hacer nada) si ya hay un envío en curso o terminado. */
  function empezar(conPermiso = false): boolean {
    if (!envio.empezar()) return false;
    dispatch({ tipo: "empezar", conPermiso });
    return true;
  }

  /** `enviando → aviso`: el servidor avisó; se espera "Guardar igual" o volver a editar. */
  function avisar(aviso: A) {
    envio.liberar();
    dispatch({ tipo: "avisar", aviso });
  }

  /** `quieto|aviso|enviando → quieto` con error (también sirve para validaciones previas al envío). */
  function fallar(mensaje: string, opciones: { deConexion?: boolean } = {}) {
    envio.liberar();
    dispatch({ tipo: "fallar", mensaje, deConexion: opciones.deConexion ?? false });
  }

  /** `enviando → enviado`: éxito con navegación disparada. Terminal. */
  function completar() {
    envio.completar();
    dispatch({ tipo: "completar" });
  }

  /** `enviando → quieto`. No hace nada fuera de `enviando`: seguro en un `finally`. */
  function liberar() {
    envio.liberar();
    dispatch({ tipo: "liberar" });
  }

  /** `aviso → quieto`: se cierra la hoja y se vuelve a editar. */
  function descartarAviso() {
    dispatch({ tipo: "descartarAviso" });
  }

  /** Borra el error a la vista (`quieto` o `aviso`). */
  function limpiarError() {
    dispatch({ tipo: "limpiarError" });
  }

  const error = estado.fase === "enviado" ? null : estado.error;

  return {
    estado,
    /** Enviando o ya enviado: es lo que va al `cargando` del botón. */
    ocupado: envio.ocupado,
    /** Aviso esperando decisión (solo en la fase `aviso`): la hoja se cierra al tocar "Guardar igual". */
    aviso: estado.fase === "aviso" ? estado.aviso : null,
    /** Aviso a la vista, también mientras corre el reintento desde él: la hoja queda abierta con el loader. */
    avisoVisible: estado.fase === "aviso" || estado.fase === "enviando" ? estado.aviso : null,
    error,
    mensajeError: error?.mensaje ?? null,
    /** Con error de conexión: el permiso con el que había que reintentar. `null` si el error no es de conexión. */
    reintento: error?.deConexion ? { conPermiso: error.conPermiso } : null,
    empezar,
    avisar,
    fallar,
    completar,
    liberar,
    descartarAviso,
    limpiarError,
  };
}
