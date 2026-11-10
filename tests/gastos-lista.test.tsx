// @vitest-environment jsdom
// /gastos: fallo de carga con aviso + reintento, y filtros en la URL (replaceState).
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

let query = "";
const replace = vi.fn((_e: unknown, _t: string, url?: string | URL | null) => {
  const u = String(url ?? "");
  query = u.includes("?") ? u.split("?")[1] : "";
});
vi.spyOn(window.history, "replaceState").mockImplementation(replace);
vi.mock("next/navigation", () => ({
  usePathname: () => "/gastos",
  useSearchParams: () => new URLSearchParams(query),
}));

const listarGastos = vi.fn();
const listarCategorias = vi.fn();
vi.mock("@/lib/data/gastos", () => ({
  listarGastos: (_s: unknown, f: unknown) => listarGastos(f),
  listarCategorias: () => listarCategorias(),
}));

import GastosPage from "@/app/(app)/gastos/page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CATS = [{ id: "k1", nombre: "Envases" }];
const GASTO = {
  id: "g1",
  fecha: "2026-11-02",
  monto_centavos: 150000,
  medio_pago: "efectivo",
  imagen_path: null,
  concepto_pago: null,
  categorias_gasto: { nombre: "Envases" },
  vendedores: null,
  productos: null,
  movimientos_insumo: [],
};

let root: Root | null = null;
let el: HTMLDivElement | null = null;
const boton = (t: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === t);
const texto = () => document.body.textContent ?? "";

async function montar() {
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => root!.render(createElement(GastosPage)));
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  listarCategorias.mockResolvedValue({ data: CATS, error: null });
});
afterEach(() => {
  act(() => root?.unmount());
  el?.remove();
  document.body.innerHTML = "";
  query = "";
  replace.mockClear();
  listarGastos.mockReset();
  listarCategorias.mockReset();
});

describe("/gastos", () => {
  it("si falla la lista avisa (no 'todavía no registraste') y 'Probar de nuevo' vuelve a pedir", async () => {
    listarGastos
      .mockResolvedValueOnce({ data: [], error: "No se pudo cargar la lista de gastos." })
      .mockResolvedValueOnce({ data: [GASTO], error: null });
    await montar();
    expect(texto()).toContain("No se pudo cargar la lista de gastos.");
    expect(texto()).not.toContain("Todavía no registraste");

    await act(async () => boton("Probar de nuevo")!.click());
    expect(listarGastos).toHaveBeenCalledTimes(2);
    expect(texto()).not.toContain("No se pudo cargar");
    expect(texto()).toContain("Envases");
  });

  it("si fallan las categorías avisa y reintenta", async () => {
    listarGastos.mockResolvedValue({ data: [], error: null });
    listarCategorias
      .mockResolvedValueOnce({ data: [], error: "No se pudo cargar la lista de categorías." })
      .mockResolvedValueOnce({ data: CATS, error: null });
    await montar();
    expect(texto()).toContain("No se pudo cargar la lista de categorías.");
    await act(async () => boton("Probar de nuevo")!.click());
    expect(boton("Envases")).toBeTruthy();
  });

  it("elegir una categoría escribe ?c= con replaceState (sin router) y al leer la URL filtra la consulta", async () => {
    listarGastos.mockResolvedValue({ data: [GASTO], error: null });
    await montar();
    expect(listarGastos).toHaveBeenLastCalledWith({ categoriaId: undefined, rango: undefined });
    await act(async () => boton("Envases")!.click());
    expect(replace).toHaveBeenCalledWith(null, "", "/gastos?c=k1");

    // En Next, `useSearchParams` se entera solo; acá se vuelve a montar con la URL nueva.
    act(() => root!.unmount());
    el!.remove();
    await montar();
    expect(listarGastos).toHaveBeenLastCalledWith({ categoriaId: "k1", rango: undefined });

    await act(async () => boton("Todas")!.click());
    expect(replace).toHaveBeenLastCalledWith(null, "", "/gastos");
  });

  it("al volver con el filtro en la URL ya viene aplicado (y un valor inválido se ignora)", async () => {
    query = "c=k1&m=2026-10";
    listarGastos.mockResolvedValue({ data: [GASTO], error: null });
    await montar();
    expect(listarGastos).toHaveBeenLastCalledWith({
      categoriaId: "k1",
      rango: { desde: "2026-10-01", hasta: "2026-11-01" },
    });
    expect(boton("Envases")!.getAttribute("aria-pressed")).toBe("true");

    act(() => root!.unmount());
    el!.remove();
    query = "m=basura";
    await montar();
    expect(listarGastos).toHaveBeenLastCalledWith({ categoriaId: undefined, rango: undefined });
  });

  it("una categoría de la URL que no existe se ignora (no deja la lista vacía) cuando las categorías cargaron", async () => {
    query = "c=borrada";
    listarGastos.mockResolvedValue({ data: [GASTO], error: null });
    await montar();
    expect(listarGastos).toHaveBeenCalledTimes(1);
    expect(listarGastos).toHaveBeenLastCalledWith({ categoriaId: undefined, rango: undefined });
    expect(boton("Todas")!.getAttribute("aria-pressed")).toBe("true");
  });

  it("si las categorías fallan, se respeta la categoría de la URL", async () => {
    query = "c=k1";
    listarCategorias.mockResolvedValue({ data: [], error: "boom" });
    listarGastos.mockResolvedValue({ data: [GASTO], error: null });
    await montar();
    expect(listarGastos).toHaveBeenLastCalledWith({ categoriaId: "k1", rango: undefined });
  });
});
