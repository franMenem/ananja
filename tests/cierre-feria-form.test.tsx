// @vitest-environment jsdom
// Cierre de la participación en una feria: un solo formulario para la revendedora (/mi/feria/cerrar)
// y para el admin (/ferias/[id]/cerrar/[vendedorId]). Datos inventados.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const cerrarParticipacion = vi.fn<(cliente: unknown, datos: unknown) => Promise<{ error: { message: string } | null }>>(async () => ({ error: null }));

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
  usePathname: () => "/ferias",
}));
vi.mock("@/components/page-header-context", () => ({ SetFormHeader: () => null }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/ferias", () => ({
  feriaCerrarParticipacion: (c: unknown, d: unknown) => cerrarParticipacion(c, d),
}));

import {
  CierreFeriaForm,
  TEXTOS_CIERRE_FERIA_MI,
  textosCierreFeriaAdmin,
  type ProductoCierreForm,
} from "@/components/ferias/cierre-feria-form";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const productos: ProductoCierreForm[] = [
  { productoId: "a", nombre: "Aceite 250", entregadas: 10, yaVendidas: 2, precioCentavos: 1500000 },
  { productoId: "b", nombre: "Aceite 500", entregadas: 4, yaVendidas: 0, precioCentavos: 2800000 },
];

const mi = (p: ProductoCierreForm[] = productos) => (
  <CierreFeriaForm feriaId="f1" vendedorId={null} productos={p} volverHref="/mi/feria" textos={TEXTOS_CIERRE_FERIA_MI} />
);
const admin = (p: ProductoCierreForm[] = productos) => (
  <CierreFeriaForm
    feriaId="f1"
    vendedorId="v1"
    productos={p}
    volverHref="/ferias/f1"
    textos={textosCierreFeriaAdmin("Ana")}
  />
);

describe("CierreFeriaForm (revendedora)", () => {
  const html = renderToStaticMarkup(mi());

  it("precarga precios y calcula lo vendido en vivo", () => {
    expect(html).toContain("Te llevaste 10");
    expect(html).toContain("ya vendiste 2");
    expect(html).toContain("15.000");
    expect(html).toContain("28.000");
    // a: 10 - 2 = 8 x 15.000 = 120.000 ; b: 4 x 28.000 = 112.000 ; total 232.000
    expect(html).toContain("232.000");
    expect(html).toContain("Total vendido");
    expect(html).toContain("Vendiste");
  });

  it("habla en segunda persona, con las tres plata, fecha y el pie de cierre", () => {
    expect(html).toContain("¿Qué pasó con lo que te llevaste?");
    expect(html).toContain("Devolvés");
    expect(html).toContain("¿Cuánta plata juntaste?");
    expect(html).toContain("Efectivo");
    expect(html).toContain("Mercado Pago");
    expect(html).toContain("Banco");
    expect(html).toContain("Cerrar mi feria");
    expect(html).toContain('href="/mi/feria"');
    expect(html.toLowerCase()).not.toContain("lote");
  });

  it("muestra lo ya cargado para degustación y renombra el stepper a Degustación extra", () => {
    const conCarga = renderToStaticMarkup(
      mi([{ ...productos[0], yaVendidas: 0, degustadasCarga: 3 }, productos[1]]),
    );
    expect(conCarga).toContain("ya tenés 3 para degustación");
    expect(conCarga).toContain("Degustación extra");
    // El segundo producto, sin carga, sigue con "Degustación" a secas.
    expect(conCarga.match(/Degustación<\/span>/g)?.length).toBe(1);
  });
});

describe("CierreFeriaForm (admin)", () => {
  const html = renderToStaticMarkup(admin());

  it("habla de la revendedora en tercera persona", () => {
    expect(html).toContain("¿Qué pasó con lo que se llevó Ana?");
    expect(html).toContain("Se llevó 10");
    expect(html).toContain("ya vendió 2");
    expect(html).toContain("Devuelve");
    expect(html).toContain("Vendió");
    expect(html).toContain("¿Cuánta plata juntó?");
    expect(html).toContain("Cerrar participación");
    expect(html).toContain('href="/ferias/f1"');
    expect(html).toContain("232.000");
  });

  it("sin productos avisa que no se le cargaron botellas", () => {
    expect(renderToStaticMarkup(admin([]))).toContain("Todavía no se le cargaron botellas.");
    expect(renderToStaticMarkup(mi([]))).not.toContain("Todavía no se le cargaron botellas.");
  });

  it("la diferencia de plata se dice en tercera persona", () => {
    expect(textosCierreFeriaAdmin("Ana").diferencia(-500000)).toContain("Faltan");
    expect(TEXTOS_CIERRE_FERIA_MI.diferencia(-500000)).toContain("Te faltan");
  });
});

describe("guardado", () => {
  let root: Root | null = null;
  let el: HTMLDivElement | null = null;

  async function montar(nodo: React.ReactNode) {
    el = document.createElement("div");
    document.body.appendChild(el);
    root = createRoot(el);
    await act(async () => {
      root!.render(nodo);
    });
  }

  async function enviar() {
    await act(async () => {
      document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
  }

  afterEach(() => {
    act(() => root?.unmount());
    el?.remove();
    document.body.innerHTML = "";
    cerrarParticipacion.mockClear();
    push.mockClear();
  });

  it("la revendedora manda vendedorId null, confirma antes de guardar y vuelve a /mi/feria", async () => {
    await montar(mi());
    await enviar();
    expect(cerrarParticipacion).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Vas a registrar 12 botellas vendidas por $ 232.000,00 y devolver 0. ¿Confirmás?");

    const confirmar = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Sí, cerrar"))!;
    await act(async () => {
      confirmar.click();
    });
    expect(cerrarParticipacion).toHaveBeenCalledTimes(1);
    expect(cerrarParticipacion.mock.calls[0][1]).toMatchObject({ feriaId: "f1", vendedorId: null });
    expect(push).toHaveBeenCalledWith("/mi/feria");
  });

  it("el admin manda el vendedorId, guarda directo y vuelve a la feria", async () => {
    await montar(admin());
    await enviar();
    expect(cerrarParticipacion).toHaveBeenCalledTimes(1);
    expect(cerrarParticipacion.mock.calls[0][1]).toMatchObject({ feriaId: "f1", vendedorId: "v1" });
    expect(push).toHaveBeenCalledWith("/ferias/f1");
  });
});
