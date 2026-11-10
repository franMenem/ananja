// @vitest-environment jsdom
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useCarga, type EstadoCarga } from "@/components/ui/use-carga";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Res = { data: string; error?: string | null };
let ultimo: { estado: EstadoCarga<string>; reintentar: () => void } | null = null;
let root: Root | null = null;

function Sonda({ cargar, clave, activo }: { cargar: () => Promise<Res>; clave?: string; activo?: boolean }) {
  const r = useCarga(cargar, { clave, activo });
  useEffect(() => {
    ultimo = r;
  });
  return null;
}
async function montar(props: Parameters<typeof Sonda>[0]) {
  const el = document.createElement("div");
  root = createRoot(el);
  await act(async () => root!.render(createElement(Sonda, props)));
  return (nuevas: Parameters<typeof Sonda>[0]) => act(async () => root!.render(createElement(Sonda, nuevas)));
}
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.restoreAllMocks();
});

describe("useCarga", () => {
  it("cargando → listo con los datos", async () => {
    await montar({ cargar: async () => ({ data: "x", error: null }) });
    expect(ultimo!.estado).toEqual({ tipo: "listo", datos: "x" });
  });

  it("error con texto o excepción → error; reintentar vuelve a pedir", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const cargar = vi
      .fn<() => Promise<Res>>()
      .mockResolvedValueOnce({ data: "", error: "No se pudo cargar la lista." })
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ data: "ok" });
    await montar({ cargar });
    expect(ultimo!.estado).toEqual({ tipo: "error", mensaje: "No se pudo cargar la lista." });
    await act(async () => ultimo!.reintentar());
    expect(ultimo!.estado.tipo).toBe("error");
    await act(async () => ultimo!.reintentar());
    expect(ultimo!.estado).toEqual({ tipo: "listo", datos: "ok" });
    expect(cargar).toHaveBeenCalledTimes(3);
  });

  it("descarta la respuesta vieja que llega después de una nueva", async () => {
    const pendientes: ((r: Res) => void)[] = [];
    const cargar = () => new Promise<Res>((resolve) => pendientes.push(resolve));
    const rerender = await montar({ cargar, clave: "a" });
    await rerender({ cargar, clave: "b" });
    await act(async () => pendientes[1]({ data: "nueva" }));
    await act(async () => pendientes[0]({ data: "vieja" }));
    expect(ultimo!.estado).toEqual({ tipo: "listo", datos: "nueva" });
  });

  it("no hace nada tras desmontar", async () => {
    let resolver!: (r: Res) => void;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await montar({ cargar: () => new Promise<Res>((r) => (resolver = r)) });
    act(() => root!.unmount());
    root = null;
    await act(async () => resolver({ data: "tarde" }));
    expect(error).not.toHaveBeenCalled();
  });

  it("activo=false no pide hasta activarse", async () => {
    const cargar = vi.fn(async (): Promise<Res> => ({ data: "x" }));
    const rerender = await montar({ cargar, activo: false });
    expect(cargar).not.toHaveBeenCalled();
    await rerender({ cargar, activo: true });
    expect(cargar).toHaveBeenCalledTimes(1);
  });
});
