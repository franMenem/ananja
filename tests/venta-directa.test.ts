import { describe, expect, it } from "vitest";

import { atribuirVenta, type TramoStock } from "@/lib/dominio/revendedor-stock";
import {
  cantidadDeVentaValida,
  disponibleEnDeposito,
  etiquetaEntregaAutomatica,
  leerDetalleError,
  mensajeDepositoInsuficiente,
  mensajeErrorVentaPropia,
  resumirVentaPropia,
  topeCantidadVenta,
} from "@/lib/dominio/venta-directa";

/**
 * "Agarra directo del depósito" (supabase/migrations/0073): reglas de la
 * pantalla donde la propia persona carga su venta. Sin el flag, todo igual
 * que antes.
 */

function tramo(parcial: Partial<TramoStock> = {}): TramoStock {
  return {
    entregaItemId: "i1",
    entregaId: "e1",
    fecha: "2026-09-01",
    productoId: "p500",
    loteId: "lote-a",
    entregado: 10,
    quedan: 10,
    costoAnanjaUnitarioCentavos: 1_000_000,
    precioSugeridoCentavos: 1_600_000,
    ...parcial,
  };
}

describe("cantidadDeVentaValida / topeCantidadVenta", () => {
  it("sin el flag: de 1 hasta lo que tiene (como siempre)", () => {
    expect(cantidadDeVentaValida(1, 5, false)).toBe(true);
    expect(cantidadDeVentaValida(5, 5, false)).toBe(true);
    expect(cantidadDeVentaValida(6, 5, false)).toBe(false);
    expect(cantidadDeVentaValida(0, 5, false)).toBe(false);
    expect(topeCantidadVenta(5, false)).toBe(5);
  });

  it("con el flag: sin tope, aunque tenga 0 en poder", () => {
    expect(cantidadDeVentaValida(30, 0, true)).toBe(true);
    expect(cantidadDeVentaValida(0, 0, true)).toBe(false);
    expect(cantidadDeVentaValida(1.5, 0, true)).toBe(false);
    expect(topeCantidadVenta(0, true)).toBeUndefined();
  });
});

describe("resumirVentaPropia", () => {
  it("sin el flag y dentro del stock: costo y ganancia completos, nada del depósito", () => {
    const a = atribuirVenta([tramo()], "p500", 4, null, "2026-09-10");
    const r = resumirVentaPropia(a, 1_500_000, false);
    expect(r).toMatchObject({
      propias: 4,
      delDeposito: 0,
      costoPropioCentavos: 4_000_000,
      costoTotalCentavos: 4_000_000,
      gananciaCentavos: 4 * 1_500_000 - 4_000_000,
      sinPrecioAsignado: false,
      bajoCosto: false,
    });
    expect(resumirVentaPropia(a, 900_000, false).bajoCosto).toBe(true);
  });

  it("sin el flag, sin precio asignado: lo avisa", () => {
    const a = atribuirVenta([tramo({ costoAnanjaUnitarioCentavos: null })], "p500", 2, null);
    expect(resumirVentaPropia(a, 1_500_000, false).sinPrecioAsignado).toBe(true);
  });

  it("con el flag y parte en poder: costo solo de lo propio, sin ganancia total", () => {
    const a = atribuirVenta([tramo({ quedan: 3 })], "p500", 10, null, "2026-09-10");
    const r = resumirVentaPropia(a, 2_000_000, true);
    expect(r.propias).toBe(3);
    expect(r.delDeposito).toBe(7);
    expect(r.costoPropioCentavos).toBe(3_000_000);
    expect(r.costoTotalCentavos).toBeNull();
    expect(r.gananciaCentavos).toBeNull();
    expect(r.sinPrecioAsignado).toBe(false);
  });

  it("con el flag y 0 en poder: todo del depósito, nada que calcular", () => {
    const a = atribuirVenta([], "p500", 5, null, "2026-09-10");
    const r = resumirVentaPropia(a, 2_000_000, true);
    expect(r).toMatchObject({
      propias: 0,
      delDeposito: 5,
      costoPropioCentavos: null,
      costoTotalCentavos: null,
      gananciaCentavos: null,
      sinPrecioAsignado: false,
      bajoCosto: false,
    });
  });

  it("con el flag pero dentro de lo que tiene: igual que sin flag", () => {
    const a = atribuirVenta([tramo()], "p500", 4, null, "2026-09-10");
    expect(resumirVentaPropia(a, 1_500_000, true)).toEqual(resumirVentaPropia(a, 1_500_000, false));
  });
});

describe("errores del servidor", () => {
  it("DEPOSITO_INSUFICIENTE dice cuántas quedan, con el detalle del servidor", () => {
    const detalle = JSON.stringify({ producto: "Botella 500 ml", producto_id: "p500", disponible: 6 });
    expect(mensajeErrorVentaPropia("DEPOSITO_INSUFICIENTE", detalle)).toBe(
      "En el depósito quedan 6. Cargá hasta esa cantidad o avisale a Ananja.",
    );
  });

  it("DEPOSITO_INSUFICIENTE con 0 o sin detalle no inventa números", () => {
    expect(mensajeDepositoInsuficiente(0)).toBe(
      "En el depósito no quedan botellas de ese producto. Avisale a Ananja.",
    );
    expect(mensajeErrorVentaPropia("DEPOSITO_INSUFICIENTE", "no es json")).toBe(
      "En el depósito no hay tantas botellas. Cargá menos o avisale a Ananja.",
    );
    expect(mensajeErrorVentaPropia("DEPOSITO_INSUFICIENTE", undefined)).toContain("no hay tantas");
  });

  it("COSTO_FALTANTE avisa que el lote todavía no tiene precio cargado", () => {
    expect(mensajeErrorVentaPropia("COSTO_FALTANTE", null)).toBe(
      "Ese lote todavía no tiene precio cargado. Avisale a Ananja para que lo cargue.",
    );
  });

  it("los errores de siempre conservan su texto, y lo desconocido cae al genérico", () => {
    expect(mensajeErrorVentaPropia("PRECIO_NO_ASIGNADO", null)).toBe(
      "Ananja todavía no te asignó precio para este producto.",
    );
    expect(mensajeErrorVentaPropia("FECHA_FUTURA", null)).toBe("La fecha de la venta no puede ser posterior a hoy.");
    expect(mensajeErrorVentaPropia("NO_AUTORIZADO", null)).toBe("No tenés permiso para esto.");
    expect(mensajeErrorVentaPropia("OTRO", null)).toBe("No se pudo guardar la venta. Probá de nuevo.");
    expect(mensajeErrorVentaPropia(undefined, null)).toBe("No se pudo guardar la venta. Probá de nuevo.");
  });

  it("leerDetalleError nunca tira", () => {
    expect(leerDetalleError(null)).toEqual({});
    expect(leerDetalleError("[1,2]")).toEqual({});
    expect(leerDetalleError("{")).toEqual({});
    expect(disponibleEnDeposito(leerDetalleError('{"disponible": 3.9}'))).toBe(3);
    expect(disponibleEnDeposito({ disponible: "3" })).toBeNull();
  });
});

describe("etiquetaEntregaAutomatica", () => {
  it("rotula la entrega y la devolución automáticas; una manual no lleva etiqueta", () => {
    expect(etiquetaEntregaAutomatica("entrega", true)).toBe("Entrega automática · agarró del depósito");
    expect(etiquetaEntregaAutomatica("devolucion", true)).toBe("Devolución automática · se eliminó la venta");
    expect(etiquetaEntregaAutomatica("entrega", false)).toBeNull();
  });
});
