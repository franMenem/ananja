// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/vendedor-actual", () => ({
  useVendedorActual: () => ({ vendedor: null, loading: false }),
}));
vi.mock("@/app/(app)/revendedores/invitar/actions", () => ({
  darDeAlta: async () => null,
  nuevaPasswordTemporal: async () => ({ ok: true, mensaje: "" }),
  reenviarInvitacion: async () => ({ ok: true, mensaje: "" }),
}));

const INSUMOS = [
  { id: "i1", nombre: "Etiqueta frente", tipo: "etiqueta", unidad: "unidad", umbral_minimo: 0, activo: true },
  { id: "i2", nombre: "Etiqueta retro", tipo: "etiqueta", unidad: "unidad", umbral_minimo: 0, activo: true },
];
vi.mock("@/lib/data/insumos", () => ({
  listarRecetas: async () => ({
    data: [
      { producto_id: "p1", insumo_id: "i1", cantidad: 1 },
      { producto_id: "p1", insumo_id: "i2", cantidad: 1 },
    ],
  }),
  listarInsumosActivos: async () => ({ data: INSUMOS, error: null }),
}));

import { PageHeaderProvider } from "@/components/page-header-context";
import { AjusteInsumoForm } from "@/components/stock/ajuste-insumo-form";
import { CompraFacturaForm } from "@/components/stock/compra-factura-form";
import { LoteForm } from "@/components/stock/lote-form";
import { MovimientoForm } from "@/components/stock/movimiento-form";
import { NuevoInsumoForm } from "@/components/stock/nuevo-insumo-form";
import { PagoLoteForm } from "@/components/stock/pago-lote-form";
import { ProveedorForm } from "@/components/stock/proveedor-form";
import { ClienteForm } from "@/components/cliente-form";
import { MaterialForm } from "@/components/material/material-form";
import { AltaForm } from "@/components/invitaciones/alta-form";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let el: HTMLDivElement | null = null;

async function montar(nodo: React.ReactNode) {
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => {
    root!.render(<PageHeaderProvider>{nodo}</PageHeaderProvider>);
  });
  return el;
}

afterEach(() => {
  act(() => root?.unmount());
  el?.remove();
  root = null;
  el = null;
});

const PRODUCTOS = [{ id: "p1", nombre: "Botella 500 ml", presentacion_ml: 500 }];

function titulos(c: HTMLElement): string[] {
  return Array.from(c.querySelectorAll("h2")).map((h) => h.textContent ?? "");
}

describe("Pedido nuevo", () => {
  it("arranca con las cantidades y suma las secciones de costos al cargar botellas", async () => {
    const c = await montar(<LoteForm productos={PRODUCTOS} />);
    expect(titulos(c)).toEqual(["Cantidades por tamaño"]);

    const mas = c.querySelector<HTMLButtonElement>('button[aria-label="Sumar una unidad de Botella 500 ml"]')!;
    await act(async () => mas.click());

    const t = titulos(c);
    for (const esperado of ["Cantidades por tamaño", "Aceite", "Envasado", "Etiquetas", "Transporte", "IVA"]) {
      expect(t).toContain(esperado);
    }
    // Envasado antes que Etiquetas (orden pedido por Fran: aceite, envasado, etiquetas, transporte).
    expect(t.indexOf("Envasado")).toBeLessThan(t.indexOf("Etiquetas"));
    expect(t.indexOf("Etiquetas")).toBeLessThan(t.indexOf("Transporte"));
  });

  it("el aviso del dólar heredado y el del IVA quedan visibles (no dentro de Más datos)", async () => {
    const c = await montar(
      <LoteForm
        productos={PRODUCTOS}
        ultimoLoteDolarCentavos={150000}
        ultimoLotePrecioLitroAceiteUsdCentavos={500}
        ultimoLoteFecha="2026-10-01"
      />,
    );
    await act(async () =>
      c.querySelector<HTMLButtonElement>('button[aria-label="Sumar una unidad de Botella 500 ml"]')!.click(),
    );
    const aviso = Array.from(c.querySelectorAll('[role="note"]')).find((n) => n.textContent?.includes("¿Lo actualizás?"));
    expect(aviso).toBeTruthy();
    expect(aviso!.closest("details")).toBeNull();
    expect(aviso!.textContent).toContain("¿Sigue vigente?");
    // El IVA: el tilde "sin IVA" y su explicación siguen a la vista.
    expect(c.textContent).toContain("se le suma el 21% de IVA");
    expect(c.querySelector("details")).toBeNull();
  });

  it("los inputs numéricos son decimales (teclado numérico) y de 16px", async () => {
    const c = await montar(<LoteForm productos={PRODUCTOS} />);
    await act(async () =>
      c.querySelector<HTMLButtonElement>('button[aria-label="Sumar una unidad de Botella 500 ml"]')!.click(),
    );
    const dolar = c.querySelector<HTMLInputElement>("#dolar")!;
    expect(dolar.getAttribute("inputmode")).toBe("decimal");
    expect(dolar.className).toContain("text-[16px]");
    expect(c.querySelector<HTMLInputElement>("#transporte-pct")!.getAttribute("inputmode")).toBe("decimal");
  });

  it("no muestra las palabras caja ni lote", async () => {
    const c = await montar(<LoteForm productos={PRODUCTOS} />);
    await act(async () =>
      c.querySelector<HTMLButtonElement>('button[aria-label="Sumar una unidad de Botella 500 ml"]')!.click(),
    );
    expect(c.textContent).not.toMatch(/\bcaja\b|\blotes?\b/i);
  });
});

