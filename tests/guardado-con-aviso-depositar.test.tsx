// @vitest-environment jsdom
// Caracterización de "Pasar a la cuenta" con aviso de saldo: aviso → Guardar
// igual → éxito, y aviso → Cancelar → editar → reenviar (sin permiso).
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
const SALDO = {
  error: { message: "SALDO_INSUFICIENTE", details: JSON.stringify({ disponible: 100 }) },
};

async function elegirMedioYGuardar() {
  await act(async () => {
    boton("Mercado Pago").click();
  });
  await act(async () => {
    guardar().click();
  });
}

async function escribirMonto(valor: string) {
  const input = document.querySelector<HTMLInputElement>("#deposito-monto")!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, valor);
    input.dispatchEvent(new Event("input", { bubbles: true }));
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

describe("DepositarForm: aviso de saldo", () => {
  it("aviso → Guardar igual → éxito: reenvía el mismo monto con permiso y navega", async () => {
    rpc.mockImplementationOnce(async () => SALDO);
    await montar();
    await elegirMedioYGuardar();
    expect(document.body.textContent).toContain("Tiene");
    expect(document.body.textContent).toContain("en mano");
    const primero = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(primero).toMatchObject({ p_permitir_negativo: false, p_monto_centavos: 500000 });

    await act(async () => {
      boton("Guardar igual").click();
    });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_permitir_negativo: true, p_monto_centavos: 500000 });
    expect(push).toHaveBeenCalledWith("/plata");
    expect(guardar().disabled).toBe(true);
  });

  it("aviso → Cancelar → editar el monto → reenviar: va sin permiso y con el monto nuevo", async () => {
    rpc.mockImplementationOnce(async () => SALDO);
    await montar();
    await elegirMedioYGuardar();

    await act(async () => {
      boton("Cancelar").click();
    });
    expect(push).not.toHaveBeenCalled();
    expect(guardar().disabled).toBe(false);

    await escribirMonto("1000");
    await act(async () => {
      guardar().click();
    });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_permitir_negativo: false, p_monto_centavos: 100000 });
    expect(push).toHaveBeenCalledWith("/plata");
  });

  it("aviso → Guardar igual que falla: muestra el error y se puede reintentar", async () => {
    rpc.mockImplementationOnce(async () => SALDO).mockImplementationOnce(async () => ({ error: { message: "MONTO_INVALIDO" } }));
    await montar();
    await elegirMedioYGuardar();
    await act(async () => {
      boton("Guardar igual").click();
    });
    expect(push).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Revisá el monto.");
    expect(guardar().disabled).toBe(false);
  });

  it("si la llamada lanza una excepción: el botón se libera y muestra el error de conexión", async () => {
    rpc.mockImplementationOnce(async () => {
      throw new Error("red caída");
    });
    await montar();
    await elegirMedioYGuardar();
    expect(push).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("No se pudo conectar");
    expect(guardar().disabled).toBe(false);
  });

  it("mientras corre 'Guardar igual' la hoja sigue abierta y el loader se ve en ese botón", async () => {
    let terminar!: () => void;
    rpc.mockImplementationOnce(async () => SALDO).mockImplementationOnce(
      () => new Promise((resolve) => (terminar = () => resolve({ error: null }))),
    );
    await montar();
    await elegirMedioYGuardar();
    await act(async () => {
      boton("Guardar igual").click();
    });
    expect(boton("Guardar igual").getAttribute("aria-busy")).toBe("true");
    expect(document.body.textContent).toContain("Si guardás igual, queda negativo.");
    await act(async () => {
      terminar();
    });
    expect(push).toHaveBeenCalledWith("/plata");
  });
});
