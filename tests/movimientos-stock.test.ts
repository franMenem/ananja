import { describe, expect, it } from "vitest";

import {
  esMovimientoStockBorrable,
  etiquetaMotivo,
  mensajeEliminarMovimientoStock,
  MOTIVOS_EGRESO_MANUAL,
} from "@/lib/dominio/movimientos-stock";

/**
 * Espejo de `eliminar_movimiento_stock` (supabase/migrations/0072): solo se
 * borra un egreso sin comprobante, sin entrega y sin feria.
 */
describe("esMovimientoStockBorrable", () => {
  const base = { tipo: "egreso", comprobante_id: null, entrega_id: null, feria_id: null };

  it("un egreso cargado a mano se puede borrar", () => {
    expect(esMovimientoStockBorrable(base)).toBe(true);
  });

  it("un egreso de venta (con comprobante) no", () => {
    expect(esMovimientoStockBorrable({ ...base, comprobante_id: "c-1" })).toBe(false);
  });

  it("un egreso de entrega a una revendedora no", () => {
    expect(esMovimientoStockBorrable({ ...base, entrega_id: "e-1" })).toBe(false);
  });

  it("un egreso de feria no", () => {
    expect(esMovimientoStockBorrable({ ...base, feria_id: "f-1" })).toBe(false);
  });

  it("ningún ingreso se puede borrar (producción, devolución o suelto)", () => {
    expect(esMovimientoStockBorrable({ ...base, tipo: "ingreso" })).toBe(false);
    expect(esMovimientoStockBorrable({ ...base, tipo: "ingreso", entrega_id: "e-1" })).toBe(false);
  });
});

describe("etiquetaMotivo", () => {
  it("usa las mismas etiquetas que el formulario de egreso manual", () => {
    for (const m of MOTIVOS_EGRESO_MANUAL) {
      expect(etiquetaMotivo(m.value)).toBe(m.label);
    }
    expect(MOTIVOS_EGRESO_MANUAL.map((m) => m.label)).toEqual([
      "Venta",
      "Degustación",
      "Rotura",
      "Regalo",
      "Otro",
    ]);
  });

  it("reconoce 'ajuste' (existe en la base aunque el formulario no lo ofrezca)", () => {
    expect(etiquetaMotivo("ajuste")).toBe("Ajuste");
    expect(MOTIVOS_EGRESO_MANUAL.some((m) => m.value === ("ajuste" as string))).toBe(false);
  });

  it("sin motivo (legado) o desconocido: null", () => {
    expect(etiquetaMotivo(null)).toBeNull();
    expect(etiquetaMotivo(undefined)).toBeNull();
    expect(etiquetaMotivo("")).toBeNull();
    expect(etiquetaMotivo("otra-cosa")).toBeNull();
  });
});

describe("mensajeEliminarMovimientoStock", () => {
  it("dice qué se elimina, de qué lote, y que las botellas vuelven al depósito", () => {
    expect(mensajeEliminarMovimientoStock(2, "Botella 250 ml", "2026-08-15")).toBe(
      "Vas a eliminar el egreso de 2 × Botella 250 ml del lote del 15/8. Esas botellas vuelven a figurar en el depósito.",
    );
  });

  it("en singular cuando es una sola botella", () => {
    expect(mensajeEliminarMovimientoStock(1, "Botella 500 ml", "2026-09-05")).toBe(
      "Vas a eliminar el egreso de 1 × Botella 500 ml del lote del 5/9. Esa botella vuelve a figurar en el depósito.",
    );
  });

  it("sin lote no menciona ninguno", () => {
    expect(mensajeEliminarMovimientoStock(3, "Botella 250 ml", null)).toBe(
      "Vas a eliminar el egreso de 3 × Botella 250 ml. Esas botellas vuelven a figurar en el depósito.",
    );
  });
});