describe("Cargar una compra de insumos", () => {
  it("en celular cada línea es una tarjeta apilada, sin tabla", async () => {
    const c = await montar(<CompraFacturaForm />);
    expect(c.querySelector("table")).toBeNull();
    expect(c.querySelectorAll('[role="group"][aria-label^="Línea"]')).toHaveLength(1);

    const agregar = Array.from(c.querySelectorAll("button")).find((b) => b.textContent?.includes("Agregar otra línea"))!;
    await act(async () => agregar.click());
    const lineas = c.querySelectorAll('[role="group"][aria-label^="Línea"]');
    expect(lineas).toHaveLength(2);
    // Cada línea tiene su insumo, cantidad y precio unitario.
    expect(lineas[1].querySelector("select")).not.toBeNull();
    expect(lineas[1].querySelectorAll("input[inputmode='decimal']")).toHaveLength(2);
  });

  it("agrupa en secciones y deja lo opcional en Más datos", async () => {
    const c = await montar(<CompraFacturaForm />);
    expect(titulos(c)).toEqual(expect.arrayContaining(["La factura", "Lo que compraste", "IVA y envío", "Revisá la factura"]));
    const mas = c.querySelector("details")!;
    expect(mas.textContent).toContain("Más datos (opcional)");
    expect(mas.querySelector("#factura-nota")).not.toBeNull();
  });
});

describe("Ningún formulario toca las palabras caja ni lote", () => {
  const CASOS: [string, () => React.ReactNode][] = [
    ["pago del pedido", () => <PagoLoteForm loteId="l1" pendienteCentavos={100000} conceptos={[]} pagadoSinConceptoCentavos={0} fecha="2026-10-01" />],
    ["ajuste de insumo", () => <AjusteInsumoForm />],
    ["nuevo insumo", () => <NuevoInsumoForm />],
    ["proveedor", () => <ProveedorForm nombreInicial={null} />],
    ["sacar botellas", () => <MovimientoForm productos={PRODUCTOS} lotesConStock={[]} />],
    ["cliente", () => <ClienteForm mode="crear" />],
    ["material", () => <MaterialForm />],
    ["sumar persona", () => <AltaForm coordinadores={[]} />],
  ];
  for (const [nombre, hacer] of CASOS) {
    it(nombre, async () => {
      const c = await montar(hacer());
      expect(c.textContent).not.toMatch(/\bcaja\b|\blotes?\b/i);
    });
  }
});

describe("Pagar el pedido", () => {
  it("título con la fecha y el pendiente a la vista", async () => {
    const c = await montar(
      <PagoLoteForm
        loteId="l1"
        pendienteCentavos={150000}
        conceptos={[]}
        pagadoSinConceptoCentavos={0}
        fecha="2026-10-01"
      />,
    );
    expect(c.textContent).toContain("Falta pagar");
    expect(c.textContent).toContain("1.500,00");
    expect(c.querySelector("form button[type='submit']")?.textContent).toContain("Registrar pago");
  });
});

describe("Cliente nuevo", () => {
  it("nombre y teléfono a la vista; el resto en Más datos", async () => {
    const c = await montar(<ClienteForm mode="crear" />);
    const mas = c.querySelector("details")!;
    expect(mas.querySelector("#cliente-direccion")).not.toBeNull();
    expect(mas.querySelector("#cliente-email")).not.toBeNull();
    expect(mas.querySelector("#cliente-nombre")).toBeNull();
    expect(c.querySelector("#cliente-telefono")!.closest("details")).toBeNull();
  });
});
