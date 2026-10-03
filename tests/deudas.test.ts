import { describe, expect, it } from "vitest";

import { calcularEstadoDeuda, calcularSaldoDeuda } from "@/lib/dominio/deudas";

describe("calcularSaldoDeuda", () => {
  it("sin pagos, todo el monto queda como restante", () => {
    expect(calcularSaldoDeuda(100000, [])).toEqual({
      pagadoCentavos: 0,
      restanteCentavos: 100000,
    });
  });

  it("un pago parcial resta del restante", () => {
    expect(calcularSaldoDeuda(100000, [{ monto_centavos: 40000 }])).toEqual({
      pagadoCentavos: 40000,
      restanteCentavos: 60000,
    });
  });

  it("varios pagos se acumulan", () => {
    expect(
      calcularSaldoDeuda(100000, [
        { monto_centavos: 40000 },
        { monto_centavos: 60000 },
      ]),
    ).toEqual({ pagadoCentavos: 100000, restanteCentavos: 0 });
  });

  it("borrar un pago (no incluirlo en el array) recalcula el restante sin él", () => {
    const conDosPagos = calcularSaldoDeuda(100000, [
      { monto_centavos: 40000 },
      { monto_centavos: 60000 },
    ]);
    expect(conDosPagos.restanteCentavos).toBe(0);

    const trasBorrarUno = calcularSaldoDeuda(100000, [{ monto_centavos: 40000 }]);
    expect(trasBorrarUno.restanteCentavos).toBe(60000);
  });
});

describe("calcularEstadoDeuda", () => {
  it("sin saldada_en y sin pagos: pendiente", () => {
    expect(calcularEstadoDeuda(null, 0)).toBe("pendiente");
  });

  it("sin saldada_en pero con algún pago: parcial", () => {
    expect(calcularEstadoDeuda(null, 40000)).toBe("parcial");
  });

  it("con saldada_en: saldada, sin importar lo pagado", () => {
    expect(calcularEstadoDeuda("2026-09-11", 100000)).toBe("saldada");
  });

  it("con saldada_en pero pagadoCentavos 0 (marcada saldada sin registrar pago): sigue siendo saldada", () => {
    expect(calcularEstadoDeuda("2026-09-11", 0)).toBe("saldada");
  });
});
