// @vitest-environment jsdom
// LoteForm: si fallan los catálogos (recetas/insumos) se avisa, se puede reintentar
// y guardar sigue permitido (el descuento real lo calcula `crear_lote` en la base).
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
type Resp = { data: unknown; error: { message: string; details?: string } | null };
const crearLote = vi.fn<(supabase: unknown, args: Record<string, unknown>) => Promise<Resp>>(async () => ({
  data: { lote_id: "l1" },
  error: null,
}));

vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: () => {} }),
  usePathname: () => "/stock/lotes/nuevo",
}));
vi.mock("@/components/page-header-context", () => ({ SetFormHeader: () => null }));
vi.mock("@/components/app/form-header-desktop", () => ({ FormHeaderDesktop: () => null }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/vendedor-actual", () => ({
  useVendedorActual: () => ({ vendedor: { id: "v1", nombre: "Fran" }, loading: false }),
}));
const listarRecetas = vi.fn();
const listarInsumosActivos = vi.fn();
vi.mock("@/lib/data/insumos", () => ({
  listarRecetas: () => listarRecetas(),
  listarInsumosActivos: () => listarInsumosActivos(),
}));
vi.mock("@/lib/lotes", () => ({ crearLote: (s: unknown, a: Record<string, unknown>) => crearLote(s, a) }));

import { LoteForm } from "@/components/stock/lote-form";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let el: HTMLDivElement | null = null;

async function montar() {
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => {
    root!.render(
      <LoteForm productos={[{ id: "p1", nombre: "Aceite 500", presentacion_ml: 500 }]} />,
    );
  });
}

const boton = (texto: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(texto));
const guardar = () => document.querySelector<HTMLButtonElement>("form button[type=submit]")!;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  window.scrollTo = () => {};
  crearLote.mockReset();
  crearLote.mockImplementation(async () => ({ data: { lote_id: "l1" }, error: null }));
});
afterEach(() => {
  act(() => root?.unmount());
  el?.remove();
  document.body.innerHTML = "";
  listarRecetas.mockReset();
  listarInsumosActivos.mockReset();
  vi.restoreAllMocks();
});

describe("LoteForm: carga de recetas e insumos", () => {
  it("si falla avisa que no se ve el descuento, reintenta y sigue permitiendo guardar", async () => {
    listarRecetas
      .mockResolvedValueOnce({ data: [], error: "No se pudo cargar la lista de recetas." })
      .mockResolvedValueOnce({ data: [{ producto_id: "p1", insumo_id: "i1", cantidad: 2 }], error: null });
    listarInsumosActivos.mockResolvedValue({
      data: [{ id: "i1", nombre: "Botella", tipo: "envase", unidad: "unidad", activo: true }],
      error: null,
    });
    await montar();

    expect(document.body.textContent).toContain("No se pudo cargar el consumo de insumos");
    expect(boton("Probar de nuevo")).toBeTruthy();
    expect(guardar().disabled).toBe(false);

    await act(async () => boton("Probar de nuevo")!.click());
    expect(listarRecetas).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).not.toContain("No se pudo cargar el consumo");

    await act(async () => {
      document.querySelector<HTMLButtonElement>("button[aria-label^='Sumar una unidad']")!.click();
    });
    expect(document.body.textContent).toContain("Va a descontar");
  });

  it("falla de insumos (no de recetas) también avisa", async () => {
    listarRecetas.mockResolvedValue({ data: [], error: null });
    listarInsumosActivos.mockResolvedValue({ data: [], error: "No se pudo cargar la lista de insumos." });
    await montar();
    expect(document.body.textContent).toContain("No se pudo cargar el consumo de insumos");
  });

  it("éxito: sin aviso", async () => {
    listarRecetas.mockResolvedValue({ data: [], error: null });
    listarInsumosActivos.mockResolvedValue({ data: [], error: null });
    await montar();
    expect(document.body.textContent).not.toContain("No se pudo cargar el consumo");
    expect(boton("Probar de nuevo")).toBeUndefined();
  });
});
