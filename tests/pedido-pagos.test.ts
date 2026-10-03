import { describe, expect, it } from "vitest";

import {
  calcularEnvasePedido,
  calcularPedido,
  construirLineasCostoBotellaDetallada,
  notaAceitePedido,
  notaCostoEnvasePedido,
  notaEnvasePedido,
  notaEtiquetaPedido,
  notaTransportePctPedido,
  reescalarTransporte,
  type CalcularPedidoInput,
  type ItemPesoInput,
  type PreviewEtiquetaInput,
  type RecetaEtiquetaConInsumo,
} from "@/lib/dominio/costos-lote";
import { etiquetaConceptoPago, insumoDeMovimientos, tituloGasto } from "@/lib/dominio/gastos";
import {
  aPagarGuardadoPorConcepto,
  conceptosPagoLote,
  construirEntradaPedido,
  construirPCostosLote,
  costosLoteStateVacio,
  mensajeErrorLote,
  montosInicialesRevision,
  montosSugeridosPago,
  prefillCostosLote,
  redondeosDesdeMontos,
  redondeosPedidoDesdeMontos,
  type CostosLoteState,
} from "@/lib/dominio/lotes";

/**
 * 0038_pago_por_concepto.sql — costo vs. a pagar por concepto del pedido al
 * proveedor, redondeos y pago por concepto. Ejemplo: un pedido (200 ×
 * 500 ml + 100 × 250 ml): envasado 250 ml calculado $125.070, pagado
 * $125.100; envasado 500 ml $300.000; transporte fijo $120.000.
 */

describe("calcularEnvasePedido", () => {
  it("0053_pago_vs_costo_insumo.sql: ejemplo, el proveedor cobra CON IVA — 'monto real' reemplaza SOLO el pago, el costo sigue el precio cargado", () => {
    const r = calcularEnvasePedido({
      precioUnitarioCentavos: 125_070,
      cantidad: 100,
      ivaPct: 21,
      incluyeIva: true,
      cobradoSinIva: false,
      redondeoCentavos: 12_510_000,
      precioCostoUnitarioCentavos: null,
    });
    expect(r.calculadoCentavos).toBe(12_507_000);
    expect(r.aPagarCentavos).toBe(12_510_000);
    // Antes de 0053 el costo seguía al "monto real" (125.100); desde acá el
    // costo es independiente del pago — sin precio para costo, sigue el
    // precio cargado tal cual (el proveedor ya lo cobra con IVA, no hay nada que
    // sumarle).
    expect(r.totalCentavos).toBe(12_507_000);
    expect(r.costoUnitarioCentavos).toBe(125_070);
  });

  it("0053: revierte 0048 — el proveedor cobra SIN IVA: el pago nunca lleva IVA sumado, el costo sí (+21%), y el 'monto real' del pago no toca el costo", () => {
    const conRedondeo = calcularEnvasePedido({
      precioUnitarioCentavos: 125_070,
      cantidad: 100,
      ivaPct: 21,
      incluyeIva: true,
      cobradoSinIva: true,
      redondeoCentavos: 12_510_000,
      precioCostoUnitarioCentavos: null,
    });
    // Pago: cantidad × precio, SIN IVA — el "monto real" (lo que el proveedor
    // realmente cobró) lo reemplaza tal cual, sin sumarle nada.
    expect(conRedondeo.calculadoCentavos).toBe(12_507_000);
    expect(conRedondeo.aPagarCentavos).toBe(12_510_000);
    // Costo: cantidad × precio + IVA 21% — el "monto real" del pago (arriba)
    // NO entra en esta cuenta: 12.507.000 × 1,21 = 15.133.470, IGUAL con o
    // sin "monto real" cargado (ver el caso sin redondeo, abajo).
    expect(conRedondeo.totalCentavos).toBe(15_133_470);
    expect(conRedondeo.costoUnitarioCentavos).toBe(151_335);

    const sinRedondeo = calcularEnvasePedido({
      precioUnitarioCentavos: 125_070,
      cantidad: 100,
      ivaPct: 21,
      incluyeIva: true,
      cobradoSinIva: true,
      redondeoCentavos: null,
      precioCostoUnitarioCentavos: null,
    });
    // Sin "monto real": el pago es el calculado, sin IVA — YA NO coincide
    // con el costo (antes de 0053, con `cobradoSinIva`, los dos siempre
    // daban igual).
    expect(sinRedondeo.aPagarCentavos).toBe(12_507_000);
    expect(sinRedondeo.totalCentavos).toBe(15_133_470);
    expect(sinRedondeo.costoUnitarioCentavos).toBe(151_335);
  });

  it("0053: precio para el costo distinto del pagado — el costo usa ESE precio, ignora el pagado y el 'monto real'", () => {
    const r = calcularEnvasePedido({
      precioUnitarioCentavos: 125_070,
      cantidad: 100,
      ivaPct: 21,
      incluyeIva: true,
      cobradoSinIva: true,
      redondeoCentavos: 12_510_000,
      precioCostoUnitarioCentavos: 200_000,
    });
    expect(r.aPagarCentavos).toBe(12_510_000); // pago: sigue el "monto real", ajeno al precio para costo
    expect(r.totalCentavos).toBe(24_200_000); // 100 × $2.000 × 1,21
    expect(r.costoUnitarioCentavos).toBe(242_000);
  });

  it("modo viejo (sin la clave): IVA por unidad según precios_incluyen_iva y a pagar = costo, como 0030 — SIN CAMBIOS por 0053 (precio para costo no tiene efecto acá)", () => {
    const r = calcularEnvasePedido({
      precioUnitarioCentavos: 150_000,
      cantidad: 200,
      ivaPct: 21,
      incluyeIva: false,
      cobradoSinIva: null,
      redondeoCentavos: null,
      precioCostoUnitarioCentavos: 999_999,
    });
    expect(r.costoUnitarioCentavos).toBe(181_500);
    expect(r.totalCentavos).toBe(36_300_000);
    expect(r.aPagarCentavos).toBe(36_300_000);
  });
});

