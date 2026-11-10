// @vitest-environment jsdom
// Transiciones de las hojas de ParticipanteFeria: el error queda DENTRO de la hoja, que sigue abierta. Datos inventados.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh }), usePathname: () => "/ferias" }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
const quitar = vi.fn();
const reabrir = vi.fn();
const cargarDeg = vi.fn();
const quitarDeg = vi.fn();
vi.mock("@/lib/ferias", () => ({
  feriaQuitarParticipante: (...a: unknown[]) => quitar(...a),
  feriaReabrirParticipacion: (...a: unknown[]) => reabrir(...a),
  feriaCargarDegustacion: (...a: unknown[]) => cargarDeg(...a),
  feriaQuitarDegustacion: (...a: unknown[]) => quitarDeg(...a),
}));

import { ParticipanteFeria } from "@/components/ferias/participante-feria";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const base = {
  feria_id: "f1",
  vendedor_id: "v1",
  vendedor_nombre: "Ana",
  estado: "pendiente",
  cerrada_at: null,
  entregadas: 0,
  devueltas: 0,
  degustadas: 0,
  degustadas_carga: 0,
  degustadas_cierre: 0,
  vendidas: 0,
  faltan: 0,
  total_vendido_centavos: 0,
  costo_centavos: 0,
  efectivo_centavos: 0,
  mercado_pago_centavos: 0,
  banco_centavos: 0,
};

let root: Root | null = null;
let contenedor: HTMLDivElement | null = null;
function montar(participante: Record<string, unknown>, productos: unknown[] = []) {
  contenedor = document.createElement("div");
  document.body.appendChild(contenedor);
  root = createRoot(contenedor);
  act(() =>
    root!.render(
      createElement(ParticipanteFeria, {
        feriaId: "f1",
        feriaAbierta: true,
        participante: { ...base, ...participante } as never,
        productos: productos as never,
        productosActivos: [{ id: "a", nombre: "Aceite 250" }],
      }),
    ),
  );
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
const hoja = () => document.querySelector('[role="dialog"]');
const alertas = () => document.querySelectorAll('[role="alert"]');

describe("ParticipanteFeria: errores dentro de la hoja", () => {
  it("quitar con error: la hoja sigue abierta con el mensaje; se puede reintentar", async () => {
    quitar.mockResolvedValueOnce({ error: { message: "ALGO_RARO" } });
    montar({ estado: "pendiente", entregadas: 0 });
    await clic("Quitar");
    await clic("Sí, quitar");
    expect(hoja()).not.toBeNull();
    expect(alertas().length).toBe(1);
    expect(hoja()!.contains(alertas()[0])).toBe(true);
    expect(refresh).not.toHaveBeenCalled();

    quitar.mockResolvedValueOnce({ error: null });
    await clic("Sí, quitar");
    expect(hoja()).toBeNull();
    expect(alertas().length).toBe(0);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("cancelar tras un error y abrir otra hoja no arrastra el error", async () => {
    quitar.mockResolvedValueOnce({ error: { message: "ALGO_RARO" } });
    montar({ estado: "pendiente", entregadas: 0 });
    await clic("Quitar");
    await clic("Sí, quitar");
    expect(alertas().length).toBe(1);
    await clic("Cancelar");
    expect(hoja()).toBeNull();
    expect(alertas().length).toBe(0);
    await clic("Cargar degustación");
    expect(hoja()).not.toBeNull();
    expect(alertas().length).toBe(0);
  });

  it("reabrir con error y luego cancelar: sin error a la vista", async () => {
    reabrir.mockResolvedValueOnce({ error: { message: "ALGO_RARO" } });
    montar({ estado: "cerrada" });
    await clic("Reabrir");
    await clic("Sí, reabrir");
    expect(hoja()).not.toBeNull();
    expect(alertas().length).toBe(1);
    await clic("Cancelar");
    expect(hoja()).toBeNull();
    expect(alertas().length).toBe(0);
    await clic("Reabrir");
    expect(alertas().length).toBe(0);
  });

  it("cargar degustación sin producto: aviso dentro de la hoja; con error del servidor queda abierta y conserva lo elegido", async () => {
    cargarDeg.mockResolvedValueOnce({ error: { message: "ALGO_RARO" } });
    montar({ estado: "pendiente" });
    await clic("Cargar degustación");
    await clic("Cargar degustación", "ultimo");
    expect(hoja()!.textContent).toContain("Elegí el producto y la cantidad.");
    expect(cargarDeg).not.toHaveBeenCalled();

    const sel = hoja()!.querySelector("select")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(sel, "a");
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await clic("Cargar degustación", "ultimo");
    expect(cargarDeg).toHaveBeenCalledTimes(1);
    expect(hoja()).not.toBeNull();
    expect(alertas().length).toBe(1);
    expect(hoja()!.querySelector("select")!.value).toBe("a");

    cargarDeg.mockResolvedValueOnce({ error: null });
    await clic("Cargar degustación", "ultimo");
    expect(hoja()).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("quitar degustación cargada con error: la hoja sigue abierta con el nombre del producto", async () => {
    quitarDeg.mockResolvedValueOnce({ error: { message: "ALGO_RARO" } });
    montar({ estado: "pendiente", degustadas_carga: 2 }, [
      { producto_id: "a", producto_nombre: "Aceite 250", degustadas_carga: 2 },
    ]);
    await clic("Quitar");
    expect(hoja()!.textContent).toContain("Aceite 250");
    await clic("Sí, quitar");
    expect(hoja()).not.toBeNull();
    expect(hoja()!.textContent).toContain("Aceite 250");
    expect(alertas().length).toBe(1);
  });
});
