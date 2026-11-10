// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));

const eliminarCobro = vi.fn();
vi.mock("@/lib/cobros", () => ({ eliminarCobro: (...a: unknown[]) => eliminarCobro(...a) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc: rpcMock }) }));
const rpcMock = vi.fn();

import { CobroDeleteButton } from "@/components/cobros/cobro-delete-button";
import { RechazarPendienteButton } from "@/components/revendedores/rechazar-pendiente-button";
import { EliminarVentaButton } from "@/components/mi/eliminar-venta-button";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let contenedor: HTMLDivElement | null = null;

function montar(el: React.ReactElement) {
  contenedor = document.createElement("div");
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
  act(() => root!.render(el));
}
afterEach(() => {
  act(() => root?.unmount());
  contenedor?.remove();
  root = null;
  vi.clearAllMocks();
});

// BotonAccion apila el texto normal y el de carga: se busca por el comienzo.
const botones = (t: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>("button")).filter((b) => b.textContent?.startsWith(t));
const boton = (t: string) => botones(t)[0];
const clic = async (t: string, cual: "primero" | "ultimo" = "primero") => {
  const lista = botones(t);
  const b = cual === "primero" ? lista[0] : lista[lista.length - 1];
  if (!b) throw new Error(`no hay botón ${t}`);
  await act(async () => {
    b.click();
  });
};

describe("botones con hoja de confirmación: el error no sobrevive a cancelar", () => {
  it("CobroDeleteButton: falla → cancelar → reabrir → sin error", async () => {
    eliminarCobro.mockResolvedValue({ error: { message: "COBRO_NO_ENCONTRADO" } });
    montar(createElement(CobroDeleteButton, { cobroId: "c1", montoCentavos: 1000 }));
    await clic("Eliminar");
    const hoja = () => document.querySelector('[role="dialog"]');
    expect(hoja()).not.toBeNull();
    await clic("Eliminar", "ultimo"); // el de confirmar (el primero es el disparador)
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("Este cobro ya no existe.");
    await clic("Cancelar");
    expect(hoja()).toBeNull();
    await clic("Eliminar");
    expect(hoja()).not.toBeNull();
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("RechazarPendienteButton: falla → cancelar → reabrir → sin error; éxito refresca y cierra", async () => {
    rpcMock.mockResolvedValueOnce({ error: { message: "NO_PENDIENTE" } });
    montar(createElement(RechazarPendienteButton, { vendedorId: "v1", nombre: "Ana" }));
    await clic("Rechazar");
    await clic("Sí, rechazar");
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("Esa persona ya no está pendiente de aprobación.");
    await clic("Cancelar");
    await clic("Rechazar");
    expect(document.querySelector('[role="alert"]')).toBeNull();
    rpcMock.mockResolvedValueOnce({ error: null });
    await clic("Sí, rechazar");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("EliminarVentaButton: con redirect, tras el éxito navega y queda ocupado", async () => {
    rpcMock.mockResolvedValueOnce({ error: null });
    montar(createElement(EliminarVentaButton, { ventaId: "v1" }));
    await clic("Borrar venta");
    await clic("Sí, borrar");
    expect(push).toHaveBeenCalledWith("/mi/ventas");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(boton("Cancelar")?.disabled || document.querySelector('[aria-busy="true"]')).toBeTruthy();
  });
});
