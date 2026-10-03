import { describe, expect, it } from "vitest";

import { calcularDeudaAceiteLoteUsdCentavos } from "@/lib/dominio/costos-lote";

/**
 * `calcularDeudaAceiteLoteUsdCentavos` — espejo puro de
 * `__SCHEMA__.sincronizar_deuda_aceite_lote`
 * (`supabase/migrations/0047_deuda_aceite_proveedor.sql`): la deuda
 * automática con el proveedor de aceite nace SOLO cuando el precio de la
 * línea de aceite del lote vino de la rama USD × dólar de
 * `aplicar_costos_lote` (`usaBranchUsd`) — un ARS explícito o el promedio
 * del tanque no dan un USD/L confiable, así que no se inventa una deuda.
 */
describe("calcularDeudaAceiteLoteUsdCentavos", () => {
  it("125 L a USD 4,00/L (rama USD × dólar) -> USD 500,00 de deuda", () => {
    expect(
      calcularDeudaAceiteLoteUsdCentavos({
        litros: 125,
        usaBranchUsd: true,
        usdPorLitroCentavos: 400, // USD 4,00
      }),
    ).toBe(50_000); // USD 500,00 en centavos
  });

  it("escala con los litros (33,333 L a USD 4,00/L)", () => {
    expect(
      calcularDeudaAceiteLoteUsdCentavos({
        litros: 33.333,
        usaBranchUsd: true,
        usdPorLitroCentavos: 400,
      }),
    ).toBe(13_333); // round(33.333 * 400) = 13.333,2 -> 13.333
  });

  it("precio ARS explícito (usaBranchUsd false): null — no se inventa un USD", () => {
    expect(
      calcularDeudaAceiteLoteUsdCentavos({
        litros: 125,
        usaBranchUsd: false,
        usdPorLitroCentavos: 400,
      }),
    ).toBeNull();
  });

  it("promedio del tanque (usaBranchUsd false, sin USD/L cargado): null", () => {
    expect(
      calcularDeudaAceiteLoteUsdCentavos({
        litros: 125,
        usaBranchUsd: false,
        usdPorLitroCentavos: null,
      }),
    ).toBeNull();
  });

  it("sin litros (0): null, aunque haya USD/L cargado", () => {
    expect(
      calcularDeudaAceiteLoteUsdCentavos({
        litros: 0,
        usaBranchUsd: true,
        usdPorLitroCentavos: 400,
      }),
    ).toBeNull();
  });

  it("rama USD pero sin usdPorLitroCentavos (caso defensivo): null", () => {
    expect(
      calcularDeudaAceiteLoteUsdCentavos({
        litros: 125,
        usaBranchUsd: true,
        usdPorLitroCentavos: null,
      }),
    ).toBeNull();
  });
});
