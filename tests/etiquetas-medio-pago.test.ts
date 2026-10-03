import { describe, expect, it } from "vitest";

import { ETIQUETA_MEDIO_PAGO, etiquetaMedioPago } from "@/lib/etiquetas/medio-pago";

describe("etiquetaMedioPago", () => {
  it("devuelve la etiqueta de cada medio válido", () => {
    expect(etiquetaMedioPago("banco")).toBe("Banco");
    expect(etiquetaMedioPago("mercado_pago")).toBe("Mercado Pago");
    expect(etiquetaMedioPago("efectivo")).toBe("Efectivo");
  });

  it("usa el mismo texto que ETIQUETA_MEDIO_PAGO", () => {
    for (const medio of Object.keys(ETIQUETA_MEDIO_PAGO) as (keyof typeof ETIQUETA_MEDIO_PAGO)[]) {
      expect(etiquetaMedioPago(medio)).toBe(ETIQUETA_MEDIO_PAGO[medio]);
    }
  });

  it("da un fallback seguro con null, undefined o un valor inválido", () => {
    expect(etiquetaMedioPago(null)).toBe("—");
    expect(etiquetaMedioPago(undefined)).toBe("—");
    expect(etiquetaMedioPago("otra_cosa")).toBe("—");
  });
});