describe("reescalarTransporte", () => {
  it("suma exacto el monto real y los centavos que sobran van a la línea más grande", () => {
    const r = reescalarTransporte(
      [
        { productoId: "p500", totalCentavos: 7_072_000 },
        { productoId: "p250", totalCentavos: 2_232_560 },
      ],
      9_300_000,
    );
    expect(r).toEqual([
      { productoId: "p500", totalCentavos: 7_068_535 },
      { productoId: "p250", totalCentavos: 2_231_465 },
    ]);
    expect(r.reduce((acc, l) => acc + l.totalCentavos, 0)).toBe(9_300_000);
  });

  it("empate: el resto va al producto_id menor", () => {
    const r = reescalarTransporte(
      [
        { productoId: "b", totalCentavos: 100 },
        { productoId: "a", totalCentavos: 100 },
      ],
      201,
    );
    expect(r).toEqual([
      { productoId: "b", totalCentavos: 100 },
      { productoId: "a", totalCentavos: 101 },
    ]);
  });

  it("la más grande se elige con los montos ORIGINALES aunque el floor las empate", () => {
    const r = reescalarTransporte(
      [
        { productoId: "a", totalCentavos: 100 },
        { productoId: "b", totalCentavos: 101 },
      ],
      100,
    );
    // floor(100·100/201) = 49, floor(101·100/201) = 50 → resto 1 a "b".
    expect(r).toEqual([
      { productoId: "a", totalCentavos: 49 },
      { productoId: "b", totalCentavos: 51 },
    ]);
  });

  it("montos grandes no pierden precisión (BigInt)", () => {
    const r = reescalarTransporte(
      [
        { productoId: "a", totalCentavos: 987_654_321 },
        { productoId: "b", totalCentavos: 123_456_789 },
      ],
      1_111_111_200,
    );
    expect(r.reduce((acc, l) => acc + l.totalCentavos, 0)).toBe(1_111_111_200);
  });
});

