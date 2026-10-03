// @vitest-environment jsdom
//
// Snapshot-diff de la tanda 4 (extracción de useAccionRapidaMonto): captura el HTML real de
// DepositarRapido (montado con react-dom/client + act(), y con la hoja
// abierta — click en el botón disparador) ANTES de moverlo a
// useAccionRapidaMonto. `npm test` lo corre con `toMatchSnapshot()`: la
// primera corrida escribe tests/__snapshots__/…, las siguientes comparan
// contra ese archivo — si el HTML cambia un solo carácter, el test falla y
// hay que revisar el diff a conciencia (nunca actualizar el snapshot a
// ciegas, ver instrucciones de la tanda).
//
// No se prueba el estado "excede" (dispara un RPC real vía Supabase, fuera
// de alcance para este snapshot estructural). DepositarRapido muestra la
// fecha ya formateada ("Fecha: 16/09/2026.", vía `formatFecha(hoyISO())`) —
// se fija el reloj del sistema a esa fecha (huso Argentina, UTC-3) para que
// el snapshot sea determinista.
//
// PagarDiferenciaRapido se borró junto con `lib/diferencia-encargado.ts`
// (rama sin-diferencia-encargado) — su caso y el `replaceAll(hoyISO(), …)`
// que solo él necesitaba se sacaron con él.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { DepositarRapido } from "@/components/tareas/depositar-rapido";

let mounted: { root: Root; container: HTMLDivElement }[] = [];

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-16T12:00:00-03:00"));
});

afterAll(() => {
  vi.useRealTimers();
});

afterEach(() => {
  for (const { root, container } of mounted) {
    act(() => root.unmount());
    container.remove();
  }
  mounted = [];
});

function montarYAbrir(node: React.ReactElement): string {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  const boton = container.querySelector("button");
  if (!boton) throw new Error("No se encontró el botón disparador");
  act(() => {
    boton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  mounted.push({ root, container });
  return container.innerHTML;
}

describe("DepositarRapido / PagarDiferenciaRapido — snapshot antes de useAccionRapidaMonto", () => {
  it("DepositarRapido (mi propia plata) — hoja abierta", () => {
    const html = montarYAbrir(
      <DepositarRapido tenedorId="tenedor-1" montoCentavos={150000} medioInicial="mercado_pago" />,
    );
    expect(html).toMatchSnapshot();
  });

  it("DepositarRapido (plata de otro admin) — hoja abierta", () => {
    const html = montarYAbrir(
      <DepositarRapido
        tenedorId="tenedor-2"
        montoCentavos={50000}
        tenedorNombre="Marcela"
        medioInicial="banco"
        tono="claro"
      />,
    );
    expect(html).toMatchSnapshot();
  });
});
