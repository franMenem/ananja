import { describe, expect, it } from "vitest";
import {
  calcularDeudaCliente,
  type CobroClienteMonto,
  type VentaClienteMonto,
} from "@/lib/dominio/calculos";

/**
 * Espejo de `v_deuda_cliente`:
 * vendido − cobrado (cobrado al momento + cobros posteriores).
 */

describe("calcularDeudaCliente — sin ventas", () => {
  it("da todo en cero", () => {
    expect(calcularDeudaCliente([], [])).toEqual({
      vendidoCentavos: 0,
      cobradoCentavos: 0,
      deudaCentavos: 0,
      cantidadVentasPendientes: 0,
    });
  });
});

describe("calcularDeudaCliente — venta cobrada al contado", () => {
  it("sin deuda", () => {
    const ventas: VentaClienteMonto[] = [
      { comprobante_id: "v1", monto_centavos: 100000, cobrado_centavos: 100000 },
    ];
    const resultado = calcularDeudaCliente(ventas, []);
    expect(resultado.vendidoCentavos).toBe(100000);
    expect(resultado.cobradoCentavos).toBe(100000);
    expect(resultado.deudaCentavos).toBe(0);
    expect(resultado.cantidadVentasPendientes).toBe(0);
  });
});

describe("calcularDeudaCliente — venta a crédito sin ningún cobro posterior", () => {
  it("queda pendiente por el saldo no cobrado", () => {
    const ventas: VentaClienteMonto[] = [
      { comprobante_id: "v1", monto_centavos: 100000, cobrado_centavos: 30000 },
    ];
    const resultado = calcularDeudaCliente(ventas, []);
    expect(resultado.vendidoCentavos).toBe(100000);
    expect(resultado.cobradoCentavos).toBe(30000);
    expect(resultado.deudaCentavos).toBe(70000);
    expect(resultado.cantidadVentasPendientes).toBe(1);
  });
});

describe("calcularDeudaCliente — venta a crédito saldada con cobros posteriores", () => {
  it("deja de estar pendiente aunque cobrado_centavos original sea menor al monto", () => {
    const ventas: VentaClienteMonto[] = [
      { comprobante_id: "v1", monto_centavos: 100000, cobrado_centavos: 30000 },
    ];
    const cobros: CobroClienteMonto[] = [
      { comprobante_id: "v1", monto_centavos: 70000 },
    ];
    const resultado = calcularDeudaCliente(ventas, cobros);
    expect(resultado.cobradoCentavos).toBe(100000);
    expect(resultado.deudaCentavos).toBe(0);
    expect(resultado.cantidadVentasPendientes).toBe(0);
  });

  it("un cobro parcial deja la venta todavía pendiente", () => {
    const ventas: VentaClienteMonto[] = [
      { comprobante_id: "v1", monto_centavos: 100000, cobrado_centavos: 30000 },
    ];
    const cobros: CobroClienteMonto[] = [
      { comprobante_id: "v1", monto_centavos: 40000 },
    ];
    const resultado = calcularDeudaCliente(ventas, cobros);
    expect(resultado.cobradoCentavos).toBe(70000);
    expect(resultado.deudaCentavos).toBe(30000);
    expect(resultado.cantidadVentasPendientes).toBe(1);
  });
});

describe("calcularDeudaCliente — varias ventas, algunas pendientes y otras no", () => {
  it("agrega vendido/cobrado/deuda de todas, cuenta solo las pendientes", () => {
    const ventas: VentaClienteMonto[] = [
      { comprobante_id: "v1", monto_centavos: 100000, cobrado_centavos: 100000 },
      { comprobante_id: "v2", monto_centavos: 50000, cobrado_centavos: 20000 },
      { comprobante_id: "v3", monto_centavos: 30000, cobrado_centavos: 0 },
    ];
    const cobros: CobroClienteMonto[] = [
      { comprobante_id: "v3", monto_centavos: 30000 },
    ];
    const resultado = calcularDeudaCliente(ventas, cobros);
    expect(resultado.vendidoCentavos).toBe(180000);
    expect(resultado.cobradoCentavos).toBe(150000);
    expect(resultado.deudaCentavos).toBe(30000);
    // v1 saldada al contado, v2 pendiente ($30.000), v3 saldada por cobro.
    expect(resultado.cantidadVentasPendientes).toBe(1);
  });
});

describe("calcularDeudaCliente — un cobro de un comprobante ajeno no afecta el cálculo", () => {
  it("ignora cobros cuyo comprobante_id no está entre las ventas pasadas", () => {
    const ventas: VentaClienteMonto[] = [
      { comprobante_id: "v1", monto_centavos: 100000, cobrado_centavos: 50000 },
    ];
    const cobros: CobroClienteMonto[] = [
      { comprobante_id: "otro-cliente", monto_centavos: 999999 },
    ];
    const resultado = calcularDeudaCliente(ventas, cobros);
    expect(resultado.cobradoCentavos).toBe(50000);
    expect(resultado.deudaCentavos).toBe(50000);
  });
});
