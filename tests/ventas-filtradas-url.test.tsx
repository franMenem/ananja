// @vitest-environment jsdom
// El filtro aplicado de /mi/ventas vive en la URL: sobrevive a "abrir una venta y volver".
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

// URL simulada: `history.replaceState` cambia la query y el próximo render la lee
// (en Next, `useSearchParams` se entera solo). No hay router: no se pide la página.
let query = "";
const replace = vi.fn((_estado: unknown, _titulo: string, url?: string | URL | null) => {
  const u = String(url ?? "");
  query = u.includes("?") ? u.split("?")[1] : "";
});
vi.spyOn(window.history, "replaceState").mockImplementation(replace);
vi.mock("next/navigation", () => ({
  usePathname: () => "/mi/ventas",
  useSearchParams: () => new URLSearchParams(query),
}));

import { VentasFiltradas } from "@/components/mi/ventas-filtradas";
import type { MesVentasMi } from "@/lib/dominio/filtro-ventas-mi";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const venta = (id: string, fecha: string, medioPago: "efectivo" | "banco" | null) => ({
  id,
  fecha,
  productoNombre: "Aceite",
  cantidad: 2,
  totalCentavos: 100000,
  medioPago,
});
const MESES: MesVentasMi[] = [
  { periodo: "2026-10", ventas: [venta("a", "2026-10-05", "efectivo"), venta("b", "2026-10-06", "banco")] },
];

let root: Root | null = null;
let contenedor: HTMLDivElement | null = null;

function montar() {
  contenedor = document.createElement("div");
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
  act(() => root!.render(createElement(VentasFiltradas, { meses: MESES, hoy: "2026-10-20" })));
}
function desmontar() {
  act(() => root?.unmount());
  contenedor?.remove();
  root = null;
  contenedor = null;
}
afterEach(() => {
  desmontar();
  query = "";
  replace.mockClear();
});

const boton = (t: string) =>
  Array.from(document.querySelectorAll<HTMLElement>("button")).find((e) => e.textContent?.trim() === t)!;

describe("VentasFiltradas — filtro aplicado en la URL", () => {
  it("abrir → elegir → Aplicar escribe la URL con history.replaceState y la lista sale filtrada al leerla", () => {
    montar();
    act(() => boton("Filtrar").click());
    act(() => boton("Banco").click());
    act(() => boton("Aplicar").click());
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0][2]).toBe("/mi/ventas?m=banco");
    desmontar();
    montar();
    expect(document.body.textContent).toContain("Todo el tiempo · Banco");
    expect(document.querySelector('a[href="/mi/ventas/b"]')).toBeTruthy();
    expect(document.querySelector('a[href="/mi/ventas/a"]')).toBeNull();
  });

  it("el filtro sobrevive a desmontar y volver a montar (abrir una venta y volver con atrás)", () => {
    query = "p=dia&d=2026-10-05&m=efectivo";
    montar();
    expect(document.body.textContent).toContain("5 de octubre · Efectivo");
    expect(document.querySelector('a[href="/mi/ventas/a"]')).toBeTruthy();
    expect(document.querySelector('a[href="/mi/ventas/b"]')).toBeNull();
  });

  it("Limpiar (borrador) → Aplicar deja la URL limpia", () => {
    query = "p=mes&m=banco";
    montar();
    act(() => boton("Filtrar").click());
    act(() => boton("Limpiar").click());
    act(() => boton("Aplicar").click());
    expect(replace.mock.calls[0][2]).toBe("/mi/ventas");
  });

  it("una URL con basura cae al default sin romper", () => {
    query = "p=dia&d=basura&m=zzz";
    montar();
    expect(document.body.textContent).toContain("Todo el tiempo · Todos los medios");
  });

  it("elegir \"Un día\" escribe p=dia&d=…", () => {
    montar();
    act(() => boton("Filtrar").click());
    act(() => boton("Un día").click());
    act(() => boton("Aplicar").click());
    expect(replace.mock.calls[0][2]).toBe("/mi/ventas?p=dia&d=2026-10-20");
  });
});
