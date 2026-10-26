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

import { FormHeaderDesktop } from "@/components/app/form-header-desktop";
import { PageHeaderProvider } from "@/components/page-header-context";
import { CargaForm } from "@/components/revendedores/carga-form";
import { PagoDeudaForm } from "@/components/deudas/pago-deuda-form";
import { Campo, Entrada } from "@/components/ui/campo";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let el: HTMLDivElement | null = null;

function montar(nodo: React.ReactNode) {
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  act(() => root!.render(nodo));
  return el;
}

afterEach(() => {
  act(() => root?.unmount());
  el?.remove();
  root = null;
  el = null;
});

describe("Campo", () => {
  it("con error marca aria-invalid, lo describe y muestra el mensaje", () => {
    const c = montar(
      <Campo id="x" etiqueta="Monto" error="Revisá el monto.">
        <Entrada />
      </Campo>,
    );
    const input = c.querySelector("input")!;
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("x-error");
    expect(c.querySelector("#x-error")?.textContent).toContain("Revisá el monto.");
    expect(c.querySelector("label")?.getAttribute("for")).toBe("x");
  });

  it("sin error no marca aria-invalid", () => {
    const c = montar(
      <Campo id="y" etiqueta="Nota" opcional>
        <Entrada />
      </Campo>,
    );
    expect(c.querySelector("input")!.getAttribute("aria-invalid")).toBeNull();
    expect(c.textContent).toContain("(opcional)");
  });
});

const PRODUCTOS = [{ id: "p1", nombre: "Aceite 500 ml" }];

function carga(seccion: "entrega" | "ventas" | "pago", conSeccion: boolean) {
  return (
    <PageHeaderProvider>
      <FormHeaderDesktop />
      <CargaForm
        vendedorId="v1"
        vendedorNombre="Laura"
        seccionInicial={seccion}
        conSeccion={conSeccion}
        encargadoNombre={null}
        deudaCentavos={100000}
        pagosPendientes={[]}
        productos={PRODUCTOS}
        lotes={[]}
        items={[]}
        ventas={[]}
        preciosManuales={{}}
        fechaLotePorId={{}}
        hoy="2026-10-26"
      />
    </PageHeaderProvider>
  );
}

describe("CargaForm con ?seccion", () => {
  it("pago: título de la acción y solo el pago abierto", () => {
    const c = montar(carga("pago", true));
    expect(c.querySelector("h1")?.textContent).toBe("Registrar pago de Laura");
    expect(c.querySelector("#monto-pago")).not.toBeNull();
    expect(c.querySelector("#fecha-entrega")).toBeNull();
    expect(c.querySelector("#fecha-ventas")).toBeNull();
    expect(c.textContent).toContain("+ Agregar también una entrega");
    expect(c.textContent).toContain("+ Agregar también una venta");
  });

  it("entrega y ventas llevan su título", () => {
    expect(montar(carga("entrega", true)).querySelector("h1")?.textContent).toBe("Entregar botellas a Laura");
    act(() => root!.unmount());
    el!.remove();
    expect(montar(carga("ventas", true)).querySelector("h1")?.textContent).toBe("Registrar venta de Laura");
  });

  it("un link despliega la otra sección", () => {
    const c = montar(carga("pago", true));
    const link = Array.from(c.querySelectorAll("button")).find((b) => b.textContent?.includes("una venta"))!;
    act(() => link.click());
    expect(c.querySelector("#fecha-ventas")).not.toBeNull();
    expect(c.querySelector("#monto-pago")).not.toBeNull();
  });

  it("sin ?seccion se ven las tres como antes", () => {
    const c = montar(carga("entrega", false));
    expect(c.querySelector("h1")?.textContent).toBe("Cargar movimiento de Laura");
    expect(c.querySelector("#fecha-entrega")).not.toBeNull();
    expect(c.textContent).not.toContain("+ Agregar también");
  });

  it("no muestra las palabras caja ni lote", () => {
    for (const s of ["entrega", "ventas", "pago"] as const) {
      const c = montar(carga(s, true));
      expect(c.textContent).not.toMatch(/\bcaja\b|\blotes?\b/i);
      act(() => root!.unmount());
      el!.remove();
    }
  });
});

describe("PagoDeudaForm", () => {
  it("no muestra la palabra caja", () => {
    const c = montar(<PagoDeudaForm deudaId="d" moneda="USD" restanteCentavos={10000} dolarCentavos={null} />);
    expect(c.textContent).not.toMatch(/\bcaja\b|\blotes?\b/i);
  });
});
