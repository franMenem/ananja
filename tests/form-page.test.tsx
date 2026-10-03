// @vitest-environment jsdom
//
// Snapshot-diff de la tanda 4 (extracción de FormPage): verifica que
// `<FormPage>`/`<FormHeaderDesktop>` renderizan EXACTAMENTE el mismo HTML
// que el bloque viejo (`<SetFormHeader/>` + `<div className="hidden
// items-center gap-3 lg:flex">…`) que estaba copiado a mano en cada
// página, para cada combinación de maxWidth/gap/pb realmente usada en las
// 17 páginas migradas con `<FormPage>` (censo en el plan).
//
// `SetFormHeader` registra el título vía `useEffect`, que NO corre en un
// render estático (`renderToStaticMarkup`) — por eso este test monta con
// `react-dom/client` + `act()` en jsdom en vez de comparar markup estático:
// así se prueba el circuito real `SetFormHeader → contexto → FormHeaderDesktop`,
// no una aproximación.
//
// Única diferencia esperada y revisada a conciencia (además de los 2 bugs
// de título de §0): `FormHeaderDesktop` siempre agrega `leading-none` al
// link "←" (11 de las 17 páginas + los 5 form components de la sección E
// ya lo tenían; el resto no). Es la clase que ya proponía el propio plan
// como implementación de referencia. `leading-none` solo cambia la altura
// de la caja de línea de un glifo que ocupa una sola línea dentro de un
// link con `min-h-11` centrado por `items-center` — no hay diferencia de
// render posible. El helper de abajo la normaliza ANTES de comparar, así
// cualquier otra diferencia sigue haciendo fallar el test.
import Link from "next/link";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { FormHeaderDesktop } from "@/components/app/form-header-desktop";
import { FormPage } from "@/components/app/form-page";
import { PageHeaderProvider, SetFormHeader } from "@/components/page-header-context";

let mounted: { root: Root; container: HTMLDivElement }[] = [];

afterEach(() => {
  for (const { root, container } of mounted) {
    act(() => root.unmount());
    container.remove();
  }
  mounted = [];
});

function mount(node: React.ReactElement): string {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  mounted.push({ root, container });
  return container.innerHTML;
}

/** Único diff esperado (ver cabecera del archivo): normaliza `leading-none`. */
function sinLeadingNone(html: string): string {
  return html.replace(/\s?leading-none/g, "");
}

function expectMismoMarkup(nuevoHtml: string, viejoHtml: string) {
  expect(sinLeadingNone(nuevoHtml)).toBe(sinLeadingNone(viejoHtml));
}

/** Reproduce el bloque viejo, carácter a carácter, tal como estaba copiado
 * en cada página (import Link from "next/link" + SetFormHeader + el div
 * `hidden … lg:flex`). */
function OldTitleBlock({
  title,
  backHref,
  backLabel,
  leadingNone,
}: {
  title: string;
  backHref: string;
  backLabel: string;
  leadingNone: boolean;
}) {
  return (
    <div className="hidden items-center gap-3 lg:flex">
      <Link
        href={backHref}
        aria-label={backLabel}
        className={`flex min-h-11 min-w-11 items-center justify-center text-[22px]${leadingNone ? " leading-none" : ""} text-primary`}
      >
        ←
      </Link>
      <h1 className="font-display text-[22px] text-primary">{title}</h1>
    </div>
  );
}

function OldPage({
  title,
  backHref,
  backLabel,
  leadingNone,
  maxWidth,
  gap,
  pb,
  children,
}: {
  title: string;
  backHref: string;
  backLabel: string;
  leadingNone: boolean;
  maxWidth: 720 | 760 | "none";
  gap: 5 | 6 | 8;
  pb: boolean;
  children?: React.ReactNode;
}) {
  const inner = (
    <div className={`flex flex-col gap-${gap}${pb ? " pb-8" : ""}`}>
      <SetFormHeader title={title} backHref={backHref} backLabel={backLabel} />
      <OldTitleBlock title={title} backHref={backHref} backLabel={backLabel} leadingNone={leadingNone} />
      {children}
    </div>
  );
  if (maxWidth === "none") return <PageHeaderProvider>{inner}</PageHeaderProvider>;
  return (
    <PageHeaderProvider>
      <div className={`mx-auto w-full max-w-[${maxWidth}px]`}>{inner}</div>
    </PageHeaderProvider>
  );
}

// Tailwind necesita las clases completas en el código fuente para generarlas
// — `OldPage` de arriba las interpola solo para este test (nunca se compila
// a CSS real), así que el string SÍ importa acá aunque en producción sería
// un bug (mismo riesgo documentado en el plan § Riesgos / FormPage).

