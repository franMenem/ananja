"use client";

import { useRef, useState } from "react";

/**
 * Estado del envío de un formulario que guarda con una llamada NO
 * idempotente (crear venta, pedido, entrega, pago, depósito…).
 *
 *   quieto ──empezar()──▶ enviando ──completar()──▶ enviado   (terminal)
 *      ▲                      │
 *      └──────liberar()───────┘   (error, aviso "Guardar igual", o éxito
 *                                  que NO navega fuera de la pantalla)
 *
 * - `quieto`: se puede enviar.
 * - `enviando`: hay una llamada en vuelo. Botón ocupado.
 * - `enviado`: la llamada salió bien y se disparó la navegación
 *   (`router.push`). Es TERMINAL: el botón sigue ocupado hasta que la
 *   pantalla se desmonte, porque `router.push` no espera a que la ruta
 *   nueva cargue y reactivar el botón en ese hueco permite un segundo
 *   toque (= un segundo registro). Por eso `liberar()` no hace nada en
 *   `enviado`: un `finally { liberar() }` es seguro aunque ya se haya
 *   llamado a `completar()`.
 *
 * Uso típico:
 *
 *   const envio = useEnvio();
 *   async function guardar() {
 *     if (!envio.empezar()) return;      // candado síncrono (ref), no espera al render
 *     const { error } = await rpc(...);
 *     if (error) { setError(...); envio.liberar(); return; }
 *     envio.completar();                 // éxito y se navega fuera
 *     router.push("/destino");
 *   }
 *
 * Si tras el éxito el usuario se queda en la misma pantalla (p. ej. solo
 * `router.refresh()`), llamar a `liberar()` en vez de `completar()`.
 *
 * `ocupado` (`enviando` o `enviado`) es lo que va al `cargando` del botón.
 */
export type EstadoEnvio = "quieto" | "enviando" | "enviado";

export function useEnvio() {
  // El ref es la fuente de verdad (lectura síncrona dentro del mismo tick);
  // el state solo existe para que el componente se vuelva a renderizar.
  const ref = useRef<EstadoEnvio>("quieto");
  const [estado, setEstado] = useState<EstadoEnvio>("quieto");

  function pasarA(nuevo: EstadoEnvio) {
    ref.current = nuevo;
    setEstado(nuevo);
  }

  /** `quieto → enviando`. Devuelve `false` (y no hace nada) si ya hay un envío en curso o terminado. */
  function empezar(): boolean {
    if (ref.current !== "quieto") return false;
    pasarA("enviando");
    return true;
  }

  /** `enviando → enviado`: éxito con navegación disparada. Terminal. */
  function completar() {
    if (ref.current === "enviando") pasarA("enviado");
  }

  /** `enviando → quieto`: se puede reintentar. No toca un envío ya `enviado`. */
  function liberar() {
    if (ref.current === "enviando") pasarA("quieto");
  }

  return { estado, ocupado: estado !== "quieto", empezar, completar, liberar };
}
