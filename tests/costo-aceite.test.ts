import { describe, expect, it } from "vitest";

import {
  aplicarIva,
  calcularCostoAceite,
  calcularCostoUnitarioEtiqueta,
  calcularPreciosSugeridos,
  calcularTransportePct,
  litrosAceitePorItem,
} from "@/lib/dominio/costos-lote";

/**
 * `calcularCostoAceite` — espejo puro de la precedencia del precio por
 * litro de aceite en `aplicar_costos_lote`
 * (`supabase/migrations/0030_dolar_por_lote.sql`): ARS explícito
 * (`precio_litro_aceite_centavos`, override de siempre) GANA sobre USD ×
 * dólar (nuevo en 0030, cuando AMBOS están cargados); sin ninguno de los
 * dos, `null` (el promedio de `v_tanque_aceite` es responsabilidad del
 * caller, no de esta función — ver el comentario de `CalcularCostoAceiteInput`
 * en `lib/costos-lote.ts`). Puesto en un archivo
 * aparte de `tests/costos-lote.test.ts`.
 */
describe("calcularCostoAceite", () => {
  it("USD 5,00/L × dólar $1.000 -> $1.250 para 250 ml (0,25 L)", () => {
    const litros = litrosAceitePorItem({ presentacionMl: 250, cantidad: 1 });
    expect(litros).toBe(0.25);

    const centavos = calcularCostoAceite({
      litros,
      usdPorLitroCentavos: 500, // USD 5,00
      dolarCentavos: 100_000, // $1.000,00
      arsPorLitroCentavos: null,
    });
    expect(centavos).toBe(125_000); // $1.250,00
  });

  it("USD 5,00/L × dólar $1.000 -> $2.500 para 500 ml (0,5 L)", () => {
    const litros = litrosAceitePorItem({ presentacionMl: 500, cantidad: 1 });
    expect(litros).toBe(0.5);

    const centavos = calcularCostoAceite({
      litros,
      usdPorLitroCentavos: 500,
      dolarCentavos: 100_000,
      arsPorLitroCentavos: null,
    });
    expect(centavos).toBe(250_000); // $2.500,00
  });

  it("escala con la cantidad de botellas (250 ml × 10 unidades)", () => {
    const litros = litrosAceitePorItem({ presentacionMl: 250, cantidad: 10 });
    expect(litros).toBe(2.5);

    const centavos = calcularCostoAceite({
      litros,
      usdPorLitroCentavos: 500,
      dolarCentavos: 100_000,
      arsPorLitroCentavos: null,
    });
    expect(centavos).toBe(1_250_000); // $12.500,00 = 10 × $1.250
  });

  it("ARS explícito GANA sobre USD×dólar cuando los dos están cargados", () => {
    const centavos = calcularCostoAceite({
      litros: 0.25,
      usdPorLitroCentavos: 500,
      dolarCentavos: 100_000,
      arsPorLitroCentavos: 700_000, // override ARS/L explícito, muy distinto del USD×dólar
    });
    expect(centavos).toBe(175_000); // 0,25 × 700.000 — el USD×dólar ni se calcula
  });

  it("sin ARS y sin dólar cargado (solo USD): null — no basta un solo dato", () => {
    expect(
      calcularCostoAceite({
        litros: 0.25,
        usdPorLitroCentavos: 500,
        dolarCentavos: null,
        arsPorLitroCentavos: null,
      }),
    ).toBeNull();
  });

  it("sin ARS y sin USD cargado (solo dólar): null — no basta un solo dato", () => {
    expect(
      calcularCostoAceite({
        litros: 0.25,
        usdPorLitroCentavos: null,
        dolarCentavos: 100_000,
        arsPorLitroCentavos: null,
      }),
    ).toBeNull();
  });

  it("nada cargado: null (el caller decide si cae al promedio del tanque)", () => {
    expect(
      calcularCostoAceite({
        litros: 0.25,
        usdPorLitroCentavos: null,
        dolarCentavos: null,
        arsPorLitroCentavos: null,
      }),
    ).toBeNull();
  });
});


