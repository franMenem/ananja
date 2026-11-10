// @vitest-environment jsdom
// Caracterización de useEntregaForm: aviso de stock → Guardar igual (reenvía lo
// último intentado con permiso), aviso → volver a editar → reenviar, error,
// doble toque.
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
type Resp = { error: { message: string; details?: string } | null };
const rpc = vi.fn<(nombre: string, args: Record<string, unknown>) => Promise<Resp>>(async () => ({ error: null }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: () => {} }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc }) }));
vi.mock("@/lib/ferias", () => ({ feriaCargarDegustacion: async () => ({ error: null }) }));
vi.mock("@/components/revendedores/aviso-carga-repetida", () => ({
  useCargasParecidas: () => ({
    parecidas: null,
    buscando: false,
    puedeGuardar: async () => true,
    guardarIgual: () => {},
    revisar: () => {},
  }),
}));

import { useEntregaForm, type EntregaFormState } from "@/components/revendedores/entrega/use-entrega-form";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const productos = [{ id: "p1", nombre: "Aceite 500" }] as Parameters<typeof useEntregaForm>[0]["productos"];

let actual: EntregaFormState | null = null;
function Harness({ tipo }: { tipo: "entrega" | "devolucion" }) {
  const r = useEntregaForm({ vendedorId: "v1", productos, tipoInicial: tipo, lotesConStock: [] });
  useEffect(() => {
    actual = r;
  });
  return null;
}
let root: Root | null = null;
let el: HTMLDivElement | null = null;
async function montar(tipo: "entrega" | "devolucion" = "devolucion") {
  el = document.createElement("div");
  root = createRoot(el);
  await act(async () => {
    root!.render(<Harness tipo={tipo} />);
  });
}
const STOCK: Resp = {
  error: { message: "STOCK_REVENDEDOR_INSUFICIENTE", details: JSON.stringify({ producto: "Aceite 500", disponible: 1 }) },
};
const permisos = () => rpc.mock.calls.map((c) => c[1].p_permitir_negativo);

beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation(async () => ({ error: null }));
  push.mockClear();
});
afterEach(() => {
  act(() => root?.unmount());
  el?.remove();
  actual = null;
});

describe("useEntregaForm: aviso de stock y Guardar igual", () => {
  it("devolución con aviso → Guardar igual (itemsPendientes, true) → éxito y navega", async () => {
    rpc.mockImplementationOnce(async () => STOCK);
    await montar();
    await act(async () => actual!.setCantidad("p1", 2));
    await act(async () => actual!.handleContinuar());
    expect(actual!.alerta).toEqual({ producto: "Aceite 500", disponible: 1 });
    expect(actual!.saving).toBe(false);
    expect(actual!.error).toBeNull();

    await act(async () => {
      await actual!.guardar(actual!.itemsPendientes, true);
    });
    expect(permisos()).toEqual([false, true]);
    expect(rpc.mock.calls[1][1].p_items).toEqual([{ producto_id: "p1", cantidad: 2 }]);
    expect(push).toHaveBeenCalledWith("/revendedores/v1");
    expect(actual!.alerta).toBeNull();
    expect(actual!.saving).toBe(true);
  });

  it("si la llamada lanza una excepción: libera el envío y muestra el error de conexión", async () => {
    rpc.mockImplementationOnce(async () => {
      throw new Error("red caída");
    });
    await montar();
    await act(async () => actual!.setCantidad("p1", 2));
    await act(async () => actual!.handleContinuar());
    expect(actual!.saving).toBe(false);
    expect(actual!.error).toContain("No se pudo conectar");
    expect(push).not.toHaveBeenCalled();
  });

  it("la hoja se cierra apenas arranca 'Guardar igual'", async () => {
    let terminar!: () => void;
    rpc.mockImplementationOnce(async () => STOCK).mockImplementationOnce(
      () => new Promise((resolve) => (terminar = () => resolve({ error: null }))),
    );
    await montar();
    await act(async () => actual!.setCantidad("p1", 2));
    await act(async () => actual!.handleContinuar());
    let p!: Promise<void>;
    await act(async () => {
      p = actual!.guardar(actual!.itemsPendientes, true);
    });
    expect(actual!.saving).toBe(true);
    expect(actual!.alerta).toBeNull();
    await act(async () => {
      terminar();
      await p;
    });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("aviso → volver a editar → reenviar: va sin permiso y con la cantidad nueva", async () => {
    rpc.mockImplementationOnce(async () => STOCK);
    await montar();
    await act(async () => actual!.setCantidad("p1", 2));
    await act(async () => actual!.handleContinuar());
    await act(async () => actual!.descartarAviso());
    expect(actual!.alerta).toBeNull();
    await act(async () => actual!.setCantidad("p1", 1));
    await act(async () => actual!.handleContinuar());
    expect(permisos()).toEqual([false, false]);
    expect(rpc.mock.calls[1][1].p_items).toEqual([{ producto_id: "p1", cantidad: 1 }]);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("STOCK_LOTE_INSUFICIENTE resuelve el nombre por producto_id", async () => {
    rpc.mockImplementationOnce(async () => ({
      error: { message: "STOCK_LOTE_INSUFICIENTE", details: JSON.stringify({ producto_id: "p1", disponible: 4 }) },
    }));
    await montar();
    await act(async () => actual!.setCantidad("p1", 5));
    await act(async () => actual!.handleContinuar());
    expect(actual!.alerta).toEqual({ producto: "Aceite 500", disponible: 4 });
  });

  it("doble toque en Guardar igual: una sola llamada de más", async () => {
    rpc.mockImplementationOnce(async () => STOCK);
    await montar();
    await act(async () => actual!.setCantidad("p1", 2));
    await act(async () => actual!.handleContinuar());
    await act(async () => {
      void actual!.guardar(actual!.itemsPendientes, true);
      void actual!.guardar(actual!.itemsPendientes, true);
    });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("error común: lo muestra, libera el botón y se puede reintentar", async () => {
    rpc.mockImplementationOnce(async () => ({ error: { message: "NO_AUTORIZADO" } }));
    await montar();
    await act(async () => actual!.setCantidad("p1", 2));
    await act(async () => actual!.handleContinuar());
    expect(actual!.error).toBe("No tenés permiso para esto.");
    expect(actual!.alerta).toBeNull();
    expect(actual!.saving).toBe(false);
    await act(async () => actual!.handleContinuar());
    expect(actual!.error).toBeNull();
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("sin cantidades: error de validación, sin llamar a la RPC", async () => {
    await montar();
    await act(async () => actual!.handleContinuar());
    expect(actual!.error).toBe("Cargá al menos una cantidad.");
    expect(rpc).not.toHaveBeenCalled();
    expect(actual!.saving).toBe(false);
  });

  it("entrega con revisión: aviso → Guardar igual reenvía los ítems de la revisión con permiso", async () => {
    rpc.mockImplementationOnce(async () => STOCK);
    await montar("entrega");
    await act(async () => actual!.setCantidad("p1", 2));
    await act(async () => actual!.handleContinuar());
    expect(actual!.revision).not.toBeNull();
    await act(async () => actual!.actualizarFila(actual!.revision![0].clave, "costo", "100"));
    await act(async () => actual!.handleConfirmarRevision());
    expect(actual!.alerta).not.toBeNull();
    await act(async () => {
      await actual!.guardar(actual!.itemsPendientes, true);
    });
    expect(permisos()).toEqual([false, true]);
    expect(rpc.mock.calls[1][1].p_items).toEqual(rpc.mock.calls[0][1].p_items);
    expect(push).toHaveBeenCalledWith("/revendedores/v1");
  });
});