describe("calcularPedido — pedido de ejemplo al proveedor", () => {
  const items: ItemPesoInput[] = [
    { productoId: "p500", presentacionMl: 500, cantidad: 200 },
    { productoId: "p250", presentacionMl: 250, cantidad: 100 },
  ];
  const recetasEtiqueta: RecetaEtiquetaConInsumo[] = [
    { productoId: "p500", insumoId: "grande-frente", cantidad: 1 },
    { productoId: "p500", insumoId: "grande-retro", cantidad: 1 },
    { productoId: "p250", insumoId: "chica-frente", cantidad: 1 },
    { productoId: "p250", insumoId: "chica-retro", cantidad: 1 },
  ];
  const etiquetas: PreviewEtiquetaInput[] = [
    { insumoId: "grande-frente", precioUnitarioCentavos: 20_000, envioUnitarioCentavos: 0 },
    { insumoId: "grande-retro", precioUnitarioCentavos: 22_000, envioUnitarioCentavos: 0 },
    { insumoId: "chica-frente", precioUnitarioCentavos: 13_000, envioUnitarioCentavos: 0 },
    { insumoId: "chica-retro", precioUnitarioCentavos: 16_000, envioUnitarioCentavos: 0 },
  ];
  const base: CalcularPedidoInput = {
    items,
    recetasEtiqueta,
    precioLitroAceiteCentavos: 500_000,
    etiquetas,
    envasePorProducto: new Map([
      ["p500", 150_000],
      ["p250", 125_070],
    ]),
    transporte: { modo: "fijo", totalCentavos: 12_000_000 },
    otrosCentavos: 0,
    ivaPct: 21,
    incluyeIva: true,
    pcts: { gananciaPct: 30, mayoristaPct: 15, minoristaPct: 40 },
    envaseCobradoSinIva: false,
  };

  it("sin redondeo: a pagar $545.070 (lo que muestra hoy v_saldo_lote)", () => {
    const r = calcularPedido(base);
    expect(r.totalAPagarCentavos).toBe(54_507_000);
    expect(r.aceiteCentavos).toBe(62_500_000);
    expect(r.etiquetas).toEqual([
      { insumoId: "grande-frente", costoCentavos: 4_000_000 },
      { insumoId: "grande-retro", costoCentavos: 4_400_000 },
      { insumoId: "chica-frente", costoCentavos: 1_300_000 },
      { insumoId: "chica-retro", costoCentavos: 1_600_000 },
    ]);
  });

  it("con el envasado de 250 ml redondeado a $125.100: a pagar $545.100, pero el costo NO se mueve (0053 — antes, 0048, sí)", () => {
    const r = calcularPedido({
      ...base,
      redondeos: { envase: { p250: 12_510_000 }, transporteCentavos: null },
    });
    expect(r.totalAPagarCentavos).toBe(54_510_000);
    expect(r.transporte).toEqual({ modo: "fijo", calculadoCentavos: 12_000_000, aPagarCentavos: 12_000_000 });

    const e250 = r.envases.find((e) => e.productoId === "p250")!;
    expect(e250.calculadoCentavos).toBe(12_507_000);
    expect(e250.aPagarCentavos).toBe(12_510_000);
    // Costo del envasado: cantidad × precio cargado, SIN pasar por el "monto
    // real" (0053) — sigue en 12.507.000 aunque se pague 12.510.000.
    expect(e250.totalCentavos).toBe(12_507_000);

    const p500 = r.presentaciones.find((p) => p.productoId === "p500")!;
    const p250 = r.presentaciones.find((p) => p.productoId === "p250")!;
    // Transporte fijo por volumen: 500×200 = 100.000, 250×100 = 25.000 —
    // sin cambios (no depende del envase).
    expect(p500.transporteCentavos).toBe(9_600_000);
    expect(p250.transporteCentavos).toBe(2_400_000);
    expect(p500.totalCentavos).toBe(98_000_000);
    expect(p500.costoUnitarioCentavos).toBe(490_000);
    // p250 baja $30 de costo total (30.310.000 → 30.307.000) respecto de
    // antes de 0053: esa diferencia era el "monto real" colándose en el
    // costo, ya no pasa.
    expect(p250.totalCentavos).toBe(30_307_000);
    expect(p250.costoUnitarioCentavos).toBe(303_070);
    expect(p250.precios.costoAnanjaCentavos).toBe(393_991);
  });

  it("0053: revierte 0048 — con 'cobrado sin IVA' el pago NUNCA suma IVA (a diferencia de 0048), y el 'monto real' del envase no mueve el costo total del pedido", () => {
    const redondeos = { envase: { p250: 12_510_000 }, transporteCentavos: null };

    const sinIvaApagado = calcularPedido({ ...base, envaseCobradoSinIva: false, redondeos });
    const e250Apagado = sinIvaApagado.envases.find((e) => e.productoId === "p250")!;
    expect(e250Apagado.calculadoCentavos).toBe(12_507_000);
    expect(e250Apagado.aPagarCentavos).toBe(12_510_000);
    expect(e250Apagado.totalCentavos).toBe(12_507_000);
    expect(sinIvaApagado.totalAPagarCentavos).toBe(54_510_000);

    const sinIvaPrendido = calcularPedido({ ...base, envaseCobradoSinIva: true, redondeos });
    const e250Prendido = sinIvaPrendido.envases.find((e) => e.productoId === "p250")!;
    const e500Prendido = sinIvaPrendido.envases.find((e) => e.productoId === "p500")!;
    // p250 tenía "Monto real" $125.100: 0053 revierte 0048 — el pago sigue
    // siendo ESE monto tal cual (sin sumarle IVA), y el costo se calcula
    // aparte (+21%, sin pasar por el "monto real").
    expect(e250Prendido.aPagarCentavos).toBe(12_510_000);
    expect(e250Prendido.totalCentavos).toBe(15_133_470);
    // p500 no tenía "Monto real": el pago sigue siendo cantidad × precio,
    // SIN IVA (0053 revierte 0048 — antes le sumaba el 21% también al pago).
    expect(e500Prendido.aPagarCentavos).toBe(30_000_000);
    expect(e500Prendido.totalCentavos).toBe(36_300_000);
    // Lo que se le paga al proveedor YA NO cambia con el IVA (0053): 300.000 (sin
    // IVA) + 125.100 (monto real) + 120.000 transporte.
    expect(sinIvaPrendido.totalAPagarCentavos).toBe(54_510_000);

    // Sin redondeo: el pago es SIEMPRE cantidad × precio, sin IVA — no
    // cambia si se enciende o apaga "cobrado sin IVA" (0053 lo desacopla del
    // pago; antes, 0048, si estaba prendido el pago SÍ subía con el IVA).
    expect(calcularPedido({ ...base, envaseCobradoSinIva: true }).totalAPagarCentavos).toBe(
      calcularPedido({ ...base, envaseCobradoSinIva: false }).totalAPagarCentavos,
    );
  });

  it("transporte 8% con redondeo: la base usa el envasado A COSTO (sin el 'monto real', 0053) y las líneas suman el monto real del transporte", () => {
    const r = calcularPedido({
      ...base,
      transporte: { modo: "porcentaje", porcentajeSobreAceiteMasEnvase: 8 },
      redondeos: { envase: { p250: 12_510_000 }, transporteCentavos: 9_300_000 },
    });
    expect(r.transporte?.modo).toBe("porcentaje");
    if (r.transporte?.modo !== "porcentaje") return;
    // 500: (50.000.000 aceite + 8.400.000 etiquetas + 30.000.000 envase COSTO) × 8%;
    // 250: (12.500.000 + 2.900.000 + 12.507.000 envase COSTO, sin el "monto
    // real" del pago) × 8% — antes de 0053 usaba 12.510.000 acá.
    expect(r.transporte.calculadoCentavos).toBe(9_304_560);
    expect(r.transporte.aPagarCentavos).toBe(9_300_000);
    expect(r.presentaciones.find((p) => p.productoId === "p500")!.transporteCentavos).toBe(7_068_535);
    expect(r.presentaciones.find((p) => p.productoId === "p250")!.transporteCentavos).toBe(2_231_465);
    expect(r.totalAPagarCentavos).toBe(30_000_000 + 12_510_000 + 9_300_000);
  });

  it("0053: envasado cobrado sin IVA — el transporte % se calcula sobre el COSTO (con IVA), no sobre lo pagado", () => {
    const r = calcularPedido({
      ...base,
      envaseCobradoSinIva: true,
      transporte: { modo: "porcentaje", porcentajeSobreAceiteMasEnvase: 8 },
      redondeos: { envase: { p250: 12_510_000 }, transporteCentavos: null },
    });
    const e250 = r.envases.find((e) => e.productoId === "p250")!;
    expect(e250.aPagarCentavos).toBe(12_510_000);
    expect(e250.totalCentavos).toBe(15_133_470);
    expect(r.presentaciones.find((p) => p.productoId === "p250")!.transporteCentavos).toBe(
      Math.round(((12_500_000 + 2_900_000 + 15_133_470) * 8) / 100),
    );
  });

  it("0053: precio para el costo distinto del pagado, en envase y en etiqueta — el pago no se mueve, el costo sí", () => {
    const r = calcularPedido({
      ...base,
      envaseCostoPorProducto: new Map([["p500", 200_000]]),
      etiquetas: etiquetas.map((e) =>
        e.insumoId === "chica-frente" ? { ...e, precioCostoUnitarioCentavos: 20_000 } : e,
      ),
    });

    const e500 = r.envases.find((e) => e.productoId === "p500")!;
    // Pago: sigue en cantidad × precio pagado (180.000 × 200) — el precio
    // para costo no lo toca.
    expect(e500.aPagarCentavos).toBe(30_000_000);
    // Costo: cantidad × precio para costo (200.000 × 200), sin IVA porque
    // El proveedor cobra con IVA acá.
    expect(e500.totalCentavos).toBe(40_000_000);

    const chicaFrente = r.etiquetas.find((e) => e.insumoId === "chica-frente")!;
    // Costo de "chica frente": 100 unidades × $200 (precio para costo, en
    // vez de los $129,50 pagados) — sigue sin generar a pagar (ya comprada).
    expect(chicaFrente.costoCentavos).toBe(2_000_000);
  });
});

