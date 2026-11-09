import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AccionesForm } from "@/components/ui/acciones-form";
import { LinkBoton } from "@/components/ui/link-boton";

describe("AccionesForm", () => {
  const html = renderToStaticMarkup(
    <AccionesForm etiqueta="Guardar" cancelarHref="/volver" nota="Una nota" />,
  );

  it("en escritorio pone los botones en un renglón con el reparto 1.6 / 1", () => {
    expect(html).toContain("lg:flex-row");
    expect(html).toContain("lg:flex-[1.6]");
    expect(html).toContain("lg:flex-1");
    expect(html).not.toContain("lg:min-w-64");
  });

  it("mantiene el orden primario, nota, Cancelar", () => {
    const iPrimario = html.indexOf("Guardar");
    const iNota = html.indexOf("Una nota");
    const iCancelar = html.indexOf("Cancelar");
    expect(iPrimario).toBeGreaterThan(-1);
    expect(iNota).toBeGreaterThan(iPrimario);
    expect(iCancelar).toBeGreaterThan(iNota);
    expect(html).toContain("lg:order-last");
  });
});

describe("LinkBoton", () => {
  it("es un enlace con href y className, con el spinner oculto si no está pendiente", () => {
    const html = renderToStaticMarkup(
      <LinkBoton href="/destino" className="clase-boton">
        Ir
      </LinkBoton>,
    );
    expect(html).toMatch(/^<a /);
    expect(html).toContain('href="/destino"');
    expect(html).toContain("clase-boton");
    expect(html).toContain("invisible");
    expect(html).toContain("<svg");
    expect(html).not.toContain("aria-busy");
  });
});
