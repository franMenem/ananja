// @vitest-environment jsdom
// Caracterización de "Nuevo pedido al proveedor" (LoteForm): aviso de insumo →
// Guardar igual, aviso → Revisar cantidades → reenviar, error de conexión →
// Reintentar, doble toque.
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
vi.mock("@/lib/data/insumos", () => ({
  listarRecetas: async () => ({ data: [] }),
  listarInsumosActivos: async () => ({ data: [] }),
}));
vi.mock("@/lib/lotes", () => ({ crearLote: (s: unknown, a: Record<string, unknown>) => crearLote(s, a) }));

import { LoteForm } from "@/components/stock/lote-form";
import { mensajeErrorLote } from "@/lib/dominio/lotes";

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
  [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(texto))!;
const guardar = () => document.querySelector<HTMLButtonElement>("form button[type=submit]")!;
const INSUMO: Resp = {
  data: null,
  error: { message: "INSUMO_INSUFICIENTE", details: JSON.stringify({ insumo: "Etiqueta", insumo_id: "i1", disponible: 3 }) },
};

async function cargarYGuardar() {
  await act(async () => {
    document.querySelector<HTMLButtonElement>("button[aria-label^='Sumar una unidad']")!.click();
  });
  await act(async () => {
    guardar().click();
  });
}
const permisos = () => crearLote.mock.calls.map((c) => c[1].permitirNegativo);

beforeEach(() => {
  crearLote.mockReset();
  crearLote.mockImplementation(async () => ({ data: { lote_id: "l1" }, error: null }));
  push.mockClear();
  window.scrollTo = () => {};
});
afterEach(() => {
  act(() => root?.unmount());
  el?.remove();
  document.body.innerHTML = "";
});

describe("LoteForm: aviso de insumo y reintento", () => {
  it("guardar bien navega al detalle del pedido y deja el botón ocupado", async () => {
    await montar();
    await cargarYGuardar();
    expect(crearLote).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/stock/lotes/l1");
    expect(guardar().disabled).toBe(true);
  });

  it("aviso → Guardar igual → éxito: reenvía con permiso y navega", async () => {
    crearLote.mockImplementationOnce(async () => INSUMO);
    await montar();
    await cargarYGuardar();
    expect(document.body.textContent).toContain("Insumo insuficiente");
    expect(document.body.textContent).toContain("Etiqueta");
    expect(push).not.toHaveBeenCalled();
    expect(guardar().disabled).toBe(false);

    await act(async () => {
      boton("Guardar igual").click();
    });
    expect(permisos()).toEqual([false, true]);
    expect(push).toHaveBeenCalledWith("/stock/lotes/l1");
  });

  it("aviso → Revisar cantidades → reenviar: va sin permiso", async () => {
    crearLote.mockImplementationOnce(async () => INSUMO);
    await montar();
    await cargarYGuardar();
    await act(async () => {
      boton("Revisar cantidades").click();
    });
    expect(document.body.textContent).not.toContain("Insumo insuficiente");
    await act(async () => {
      guardar().click();
    });
    expect(permisos()).toEqual([false, false]);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("la hoja sigue abierta con el botón ocupado mientras corre 'Guardar igual'", async () => {
    let terminar!: () => void;
    crearLote
      .mockImplementationOnce(async () => INSUMO)
      .mockImplementationOnce(() => new Promise((resolve) => (terminar = () => resolve({ data: { lote_id: "l1" }, error: null }))));
    await montar();
    await cargarYGuardar();
    await act(async () => {
      boton("Guardar igual").click();
    });
    expect(boton("Guardar igual").getAttribute("aria-busy")).toBe("true");
    expect(document.body.textContent).toContain("Insumo insuficiente");
    await act(async () => {
      terminar();
    });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("doble toque en Guardar igual: una sola llamada de más", async () => {
    crearLote.mockImplementationOnce(async () => INSUMO);
    await montar();
    await cargarYGuardar();
    await act(async () => {
      const igual = boton("Guardar igual");
      igual.click();
      igual.click();
    });
    expect(crearLote).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("excepción de red → 'No se pudo conectar' + Reintentar con el mismo permiso", async () => {
    crearLote
      .mockImplementationOnce(async () => INSUMO)
      .mockImplementationOnce(async () => {
        throw new Error("offline");
      });
    await montar();
    await cargarYGuardar();
    await act(async () => {
      boton("Guardar igual").click();
    });
    expect(document.body.textContent).toContain("No se pudo conectar. Revisá la conexión e intentá de nuevo.");
    expect(push).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Insumo insuficiente");

    await act(async () => {
      boton("Reintentar").click();
    });
    expect(permisos()).toEqual([false, true, true]);
    expect(push).toHaveBeenCalledWith("/stock/lotes/l1");
  });

  it("un error común de la RPC se muestra sin 'Reintentar'", async () => {
    crearLote.mockImplementationOnce(async () => ({ data: null, error: { message: "NO_AUTORIZADO" } }));
    await montar();
    await cargarYGuardar();
    expect(push).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(mensajeErrorLote("NO_AUTORIZADO", undefined));
    expect([...document.querySelectorAll("button")].some((b) => b.textContent?.includes("Reintentar"))).toBe(false);
    expect(guardar().disabled).toBe(false);
  });

  it("sin cantidades no llama a la RPC y avisa", async () => {
    await montar();
    await act(async () => {
      guardar().click();
    });
    expect(crearLote).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Cargá al menos una cantidad.");
  });
});