describe("calcularPedido — costo Ananja redondeado (0054_costo_ananja_redondeado.sql)", () => {
  const items: ItemPesoInput[] = [
    { productoId: "p500", presentacionMl: 500, cantidad: 200 },
    { productoId: "p250", presentacionMl: 250, cantidad: 100 },
  ];
  const base: CalcularPedidoInput = {
    items,
    recetasEtiqueta: [],
    precioLitroAceiteCentavos: 500_000,
    etiquetas: [],
    envasePorProducto: new Map([
      ["p500", 150_000],
      ["p250", 125_070],
    ]),
    transporte: { modo: "fijo", totalCentavos: 0 },
    otrosCentavos: 0,
    ivaPct: 21,
    incluyeIva: true,
    pcts: { gananciaPct: 30, mayoristaPct: 15, minoristaPct: 40 },
    envaseCobradoSinIva: false,
  };

  it("sin costoAnanjaRedondeadoPorProducto: los precios de cada presentación son los mismos de siempre (calculado === efectivo)", () => {
    const r = calcularPedido(base);
    for (const p of r.presentaciones) {
      expect(p.precios.costoAnanjaCentavos).toBe(p.precios.costoAnanjaCalculadoCentavos);
    }
  });

  it("con costoAnanjaRedondeadoPorProducto: SOLO la presentación mencionada usa el redondeado, la otra sigue el calculado", () => {
    const r = calcularPedido({
      ...base,
      costoAnanjaRedondeadoPorProducto: new Map([["p250", 250_000]]),
    });
    const p250 = r.presentaciones.find((p) => p.productoId === "p250")!;
    const p500 = r.presentaciones.find((p) => p.productoId === "p500")!;
    expect(p250.precios.costoAnanjaCentavos).toBe(250_000);
    expect(p250.precios.costoAnanjaCalculadoCentavos).not.toBe(250_000);
    expect(p500.precios.costoAnanjaCentavos).toBe(p500.precios.costoAnanjaCalculadoCentavos);
  });
});

function stateCon(parcial: Partial<CostosLoteState>): CostosLoteState {
  return { ...costosLoteStateVacio(), ...parcial };
}

const items250 = [{ productoId: "p250", presentacionMl: 250, cantidad: 100 }];

describe("construirPCostosLote (0038)", () => {
  it("siempre manda envase_cobrado_sin_iva y redondeos explícitos", () => {
    const state = stateCon({ envasePorProducto: { p250: "1.250,70" }, envaseSinIva: true });
    const sinRedondeos = construirPCostosLote(state, ["p250"]);
    expect(sinRedondeos?.envase_cobrado_sin_iva).toBe(true);
    expect(sinRedondeos?.redondeos).toEqual([]);

    const conRedondeos = construirPCostosLote(state, ["p250"], [], [
      { concepto: "envase", producto_id: "p250", monto_centavos: 12_510_000 },
    ]);
    expect(conRedondeos?.redondeos).toEqual([
      { concepto: "envase", producto_id: "p250", monto_centavos: 12_510_000 },
    ]);
  });
});

describe("construirPCostosLote — costo Ananja redondeado (0054)", () => {
  it("manda una entrada por producto_id, con monto_centavos null cuando el campo está vacío", () => {
    const state = stateCon({
      envasePorProducto: { p250: "1.250,70" },
      costoAnanjaRedondeadoPorProducto: { p250: "2.500,00" },
    });
    const costos = construirPCostosLote(state, ["p250", "p500"]);
    expect(costos?.costos_ananja_redondeados).toEqual([
      { producto_id: "p250", monto_centavos: 250_000 },
      { producto_id: "p500", monto_centavos: null },
    ]);
  });

  it("un redondeo cargado sin ningún otro costo igual dispara el guardado (algoCargado)", () => {
    const state = stateCon({ costoAnanjaRedondeadoPorProducto: { p250: "2.500,00" } });
    const costos = construirPCostosLote(state, ["p250"]);
    expect(costos).not.toBeNull();
    expect(costos?.costos_ananja_redondeados).toEqual([{ producto_id: "p250", monto_centavos: 250_000 }]);
  });
});

