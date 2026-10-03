// Snapshot-diff de la tanda 4 (extracción de CamposPagoCaja): captura el HTML inicial
// de PagoDeudaForm (ARS y USD) y CobroForm ANTES de extraer
// <CamposPagoCaja />. Ninguno de los dos usa useEffect en el render inicial
// (solo useState/useRouter), así que alcanza con
// `renderToStaticMarkup` — no hace falta jsdom/act() como en el hook de
// Tareas (que sí depende de un efecto de SetFormHeader).
//
// Ambos forms precargan el campo fecha con `hoyISO()` (huso Argentina), que
// quedó embebido en el snapshot guardado como "2026-09-16" — sin fijar el
// reloj, el test rota solo cada día. Se fija la fecha del sistema a esa
// misma fecha/hora en horario argentino (UTC-3) para todo el archivo.
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

import { CobroForm } from "@/components/cobros/cobro-form";
import { PagoDeudaForm } from "@/components/deudas/pago-deuda-form";

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-16T12:00:00-03:00"));
});

afterAll(() => {
  vi.useRealTimers();
});

describe("PagoDeudaForm / CobroForm — snapshot antes de CamposPagoCaja", () => {
  it("PagoDeudaForm — deuda en ARS", () => {
    const html = renderToStaticMarkup(
      <PagoDeudaForm deudaId="deuda-1" moneda="ARS" restanteCentavos={250000} dolarCentavos={null} />,
    );
    expect(html).toMatchSnapshot();
  });

  it("PagoDeudaForm — deuda en USD, con dólar de referencia", () => {
    const html = renderToStaticMarkup(
      <PagoDeudaForm deudaId="deuda-2" moneda="USD" restanteCentavos={10000} dolarCentavos={135000} />,
    );
    expect(html).toMatchSnapshot();
  });

  it("PagoDeudaForm — deuda en USD, sin dólar de referencia", () => {
    const html = renderToStaticMarkup(
      <PagoDeudaForm deudaId="deuda-3" moneda="USD" restanteCentavos={10000} dolarCentavos={null} />,
    );
    expect(html).toMatchSnapshot();
  });

  it("CobroForm", () => {
    const html = renderToStaticMarkup(
      <CobroForm comprobanteId="comprobante-1" deudaCentavos={180000} volverA="/comprobantes/comprobante-1" />,
    );
    expect(html).toMatchSnapshot();
  });
});
