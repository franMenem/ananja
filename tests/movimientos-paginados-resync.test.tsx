// @vitest-environment jsdom
//
// Bug: `MovimientosPaginados` hacía `useState(itemsIniciales)` y nunca volvía a
// leer la prop, así que tras un `router.refresh()` (eliminar depósito, editar
// o crear un ajuste) los totales del servidor cambiaban pero la lista no.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/caja/lista-movimientos", () => ({
  ListaMovimientos: ({ items }: { items: { fila: { key: string; titulo: string } }[] }) => (
    <ul>
      {items.map((i) => (
        <li key={i.fila.key}>{i.fila.titulo}</li>
      ))}
    </ul>
  ),
}));
const cargar = vi.fn();
vi.mock("@/lib/data/plata", () => ({
  cargarMovimientosPlata: (...a: unknown[]) => cargar(...a),
  itemsGenerales: (filas: unknown[]) => filas,
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

import { MovimientosPaginados } from "@/components/plata/movimientos-paginados";
import type { ItemMovimiento } from "@/components/caja/lista-movimientos";

const item = (key: string, monto = 100): ItemMovimiento =>
  ({ fila: { key, titulo: key }, montoCentavos: monto }) as unknown as ItemMovimiento;

let mounted: { root: Root; container: HTMLDivElement }[] = [];
afterEach(() => {
  for (const { root, container } of mounted) {
    act(() => root.unmount());
    container.remove();
  }
  mounted = [];
  cargar.mockReset();
});

function montar(items: ItemMovimiento[]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  const render = (its: ItemMovimiento[]) =>
    act(() =>
      root.render(<MovimientosPaginados itemsIniciales={its} limiteInicial={2} paso={2} vacio="vacío" />),
    );
  render(items);
  return { container, render };
}

const titulos = (c: HTMLElement) => [...c.querySelectorAll("li")].map((l) => l.textContent);

describe("MovimientosPaginados", () => {
  it("muestra los movimientos nuevos cuando el servidor manda otra lista (router.refresh)", () => {
    const { container, render } = montar([item("a"), item("b")]);
    expect(titulos(container)).toEqual(["a", "b"]);
    render([item("a"), item("c")]); // se eliminó "b", entró "c"
    expect(titulos(container)).toEqual(["a", "c"]);
  });

  it("un re-render con los mismos datos no pisa las páginas cargadas con Ver más", async () => {
    cargar.mockResolvedValue([item("a"), item("b"), item("x")]);
    const { container, render } = montar([item("a"), item("b")]);
    const boton = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Ver más"))!;
    await act(async () => boton.click());
    expect(titulos(container)).toEqual(["a", "b", "x"]);
    render([item("a"), item("b")]); // props nuevas pero iguales
    expect(titulos(container)).toEqual(["a", "b", "x"]);
  });
});