describe("redondeosDesdeMontos", () => {
  const entrada = construirEntradaPedido({
    state: stateCon({ envasePorProducto: { p250: "1.250,70" } }),
    items: items250,
    recetasEtiqueta: [],
    etiquetaInsumoIds: [],
  });

  function redondeos(montos: Record<string, number>) {
    const calculo = calcularPedido({ ...entrada, redondeos: redondeosPedidoDesdeMontos(montos) });
    return redondeosDesdeMontos(calculo, montos);
  }

  it("solo manda los montos que difieren del calculado — 0053: la base del transporte ya NO sigue el 'monto real' del envase, así que un transporte antes 'exacto' ahora también difiere", () => {
    // Transporte 8% sobre el envase A COSTO (0053, sin el "monto real" del
    // pago): 12.507.000 × 8% = 1.000.560 — 1.000.800 (calculado con la
    // regla vieja, sobre el envase redondeado) ya no coincide, así que
    // ahora viaja también.
    expect(redondeos({ "envase:p250": 12_510_000, transporte: 1_000_800 })).toEqual([
      { concepto: "envase", producto_id: "p250", monto_centavos: 12_510_000 },
      { concepto: "transporte", monto_centavos: 1_000_800 },
    ]);
    expect(redondeos({ "envase:p250": 12_507_000, transporte: 1_001_000 })).toEqual([
      { concepto: "transporte", monto_centavos: 1_001_000 },
    ]);
  });
});

describe("aPagarGuardadoPorConcepto / montosInicialesRevision", () => {
  it("suma a_pagar por clave (envase por presentación, transporte del pedido)", () => {
    expect(
      aPagarGuardadoPorConcepto([
        { concepto: "aceite", producto_id: "p250", a_pagar_centavos: null },
        { concepto: "envase", producto_id: "p250", a_pagar_centavos: 12_510_000 },
        { concepto: "transporte", producto_id: "p250", a_pagar_centavos: 1_000 },
        { concepto: "transporte", producto_id: "p500", a_pagar_centavos: 2_000 },
        { concepto: "otro", producto_id: null, a_pagar_centavos: 500 },
      ]),
    ).toEqual({ "envase:p250": 12_510_000, transporte: 3_000 });
  });

  const state = stateCon({ envasePorProducto: { p250: "1.250,70" } });
  const entrada = construirEntradaPedido({
    state,
    items: items250,
    recetasEtiqueta: [],
    etiquetaInsumoIds: [],
  });

  it("sin tocar nada: arranca con el redondeo guardado (0053: el transporte también, porque su base ya no sigue el 'monto real' del envase — ver el test de `redondeosDesdeMontos`)", () => {
    expect(
      montosInicialesRevision({
        entradaInicial: entrada,
        entradaActual: entrada,
        aPagarGuardado: { "envase:p250": 12_510_000, transporte: 1_000_800 },
      }),
    ).toEqual({ "envase:p250": 12_510_000, transporte: 1_000_800 });

    expect(
      montosInicialesRevision({
        entradaInicial: entrada,
        entradaActual: entrada,
        aPagarGuardado: { "envase:p250": 12_510_000, transporte: 1_001_000 },
      }),
    ).toEqual({ "envase:p250": 12_510_000, transporte: 1_001_000 });
  });

  it("si cambió el precio, lo guardado ya no corresponde: arranca del calculado", () => {
    const entradaActual = construirEntradaPedido({
      state: stateCon({ envasePorProducto: { p250: "1.600,00" } }),
      items: items250,
      recetasEtiqueta: [],
      etiquetaInsumoIds: [],
    });
    expect(
      montosInicialesRevision({
        entradaInicial: entrada,
        entradaActual,
        aPagarGuardado: { "envase:p250": 12_510_000, transporte: 1_001_000 },
      }),
    ).toEqual({});
  });
});

describe("prefillCostosLote — envase legado gross-eado (antes de 0038)", () => {
  const fila = {
    concepto: "envase",
    producto_id: "p500",
    insumo_id: null,
    costo_unitario_centavos: 181_500,
    neto_centavos: 150_000,
    costo_neto_centavos: null,
    envio_centavos: null,
    total_centavos: 36_300_000,
    descripcion: "IVA 21% aplicado sobre el precio neto",
  };

  it("prefija el precio CON IVA que se venía pagando, con el switch nuevo apagado", () => {
    const r = prefillCostosLote([fila], ["p500"], { precioIncluyeIva: false, ivaPct: 21 });
    expect(r.envaseSinIva).toBe(false);
    expect(r.envasePorProducto.p500).toBe("1.815,00");
  });

  it("un lote ya guardado con 'cobrado sin IVA' prefija el neto y el switch prendido", () => {
    const r = prefillCostosLote(
      [{ ...fila, costo_unitario_centavos: 150_000, descripcion: null }],
      ["p500"],
      { precioIncluyeIva: true, ivaPct: 21, envaseCobradoSinIva: true },
    );
    expect(r.envaseSinIva).toBe(true);
    expect(r.envasePorProducto.p500).toBe("1.500,00");
  });
});

