import { describe, expect, it } from "vitest";

import {
  ESTADO_PAGO_LABELS,
  ESTADO_PAGO_PENDIENTE,
  ESTADO_PAGO_VARIANTE,
  FILTROS_ESTADO_PAGO,
  etiquetaEstadoPagoParaRevendedora,
} from "@/lib/dominio/pagos-revendedor";

describe("presentación del estado de un pago", () => {
  it("variante por estado", () => {
    expect(ESTADO_PAGO_VARIANTE).toEqual({ pendiente: "confirmar", confirmado: "ok", rechazado: "debe" });
  });

  it("la revendedora ve 'Por confirmar'; el resto de los estados igual que el admin", () => {
    expect(etiquetaEstadoPagoParaRevendedora("pendiente")).toBe("Por confirmar");
    expect(ESTADO_PAGO_LABELS.pendiente).toBe("Pendiente de confirmar");
    expect(etiquetaEstadoPagoParaRevendedora("confirmado")).toBe("Confirmado");
    expect(etiquetaEstadoPagoParaRevendedora("rechazado")).toBe("Rechazado");
  });

  it("filtros y literal pendiente", () => {
    expect(FILTROS_ESTADO_PAGO.map((f) => f.value)).toEqual(["todos", "pendiente", "confirmado", "rechazado"]);
    expect(ESTADO_PAGO_PENDIENTE).toBe("pendiente");
  });
});
