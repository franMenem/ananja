// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BottomSheet } from "@/components/bottom-sheet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let contenedor: HTMLDivElement | null = null;

function render(el: React.ReactElement) {
  if (!contenedor) {
    contenedor = document.createElement("div");
    document.body.appendChild(contenedor);
    root = createRoot(contenedor);
  }
  act(() => root!.render(el));
}

function hoja(props: Partial<React.ComponentProps<typeof BottomSheet>> = {}) {
  return (
    <BottomSheet open ariaLabel="Prueba" {...props}>
      <button id="a">A</button>
      <input id="b" />
      <button id="c">C</button>
    </BottomSheet>
  );
}

const escape = () =>
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  });
const tab = (shiftKey = false) => {
  const ev = new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true });
  act(() => {
    document.activeElement!.dispatchEvent(ev);
  });
  return ev;
};
const $ = (id: string) => document.getElementById(id)!;

afterEach(() => {
  act(() => root?.unmount());
  contenedor?.remove();
  root = null;
  contenedor = null;
  document.body.removeAttribute("style");
  document.body.innerHTML = "";
});

describe("BottomSheet — Escape", () => {
  it("cierra llamando a onClose", () => {
    const onClose = vi.fn();
    render(hoja({ onClose }));
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("no cierra si está bloqueada", () => {
    const onClose = vi.fn();
    render(hoja({ onClose, bloqueada: true }));
    escape();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cerrada no escucha Escape", () => {
    const onClose = vi.fn();
    render(hoja({ onClose, open: false }));
    escape();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("con dos hojas abiertas solo cierra la de arriba", () => {
    const abajo = vi.fn();
    const arriba = vi.fn();
    render(
      <div>
        <BottomSheet open ariaLabel="abajo" onClose={abajo}>x</BottomSheet>
        <BottomSheet open ariaLabel="arriba" onClose={arriba}>y</BottomSheet>
      </div>,
    );
    escape();
    expect(arriba).toHaveBeenCalledTimes(1);
    expect(abajo).not.toHaveBeenCalled();
  });
});

describe("BottomSheet — foco", () => {
  function Con() {
    const [open, setOpen] = useState(false);
    return (
      <div>
        <button id="abre" onClick={() => setOpen(true)}>abrir</button>
        {hoja({ open, onClose: () => setOpen(false) })}
      </div>
    );
  }

  it("entra a la hoja al abrir y vuelve al disparador al cerrar", () => {
    render(createElement(Con));
    $("abre").focus();
    act(() => $("abre").click());
    const dialogo = document.querySelector('[role="dialog"]')!;
    expect(dialogo.contains(document.activeElement)).toBe(true);
    escape();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe($("abre"));
  });

  it("el foco inicial va al panel, no al primer botón", () => {
    render(hoja());
    const panel = document.querySelector('[role="dialog"] > div') as HTMLElement;
    expect(panel.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(panel);
    expect(document.activeElement).not.toBe($("a"));
  });

  it("Tab desde el panel entra al primero y Shift+Tab al último", () => {
    render(hoja());
    const t = tab();
    expect(t.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe($("a"));
    document.querySelector<HTMLElement>('[role="dialog"] > div')!.focus();
    const s = tab(true);
    expect(s.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe($("c"));
  });

  it("respeta un foco que el contenido ya tomó al montarse", () => {
    render(
      <BottomSheet open ariaLabel="x">
        <input id="i" autoFocus />
        <button id="j">j</button>
      </BottomSheet>,
    );
    expect(document.activeElement).toBe($("i"));
  });

  it("Tab desde el último vuelve al primero y Shift+Tab desde el primero va al último", () => {
    render(hoja());
    $("c").focus();
    const t = tab();
    expect(t.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe($("a"));
    const s = tab(true);
    expect(s.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe($("c"));
  });

  it("Tab en el medio no se intercepta", () => {
    render(hoja());
    $("b").focus();
    expect(tab().defaultPrevented).toBe(false);
  });

  it("si el foco está fuera de la hoja, Tab lo trae adentro", () => {
    const afuera = document.createElement("button");
    document.body.appendChild(afuera);
    render(hoja());
    afuera.focus();
    tab();
    expect(document.querySelector('[role="dialog"]')!.contains(document.activeElement)).toBe(true);
  });
});

describe("BottomSheet: scroll del fondo", () => {
  it("bloquea el documento mientras está abierta y lo libera al cerrar o desmontar", () => {
    render(<div />);
    expect(document.documentElement.style.overflow).toBe("");
    render(hoja());
    expect(document.documentElement.style.overflow).toBe("hidden");
    render(<div />);
    expect(document.documentElement.style.overflow).toBe("");
    render(hoja());
    act(() => root!.unmount());
    root = null;
    contenedor!.remove();
    contenedor = null;
    expect(document.documentElement.style.overflow).toBe("");
  });
});