describe("conceptosPagoLote / montosSugeridosPago", () => {
  const conceptos = conceptosPagoLote(
    [
      { concepto: "transporte", producto_id: null, a_pagar_centavos: 12_000_000, pagado_centavos: 0, saldo_centavos: 12_000_000 },
      { concepto: "envase", producto_id: "p250", a_pagar_centavos: 12_510_000, pagado_centavos: 0, saldo_centavos: 12_510_000 },
      { concepto: "envase", producto_id: "p500", a_pagar_centavos: 30_000_000, pagado_centavos: 30_000_000, saldo_centavos: 0 },
    ],
    new Map([
      ["p500", 500],
      ["p250", 250],
    ]),
  );

  it("ordena envasado (presentación más grande primero), transporte, otros", () => {
    expect(conceptos.map((c) => c.clave)).toEqual(["envase:p500", "envase:p250", "transporte:"]);
    expect(conceptos[0].etiqueta).toMatch(/^Envasado 500/);
    expect(conceptos[2].etiqueta).toBe("Transporte");
  });

  it("prefija cada concepto con su pendiente sin pasarse del total del pedido", () => {
    expect(
      montosSugeridosPago(
        [
          { clave: "envase:p250", pendienteCentavos: 12_510_000 },
          { clave: "transporte:", pendienteCentavos: 12_000_000 },
        ],
        20_000_000,
      ),
    ).toEqual({ "envase:p250": 12_510_000, "transporte:": 7_490_000 });
  });
});

describe("mensajeErrorLote (0038)", () => {
  it("nombra el concepto en PAGO_EXCEDE_SALDO / COSTOS_MENORES_A_PAGADO / REDONDEO_INVALIDO", () => {
    expect(
      mensajeErrorLote("PAGO_EXCEDE_SALDO", JSON.stringify({ saldo_centavos: 0, concepto: "transporte" })),
    ).toContain("del transporte");
    expect(
      mensajeErrorLote(
        "COSTOS_MENORES_A_PAGADO",
        JSON.stringify({ pagado_centavos: 100, nuevo_total_centavos: 50, concepto: "envase", producto_id: "x" }),
      ),
    ).toContain("del envasado");
    expect(mensajeErrorLote("REDONDEO_INVALIDO", JSON.stringify({ concepto: "transporte" }))).toContain(
      "redondeos",
    );
    expect(
      mensajeErrorLote("PAGO_INVALIDO", JSON.stringify({ concepto: "envase", producto_id: "x" })),
    ).toContain("no tiene nada para pagar del envasado");
    expect(mensajeErrorLote("PAGO_INVALIDO")).toBe("Revisá los montos cargados.");
    // Sin concepto: mensaje de siempre.
    expect(mensajeErrorLote("PAGO_EXCEDE_SALDO", JSON.stringify({ saldo_centavos: 0 }))).toBe(
      "El pago supera lo que falta de este pedido.",
    );
  });
});

