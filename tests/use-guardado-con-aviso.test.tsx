// @vitest-environment jsdom
// Máquina "guardar → aviso → Guardar igual → reintento": transiciones puras y
// candado del hook (construido sobre `useEnvio`).
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  siguienteEstadoGuardado,
  useGuardadoConAviso,
  type EstadoGuardado,
} from "@/components/ui/use-guardado-con-aviso";

type A = { producto: string };
const quieto: EstadoGuardado<A> = { fase: "quieto", error: null };
const sig = (e: EstadoGuardado<A>, ev: Parameters<typeof siguienteEstadoGuardado<A>>[1]) => siguienteEstadoGuardado<A>(e, ev);

describe("siguienteEstadoGuardado", () => {
  it("quieto → enviando; el error común se descarta, el de conexión se conserva", () => {
    expect(sig({ fase: "quieto", error: { deConexion: false, mensaje: "x" } }, { tipo: "empezar", conPermiso: false })).toEqual({
      fase: "enviando",
      conPermiso: false,
      aviso: null,
      error: null,
    });
    const conexion = { deConexion: true as const, mensaje: "sin red", conPermiso: true };
    expect(sig({ fase: "quieto", error: conexion }, { tipo: "empezar", conPermiso: true })).toMatchObject({
      fase: "enviando",
      error: conexion,
    });
  });

  it("enviando → aviso → (Guardar igual) enviando retiene el aviso → enviado", () => {
    let e = sig(quieto, { tipo: "empezar", conPermiso: false });
    e = sig(e, { tipo: "avisar", aviso: { producto: "Aceite" } });
    expect(e).toEqual({ fase: "aviso", aviso: { producto: "Aceite" }, error: null });
    e = sig(e, { tipo: "empezar", conPermiso: true });
    expect(e).toEqual({ fase: "enviando", conPermiso: true, aviso: { producto: "Aceite" }, error: null });
    expect(sig(e, { tipo: "completar" })).toEqual({ fase: "enviado" });
  });

  it("aviso → descartarAviso → quieto", () => {
    const e = sig({ fase: "aviso", aviso: { producto: "Aceite" }, error: null }, { tipo: "descartarAviso" });
    expect(e).toEqual({ fase: "quieto", error: null });
  });

  it("fallar de conexión recuerda con qué permiso se envió", () => {
    const e = sig({ fase: "enviando", conPermiso: true, aviso: null, error: null }, { tipo: "fallar", mensaje: "m", deConexion: true });
    expect(e).toEqual({ fase: "quieto", error: { deConexion: true, mensaje: "m", conPermiso: true } });
  });

  it("fallar común (también desde quieto, para validaciones) no es de conexión", () => {
    expect(sig(quieto, { tipo: "fallar", mensaje: "falta algo", deConexion: false })).toEqual({
      fase: "quieto",
      error: { deConexion: false, mensaje: "falta algo" },
    });
  });

  it("enviado es terminal: ignora todo", () => {
    const enviado: EstadoGuardado<A> = { fase: "enviado" };
    for (const ev of [
      { tipo: "empezar", conPermiso: false },
      { tipo: "avisar", aviso: { producto: "x" } },
      { tipo: "fallar", mensaje: "m", deConexion: false },
      { tipo: "liberar" },
      { tipo: "descartarAviso" },
      { tipo: "limpiarError" },
    ] as const) {
      expect(sig(enviado, ev)).toBe(enviado);
    }
  });

  it("liberar solo actúa desde enviando; avisar y completar tampoco funcionan fuera de enviando", () => {
    expect(sig(quieto, { tipo: "liberar" })).toBe(quieto);
    expect(sig(quieto, { tipo: "completar" })).toBe(quieto);
    expect(sig(quieto, { tipo: "avisar", aviso: { producto: "x" } })).toBe(quieto);
    expect(sig({ fase: "enviando", conPermiso: false, aviso: null, error: null }, { tipo: "liberar" })).toEqual(quieto);
  });

  it("limpiarError borra el error en quieto y en aviso", () => {
    expect(sig({ fase: "quieto", error: { deConexion: false, mensaje: "x" } }, { tipo: "limpiarError" })).toEqual(quieto);
  });
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Hook = ReturnType<typeof useGuardadoConAviso<A>>;
let actual: Hook | null = null;
function Harness() {
  const g = useGuardadoConAviso<A>();
  useEffect(() => {
    actual = g;
  });
  return null;
}
let root: Root | null = null;
let el: HTMLDivElement | null = null;
async function montar() {
  el = document.createElement("div");
  root = createRoot(el);
  await act(async () => {
    root!.render(<Harness />);
  });
}
afterEach(() => {
  act(() => root?.unmount());
  el?.remove();
  actual = null;
});

describe("useGuardadoConAviso", () => {
  it("candado síncrono: dos empezar() en el mismo tick, uno solo pasa", async () => {
    await montar();
    let resultados: boolean[] = [];
    await act(async () => {
      resultados = [actual!.empezar(false), actual!.empezar(false)];
    });
    expect(resultados).toEqual([true, false]);
    expect(actual!.ocupado).toBe(true);
  });

  it("aviso → Guardar igual: el candado se libera al avisar y vuelve a tomarse", async () => {
    await montar();
    await act(async () => {
      actual!.empezar(false);
      actual!.avisar({ producto: "Aceite" });
    });
    expect(actual!.ocupado).toBe(false);
    expect(actual!.aviso).toEqual({ producto: "Aceite" });
    let ok = false;
    await act(async () => {
      ok = actual!.empezar(true);
    });
    expect(ok).toBe(true);
    expect(actual!.aviso).toBeNull();
    expect(actual!.avisoVisible).toEqual({ producto: "Aceite" });
  });

  it("error de conexión: expone reintento con el permiso original; un error común no", async () => {
    await montar();
    await act(async () => {
      actual!.empezar(true);
      actual!.fallar("sin red", { deConexion: true });
    });
    expect(actual!.mensajeError).toBe("sin red");
    expect(actual!.reintento).toEqual({ conPermiso: true });
    expect(actual!.ocupado).toBe(false);

    await act(async () => {
      actual!.empezar(false);
      actual!.fallar("otro");
    });
    expect(actual!.reintento).toBeNull();
  });

  it("completar deja el botón ocupado y liberar() posterior (finally) no lo reactiva", async () => {
    await montar();
    await act(async () => {
      actual!.empezar(false);
      actual!.completar();
      actual!.liberar();
    });
    expect(actual!.ocupado).toBe(true);
    expect(actual!.estado.fase).toBe("enviado");
  });
});
