// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { crearBloqueoScroll } from "@/lib/bloqueo-scroll";

function entorno(barra = 0) {
  const html = document.createElement("html");
  const body = document.createElement("body");
  Object.defineProperty(html, "clientWidth", { value: 1000 - barra });
  const defaultView = {
    innerWidth: 1000,
    getComputedStyle: () => ({ paddingRight: html.style.paddingRight || "0px" }),
  } as unknown as Window;
  return { documentElement: html, body, defaultView };
}

afterEach(() => {
  document.documentElement.removeAttribute("style");
  document.body.removeAttribute("style");
});

describe("bloqueo de scroll", () => {
  it("bloquea al abrir la primera y libera al cerrar la última", () => {
    const env = entorno();
    const b = crearBloqueoScroll(env);
    const a = b.bloquear();
    expect(env.documentElement.style.overflow).toBe("hidden");
    expect(env.body.style.overflow).toBe("hidden");
    const c = b.bloquear();
    a();
    expect(env.documentElement.style.overflow).toBe("hidden");
    expect(b.activos).toBe(1);
    c();
    expect(env.documentElement.style.overflow).toBe("");
    expect(b.activos).toBe(0);
  });

  it("restaura exactamente los valores previos", () => {
    const env = entorno(15);
    env.documentElement.style.overflow = "scroll";
    env.documentElement.style.paddingRight = "4px";
    env.body.style.overflow = "auto";
    const b = crearBloqueoScroll(env);
    const soltar = b.bloquear();
    expect(env.documentElement.style.paddingRight).toBe("19px");
    soltar();
    expect(env.documentElement.style.overflow).toBe("scroll");
    expect(env.documentElement.style.paddingRight).toBe("4px");
    expect(env.body.style.overflow).toBe("auto");
  });

  it("compensa la barra solo si existe", () => {
    const sin = entorno(0);
    crearBloqueoScroll(sin).bloquear();
    expect(sin.documentElement.style.paddingRight).toBe("");
    const con = entorno(15);
    crearBloqueoScroll(con).bloquear();
    expect(con.documentElement.style.paddingRight).toBe("15px");
  });

  it("soltar dos veces no libera la hoja de otro", () => {
    const env = entorno();
    const b = crearBloqueoScroll(env);
    const a = b.bloquear();
    b.bloquear();
    a();
    a();
    expect(b.activos).toBe(1);
    expect(env.documentElement.style.overflow).toBe("hidden");
  });

  it("usa el document global por defecto", () => {
    const b = crearBloqueoScroll();
    const soltar = b.bloquear();
    expect(document.documentElement.style.overflow).toBe("hidden");
    soltar();
    expect(document.documentElement.style.overflow).toBe("");
  });
});
