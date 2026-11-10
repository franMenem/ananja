// @vitest-environment jsdom
//
// Bug: con una versión nueva ya desplegada, cada chequeo (cada 5 min y en
// `visibilitychange`) volvía a poner `dismissed=false` y el aviso cerrado con ×
// reaparecía. Solo debe reaparecer ante una versión DISTINTA de la ya avisada.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UpdateBanner } from "@/components/update-banner";

let version = "v1";
let mounted: { root: Root; container: HTMLDivElement }[] = [];

afterEach(() => {
  for (const { root, container } of mounted) {
    act(() => root.unmount());
    container.remove();
  }
  mounted = [];
  vi.unstubAllGlobals();
});

async function chequear() {
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

async function montar() {
  vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({ version }) }));
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => root.render(<UpdateBanner />));
  return container;
}

describe("UpdateBanner", () => {
  it("el aviso descartado no reaparece mientras la versión nueva sea la misma", async () => {
    version = "v1";
    const c = await montar();
    expect(c.textContent).not.toContain("Hay una versión nueva");

    version = "v2";
    await chequear();
    expect(c.textContent).toContain("Hay una versión nueva");

    act(() => c.querySelector<HTMLButtonElement>('button[aria-label^="Descartar"]')!.click());
    expect(c.textContent).not.toContain("Hay una versión nueva");

    await chequear(); // sigue v2
    expect(c.textContent).not.toContain("Hay una versión nueva");
  });

  it("reaparece si sale una versión distinta de la ya avisada", async () => {
    version = "v1";
    const c = await montar();
    version = "v2";
    await chequear();
    act(() => c.querySelector<HTMLButtonElement>('button[aria-label^="Descartar"]')!.click());
    version = "v3";
    await chequear();
    expect(c.textContent).toContain("Hay una versión nueva");
  });
});
