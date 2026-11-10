// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const rpc = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { EliminarMovimientoAccion } from "@/components/caja/eliminar-movimiento-accion";

let montado: { root: Root; container: HTMLDivElement } | null = null;
afterEach(() => {
  if (montado) {
    act(() => montado!.root.unmount());
    montado.container.remove();
    montado = null;
  }
  rpc.mockReset();
  refresh.mockReset();
});

function montar() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  montado = { root, container };
  act(() =>
    root.render(
      <EliminarMovimientoAccion
        id="t1"
        accion={{ tipo: "transferencia", montoCentavos: 70_00, origenLugar: "Mercado Pago", destino: "banco" }}
      />,
    ),
  );
}

const boton = (texto: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.startsWith(texto)) as HTMLButtonElement | undefined;

describe("EliminarMovimientoAccion", () => {
  it("no llama a la RPC hasta que se confirma en el cartel", async () => {
    rpc.mockResolvedValue({ error: null });
    montar();
    expect(rpc).not.toHaveBeenCalled();

    await act(async () => boton("Eliminar")!.click());
    expect(document.body.textContent).toContain("¿Estás seguro?");
    expect(rpc).not.toHaveBeenCalled();

    const confirmar = [...document.querySelectorAll("button")].filter((b) => b.textContent?.startsWith("Eliminar")).at(-1)!;
    await act(async () => {
      confirmar.click();
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(rpc).toHaveBeenCalledWith("eliminar_transferencia_caja", { p_transferencia_id: "t1" });
    expect(refresh).toHaveBeenCalled();
  });

  it("si la RPC no existe todavía muestra el error genérico y no refresca", async () => {
    rpc.mockResolvedValue({ error: { message: "Could not find the function public.eliminar_transferencia_caja" } });
    montar();
    await act(async () => boton("Eliminar")!.click());
    const confirmar = [...document.querySelectorAll("button")].filter((b) => b.textContent?.startsWith("Eliminar")).at(-1)!;
    await act(async () => {
      confirmar.click();
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(document.body.textContent).toContain("No se pudo eliminar. Probá de nuevo.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("traduce SALDO_INSUFICIENTE", async () => {
    rpc.mockResolvedValue({ error: { message: "SALDO_INSUFICIENTE" } });
    montar();
    await act(async () => boton("Eliminar")!.click());
    const confirmar = [...document.querySelectorAll("button")].filter((b) => b.textContent?.startsWith("Eliminar")).at(-1)!;
    await act(async () => {
      confirmar.click();
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(document.body.textContent).toContain("quedaría en negativo");
  });
});
