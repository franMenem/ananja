// @vitest-environment jsdom
// "Pasar a la cuenta": un guardado exitoso navega a /plata y el botón queda
// ocupado hasta que la pantalla se desmonte (un segundo toque no puede
// registrar un segundo depósito); un error o el aviso de saldo sí se reintentan.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const rpc = vi.fn<(nombre: string, args: unknown) => Promise<{ error: { message: string; details?: string } | null }>>(
  async () => ({ error: null }),
);

vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: () => {} }),
  usePathname: () => "/plata/depositar",
}));
vi.mock("@/components/page-header-context", () => ({ SetFormHeader: () => null }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc }) }));

import { DepositarForm } from "@/components/plata/depositar-form";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let el: HTMLDivElement | null = null;

async function montar() {
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => {
    root!.render(
      <DepositarForm personas={[{ id: "p1", nombre: "Ana" }]} montosPorPersona={{ p1: 500000 }} tenedorInicial="p1" />,
    );
  });
}

const boton = (texto: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(texto))!;
const guardar = () => document.querySelector<HTMLButtonElement>("form button[type=submit]")!;

async function elegirMedioYGuardar() {
  await act(async () => {
    boton("Mercado Pago").click();
  });
  await act(async () => {
    guardar().click();
  });
}

afterEach(() => {
  act(() => root?.unmount());
  el?.remove();
  document.body.innerHTML = "";
  rpc.mockReset();
  rpc.mockImplementation(async () => ({ error: null }));
  push.mockClear();
});

describe("DepositarForm: doble toque", () => {
  it("después de guardar bien, el botón queda ocupado y un segundo toque no repite el depósito", async () => {
    await montar();
    await elegirMedioYGuardar();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/plata");
    expect(guardar().disabled).toBe(true);

    await act(async () => {
      guardar().click();
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("si falla, muestra el error y se puede volver a guardar", async () => {
    rpc.mockImplementationOnce(async () => ({ error: { message: "MONTO_INVALIDO" } }));
    await montar();
    await elegirMedioYGuardar();
    expect(push).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Revisá el monto.");
    expect(guardar().disabled).toBe(false);

    await act(async () => {
      guardar().click();
    });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenCalledWith("/plata");
  });

  it("con saldo insuficiente ofrece 'Guardar igual', que reintenta una sola vez aunque se toque dos veces", async () => {
    rpc.mockImplementationOnce(async () => ({
      error: { message: "SALDO_INSUFICIENTE", details: JSON.stringify({ disponible: 100 }) },
    }));
    await montar();
    await elegirMedioYGuardar();
    expect(document.body.textContent).toContain("Si guardás igual, queda negativo.");
    expect(guardar().disabled).toBe(false);

    await act(async () => {
      const igual = boton("Guardar igual");
      igual.click();
      igual.click();
    });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_permitir_negativo: true });
    expect(push).toHaveBeenCalledTimes(1);
  });
});
