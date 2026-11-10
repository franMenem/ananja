// @vitest-environment jsdom
// Caracterización de useGuardadoCarga ("Cargar todo junto"): aviso de stock →
// Guardar igual (guardar(true)), aviso → Revisar → volver a guardar, error,
// "ya guardada", doble toque.
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
type Resp = { error: { message: string; details?: string } | null };
const registrar = vi.fn<(supabase: unknown, args: { pedido: { p_entrega: { permitir_negativo?: boolean } } }) => Promise<Resp>>(
  async () => ({ error: null }),
);

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: () => {} }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/revendedores", () => ({
  registrarCargaRevendedor: (s: unknown, a: never) => registrar(s, a),
}));

import { useGuardadoCarga, type GuardadoCargaState } from "@/components/revendedores/carga/use-guardado";
import type { CargaInput } from "@/lib/dominio/carga-revendedor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const input = {
  entrega: {
    fecha: "2026-11-10",
    permitirNegativo: false,
    filas: [{ productoId: "p1", loteId: null, cantidad: 2, costoCentavos: 100, sugeridoCentavos: null }],
  },
  ventas: null,
  pago: null,
} as unknown as CargaInput;
const textos = { nombres: { p1: "Aceite 500" }, formatFecha: (f: string) => f };

let actual: GuardadoCargaState | null = null;
function Harness() {
  const r = useGuardadoCarga({ vendedorId: "v1", clave: "k1", input, problemas: [], textos });
  useEffect(() => {
    actual = r;
  });
  return null;
}
let root: Root | null = null;
let el: HTMLDivElement | null = null;
async function montar() {
  el = document.createElement("div");
  root = createRoot(el);
  await act(async () => {
    root!.render(<Harness />);
  });
}
const STOCK: Resp = {
  error: {
    message: "entrega:STOCK_INSUFICIENTE",
    details: JSON.stringify({ detalle: JSON.stringify({ producto_id: "p1", disponible: 1 }) }),
  },
};
const permisos = () => registrar.mock.calls.map((c) => c[1].pedido.p_entrega.permitir_negativo);

beforeEach(() => {
  registrar.mockReset();
  registrar.mockImplementation(async () => ({ error: null }));
  push.mockClear();
});
afterEach(() => {
  act(() => root?.unmount());
  el?.remove();
  actual = null;
});

describe("useGuardadoCarga: aviso de stock y Guardar igual", () => {
  it("guardar bien navega a la ficha", async () => {
    await montar();
    await act(async () => {
      await actual!.guardar(false);
    });
    expect(push).toHaveBeenCalledWith("/revendedores/v1");
    expect(actual!.error).toBeNull();
    // Éxito que navega: el botón queda ocupado hasta que la pantalla se desmonte.
    expect(actual!.saving).toBe(true);
  });

  it("si la llamada lanza una excepción: libera el envío y muestra el error de conexión", async () => {
    registrar.mockImplementationOnce(async () => {
      throw new Error("red caída");
    });
    await montar();
    await act(async () => {
      await actual!.guardar(false);
    });
    expect(actual!.saving).toBe(false);
    expect(actual!.error).toContain("No se pudo conectar");
    expect(push).not.toHaveBeenCalled();
    await act(async () => {
      await actual!.guardar(false);
    });
    expect(push).toHaveBeenCalledWith("/revendedores/v1");
  });

  it("aviso → Guardar igual → éxito: reenvía con permitir_negativo y navega", async () => {
    registrar.mockImplementationOnce(async () => STOCK);
    await montar();
    await act(async () => {
      await actual!.guardar(false);
    });
    expect(actual!.alertaStock).toMatchObject({ codigo: "STOCK_INSUFICIENTE", permiteGuardarIgual: true });
    expect(actual!.error).toBeNull();
    expect(actual!.saving).toBe(false);

    await act(async () => {
      await actual!.guardar(true);
    });
    expect(permisos()).toEqual([false, true]);
    expect(push).toHaveBeenCalledWith("/revendedores/v1");
    expect(actual!.alertaStock).toBeNull();
  });

  it("la hoja se cierra apenas arranca 'Guardar igual'", async () => {
    let terminar!: () => void;
    registrar.mockImplementationOnce(async () => STOCK).mockImplementationOnce(
      () => new Promise((resolve) => (terminar = () => resolve({ error: null }))),
    );
    await montar();
    await act(async () => {
      await actual!.guardar(false);
    });
    let p!: Promise<void>;
    await act(async () => {
      p = actual!.guardar(true);
    });
    expect(actual!.saving).toBe(true);
    expect(actual!.alertaStock).toBeNull();
    await act(async () => {
      terminar();
      await p;
    });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("aviso → Revisar cantidades → volver a guardar: va sin permiso", async () => {
    registrar.mockImplementationOnce(async () => STOCK);
    await montar();
    await act(async () => {
      await actual!.guardar(false);
    });
    await act(async () => actual!.cerrarAlertaStock());
    expect(actual!.alertaStock).toBeNull();
    expect(actual!.revisando).toBe(false);
    await act(async () => {
      await actual!.guardar(false);
    });
    expect(permisos()).toEqual([false, false]);
  });

  it("si con permiso igual vuelve a fallar por stock, es un error común (no otro aviso)", async () => {
    registrar.mockImplementation(async () => STOCK);
    await montar();
    await act(async () => {
      await actual!.guardar(false);
    });
    await act(async () => {
      await actual!.guardar(true);
    });
    expect(actual!.alertaStock).toBeNull();
    expect(actual!.error).toContain("Quedan 1.");
    expect(actual!.saving).toBe(false);
  });

  it("CARGA_YA_GUARDADA queda marcada y volverAEditar la limpia", async () => {
    registrar.mockImplementationOnce(async () => ({ error: { message: "CARGA_YA_GUARDADA" } }));
    await montar();
    await act(async () => {
      await actual!.guardar(false);
    });
    expect(actual!.yaGuardada).toBe(true);
    expect(actual!.error).not.toBeNull();
    await act(async () => actual!.volverAEditar());
    expect(actual!.yaGuardada).toBe(false);
    expect(actual!.error).toBeNull();
  });

  it("error genérico: lo muestra y se puede volver a guardar (misma clave)", async () => {
    registrar.mockImplementationOnce(async () => ({ error: { message: "ALGO" } }));
    await montar();
    await act(async () => {
      await actual!.guardar(false);
    });
    expect(actual!.error).toContain("No se pudo guardar");
    expect(actual!.saving).toBe(false);
    await act(async () => {
      await actual!.guardar(false);
    });
    expect(registrar.mock.calls.map((c) => (c[1] as unknown as { clave: string }).clave)).toEqual(["k1", "k1"]);
    expect(actual!.error).toBeNull();
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("doble toque en Guardar igual: una sola llamada de más (candado de la máquina)", async () => {
    registrar.mockImplementationOnce(async () => STOCK);
    await montar();
    await act(async () => {
      await actual!.guardar(false);
    });
    await act(async () => {
      void actual!.guardar(true);
      void actual!.guardar(true);
    });
    expect(registrar).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenCalledTimes(1);
  });
});
