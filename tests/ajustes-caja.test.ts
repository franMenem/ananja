import { describe, expect, it } from "vitest";

import { mensajeEliminarAjuste } from "@/lib/dominio/caja";

/**
 * `mensajeEliminarAjuste` (`lib/caja.ts`) arma el texto de confirmación de
 * `AjusteCajaAcciones` al eliminar un ajuste — ver
 * `supabase/migrations/0034_editar_ajuste_caja.sql`. Un ajuste tiene signo
 * propio (a diferencia de gastos/rendiciones, siempre positivos): uno
 * positivo SUMÓ al saldo (eliminarlo lo baja), uno negativo RESTÓ
 * (eliminarlo lo sube) — este test cubre ambos signos y el caso límite de
 * monto 0 (aunque `ajustes_caja.monto_centavos` tiene un CHECK `<> 0`, la
 * función no debería explotar si algún día se la llama con 0).
 */
describe("mensajeEliminarAjuste", () => {
  it("ajuste positivo: se va a descontar del saldo", () => {
    expect(mensajeEliminarAjuste("efectivo", 500000)).toBe(
      "Se va a descontar $ 5.000,00 del saldo de Efectivo.",
    );
  });

  it("ajuste negativo: se va a sumar al saldo (usa el valor absoluto)", () => {
    expect(mensajeEliminarAjuste("banco", -250000)).toBe(
      "Se va a sumar $ 2.500,00 al saldo de Banco.",
    );
  });

  it("usa la etiqueta del medio de pago correspondiente", () => {
    expect(mensajeEliminarAjuste("mercado_pago", 100)).toBe(
      "Se va a descontar $ 1,00 del saldo de Mercado Pago.",
    );
  });

  it("monto 0 (caso límite): se trata como positivo, no rompe", () => {
    expect(mensajeEliminarAjuste("efectivo", 0)).toBe(
      "Se va a descontar $ 0,00 del saldo de Efectivo.",
    );
  });
});