describe("construirLineasCostoBotellaDetallada — nota del envase (0053_pago_vs_costo_insumo.sql)", () => {
  // 0053 SHOULD-FIX: antes, `notaEnvase` inferí­a "el proveedor cobró sin IVA" de
  // comparar `aPagarCentavos` contra el costo — con el precio para costo
  // separado del pagado, esa comparación ya no alcanza (puede dar distinto
  // solo por el precio para costo, con el proveedor cobrando CON IVA, y el texto
  // mentía). Ahora usa `envaseSinIva` (lotes_produccion.envase_cobrado_sin_iva)
  // y `costoNetoCentavos` (lote_costos.costo_neto_centavos) por separado.
  const baseInput = {
    aceite: null,
    etiquetas: [],
    transporteCentavos: 0,
    transportePct: null,
    otrosCentavos: 0,
    cantidadBotellas: 100,
    ivaPct: 21,
    incluyeIva: true,
    envaseSinIva: false,
  };

  it("solo sin IVA (sin precio para costo distinto): 'sin IVA $X + IVA 21%'", () => {
    const lineas = construirLineasCostoBotellaDetallada({
      ...baseInput,
      envase: {
        cantidad: 100,
        netoCentavos: 125_070,
        costoUnitarioCentavos: 151_335,
        totalCentavos: 15_133_470,
        aPagarCentavos: 12_510_000, // "monto real" del PAGO — ya no influye en la nota.
        costoNetoCentavos: null,
      },
      totalCentavos: 15_133_470,
      costoUnitarioCentavos: 151_335,
      envaseSinIva: true,
    });
    expect(lineas[0].antes).toContain("(sin IVA $ 1.250,70 + IVA 21%)");
    expect(lineas[0].antes).not.toContain("Cobrado");
    expect(lineas[0].antes).not.toContain("para el costo");
  });

  it("solo precio para costo distinto, el proveedor cobra CON IVA: 'pagado $X · para el costo $Y' — SIN mencionar IVA (el bug que corrige esta migración)", () => {
    const lineas = construirLineasCostoBotellaDetallada({
      ...baseInput,
      envase: {
        cantidad: 200,
        netoCentavos: 150_000,
        costoUnitarioCentavos: 200_000,
        totalCentavos: 40_000_000,
        aPagarCentavos: 30_000_000,
        costoNetoCentavos: 200_000,
      },
      totalCentavos: 40_000_000,
      costoUnitarioCentavos: 200_000,
      envaseSinIva: false,
    });
    expect(lineas[0].antes).toContain("(pagado $ 1.500,00 · para el costo $ 2.000,00)");
    expect(lineas[0].antes).not.toContain("IVA");
  });

  it("los dos juntos — sin IVA Y precio para costo distinto: 'pagado $X · para el costo $Y + IVA 21%'", () => {
    const lineas = construirLineasCostoBotellaDetallada({
      ...baseInput,
      envase: {
        cantidad: 200,
        netoCentavos: 150_000,
        costoUnitarioCentavos: 242_000,
        totalCentavos: 48_400_000,
        aPagarCentavos: 30_000_000,
        costoNetoCentavos: 200_000,
      },
      totalCentavos: 48_400_000,
      costoUnitarioCentavos: 242_000,
      envaseSinIva: true,
    });
    expect(lineas[0].antes).toContain("(pagado $ 1.500,00 · para el costo $ 2.000,00 + IVA 21%)");
  });

  it("ninguna de las dos: sin nota", () => {
    const lineas = construirLineasCostoBotellaDetallada({
      ...baseInput,
      envase: {
        cantidad: 200,
        netoCentavos: 150_000,
        costoUnitarioCentavos: 150_000,
        totalCentavos: 30_000_000,
        aPagarCentavos: 30_000_000,
        costoNetoCentavos: null,
      },
      totalCentavos: 30_000_000,
      costoUnitarioCentavos: 150_000,
      envaseSinIva: false,
    });
    expect(lineas[0].antes).not.toContain("IVA");
    expect(lineas[0].antes).not.toContain("para el costo");
  });

  it("legado (anterior a 0038, sin `envaseSinIva` propio): el precio se gross-eó por unidad — sigue detectándose igual que siempre", () => {
    const lineas = construirLineasCostoBotellaDetallada({
      ...baseInput,
      envase: {
        cantidad: 200,
        netoCentavos: 150_000,
        costoUnitarioCentavos: 181_500,
        totalCentavos: 36_300_000,
        aPagarCentavos: undefined,
        costoNetoCentavos: undefined,
      },
      totalCentavos: 36_300_000,
      costoUnitarioCentavos: 181_500,
      incluyeIva: false,
      envaseSinIva: false,
    });
    expect(lineas[0].antes).toContain("(sin IVA $ 1.500,00 + IVA 21%)");
  });

  it("etiqueta con precio para costo distinto, el proveedor cobra CON IVA: misma nota 'pagado · para el costo', sin IVA de más", () => {
    const lineas = construirLineasCostoBotellaDetallada({
      ...baseInput,
      envase: null,
      etiquetas: [
        {
          nombreInsumo: "Etiqueta chica frente",
          cantidad: 100,
          netoCentavos: 10_000,
          envioCentavos: 0,
          costoUnitarioCentavos: 15_000,
          totalCentavos: 1_500_000,
          costoNetoCentavos: 15_000,
        },
      ],
      totalCentavos: 1_500_000,
      costoUnitarioCentavos: 15_000,
      incluyeIva: true,
    });
    expect(lineas[0].antes).toContain("(pagado $ 100,00 · para el costo $ 150,00)");
    expect(lineas[0].antes).not.toContain("+ IVA");
  });

  it("etiqueta sin precio para costo, cargada sin IVA: nota vieja intacta (sin cambios de comportamiento)", () => {
    const lineas = construirLineasCostoBotellaDetallada({
      ...baseInput,
      envase: null,
      etiquetas: [
        {
          nombreInsumo: "Etiqueta chica frente",
          cantidad: 100,
          netoCentavos: 10_000,
          envioCentavos: 0,
          costoUnitarioCentavos: 12_100,
          totalCentavos: 1_190_900,
          costoNetoCentavos: null,
        },
      ],
      totalCentavos: 1_190_900,
      costoUnitarioCentavos: 12_100,
      incluyeIva: false,
    });
    expect(lineas[0].antes).toContain("(sin IVA $ 100,00 + IVA 21%)");
  });
});

describe("notaEnvasePedido — desglose de 'Revisá el pedido' (previo a guardar)", () => {
  it("0053: cobrado sin IVA, sin redondeo — el PAGO nunca lleva la nota de IVA (antes de 0053, con 0048, sí)", () => {
    // Mismo ejemplo que calcularEnvasePedido: 100 × $1.250,70, sin redondeo.
    // El pago es cantidad × precio, sin IVA — la nota "+ IVA%" (0048) ahora
    // es del renglón de COSTO (`notaCostoEnvasePedido`), no de este.
    expect(
      notaEnvasePedido(
        { cantidad: 100, calculadoCentavos: 12_507_000, aPagarCentavos: 12_507_000 },
        125_070,
        21,
        true,
        true,
      ),
    ).toBe("100 × $ 1.250,70");
  });

  it("cobrado CON IVA (modo nuevo), sin redondeo: sin nota de IVA", () => {
    expect(
      notaEnvasePedido(
        { cantidad: 100, calculadoCentavos: 12_507_000, aPagarCentavos: 12_507_000 },
        125_070,
        21,
        true,
        false,
      ),
    ).toBe("100 × $ 1.250,70");
  });

  it("con 'Monto real' cargado (redondeo): calculado vs. lo que cobró el proveedor (125.070 → 125.100)", () => {
    expect(
      notaEnvasePedido(
        { cantidad: 100, calculadoCentavos: 12_507_000, aPagarCentavos: 12_510_000 },
        125_070,
        21,
        true,
        false,
      ),
    ).toBe("100 × $ 1.250,70 = $ 125.070,00 · Cobrado $ 125.100,00");
  });

  it("notaCostoEnvasePedido — cuenta del renglón de COSTO, independiente del pago", () => {
    // Mismo ejemplo: el precio para costo por default es el pagado
    // (125.070), + IVA 21% porque el proveedor lo cobra sin IVA — sin importar el
    // "Monto real" del pago (125.100).
    expect(
      notaCostoEnvasePedido({ cantidad: 100, totalCentavos: 15_133_470 }, 125_070, 21, true),
    ).toBe("100 × $ 1.250,70 + IVA 21% = $ 151.334,70");

    // Con un precio para costo distinto ($2.000) y el proveedor cobrando CON IVA:
    // sin la nota "+ IVA%".
    expect(
      notaCostoEnvasePedido({ cantidad: 100, totalCentavos: 20_000_000 }, 200_000, 21, false),
    ).toBe("100 × $ 2.000,00 = $ 200.000,00");
  });

  it("modo viejo (sin la clave, precios sin IVA): el precio se gross-ea por unidad, con la nota 'sin IVA + IVA%'", () => {
    expect(
      notaEnvasePedido(
        { cantidad: 200, calculadoCentavos: 36_300_000, aPagarCentavos: 36_300_000 },
        150_000,
        21,
        false,
        null,
      ),
    ).toBe("200 × $ 1.815,00 (sin IVA $ 1.500,00 + IVA 21%)");
  });

  it("modo viejo con precios_incluyen_iva: sin nota de IVA", () => {
    expect(
      notaEnvasePedido(
        { cantidad: 1, calculadoCentavos: 121_000, aPagarCentavos: 121_000 },
        121_000,
        21,
        true,
        null,
      ),
    ).toBe("1 × $ 1.210,00");
  });
});

