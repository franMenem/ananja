import { describe, expect, it } from "vitest";

import { avisoPagoDadoAOtro, puedeResolverPagoRevendedor } from "@/lib/dominio/pagos-revendedor";

describe("puedeResolverPagoRevendedor (0093: un admin puede todo)", () => {
  it("cualquier admin resuelve cualquier pago pendiente", () => {
    expect(puedeResolverPagoRevendedor()).toBe(true);
  });
});

describe("avisoPagoDadoAOtro", () => {
  const base = {
    destinatarioId: "otro",
    destinatarioNombre: "Marta",
    destinatarioPuedeSerEncargado: true,
    miVendedorId: "yo",
  };

  it("avisa que la plata queda en manos del destinatario cuando es otra persona activa", () => {
    const aviso = avisoPagoDadoAOtro(base);
    expect(aviso).toContain("Este pago se lo dieron a Marta");
    expect(aviso).toContain("la plata queda en manos de Marta");
  });

  it("no avisa si va a la cuenta, si es para quien mira o si el destinatario ya no está activo", () => {
    expect(avisoPagoDadoAOtro({ ...base, destinatarioId: null, destinatarioNombre: null })).toBeNull();
    expect(avisoPagoDadoAOtro({ ...base, destinatarioId: "yo" })).toBeNull();
    expect(avisoPagoDadoAOtro({ ...base, destinatarioPuedeSerEncargado: false })).toBeNull();
  });

  it("sin nombre dice su encargado", () => {
    expect(avisoPagoDadoAOtro({ ...base, destinatarioNombre: null })).toContain("su encargado");
  });
});
