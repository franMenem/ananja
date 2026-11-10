// @vitest-environment jsdom
// /ganancia: la lectura lenta (v_margen_ventas) y los gráficos cargan por separado.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/ganancia/ventas-por-mes", () => ({ VentasPorMes: () => <p>GRAFICO-VENTAS</p> }));
vi.mock("@/components/ganancia/botellas-vendidas", () => ({ BotellasVendidas: () => <p>BOTELLAS-LISTAS</p> }));

type Res<T> = { data: T; error: string | null };
const ok = <T,>(data: T): Res<T> => ({ data, error: null });
function diferido<T>() {
  let resolver!: (v: T) => void;
  const promesa = new Promise<T>((r) => (resolver = r));
  return { promesa, resolver };
}

const margen = vi.fn();
const graficos = vi.fn();
vi.mock("@/lib/data/ganancia", () => ({
  listarMargenVentas: () => margen(),
  listarGastosConCategoria: async () => ok([]),
  listarVendedoresNombre: async () => ok([]),
  cargarDatosGraficos: () => graficos(),
  listarCoordinadorIds: async () => [],
}));

import GananciaPage from "@/app/(app)/ganancia/page";
import {
  EsqueletoBotellasVendidas,
  EsqueletoGananciaHeader,
  EsqueletoGananciaVendedores,
  EsqueletoTablaPorMes,
  EsqueletoVentasPorMes,
} from "@/components/ganancia/esqueletos";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DATOS_GRAFICOS = { comprobantes: [], ventasRevendedor: [], comprobanteItems: [], productos: [] };
let root: Root | null = null;
let el: HTMLDivElement | null = null;
const texto = () => document.body.textContent ?? "";
const esqueleto = (id: string) => document.querySelector(`[data-testid="ganancia-esqueleto-${id}"]`);
const boton = (t: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === t);

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
  graficos.mockReset();
  vi.restoreAllMocks();
});

const FILA_MARGEN = {
  origen: "comprobante",
  fecha: `${new Date().getFullYear()}-01-15`,
  vendedor_id: "v1",
  cantidad: 2,
  margen_ananja_centavos: 1000,
  ingreso_ananja_centavos: 5000,
  margen_vendedor_centavos: null,
  precio_unitario_venta_centavos: 2500,
  costo_estimado: false,
};

