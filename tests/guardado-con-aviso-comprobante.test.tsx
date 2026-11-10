// @vitest-environment jsdom
// Caracterización de useGuardarComprobante: aviso de stock → Guardar igual,
// aviso → volver a editar → reenviar, error → Reintentar, doble toque.
import { act, useEffect } from "react";
import { interpretarErrorComprobante } from "@/lib/dominio/comprobantes";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
type RpcResp = { data?: unknown; error: { message: string; details?: string } | null };
const rpc = vi.fn<(nombre: string, args: unknown) => Promise<RpcResp>>(async () => ({ data: {}, error: null }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: () => {} }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc }) }));
vi.mock("@/lib/push-client", () => ({ notificarPush: async () => {} }));

import {
  useGuardarComprobante,
  MENSAJE_ERROR_DE_CONEXION,
  type UseGuardarComprobanteArgs,
  type UseGuardarComprobanteResult,
} from "@/components/comprobante-form/use-guardar-comprobante";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const producto = { id: "p1", nombre: "Aceite 500" } as UseGuardarComprobanteArgs["productos"][number];
const args: UseGuardarComprobanteArgs = {
  mode: "crear",
  uploading: false,
  montoInput: "1000",
  cobradoCentavos: 100000,
  clienteId: null,
  medioPago: "efectivo",
  productos: [producto],
  cantidades: { p1: 1 },
  precios: { p1: "1000" },
  lotesPorProducto: {},
  itemsPayload: [{ producto_id: "p1", cantidad: 1, precio_unitario_centavos: 100000 }] as UseGuardarComprobanteArgs["itemsPayload"],
  imagenPath: null,
  fecha: "2026-11-10",
  nota: "",
  ocrEstado: "no_aplica" as UseGuardarComprobanteArgs["ocrEstado"],
  ocrMontoCentavos: null,
};

let actual: UseGuardarComprobanteResult | null = null;
function Harness({ a }: { a: UseGuardarComprobanteArgs }) {
  const r = useGuardarComprobante(a);
  useEffect(() => {
    actual = r;
  });
  return null;
}
let root: Root | null = null;
let el: HTMLDivElement | null = null;
async function montar(a = args) {
  el = document.createElement("div");
  root = createRoot(el);
  await act(async () => {
    root!.render(<Harness a={a} />);
  });
}
const STOCK: RpcResp = {
  error: { message: "STOCK_INSUFICIENTE", details: JSON.stringify({ producto: "Aceite 500", disponible: 2 }) },
};
const ERROR_RARO: RpcResp = { error: { message: "ALGO_RARO" } };
const llamadas = () => rpc.mock.calls.map((c) => c[1] as Record<string, unknown>);

beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation(async () => ({ data: {}, error: null }));
  push.mockClear();
});
afterEach(() => {
  act(() => root?.unmount());
  el?.remove();
  actual = null;
});

