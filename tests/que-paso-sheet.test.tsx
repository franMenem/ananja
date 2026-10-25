// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { QuePasoSheet } from "@/components/cargar/que-paso-sheet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REVENDEDORAS = [
  { id: "r1", nombre: "Ana Pérez" },
  { id: "r2", nombre: "Bea Gómez" },
];

let root: Root | null = null;
let contenedor: HTMLDivElement | null = null;

function montar(props: Partial<React.ComponentProps<typeof QuePasoSheet>> = {}) {
  contenedor = document.createElement("div");
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
  const onClose = vi.fn();
  act(() => {
    root!.render(
      createElement(QuePasoSheet, {
        open: true,
        onClose,
        revendedoras: REVENDEDORAS,
        proveedorNombre: null,
        ...props,
      }),
    );
  });
  return { onClose };
}

afterEach(() => {
  act(() => root?.unmount());
  contenedor?.remove();
  root = null;
  contenedor = null;
});

const texto = (t: string) =>
  Array.from(document.querySelectorAll<HTMLElement>("a, button")).find((e) => e.textContent?.includes(t));

describe("QuePasoSheet", () => {
  it("cerrada no muestra nada", () => {
    montar({ open: false });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("abierta muestra el título y las 6 opciones", () => {
    montar();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("¿Qué pasó?");
    for (const t of ["Vendí", "Me pagaron", "Pagué un gasto", "Entregué botellas", "Llegó un pedido", "Compré insumos"]) {
      expect(texto(t), t).toBeTruthy();
    }
  });

  it("\"Pagué un gasto\" apunta a /gastos/nuevo y los pedidos/insumos a su lugar", () => {
    montar();
    expect(texto("Pagué un gasto")?.getAttribute("href")).toBe("/gastos/nuevo");
    expect(texto("Llegó un pedido")?.getAttribute("href")).toBe("/stock/lotes/nuevo");
    expect(texto("Compré insumos")?.getAttribute("href")).toBe("/stock/insumos/factura");
  });

  it("\"Llegó un pedido\" nombra al proveedor configurado, o dice \"del proveedor\"", () => {
    montar({ proveedorNombre: "Olivares Test" });
    expect(texto("Llegó un pedido")?.textContent).toContain("de Olivares Test");
  });

  it("\"Llegó un pedido\" sin nombre dice \"del proveedor\"", () => {
    montar();
    expect(texto("Llegó un pedido")?.textContent).toContain("del proveedor");
  });

  it("Vendí → paso 2 con Ananja y cada revendedora con ?seccion=ventas", () => {
    montar();
    act(() => texto("Vendí")!.click());
    expect(document.body.textContent).toContain("¿Quién vendió?");
    expect(texto("Ananja, a un cliente")?.getAttribute("href")).toBe("/comprobantes/nuevo");
    expect(texto("Ana Pérez")?.getAttribute("href")).toBe("/revendedores/r1/carga?seccion=ventas");
  });

  it("Me pagaron → paso 2: cliente a /clientes y revendedora con ?seccion=pago", () => {
    montar();
    act(() => texto("Me pagaron")!.click());
    expect(texto("Un cliente")?.getAttribute("href")).toBe("/clientes");
    expect(texto("Bea Gómez")?.getAttribute("href")).toBe("/revendedores/r2/carga?seccion=pago");
  });

  it("Entregué botellas → ?seccion=entrega y sin opción extra", () => {
    montar();
    act(() => texto("Entregué botellas")!.click());
    expect(texto("Ana Pérez")?.getAttribute("href")).toBe("/revendedores/r1/carga?seccion=entrega");
    expect(texto("Un cliente")).toBeUndefined();
  });

  it("el buscador filtra sin importar acentos y \"‹ Volver\" vuelve al paso 1", () => {
    montar();
    act(() => texto("Entregué botellas")!.click());
    const input = document.querySelector<HTMLInputElement>('input[type="search"]')!;
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(input, "gomez");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(texto("Bea Gómez")).toBeTruthy();
    expect(texto("Ana Pérez")).toBeUndefined();
    act(() => texto("Volver")!.click());
    expect(document.body.textContent).toContain("Elegí y te llevo al lugar justo");
  });

  it("Escape cierra", () => {
    const { onClose } = montar();
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