describe("GananciaPage: cargas independientes", () => {
  it("los gráficos aparecen sin esperar a la vista lenta, que mientras tanto muestra esqueletos y no 'vacío'", async () => {
    const lenta = diferido<Res<unknown[]>>();
    margen.mockReturnValue(lenta.promesa);
    graficos.mockResolvedValue(ok(DATOS_GRAFICOS));
    await act(async () => root!.render(createElement(GananciaPage)));

    expect(texto()).toContain("GRAFICO-VENTAS");
    expect(texto()).toContain("BOTELLAS-LISTAS");
    expect(esqueleto("header")).not.toBeNull();
    expect(esqueleto("por-mes")).not.toBeNull();
    expect(esqueleto("vendedores")).not.toBeNull();
    expect(esqueleto("ventas")).toBeNull();
    expect(texto()).not.toContain("Todavía no hay ventas");
    expect(texto()).toContain("Ganancia");

    await act(async () => lenta.resolver(ok([FILA_MARGEN])));
    expect(esqueleto("header")).toBeNull();
    expect(esqueleto("por-mes")).toBeNull();
    expect(texto()).toContain("Por mes");
    expect(texto()).not.toContain("Todavía no hay ventas ni gastos.");
  });

  it("si la vista lenta termina primero, los gráficos muestran su esqueleto hasta que llegan", async () => {
    const g = diferido<Res<typeof DATOS_GRAFICOS>>();
    margen.mockResolvedValue(ok([FILA_MARGEN]));
    graficos.mockReturnValue(g.promesa);
    await act(async () => root!.render(createElement(GananciaPage)));

    expect(texto()).toContain("Por mes");
    expect(esqueleto("ventas")).not.toBeNull();
    expect(esqueleto("botellas")).not.toBeNull();

    await act(async () => g.resolver(ok(DATOS_GRAFICOS)));
    expect(esqueleto("ventas")).toBeNull();
    expect(texto()).toContain("GRAFICO-VENTAS");
  });

  it("vacío: recién se afirma cuando la carga lenta terminó, y no parpadea", async () => {
    const lenta = diferido<Res<unknown[]>>();
    margen.mockReturnValue(lenta.promesa);
    graficos.mockResolvedValue(ok(DATOS_GRAFICOS));
    await act(async () => root!.render(createElement(GananciaPage)));
    expect(texto()).not.toContain("Todavía no hay ventas ni gastos.");
    await act(async () => lenta.resolver(ok([])));
    expect(texto()).toContain("Todavía no hay ventas ni gastos.");
    expect(esqueleto("header")).toBeNull();
    expect(texto()).toContain("GRAFICO-VENTAS");
  });

  it("falla la vista lenta: avisa solo en su lugar y los gráficos siguen; reintentar vuelve a pedir solo esa carga", async () => {
    margen.mockResolvedValueOnce({ data: [], error: "x" }).mockResolvedValueOnce(ok([FILA_MARGEN]));
    graficos.mockResolvedValue(ok(DATOS_GRAFICOS));
    await act(async () => root!.render(createElement(GananciaPage)));
    expect(texto()).toContain("No se pudo cargar la información de ganancia.");
    expect(texto()).toContain("GRAFICO-VENTAS");

    await act(async () => boton("Probar de nuevo")!.click());
    expect(margen).toHaveBeenCalledTimes(2);
    expect(graficos).toHaveBeenCalledTimes(1);
    expect(texto()).not.toContain("No se pudo cargar");
    expect(texto()).toContain("Por mes");
  });

  it("fallan los gráficos: avisa solo ahí, la cuenta se ve, y reintentar no vuelve a pedir la vista", async () => {
    margen.mockResolvedValue(ok([FILA_MARGEN]));
    graficos
      .mockResolvedValueOnce({ data: DATOS_GRAFICOS, error: "boom" })
      .mockResolvedValueOnce(ok(DATOS_GRAFICOS));
    await act(async () => root!.render(createElement(GananciaPage)));
    expect(texto()).toContain("No se pudieron cargar los gráficos de ventas.");
    expect(texto()).toContain("Por mes");
    expect(texto()).not.toContain("GRAFICO-VENTAS");

    await act(async () => boton("Probar de nuevo")!.click());
    expect(graficos).toHaveBeenCalledTimes(2);
    expect(margen).toHaveBeenCalledTimes(1);
    expect(texto()).toContain("GRAFICO-VENTAS");
  });

  it("cambiar de período no vuelve a pedir nada", async () => {
    margen.mockResolvedValue(ok([FILA_MARGEN]));
    graficos.mockResolvedValue(ok(DATOS_GRAFICOS));
    await act(async () => root!.render(createElement(GananciaPage)));
    await act(async () => boton("Este mes")!.click());
    expect(margen).toHaveBeenCalledTimes(1);
    expect(graficos).toHaveBeenCalledTimes(1);
  });
});

describe("esqueletos de /ganancia", () => {
  it("usan las mismas cajas que el bloque real (títulos y clases de alto)", () => {
    const html = renderToStaticMarkup(
      <>
        <EsqueletoGananciaHeader />
        <EsqueletoTablaPorMes filas={3} />
        <EsqueletoGananciaVendedores />
        <EsqueletoVentasPorMes />
        <EsqueletoBotellasVendidas />
      </>,
    );
    // Títulos reales ya visibles.
    for (const t of ["Por mes", "Ganancia de cada vendedor", "Ventas por mes", "Botellas vendidas"]) {
      expect(html).toContain(t);
    }
    // Filas de la cuenta (44 px) y de "Por mes" (48 px) como las reales.
    expect(html.match(/min-h-11 items-center justify-between/g)?.length).toBe(3 + 0);
    expect(html.match(/min-h-12 items-center justify-between/g)?.length).toBe(3);
    // Mismo summary de 44 px que el <details> real.
    expect(html).toContain("flex min-h-11 items-center text-[17px] font-semibold");
  });
});
