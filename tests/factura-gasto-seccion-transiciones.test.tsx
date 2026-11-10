// @vitest-environment jsdom
// Transiciones de la sección "Factura" de un gasto: el error vive en una sola fase y no sobrevive a cancelar.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc }) }));
vi.mock("@/lib/storage", () => ({
  getSignedUrl: async () => "https://x.test/f.png",
  getSignedUrls: async () => ({}),
}));
const subirFotoCompra = vi.fn();
vi.mock("@/lib/foto-compra", () => ({
  subirFotoCompra: (...a: unknown[]) => subirFotoCompra(...a),
  validarFotoCompra: () => null,
}));
vi.mock("@/lib/data/gastos", () => ({
  listarFacturasDeGastos: async () => ({
    data: [{ imagenPath: "facturas/a.png", categoriaNombre: "Etiquetas", fecha: "2026-11-01", cantidadGastos: 1, nota: null }],
    error: null,
  }),
}));

import { FacturaGastoSeccion } from "@/components/gastos/factura-gasto-seccion";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let contenedor: HTMLDivElement | null = null;
const onCambiada = vi.fn();
async function montar(imagenPath: string | null) {
  contenedor = document.createElement("div");
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
  await act(async () => {
    root!.render(createElement(FacturaGastoSeccion, { gastoId: "g1", imagenPath, isAdmin: true, onCambiada }));
  });
}
afterEach(() => {
  act(() => root?.unmount());
  contenedor?.remove();
  root = null;
  vi.clearAllMocks();
});

const botones = (t: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>("button")).filter((b) => b.textContent?.startsWith(t));
const clic = async (t: string, cual: "primero" | "ultimo" = "primero") => {
  const lista = botones(t);
  const b = cual === "primero" ? lista[0] : lista[lista.length - 1];
  if (!b) throw new Error(`no hay botón ${t}`);
  await act(async () => {
    b.click();
  });
};
const alertas = () => document.querySelectorAll('[role="alert"]');
const hoja = () => document.querySelector('[role="dialog"]');

describe("FacturaGastoSeccion", () => {
  it("quitar con error: el error se ve UNA vez (en la hoja); cancelar y reabrir no lo arrastra", async () => {
    rpc.mockResolvedValueOnce({ error: { message: "X" } });
    await montar("facturas/a.png");
    await clic("Quitar");
    await clic("Quitar", "ultimo");
    expect(hoja()).not.toBeNull();
    expect(alertas().length).toBe(1);
    expect(hoja()!.contains(alertas()[0])).toBe(true);
    expect(document.body.textContent).toContain("Quitar factura");
    await clic("Cancelar");
    expect(hoja()).toBeNull();
    expect(alertas().length).toBe(0);
    await clic("Quitar");
    expect(hoja()).not.toBeNull();
    expect(alertas().length).toBe(0);
  });

  it("quitar bien: avisa al padre con null y cierra la hoja", async () => {
    rpc.mockResolvedValueOnce({ error: null });
    await montar("facturas/a.png");
    await clic("Quitar");
    await clic("Quitar", "ultimo");
    expect(onCambiada).toHaveBeenCalledWith(null);
    expect(hoja()).toBeNull();
  });

  it("subir: si la RPC falla se reintenta SOLO la RPC con el mismo path, sin volver a subir", async () => {
    subirFotoCompra.mockResolvedValue("facturas/nueva.png");
    rpc.mockResolvedValueOnce({ error: { message: "X" } });
    await montar(null);
    await clic("Subir factura");
    const input = document.querySelector<HTMLInputElement>('input[type="file"]:not([capture])')!;
    const archivo = new File(["x"], "f.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [archivo], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(subirFotoCompra).toHaveBeenCalledTimes(1);
    expect(alertas().length).toBe(1);
    expect(document.body.textContent).toContain("El archivo ya se subió");

    rpc.mockResolvedValueOnce({ error: null });
    await clic("Reintentar");
    expect(subirFotoCompra).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenLastCalledWith("adjuntar_comprobante_gasto", { p_gasto_id: "g1", p_imagen_path: "facturas/nueva.png" });
    expect(onCambiada).toHaveBeenCalledWith("facturas/nueva.png");
    expect(alertas().length).toBe(0);
  });

  it("subir: cancelar tras un error de la RPC descarta el error y el path pendiente", async () => {
    subirFotoCompra.mockResolvedValue("facturas/nueva.png");
    rpc.mockResolvedValueOnce({ error: { message: "X" } });
    await montar(null);
    await clic("Subir factura");
    const input = document.querySelector<HTMLInputElement>('input[type="file"]:not([capture])')!;
    Object.defineProperty(input, "files", { value: [new File(["x"], "f.png", { type: "image/png" })], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await clic("Cancelar");
    expect(alertas().length).toBe(0);
    await clic("Subir factura");
    expect(document.body.textContent).not.toContain("El archivo ya se subió");
    expect(alertas().length).toBe(0);
  });

  it("elegir: un error de la RPC no deja pendingPath; cancelar limpia", async () => {
    rpc.mockResolvedValueOnce({ error: { message: "X" } });
    await montar(null);
    await clic("Usar una que ya subí");
    await clic("Etiquetas");
    expect(alertas().length).toBe(1);
    expect(document.body.textContent).not.toContain("El archivo ya se subió");
    await clic("Cancelar");
    expect(alertas().length).toBe(0);
  });
});
