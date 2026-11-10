// @vitest-environment jsdom
// /ganancia: un fallo de carga no se ve como "Todavía no hay ventas ni gastos".
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/ganancia/ventas-por-mes", () => ({ VentasPorMes: () => null }));
vi.mock("@/components/ganancia/botellas-vendidas", () => ({ BotellasVendidas: () => null }));

const ok = <T,>(data: T) => ({ data, error: null });
const margen = vi.fn();
vi.mock("@/lib/data/ganancia", () => ({
  listarMargenVentas: () => margen(),
  listarGastosConCategoria: async () => ok([]),
  listarVendedoresNombre: async () => ok([]),
  cargarDatosGraficos: async () => ok({ comprobantes: [], ventasRevendedor: [], comprobanteItems: [], productos: [] }),
  listarCoordinadorIds: async () => [],
}));

import GananciaPage from "@/app/(app)/ganancia/page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let el: HTMLDivElement | null = null;
const boton = (t: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === t);
const texto = () => document.body.textContent ?? "";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
});
afterEach(() => {
  act(() => root?.unmount());
  el?.remove();
  margen.mockReset();
  vi.restoreAllMocks();
});

describe("GananciaPage", () => {
  it("si falla la carga avisa y 'Probar de nuevo' vuelve a pedir", async () => {
    margen
      .mockResolvedValueOnce({ data: [], error: "x" })
      .mockResolvedValueOnce(ok([]));
    await act(async () => root!.render(createElement(GananciaPage)));
    expect(texto()).toContain("No se pudo cargar la información de ganancia.");
    expect(texto()).not.toContain("Todavía no hay ventas");

    await act(async () => boton("Probar de nuevo")!.click());
    expect(margen).toHaveBeenCalledTimes(2);
    expect(texto()).not.toContain("No se pudo cargar");
    expect(texto()).toContain("Todavía no hay ventas ni gastos.");
  });

  it("éxito sin datos: estado vacío, sin aviso", async () => {
    margen.mockResolvedValue(ok([]));
    await act(async () => root!.render(createElement(GananciaPage)));
    expect(texto()).toContain("Todavía no hay ventas ni gastos.");
    expect(boton("Probar de nuevo")).toBeUndefined();
  });
});
