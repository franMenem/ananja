// @vitest-environment jsdom
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MENSAJE_SIN_CONEXION, siguienteEstado, useConfirmacion, type EstadoConfirmacion } from "@/components/ui/use-confirmacion";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("siguienteEstado (la máquina pura)", () => {
  const cerrada: EstadoConfirmacion = { fase: "cerrada" };
  const confirmando: EstadoConfirmacion = { fase: "confirmando", error: null };
  const conError: EstadoConfirmacion = { fase: "confirmando", error: "mal" };
  const enviando: EstadoConfirmacion = { fase: "enviando" };

  it("abrir siempre arranca sin error", () => {
    expect(siguienteEstado(cerrada, { tipo: "abrir" })).toEqual({ fase: "confirmando", error: null });
  });
  it("cancelar descarta el error", () => {
    expect(siguienteEstado(conError, { tipo: "cancelar" })).toEqual({ fase: "cerrada" });
  });
  it("no se puede cancelar ni abrir mientras envía", () => {
    expect(siguienteEstado(enviando, { tipo: "cancelar" })).toBe(enviando);
    expect(siguienteEstado(enviando, { tipo: "abrir" })).toBe(enviando);
  });
  it("enviar solo desde confirmando", () => {
    expect(siguienteEstado(confirmando, { tipo: "enviar" })).toEqual({ fase: "enviando" });
    expect(siguienteEstado(cerrada, { tipo: "enviar" })).toBe(cerrada);
    expect(siguienteEstado(enviando, { tipo: "enviar" })).toBe(enviando);
  });
  it("un fallo vuelve a confirmando con el error", () => {
    expect(siguienteEstado(enviando, { tipo: "fallo", mensaje: "x" })).toEqual({ fase: "confirmando", error: "x" });
  });
  it("éxito cierra; éxito con navegación queda en hecha", () => {
    expect(siguienteEstado(enviando, { tipo: "exito", seguirOcupada: false })).toEqual({ fase: "cerrada" });
    expect(siguienteEstado(enviando, { tipo: "exito", seguirOcupada: true })).toEqual({ fase: "hecha" });
  });
  it("hecha no admite ningún evento", () => {
    const hecha: EstadoConfirmacion = { fase: "hecha" };
    for (const e of [{ tipo: "abrir" }, { tipo: "cancelar" }, { tipo: "enviar" }] as const) {
      expect(siguienteEstado(hecha, e)).toBe(hecha);
    }
  });
});

let root: Root | null = null;
let contenedor: HTMLDivElement | null = null;
type Api = ReturnType<typeof useConfirmacion>;
const ultimo: { api: Api | null } = { api: null };
// El arnés entrega la API actual por callback (un efecto), no durante el render.
function Arnes({ alRenderizar }: { alRenderizar: (a: Api) => void }) {
  const a = useConfirmacion();
  useEffect(() => alRenderizar(a));
  return null;
}
const api = new Proxy({} as Api, { get: (_, clave) => ultimo.api![clave as keyof Api] });
function montar() {
  contenedor = document.createElement("div");
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
  act(() => root!.render(createElement(Arnes, { alRenderizar: (a) => { ultimo.api = a; } })));
}
afterEach(() => {
  act(() => root?.unmount());
  contenedor?.remove();
  root = null;
});

describe("useConfirmacion", () => {
  it("falla, cancela, reabre: sin error", async () => {
    montar();
    act(() => api.abrir());
    await act(async () => api.confirmar(async () => "No se pudo"));
    expect(api.abierta).toBe(true);
    expect(api.error).toBe("No se pudo");
    expect(api.ocupada).toBe(false);
    act(() => api.cancelar());
    expect(api.abierta).toBe(false);
    act(() => api.abrir());
    expect(api.abierta).toBe(true);
    expect(api.error).toBeNull();
  });

  it("éxito cierra y llama alExito", async () => {
    montar();
    const alExito = vi.fn();
    act(() => api.abrir());
    await act(async () => api.confirmar(async () => null, { alExito }));
    expect(api.abierta).toBe(false);
    expect(alExito).toHaveBeenCalledTimes(1);
  });

  it("éxito con seguirOcupada queda abierta y ocupada", async () => {
    montar();
    act(() => api.abrir());
    await act(async () => api.confirmar(async () => null, { seguirOcupada: true }));
    expect(api.abierta).toBe(true);
    expect(api.ocupada).toBe(true);
    act(() => api.cancelar());
    expect(api.abierta).toBe(true);
  });

  it("candado: un segundo toque mientras envía no ejecuta de nuevo, y cancelar se ignora", async () => {
    montar();
    let liberar!: () => void;
    const accion = vi.fn(() => new Promise<null>((r) => (liberar = () => r(null))));
    act(() => api.abrir());
    let p1!: Promise<void>;
    act(() => {
      p1 = api.confirmar(accion);
      void api.confirmar(accion);
    });
    expect(accion).toHaveBeenCalledTimes(1);
    expect(api.enviando).toBe(true);
    act(() => api.cancelar());
    expect(api.abierta).toBe(true);
    await act(async () => {
      liberar();
      await p1;
    });
    expect(api.abierta).toBe(false);
  });

  it("si la acción lanza, vuelve a confirmando con el mensaje de conexión", async () => {
    montar();
    act(() => api.abrir());
    await act(async () =>
      api.confirmar(async () => {
        throw new Error("red");
      }),
    );
    expect(api.error).toBe(MENSAJE_SIN_CONEXION);
    expect(api.ocupada).toBe(false);
  });
});
