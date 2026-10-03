import { describe, expect, it } from "vitest";

import { calcularCobranzaLote } from "@/lib/dominio/costos-lote";

/** Espejo de `v_cobranza_lote.esperado_por_vendidas_centavos`: siempre al
 * costo Ananja del lote, sin importar cuánto se le cobró de más a una
 * revendedora en la entrega. */
describe("calcularCobranzaLote al costo Ananja del lote", () => {
  it("lo vendido se espera al costo del lote", () => {
    // 10 entregadas a una revendedora (le cobran $10.000), costo del lote $9.000
    const r = calcularCobranzaLote({ producidas: 100, vendidas: 10, perdidas: 0, costoAnanjaCentavos: 900_000 });
    expect(r.esperadoPorVendidasCentavos).toBe(10 * 900_000);
  });

  it("esperado total descuenta las pérdidas", () => {
    const r = calcularCobranzaLote({ producidas: 100, vendidas: 60, perdidas: 8, costoAnanjaCentavos: 453_791 });
    expect(r.esperadoTotalCentavos).toBe(453_791 * 92);
    expect(r.esperadoPorVendidasCentavos).toBe(453_791 * 60);
  });
});
