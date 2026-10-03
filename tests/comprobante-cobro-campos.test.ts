import { describe, expect, it } from "vitest";

import { calcularCobradoSincronizado } from "@/components/comprobante-cobro-campos";

/**
 * Fix de revisión de Task 3: "Cobrado ahora" no debe resincronizarse con el monto en modo
 * "editar" — ni siquiera en el primer cambio — para no pisar un cobro
 * parcial ya guardado.
 */
describe("calcularCobradoSincronizado", () => {
  it("crear, no tocado: sigue al monto", () => {
    expect(calcularCobradoSincronizado("crear", "150,00", "100,00", false)).toBe(
      "150,00",
    );
  });

  it("crear, tocado: conserva lo que el usuario escribió", () => {
    expect(calcularCobradoSincronizado("crear", "150,00", "50,00", true)).toBe(
      "50,00",
    );
  });

  it("editar, no tocado: conserva el cobrado precargado aunque suba el monto", () => {
    expect(calcularCobradoSincronizado("editar", "150,00", "80,00", false)).toBe(
      "80,00",
    );
  });

  it("editar, tocado: conserva lo que el usuario escribió", () => {
    expect(calcularCobradoSincronizado("editar", "150,00", "50,00", true)).toBe(
      "50,00",
    );
  });
});