describe("notaEtiquetaPedido — desglose de 'Revisá el pedido'", () => {
  it("sin IVA cargada: precio con IVA + nota 'sin IVA + IVA%' + envío", () => {
    expect(
      notaEtiquetaPedido({ precioUnitarioCentavos: 10_000, envioUnitarioCentavos: 500 }, 21, false),
    ).toBe("$ 126,00 (sin IVA $ 100,00 + IVA 21%), envío $ 5,00");
  });

  it("con IVA cargada: sin nota de IVA", () => {
    expect(notaEtiquetaPedido({ precioUnitarioCentavos: 12_576, envioUnitarioCentavos: 0 }, 21, true)).toBe(
      "$ 125,76",
    );
  });

  it("sin envío: no agrega ', envío $0,00'", () => {
    expect(notaEtiquetaPedido({ precioUnitarioCentavos: 1_000, envioUnitarioCentavos: 0 }, 21, true)).toBe(
      "$ 10,00",
    );
  });
});

describe("notaAceitePedido — desglose de 'Revisá el pedido'", () => {
  it("litros totales × precio por litro ya resuelto (ARS)", () => {
    expect(notaAceitePedido(0.75, 500_000)).toBe("0,75 L × $ 5.000,00/L");
  });
});

describe("notaTransportePctPedido — desglose de 'Revisá el pedido'", () => {
  it("sin redondeo: solo el % y la base", () => {
    expect(notaTransportePctPedido({ pct: 8, calculadoCentavos: 9_304_560, aPagarCentavos: 9_304_560 })).toBe(
      "8% sobre aceite + envasado + etiquetas",
    );
  });

  it("con 'Monto real' cargado: calculado vs. cobrado", () => {
    expect(notaTransportePctPedido({ pct: 8, calculadoCentavos: 9_304_560, aPagarCentavos: 9_300_000 })).toBe(
      "8% sobre aceite + envasado + etiquetas = $ 93.045,60 · cobrado $ 93.000,00",
    );
  });
});

describe("tituloGasto", () => {
  const ml = { unidad: "ml" as const };

  it("insumo comprado > concepto del pedido > categoría", () => {
    expect(
      tituloGasto(
        { categoriaNombre: "Insumos", conceptoPago: null, presentacionMl: null, insumoNombre: "Etiqueta grande frente" },
        ml,
      ),
    ).toEqual({ titulo: "Etiqueta grande frente", categoria: "Insumos" });
    expect(
      tituloGasto({ categoriaNombre: "Envases", conceptoPago: "envase", presentacionMl: 500, insumoNombre: null }, ml),
    ).toEqual({ titulo: "Envasado 500 ml", categoria: "Envases" });
    expect(
      tituloGasto(
        { categoriaNombre: "Transporte de pedidos", conceptoPago: "transporte", presentacionMl: null, insumoNombre: null },
        ml,
      ),
    ).toEqual({ titulo: "Transporte", categoria: "Transporte de pedidos" });
    expect(
      tituloGasto({ categoriaNombre: "Logística", conceptoPago: null, presentacionMl: null, insumoNombre: null }, ml),
    ).toEqual({ titulo: "Logística", categoria: null });
    expect(
      tituloGasto({ categoriaNombre: null, conceptoPago: null, presentacionMl: null, insumoNombre: null }, ml),
    ).toEqual({ titulo: "Sin categoría", categoria: null });
  });

  it("etiquetaConceptoPago / insumoDeMovimientos", () => {
    expect(etiquetaConceptoPago("envase", null, ml)).toBe("Envasado");
    expect(etiquetaConceptoPago("otro", null, ml)).toBe("Otros del pedido");
    expect(etiquetaConceptoPago(null, 500, ml)).toBeNull();
    expect(insumoDeMovimientos([{ insumos: null }, { insumos: { nombre: "Aceite" } }])).toBe("Aceite");
    expect(insumoDeMovimientos([])).toBeNull();
  });
});
