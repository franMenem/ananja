import { describe, expect, it } from "vitest";

import { pagoRechazadoParaAvisar, type PagoParaAviso } from "@/lib/dominio/pagos-revendedor";

const HOY = "2026-09-15";

const rechazado: PagoParaAviso = {
  estado: "rechazado",
  createdAt: "2026-09-10T15:00:00Z",
  resueltoEn: "2026-09-12T15:00:00Z",
  montoCentavos: 500000,
  fecha: "2026-09-10",
  motivoRechazo: "No llegó",
};

describe("pagoRechazadoParaAvisar", () => {
  it("avisa por un rechazo reciente si todavía debe", () => {
    expect(pagoRechazadoParaAvisar([rechazado], [], 100, HOY)).toBe(rechazado);
  });

  it("no avisa si ya no debe", () => {
    expect(pagoRechazadoParaAvisar([rechazado], [], 0, HOY)).toBeNull();
  });

  it("deja de avisar pasados 15 días del rechazo", () => {
    const viejo = { ...rechazado, resueltoEn: "2026-08-30T15:00:00Z" };
    expect(pagoRechazadoParaAvisar([viejo], [], 100, HOY)).toBeNull();
    const justo = { ...rechazado, resueltoEn: "2026-08-31T15:00:00Z" };
    expect(pagoRechazadoParaAvisar([justo], [], 100, HOY)).toBe(justo);
  });

  it("no avisa si después informó otro pago o le registraron una rendición", () => {
    const otroPago: PagoParaAviso = { ...rechazado, estado: "pendiente", createdAt: "2026-09-13T10:00:00Z", resueltoEn: null };
    expect(pagoRechazadoParaAvisar([rechazado, otroPago], [], 100, HOY)).toBeNull();
    expect(pagoRechazadoParaAvisar([rechazado], [{ createdAt: "2026-09-14T10:00:00Z" }], 100, HOY)).toBeNull();
    // Una rendición anterior al pago rechazado no lo tapa.
    expect(pagoRechazadoParaAvisar([rechazado], [{ createdAt: "2026-09-01T10:00:00Z" }], 100, HOY)).toBe(rechazado);
  });
});