describe("useGuardarComprobante: aviso, Guardar igual y reintento", () => {
  it("aviso de stock → Guardar igual → éxito: reenvía con permiso y navega", async () => {
    rpc.mockImplementationOnce(async () => STOCK);
    await montar();
    await act(async () => {
      await actual!.handleSubmit(false);
    });
    expect(actual!.stockAlert).toEqual({ producto: "Aceite 500", disponible: 2 });
    expect(actual!.submitting).toBe(false);
    expect(actual!.showRetry).toBe(false);
    expect(push).not.toHaveBeenCalled();

    await act(async () => {
      await actual!.handleSubmit(true);
    });
    expect(llamadas().map((l) => l.p_permitir_negativo)).toEqual([false, true]);
    expect(push).toHaveBeenCalledWith("/comprobantes");
    expect(actual!.stockAlert).toBeNull();
    expect(actual!.submitting).toBe(true);
  });

  it("aviso → volver a editar → reenviar: va sin permiso", async () => {
    rpc.mockImplementationOnce(async () => STOCK);
    await montar();
    await act(async () => {
      await actual!.handleSubmit(false);
    });
    await act(async () => {
      actual!.descartarAviso();
    });
    expect(actual!.stockAlert).toBeNull();
    await act(async () => {
      await actual!.handleSubmit(false);
    });
    expect(llamadas().map((l) => l.p_permitir_negativo)).toEqual([false, false]);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("la hoja de aviso queda a la vista mientras corre 'Guardar igual'", async () => {
    let terminar!: () => void;
    rpc.mockImplementationOnce(async () => STOCK).mockImplementationOnce(
      () => new Promise((resolve) => (terminar = () => resolve({ data: {}, error: null }))),
    );
    await montar();
    await act(async () => {
      await actual!.handleSubmit(false);
    });
    let p!: Promise<void>;
    await act(async () => {
      p = actual!.handleSubmit(true);
    });
    expect(actual!.submitting).toBe(true);
    expect(actual!.stockAlert).not.toBeNull();
    await act(async () => {
      terminar();
      await p;
    });
    expect(actual!.stockAlert).toBeNull();
  });

  it("doble toque en Guardar igual: una sola llamada", async () => {
    rpc.mockImplementationOnce(async () => STOCK);
    await montar();
    await act(async () => {
      await actual!.handleSubmit(false);
    });
    await act(async () => {
      void actual!.handleSubmit(true);
      void actual!.handleSubmit(true);
    });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("error de la RPC → mensaje de conexión + Reintentar, que repite el mismo permiso", async () => {
    rpc.mockImplementationOnce(async () => STOCK).mockImplementationOnce(async () => ERROR_RARO);
    await montar();
    await act(async () => {
      await actual!.handleSubmit(false);
    });
    await act(async () => {
      await actual!.handleSubmit(true);
    });
    expect(actual!.formError).toContain("No se pudo guardar por un problema de conexión");
    expect(actual!.showRetry).toBe(true);
    expect(actual!.stockAlert).toBeNull();
    expect(actual!.submitting).toBe(false);

    await act(async () => {
      actual!.reintentar();
    });
    expect(llamadas().map((l) => l.p_permitir_negativo)).toEqual([false, true, true]);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("excepción de red → mensaje de conexión + Reintentar; el error sigue a la vista mientras se reintenta", async () => {
    rpc.mockImplementationOnce(async () => {
      throw new Error("offline");
    });
    await montar();
    await act(async () => {
      await actual!.handleSubmit(false);
    });
    expect(actual!.showRetry).toBe(true);

    let terminar!: () => void;
    rpc.mockImplementationOnce(() => new Promise((resolve) => (terminar = () => resolve({ data: {}, error: null }))));
    let p!: Promise<void>;
    await act(async () => {
      p = actual!.handleSubmit(false);
    });
    expect(actual!.submitting).toBe(true);
    expect(actual!.showRetry).toBe(true);
    await act(async () => {
      terminar();
      await p;
    });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("un error común (no de conexión) se limpia al reintentar y no ofrece Reintentar", async () => {
    rpc.mockImplementationOnce(async () => ({ error: { message: "COBRADO_INVALIDO" } }));
    await montar();
    await act(async () => {
      await actual!.handleSubmit(false);
    });
    expect(actual!.formError).toBe("Lo cobrado no puede superar el monto.");
    expect(actual!.showRetry).toBe(false);
    await act(async () => {
      await actual!.handleSubmit(false);
    });
    expect(actual!.formError).toBeNull();
  });

  it("una validación previa muestra el error, no llama a la RPC y libera el botón", async () => {
    await montar({ ...args, montoInput: "" });
    await act(async () => {
      await actual!.handleSubmit(false);
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(actual!.formError).toBe("Ingresá un monto válido.");
    expect(actual!.showRetry).toBe(false);
    expect(actual!.submitting).toBe(false);
  });

  it("el mensaje de conexión del hook es el mismo que devuelve la traducción de errores desconocidos", () => {
    expect(interpretarErrorComprobante({ message: "ALGO_RARO" }, [])).toEqual({
      tipo: "error",
      mensaje: MENSAJE_ERROR_DE_CONEXION,
    });
  });
});
