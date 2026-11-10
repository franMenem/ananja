// @vitest-environment jsdom
// Borrar un material: dos toques seguidos en "Sí, borrar" disparan UN solo borrado,
// y el botón sigue ocupado después de navegar (no se reabre el hueco del doble toque).
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/material/m1",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/page-header-context", () => ({ SetFormHeader: () => null }));
vi.mock("@/components/app/form-header-desktop", () => ({ FormHeaderDesktop: () => null }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

const eliminarMaterial = vi.fn();
vi.mock("@/lib/material", () => ({
  eliminarMaterial: (...a: unknown[]) => eliminarMaterial(...a),
  actualizarMaterial: vi.fn(),
  crearMaterial: vi.fn(),
}));

import { MaterialForm } from "@/components/material/material-form";
import type { Material } from "@/lib/data/material";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MATERIAL = { id: "m1", titulo: "Hola", cuerpo: "Texto", publicado: true, orden: 1 } as unknown as Material;

let root: Root | null = null;
let contenedor: HTMLDivElement | null = null;

function montar() {
  contenedor = document.createElement("div");
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
  act(() => root!.render(createElement(MaterialForm, { material: MATERIAL })));
}

afterEach(() => {
  act(() => root?.unmount());
  contenedor?.remove();
  root = null;
  contenedor = null;
  vi.clearAllMocks();
});

const boton = (t: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((e) => e.textContent?.includes(t))!;

describe("MaterialForm — borrar", () => {
  it("doble toque en \"Sí, borrar\" borra una sola vez y el botón queda ocupado tras navegar", async () => {
    let resolver: (v: unknown) => void = () => {};
    eliminarMaterial.mockReturnValue(new Promise((r) => (resolver = r)));
    montar();
    act(() => boton("Eliminar este material").click());
    const sí = boton("Sí, borrar");
    act(() => {
      sí.click();
      sí.click();
    });
    expect(eliminarMaterial).toHaveBeenCalledTimes(1);
    expect(boton("Sí, borrar").disabled).toBe(true);

    await act(async () => resolver({ error: null }));
    expect(push).toHaveBeenCalledWith("/material");
    expect(refresh).toHaveBeenCalled();
    // Terminal: no se reactiva en el hueco hasta que la pantalla se desmonte.
    expect(boton("Sí, borrar").disabled).toBe(true);
    act(() => boton("Sí, borrar").click());
    expect(eliminarMaterial).toHaveBeenCalledTimes(1);
  });

  it("si falla muestra el error y se puede reintentar", async () => {
    eliminarMaterial.mockResolvedValueOnce({ error: { message: "x" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    montar();
    act(() => boton("Eliminar este material").click());
    await act(async () => boton("Sí, borrar").click());
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("No se pudo eliminar.");
    expect(push).not.toHaveBeenCalled();
    expect(boton("Sí, borrar").disabled).toBe(false);

    eliminarMaterial.mockResolvedValueOnce({ error: null });
    await act(async () => boton("Sí, borrar").click());
    expect(eliminarMaterial).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenCalledWith("/material");
  });
});