type Combo = {
  nombre: string;
  title: string;
  backHref: string;
  backLabel: string;
  leadingNone: boolean;
  maxWidth: 720 | 760 | "none";
  gap: 5 | 6 | 8;
  pb: boolean;
};

// Censo real de las 17 páginas migradas con <FormPage> (plan § 1, casos A+C):
// 5 combinaciones distintas de (maxWidth, gap, pb, leadingNone) cubren las 17.
const COMBOS: Combo[] = [
  {
    nombre: "720/gap-5/sin pb/sin leading-none (10 páginas: clientes, comprobantes, plata/deudas, stock/insumos)",
    title: "Nuevo cliente",
    backHref: "/clientes",
    backLabel: "Volver a clientes",
    leadingNone: false,
    maxWidth: 720,
    gap: 5,
    pb: false,
  },
  {
    nombre: "720/gap-5/pb-8/leading-none (gastos/nuevo)",
    title: "Registrar gasto",
    backHref: "/gastos",
    backLabel: "Volver a gastos",
    leadingNone: true,
    maxWidth: 720,
    gap: 5,
    pb: true,
  },
  {
    nombre: "760/gap-5/pb-8/leading-none (gastos/[id], plata/cuenta/[medio], plata/en-manos/[id])",
    title: "Detalle del gasto",
    backHref: "/gastos",
    backLabel: "Volver a gastos",
    leadingNone: true,
    maxWidth: 760,
    gap: 5,
    pb: true,
  },
  {
    nombre: "720/gap-8/pb-8/sin leading-none (revendedores/invitar)",
    title: "Sumar persona",
    backHref: "/revendedores",
    backLabel: "Volver a revendedores",
    leadingNone: false,
    maxWidth: 720,
    gap: 8,
    pb: true,
  },
  {
    nombre: "sin mx-auto (\"none\")/gap-5/pb-8/leading-none (stock/lotes, stock/movimientos)",
    title: "Pedidos",
    backHref: "/stock",
    backLabel: "Volver a stock",
    leadingNone: true,
    maxWidth: "none",
    gap: 5,
    pb: true,
  },
];

describe("FormPage / FormHeaderDesktop — paridad con el bloque viejo", () => {
  for (const combo of COMBOS) {
    it(`produce el mismo HTML que el bloque viejo — ${combo.nombre}`, () => {
      const viejoHtml = mount(
        <OldPage
          title={combo.title}
          backHref={combo.backHref}
          backLabel={combo.backLabel}
          leadingNone={combo.leadingNone}
          maxWidth={combo.maxWidth}
          gap={combo.gap}
          pb={combo.pb}
        >
          <p>contenido</p>
        </OldPage>,
      );

      const nuevoHtml = mount(
        <PageHeaderProvider>
          <FormPage
            title={combo.title}
            backHref={combo.backHref}
            backLabel={combo.backLabel}
            maxWidth={combo.maxWidth}
            gap={combo.gap}
            pb={combo.pb}
          >
            <p>contenido</p>
          </FormPage>
        </PageHeaderProvider>,
      );

      expectMismoMarkup(nuevoHtml, viejoHtml);
    });
  }

  it("sin SetFormHeader montado, FormHeaderDesktop no renderiza nada (igual que antes de que exista `formHeader`)", () => {
    const html = mount(
      <PageHeaderProvider>
        <FormHeaderDesktop />
      </PageHeaderProvider>,
    );
    expect(html).toBe("");
  });
});

describe("FormHeaderDesktop leído desde un SetFormHeader de un componente hijo (casos E/F, plan § 1)", () => {
  it("refleja el título dinámico del form component sin que la página tenga su propio SetFormHeader", () => {
    function FormularioConTituloDinamico({ revisando }: { revisando: boolean }) {
      return (
        <SetFormHeader
          title={revisando ? "Revisá todo" : "Cargar movimiento"}
          backHref="/revendedores/1"
          backLabel="Volver al revendedor"
        />
      );
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <PageHeaderProvider>
          <FormularioConTituloDinamico revisando={false} />
          <FormHeaderDesktop />
        </PageHeaderProvider>,
      );
    });
    expect(container.querySelector("h1")?.textContent).toBe("Cargar movimiento");

    // Bug de §0: antes la página tenía su PROPIO <h1> fijo ("Cargar
    // movimiento") que nunca se enteraba de este cambio — con
    // FormHeaderDesktop leyendo la misma fuente que SetFormHeader, el
    // título de escritorio pasa a "Revisá todo" igual que el de mobile.
    act(() => {
      root.render(
        <PageHeaderProvider>
          <FormularioConTituloDinamico revisando={true} />
          <FormHeaderDesktop />
        </PageHeaderProvider>,
      );
    });
    expect(container.querySelector("h1")?.textContent).toBe("Revisá todo");

    act(() => root.unmount());
    container.remove();
  });
});
