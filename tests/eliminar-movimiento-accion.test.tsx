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

function montar(accion: Parameters<typeof EliminarMovimientoAccion>[0]["accion"] = { tipo: "transferencia", montoCentavos: 70_00, origenLugar: "Mercado Pago", destino: "banco" }) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  montado = { root, container };
  act(() =>
    root.render(
      <EliminarMovimientoAccion id="t1" accion={accion} />,
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

  describe("pago de revendedora", () => {
    const pago = { tipo: "rendicion", revendedora: "Rita", montoCentavos: 300_00, lugar: "la plata en manos de Ana" } as const;
    const confirmar = () =>
      [...document.querySelectorAll("button")].filter((b) => b.textContent?.startsWith("Eliminar")).at(-1)!;

    it("el cartel dice qué pasa y no llama a la RPC hasta confirmar", async () => {
      rpc.mockResolvedValue({ error: null });
      montar(pago);
      await act(async () => boton("Eliminar")!.click());
      expect(document.body.textContent).toContain("Rita vuelve a deber");
      expect(document.body.textContent).toContain("¿Estás seguro?");
      expect(rpc).not.toHaveBeenCalled();
      await act(async () => {
        confirmar().click();
        await new Promise((r) => setTimeout(r, 20));
      });
      expect(rpc).toHaveBeenCalledWith("eliminar_rendicion_revendedor", { p_rendicion_id: "t1" });
      expect(refresh).toHaveBeenCalled();
    });

    it("traduce PLATA_YA_DEPOSITADA con el nombre del encargado", async () => {
      rpc.mockResolvedValue({
        error: {
          message: "PLATA_YA_DEPOSITADA",
          details: JSON.stringify({ tenedor: "Ana", en_mano_centavos: -1, pendiente_centavos: 0 }),
        },
      });
      montar(pago);
      await act(async () => boton("Eliminar")!.click());
      await act(async () => {
        confirmar().click();
        await new Promise((r) => setTimeout(r, 20));
      });
      expect(document.body.textContent).toContain("Ana ya pasó a la Cuenta Ananja");
      expect(refresh).not.toHaveBeenCalled();
    });

    it("si la RPC no existe todavía muestra el error genérico", async () => {
      rpc.mockResolvedValue({ error: { message: "Could not find the function public.eliminar_rendicion_revendedor" } });
      montar(pago);
      await act(async () => boton("Eliminar")!.click());
      await act(async () => {
        confirmar().click();
        await new Promise((r) => setTimeout(r, 20));
      });
      expect(document.body.textContent).toContain("No se pudo eliminar. Probá de nuevo.");
    });
  });
});