/**
 * Ejemplo ilustrativo (valores inventados, dólar $1.000, IVA 21%) — mismos
 * pasos que `tests/costos-lote.test.ts` § "reproducción de la planilla",
 * con el aceite derivado de `calcularCostoAceite` (USD × dólar, 0030) en
 * vez de hardcodeado: confirma que el camino USD×dólar llega al costo total
 * de botella esperado, con envase, transporte 8% y las dos etiquetas
 * (frente + retro) cargadas CON IVA incluido. Los esperados salen de
 * hacer la cuenta a mano, no de correr el código.
 */
describe("costo de la botella con aceite USD×dólar (0030) — ejemplo ilustrativo", () => {
  const iva = 21;

  function costoBotella(presentacionMl: 250 | 500) {
    const litros = litrosAceitePorItem({ presentacionMl, cantidad: 1 });
    const aceiteCentavos = calcularCostoAceite({
      litros,
      usdPorLitroCentavos: 500, // USD 5,00/L
      dolarCentavos: 100_000, // $1.000,00
      arsPorLitroCentavos: null,
    })!;

    const envaseNeto = presentacionMl === 250 ? 100_000 : 120_000;
    const envaseCentavos = aplicarIva(envaseNeto, iva, false);
    const transporteCentavos = calcularTransportePct(aceiteCentavos + envaseCentavos, 8);

    const frenteNeto = presentacionMl === 250 ? 10_000 : 15_000;
    const frenteEnvio = 500;
    const reversoNeto = presentacionMl === 250 ? 11_000 : 16_000;
    const reversoEnvio = 1_000;
    const etiquetaCentavos =
      calcularCostoUnitarioEtiqueta({ precioUnitarioCentavos: frenteNeto, envioUnitarioCentavos: frenteEnvio }, iva, false) +
      calcularCostoUnitarioEtiqueta({ precioUnitarioCentavos: reversoNeto, envioUnitarioCentavos: reversoEnvio }, iva, false);

    return { aceiteCentavos, envaseCentavos, transporteCentavos, etiquetaCentavos };
  }

  it("250 ml: costo total de botella $2.925,90", () => {
    const { aceiteCentavos, envaseCentavos, transporteCentavos, etiquetaCentavos } = costoBotella(250);
    expect(aceiteCentavos).toBe(125_000); // $1.250,00 — vía USD×dólar, no hardcodeado
    expect(envaseCentavos).toBe(121_000); // 1.000,00 + IVA 21%
    expect(transporteCentavos).toBe(19_680); // 8% de (aceite + envase)
    expect(etiquetaCentavos).toBe(26_910); // (100×1,21 + 5) + (110×1,21 + 10)

    const totalCentavos = aceiteCentavos + envaseCentavos + transporteCentavos + etiquetaCentavos;
    expect(totalCentavos).toBe(292_590);

    const precios = calcularPreciosSugeridos(totalCentavos, {
      gananciaPct: 30,
      mayoristaPct: 15,
      minoristaPct: 40,
    });
    expect(precios.costoAnanjaCentavos).toBe(380_367); // 292.590 × 1,30
    expect(precios.mayoristaSugeridoCentavos).toBe(437_422); // × 1,15
    expect(precios.minoristaSugeridoCentavos).toBe(612_391); // × 1,40
  });

  it("500 ml: costo total de botella $4.658,26", () => {
    const { aceiteCentavos, envaseCentavos, transporteCentavos, etiquetaCentavos } = costoBotella(500);
    expect(aceiteCentavos).toBe(250_000); // $2.500,00 — vía USD×dólar, no hardcodeado
    expect(envaseCentavos).toBe(145_200); // 1.200,00 + IVA 21%
    expect(transporteCentavos).toBe(31_616); // 8% de (aceite + envase)
    expect(etiquetaCentavos).toBe(39_010); // (150×1,21 + 5) + (160×1,21 + 10)

    const totalCentavos = aceiteCentavos + envaseCentavos + transporteCentavos + etiquetaCentavos;
    expect(totalCentavos).toBe(465_826);

    const precios = calcularPreciosSugeridos(totalCentavos, {
      gananciaPct: 30,
      mayoristaPct: 15,
      minoristaPct: 40,
    });
    expect(precios.costoAnanjaCentavos).toBe(605_574); // 465.826 × 1,30
    expect(precios.mayoristaSugeridoCentavos).toBe(696_410); // × 1,15
    expect(precios.minoristaSugeridoCentavos).toBe(974_974); // × 1,40
  });
});
