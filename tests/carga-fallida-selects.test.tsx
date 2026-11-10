// @vitest-environment jsdom
// Un fallo de carga (red/RLS) no se ve como "no hay datos": aviso + "Probar de nuevo".
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const listarClientes = vi.fn();
vi.mock("@/lib/data/clientes", () => ({
  listarClientesActivosCompletos: () => listarClientes(),
  obtenerCliente: async () => null,
}));
const listarCategorias = vi.fn();
vi.mock("@/lib/data/gastos", () => ({
  listarCategoriasActivas: () => listarCategorias(),
  obtenerCategoria: async () => null,
}));

import { ClienteSelect } from "@/components/cliente-select";
import { CategoriaSelect } from "@/app/(app)/gastos/categoria-select";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let el: HTMLDivElement | null = null;
async function montar(nodo: React.ReactElement) {
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => root!.render(nodo));
}
const boton = (t: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === t);
const texto = () => document.body.textContent ?? "";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  act(() => root?.unmount());
  el?.remove();
  document.body.innerHTML = "";
  listarClientes.mockReset();
  listarCategorias.mockReset();
  vi.restoreAllMocks();
});

describe("ClienteSelect", () => {
  it("si falla la lista avisa, deja usar 'Sin cliente' / 'Nuevo cliente' y reintenta", async () => {
    listarClientes
      .mockResolvedValueOnce({ data: [], error: "No se pudo cargar la lista de clientes." })
      .mockResolvedValueOnce({ data: [{ id: "c1", nombre: "Ana Pérez" }], error: null });
    await montar(createElement(ClienteSelect, { value: null, onChange: () => {} }));
    await act(async () => document.querySelector<HTMLButtonElement>("button[aria-labelledby]")!.click());

    expect(texto()).toContain("No se pudo cargar la lista de clientes.");
    expect(texto()).not.toContain("No hay clientes que coincidan");
    expect(boton("Sin cliente")).toBeTruthy();
    expect(boton("+ Nuevo cliente")).toBeTruthy();

    await act(async () => boton("Probar de nuevo")!.click());
    expect(listarClientes).toHaveBeenCalledTimes(2);
    expect(texto()).toContain("Ana Pérez");
    expect(texto()).not.toContain("No se pudo cargar");
  });

  it("éxito: lista los clientes sin aviso", async () => {
    listarClientes.mockResolvedValue({ data: [{ id: "c1", nombre: "Ana Pérez" }], error: null });
    await montar(createElement(ClienteSelect, { value: null, onChange: () => {} }));
    await act(async () => document.querySelector<HTMLButtonElement>("button[aria-labelledby]")!.click());
    expect(texto()).toContain("Ana Pérez");
    expect(boton("Probar de nuevo")).toBeUndefined();
  });
});

describe("CategoriaSelect", () => {
  it("si falla la lista avisa en el lugar del select y reintenta", async () => {
    listarCategorias
      .mockResolvedValueOnce({ data: [], error: "No se pudo cargar la lista de categorías." })
      .mockResolvedValueOnce({ data: [{ id: "k1", nombre: "Envases" }], error: null });
    await montar(createElement(CategoriaSelect, { value: null, onChange: () => {} }));

    expect(texto()).toContain("No se pudo cargar la lista de categorías.");
    expect(document.querySelector("select")).toBeNull();

    await act(async () => boton("Probar de nuevo")!.click());
    expect(listarCategorias).toHaveBeenCalledTimes(2);
    expect(document.querySelector("select")).not.toBeNull();
    expect(texto()).toContain("Envases");
    expect(texto()).not.toContain("No se pudo cargar");
  });

  it("éxito: muestra el select con las categorías", async () => {
    listarCategorias.mockResolvedValue({ data: [{ id: "k1", nombre: "Envases" }], error: null });
    await montar(createElement(CategoriaSelect, { value: null, onChange: () => {} }));
    expect(texto()).toContain("Envases");
    expect(boton("Probar de nuevo")).toBeUndefined();
  });
});
