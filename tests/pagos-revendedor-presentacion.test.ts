import { describe, expect, it } from "vitest";

import {
  ESTADO_PAGO_LABELS,
  ESTADO_PAGO_PENDIENTE,
  ESTADO_PAGO_VARIANTE,
  FILTROS_ESTADO_PAGO,
} from "@/lib/dominio/pagos-revendedor";

describe("presentación del estado de un pago", () => {
  it("variante por estado", () => {
    expect(ESTADO_PAGO_VARIANTE).toEqual({ pendiente: "confirmar", confirmado: "ok", rechazado: "debe" });
  });

  it("etiquetas únicas para todas las pantallas: 'Por confirmar' para el pendiente", () => {
    expect(ESTADO_PAGO_LABELS).toEqual({ pendiente: "Por confirmar", confirmado: "Confirmado", rechazado: "Rechazado" });
  });

  it("filtros y literal pendiente", () => {
    expect(FILTROS_ESTADO_PAGO.map((f) => f.value)).toEqual(["todos", "pendiente", "confirmado", "rechazado"]);
    expect(ESTADO_PAGO_PENDIENTE).toBe("pendiente");
  });
});
