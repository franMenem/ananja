import { describe, expect, it } from "vitest";
import {
  agregarMovimientosPorLote,
  aplicarIva,
  calcularCobranzaLote,
  calcularConsumoAceiteEtiquetaLote,
  calcularCostoPromedioPonderado,
  calcularCostoUnitarioEtiqueta,
  calcularDesgloseLote,
  calcularPerdidasLote,
  calcularPoolSinAsignarPorProducto,
  calcularPreciosSugeridos,
  calcularSaldoLote,
  calcularStockPorLote,
  calcularTanqueAceite,
  calcularTransportePct,
  calcularVendidasNetas,
  compararCostoUnitario,
  construirLineasCostoBotella,
  construirLineasCostoBotellaDetallada,
  construirPreviewCostosLote,
  cuentaEnvaseCampo,
  etiquetaSaldoPendiente,
  etiquetasPorBotella,
  fusionarPrecioEtiquetaGrupo,
  litrosAceitePorItem,
  precioNetoEquivalenteEtiqueta,
  repartirPrecioEtiquetaGrupo,
  type CostoCompartidoInput,
  type CostoDirectoInput,
  type DesgloseTextoInput,
  type EtiquetaGrupoMiembro,
  type GastoLegacyInput,
  type ItemPesoInput,
  type LoteStockInput,
  type MovimientoConMotivo,
  type MovimientoParaCobranza,
  type MovimientoSinLoteInput,
  type MovimientoStockConLote,
  type PreviewEtiquetaInput,
  type RecetaEtiquetaConInsumo,
  type RecetaEtiquetaInput,
} from "@/lib/dominio/costos-lote";

/**
 * Espejo de supabase/migrations/0028_costos_por_lote.sql — costo real por
 * lote (aceite/etiqueta/envase/transporte/otros), precio sugerido a partir
 * de ese costo, saldo de un lote y stock por lote (explícito + fallback
 * FIFO). Valores verificados a mano contra la base local (ver reporte).
 */

describe("litrosAceitePorItem / etiquetasPorBotella", () => {
  it("litros = presentacion_ml / 1000 × cantidad", () => {
    expect(litrosAceitePorItem({ presentacionMl: 500, cantidad: 100 })).toBe(50);
    expect(litrosAceitePorItem({ presentacionMl: 250, cantidad: 50 })).toBe(12.5);
  });

  it("etiquetas por botella: suma recetas de insumos tipo 'etiqueta' (frente + retro)", () => {
    const recetas: RecetaEtiquetaInput[] = [
      { productoId: "p500", insumoTipo: "etiqueta", cantidad: 1 },
      { productoId: "p500", insumoTipo: "etiqueta", cantidad: 1 },
      { productoId: "p500", insumoTipo: "materia_prima", cantidad: 0.5 },
    ];
    expect(etiquetasPorBotella("p500", recetas)).toBe(2);
  });

  it("sin receta de etiqueta para ese producto: fallback 1 por botella", () => {
    expect(etiquetasPorBotella("sin-receta", [])).toBe(1);
  });
});

describe("calcularConsumoAceiteEtiquetaLote", () => {
  it("calcula aceite y etiqueta por ítem con los precios cargados", () => {
    const items = [{ productoId: "p500", presentacionMl: 500, cantidad: 100 }];
    const recetas: RecetaEtiquetaInput[] = [
      { productoId: "p500", insumoTipo: "etiqueta", cantidad: 1 },
      { productoId: "p500", insumoTipo: "etiqueta", cantidad: 1 },
    ];
    const [resultado] = calcularConsumoAceiteEtiquetaLote(items, recetas, 200_000, 5_000);
    expect(resultado.aceiteCantidadLitros).toBe(50);
    expect(resultado.aceiteCentavos).toBe(10_000_000);
    expect(resultado.etiquetaCantidadUnidades).toBe(200);
    expect(resultado.etiquetaCentavos).toBe(1_000_000);
  });

  it("sin precio cargado (null): ese concepto queda en 0, no error", () => {
    const items = [{ productoId: "p500", presentacionMl: 500, cantidad: 100 }];
    const [resultado] = calcularConsumoAceiteEtiquetaLote(items, [], null, null);
    expect(resultado.aceiteCentavos).toBe(0);
    expect(resultado.etiquetaCentavos).toBe(0);
  });
});

describe("calcularDesgloseLote", () => {
  it("una sola presentación: todo lo compartido es 100% suyo", () => {
    const items: ItemPesoInput[] = [{ productoId: "p500", presentacionMl: 500, cantidad: 100 }];
    const directos: CostoDirectoInput[] = [
      { productoId: "p500", concepto: "aceite", totalCentavos: 10_000_000 },
      { productoId: "p500", concepto: "etiqueta", totalCentavos: 1_000_000 },
      { productoId: "p500", concepto: "envase", totalCentavos: 1_500_000 },
    ];
    const compartidos: CostoCompartidoInput[] = [
      { concepto: "transporte", totalCentavos: 3_000_000 },
      { concepto: "otro", totalCentavos: 500_000 },
    ];
    const [resultado] = calcularDesgloseLote(items, directos, compartidos);
    expect(resultado.transporteCentavos).toBe(3_000_000);
    expect(resultado.otrosCentavos).toBe(500_000);
    expect(resultado.totalCentavos).toBe(16_000_000);
    expect(resultado.costoUnitarioCentavos).toBe(160_000);
    expect(resultado.tieneCostos).toBe(true);
  });

  it("dos presentaciones: transporte/otros compartidos se reparten por volumen (ml × cantidad)", () => {
    // Caso verificado contra la base local: 500ml×100 (peso 50.000),
    // 250ml×50 (peso 12.500) -> reparto 80%/20%.
    const items: ItemPesoInput[] = [
      { productoId: "p500", presentacionMl: 500, cantidad: 100 },
      { productoId: "p250", presentacionMl: 250, cantidad: 50 },
    ];
    const directos: CostoDirectoInput[] = [
      { productoId: "p500", concepto: "aceite", totalCentavos: 10_000_000 },
      { productoId: "p500", concepto: "etiqueta", totalCentavos: 1_000_000 },
      { productoId: "p500", concepto: "envase", totalCentavos: 1_500_000 },
      { productoId: "p250", concepto: "aceite", totalCentavos: 2_500_000 },
      { productoId: "p250", concepto: "etiqueta", totalCentavos: 500_000 },
      { productoId: "p250", concepto: "envase", totalCentavos: 500_000 },
    ];
    const compartidos: CostoCompartidoInput[] = [
      { concepto: "transporte", totalCentavos: 3_000_000 },
      { concepto: "otro", totalCentavos: 500_000 },
    ];
    const resultado = calcularDesgloseLote(items, directos, compartidos);
    const p500 = resultado.find((r) => r.productoId === "p500")!;
    const p250 = resultado.find((r) => r.productoId === "p250")!;

    expect(p500.transporteCentavos).toBe(2_400_000);
    expect(p250.transporteCentavos).toBe(600_000);
    expect(p500.otrosCentavos).toBe(400_000);
    expect(p250.otrosCentavos).toBe(100_000);
    expect(p500.totalCentavos).toBe(15_300_000);
    expect(p500.costoUnitarioCentavos).toBe(153_000);
    expect(p250.totalCentavos).toBe(4_200_000);
    expect(p250.costoUnitarioCentavos).toBe(84_000);
  });

  it("gastos legado (concepto_lote null) se pliegan en 'otros', directos o repartidos", () => {
    const items: ItemPesoInput[] = [
      { productoId: "p500", presentacionMl: 500, cantidad: 100 },
      { productoId: "p250", presentacionMl: 250, cantidad: 50 },
    ];
    const legacy: GastoLegacyInput[] = [
      { productoId: "p250", montoCentavos: 300_000 }, // directo, viejo "asignar gasto"
      { productoId: null, montoCentavos: 1_000_000 }, // compartido, flete viejo
    ];
    const resultado = calcularDesgloseLote(items, [], [], legacy);
    const p500 = resultado.find((r) => r.productoId === "p500")!;
    const p250 = resultado.find((r) => r.productoId === "p250")!;

    expect(p500.otrosCentavos).toBe(800_000); // su 80% del flete compartido
    expect(p250.otrosCentavos).toBe(300_000 + 200_000); // directo + su 20%
  });

  it("lote sin ningún costo cargado: total 0, tieneCostos false (no error)", () => {
    const items: ItemPesoInput[] = [{ productoId: "p500", presentacionMl: 500, cantidad: 40 }];
    const [resultado] = calcularDesgloseLote(items, [], []);
    expect(resultado.totalCentavos).toBe(0);
    expect(resultado.costoUnitarioCentavos).toBe(0);
    expect(resultado.tieneCostos).toBe(false);
  });
});

describe("calcularPreciosSugeridos", () => {
  it("costo Ananja = costo × (1 + ganancia%); mayorista = costo Ananja × (1 + mayorista%); minorista ENCADENADO = mayorista × (1 + minorista%)", () => {
    // Cuenta a mano (0029_costos_reales_lote.sql): costo 100.000, ganancia
    // 30%, mayorista 20%, minorista 60% -> costo Ananja 130.000, mayorista
    // sugerido 156.000, minorista sugerido (encadenado sobre el mayorista,
    // no sobre costo Ananja) 156.000 × 1,6 = 249.600.
    const resultado = calcularPreciosSugeridos(100_000, {
      gananciaPct: 30,
      mayoristaPct: 20,
      minoristaPct: 60,
    });
    expect(resultado.costoAnanjaCentavos).toBe(130_000);
    expect(resultado.mayoristaSugeridoCentavos).toBe(156_000);
    expect(resultado.minoristaSugeridoCentavos).toBe(249_600);
  });

  it("costo 0: los tres dan 0 (no error)", () => {
    const resultado = calcularPreciosSugeridos(0, {
      gananciaPct: 30,
      mayoristaPct: 20,
      minoristaPct: 60,
    });
    expect(resultado.costoAnanjaCentavos).toBe(0);
    expect(resultado.mayoristaSugeridoCentavos).toBe(0);
    expect(resultado.minoristaSugeridoCentavos).toBe(0);
  });

  // 0054_costo_ananja_redondeado.sql: sin redondeo cargado, el calculado
  // sigue siendo el efectivo — mismo comportamiento de siempre, y
  // `costoAnanjaCalculadoCentavos` reproduce el mismo número (siempre
  // presente, se cargue o no un redondeo).
  it("sin redondeo: costoAnanjaCentavos === costoAnanjaCalculadoCentavos, igual que antes de 0054", () => {
    const resultado = calcularPreciosSugeridos(100_000, {
      gananciaPct: 30,
      mayoristaPct: 20,
      minoristaPct: 60,
    });
    expect(resultado.costoAnanjaCalculadoCentavos).toBe(130_000);
    expect(resultado.costoAnanjaCentavos).toBe(resultado.costoAnanjaCalculadoCentavos);
  });

  it("con redondeo: costoAnanjaCentavos = el redondeado (coalesce), costoAnanjaCalculadoCentavos sigue siendo el calculado sin redondear", () => {
    const resultado = calcularPreciosSugeridos(
      100_000,
      { gananciaPct: 30, mayoristaPct: 20, minoristaPct: 60 },
      131_000,
    );
    expect(resultado.costoAnanjaCalculadoCentavos).toBe(130_000);
    expect(resultado.costoAnanjaCentavos).toBe(131_000);
  });

  it("los sugeridos mayorista/minorista se encadenan desde el REDONDEADO, no desde el calculado (decisión de Fran)", () => {
    const resultado = calcularPreciosSugeridos(
      100_000,
      { gananciaPct: 30, mayoristaPct: 20, minoristaPct: 60 },
      131_000,
    );
    // Sin redondeo: mayorista = 130.000 × 1,2 = 156.000. Con redondeo a
    // 131.000: mayorista = 131.000 × 1,2 = 157.200 (no 156.000).
    expect(resultado.mayoristaSugeridoCentavos).toBe(157_200);
    expect(resultado.minoristaSugeridoCentavos).toBe(Math.round(157_200 * 1.6));
  });

  it("redondeado null explícito: se comporta igual que no pasarlo (usa el calculado)", () => {
    const conNull = calcularPreciosSugeridos(
      100_000,
      { gananciaPct: 30, mayoristaPct: 20, minoristaPct: 60 },
      null,
    );
    const sinArgumento = calcularPreciosSugeridos(100_000, {
      gananciaPct: 30,
      mayoristaPct: 20,
      minoristaPct: 60,
    });
    expect(conNull).toEqual(sinArgumento);
  });
});

describe("calcularSaldoLote", () => {
  it("saldo = a pagar - pagado", () => {
    expect(calcularSaldoLote({ aPagarCentavos: 5_500_000, pagadoCentavos: 3_000_000 })).toBe(
      2_500_000,
    );
  });

  it("nunca da negativo (piso en 0)", () => {
    expect(calcularSaldoLote({ aPagarCentavos: 1_000, pagadoCentavos: 1_000 })).toBe(0);
    expect(calcularSaldoLote({ aPagarCentavos: 0, pagadoCentavos: 0 })).toBe(0);
  });
});

describe("agregarMovimientosPorLote", () => {
  it("suma varias filas del MISMO lote — dos ítems de un solo documento (30 + 20)", () => {
    // Caso de uso: una sola entrega/comprobante reparte la misma
    // presentación entre dos lotes en filas separadas, pero también puede
    // haber dos filas del MISMO lote si, además, otro documento vendió de
    // ese lote antes. Acá: dos filas de lote-a en el mismo documento
    // (permitido porque en la práctica cada una es un producto distinto,
    // pero la función no le pide nada al caller salvo la key lote+producto).
    const movimientos: MovimientoStockConLote[] = [
      { loteId: "lote-a", productoId: "p500", tipo: "egreso", cantidad: 30, esDevolucion: false },
      { loteId: "lote-a", productoId: "p500", tipo: "egreso", cantidad: 20, esDevolucion: false },
    ];
    const agregado = agregarMovimientosPorLote(movimientos);
    expect(agregado.get("lote-a:p500")).toEqual({
      egresosDirectos: 50,
      devolucionesDirectas: 0,
    });
  });

  it("distingue devoluciones (ingreso con entrega_id) de otros ingresos", () => {
    const movimientos: MovimientoStockConLote[] = [
      { loteId: "lote-a", productoId: "p500", tipo: "egreso", cantidad: 20, esDevolucion: false },
      { loteId: "lote-a", productoId: "p500", tipo: "ingreso", cantidad: 5, esDevolucion: true },
    ];
    const agregado = agregarMovimientosPorLote(movimientos);
    expect(agregado.get("lote-a:p500")).toEqual({
      egresosDirectos: 20,
      devolucionesDirectas: 5,
    });
  });

  it("acumula movimientos de MUCHOS documentos distintos sobre el mismo lote", () => {
    const movimientos: MovimientoStockConLote[] = Array.from({ length: 5 }, () => ({
      loteId: "lote-a",
      productoId: "p500",
      tipo: "egreso" as const,
      cantidad: 4,
      esDevolucion: false,
    }));
    expect(agregarMovimientosPorLote(movimientos).get("lote-a:p500")?.egresosDirectos).toBe(20);
  });
});

describe("calcularStockPorLote", () => {
  it("una entrega con DOS filas del mismo producto (30 del lote viejo + 20 del nuevo): cada lote pierde solo lo suyo", () => {
    const movimientosEntrega: MovimientoStockConLote[] = [
      { loteId: "lote-a", productoId: "p500", tipo: "egreso", cantidad: 30, esDevolucion: false },
      { loteId: "lote-b", productoId: "p500", tipo: "egreso", cantidad: 20, esDevolucion: false },
    ];
    const agregados = agregarMovimientosPorLote(movimientosEntrega);

    const lotes: LoteStockInput[] = [
      {
        loteId: "lote-a",
        productoId: "p500",
        fecha: "2026-08-01",
        createdAt: "2026-08-01T00:00:00Z",
        producido: 40,
        ...(agregados.get("lote-a:p500") ?? { egresosDirectos: 0, devolucionesDirectas: 0 }),
      },
      {
        loteId: "lote-b",
        productoId: "p500",
        fecha: "2026-09-01",
        createdAt: "2026-09-01T00:00:00Z",
        producido: 100,
        ...(agregados.get("lote-b:p500") ?? { egresosDirectos: 0, devolucionesDirectas: 0 }),
      },
    ];
    const resultado = calcularStockPorLote(lotes, new Map());
    expect(resultado.find((r) => r.loteId === "lote-a")!.quedan).toBe(10);
    expect(resultado.find((r) => r.loteId === "lote-b")!.quedan).toBe(80);
  });


  it("venta explícita de un lote: solo ese lote pierde stock", () => {
    const lotes: LoteStockInput[] = [
      {
        loteId: "lote-a",
        productoId: "p500",
        fecha: "2026-08-01",
        createdAt: "2026-08-01T00:00:00Z",
        producido: 40,
        egresosDirectos: 0,
        devolucionesDirectas: 0,
      },
      {
        loteId: "lote-b",
        productoId: "p500",
        fecha: "2026-09-01",
        createdAt: "2026-09-01T00:00:00Z",
        producido: 100,
        egresosDirectos: 30,
        devolucionesDirectas: 0,
      },
    ];
    const resultado = calcularStockPorLote(lotes, new Map());
    const a = resultado.find((r) => r.loteId === "lote-a")!;
    const b = resultado.find((r) => r.loteId === "lote-b")!;
    expect(a.quedan).toBe(40);
    expect(b.quedan).toBe(70);
    expect(b.salidasAsignadas).toBe(30);
  });

  it("fallback FIFO: egresos sin lote se atribuyen del más viejo al más nuevo, después de las salidas directas", () => {
    // Mismo escenario verificado contra la base local: lote-a (viejo,
    // producido 40, ya vendido 0 directo), lote-b (nuevo, producido 100,
    // ya vendidas 30 directas -> quedan 70 antes del fallback). Pool sin
    // asignar = 60: se lleva 40 de lote-a (lo agota) y 20 de lote-b.
    const lotes: LoteStockInput[] = [
      {
        loteId: "lote-a",
        productoId: "p500",
        fecha: "2026-08-01",
        createdAt: "2026-08-01T00:00:00Z",
        producido: 40,
        egresosDirectos: 0,
        devolucionesDirectas: 0,
      },
      {
        loteId: "lote-b",
        productoId: "p500",
        fecha: "2026-09-01",
        createdAt: "2026-09-01T00:00:00Z",
        producido: 100,
        egresosDirectos: 30,
        devolucionesDirectas: 0,
      },
    ];
    const pool = new Map([["p500", 60]]);
    const resultado = calcularStockPorLote(lotes, pool);
    const a = resultado.find((r) => r.loteId === "lote-a")!;
    const b = resultado.find((r) => r.loteId === "lote-b")!;

    expect(a.salidasSinAsignarAtribuidas).toBe(40);
    expect(a.quedan).toBe(0);
    expect(b.salidasSinAsignarAtribuidas).toBe(20);
    expect(b.quedan).toBe(50);

    const producidoTotal = lotes.reduce((acc, l) => acc + l.producido, 0);
    const vendidoTotal = 30 + 60;
    const quedanTotal = resultado.reduce((acc, r) => acc + r.quedan, 0);
    expect(quedanTotal).toBe(producidoTotal - vendidoTotal);
  });

  it("una devolución (ingreso con lote_id) neta las salidas asignadas de ese lote", () => {
    const lotes: LoteStockInput[] = [
      {
        loteId: "lote-a",
        productoId: "p500",
        fecha: "2026-08-01",
        createdAt: "2026-08-01T00:00:00Z",
        producido: 50,
        egresosDirectos: 20,
        devolucionesDirectas: 5,
      },
    ];
    const [resultado] = calcularStockPorLote(lotes, new Map());
    expect(resultado.salidasAsignadas).toBe(15);
    expect(resultado.quedan).toBe(35);
  });

  it("producto sin ningún lote: no devuelve filas (no error)", () => {
    expect(calcularStockPorLote([], new Map([["p500", 10]]))).toEqual([]);
  });
});

describe("construirLineasCostoBotella", () => {
  const BASE: DesgloseTextoInput = {
    aceite: null,
    etiqueta: null,
    envase: null,
    transporteCentavos: 0,
    otrosCentavos: 0,
    totalCentavos: 0,
    costoUnitarioCentavos: 0,
    cantidadBotellas: 100,
  };

  it("un concepto ausente (null o en 0) no genera línea", () => {
    const lineas = construirLineasCostoBotella({
      ...BASE,
      aceite: { cantidad: 50, costoUnitarioCentavos: 200_00, totalCentavos: 10_000_00 },
      totalCentavos: 10_000_00,
      costoUnitarioCentavos: 10_000,
    });
    // Solo la línea de aceite + la línea de total.
    expect(lineas).toHaveLength(2);
    expect(lineas[0].antes).toContain("Aceite 50 L");
    expect(lineas[0].resultado).toBe("$ 10.000,00");
  });

  it("todos los conceptos presentes arman una línea cada uno + el total", () => {
    const lineas = construirLineasCostoBotella({
      aceite: { cantidad: 50, costoUnitarioCentavos: 2_000, totalCentavos: 100_000 },
      etiqueta: { cantidad: 200, costoUnitarioCentavos: 50, totalCentavos: 10_000 },
      envase: { cantidad: 100, costoUnitarioCentavos: 80, totalCentavos: 8_000 },
      transporteCentavos: 3_000,
      otrosCentavos: 500,
      totalCentavos: 121_500,
      costoUnitarioCentavos: 1_215,
      cantidadBotellas: 100,
    });
    expect(lineas).toHaveLength(6);
    expect(lineas.at(-1)!.antes).toContain("Total $ 1.215,00 ÷ 100 botellas");
    expect(lineas.at(-1)!.resultado).toBe("$ 12,15 por botella");
  });

  it("sin ningún costo cargado: solo la línea de total, en 0", () => {
    const lineas = construirLineasCostoBotella(BASE);
    expect(lineas).toHaveLength(1);
    expect(lineas[0].resultado).toBe("$ 0,00 por botella");
  });
});

describe("construirLineasCostoBotellaDetallada", () => {
  it("dos insumos de etiqueta (frente + retro) arman DOS líneas separadas, cada una con su envío", () => {
    const lineas = construirLineasCostoBotellaDetallada({
      aceite: { cantidad: 0.25, costoUnitarioCentavos: 500_000, totalCentavos: 125_000 },
      etiquetas: [
        {
          nombreInsumo: "Etiqueta chica frente",
          cantidad: 1,
          netoCentavos: 10_000,
          envioCentavos: 500,
          costoUnitarioCentavos: 12_600,
          totalCentavos: 12_600,
        },
        {
          nombreInsumo: "Etiqueta chica retro",
          cantidad: 1,
          netoCentavos: 11_000,
          envioCentavos: 1_000,
          costoUnitarioCentavos: 14_310,
          totalCentavos: 14_310,
        },
      ],
      envase: { cantidad: 1, netoCentavos: 100_000, costoUnitarioCentavos: 121_000, totalCentavos: 121_000 },
      transporteCentavos: 19_680,
      transportePct: 8,
      otrosCentavos: 0,
      totalCentavos: 292_590,
      costoUnitarioCentavos: 292_590,
      cantidadBotellas: 1,
      ivaPct: 21,
      incluyeIva: false,
    });

    // aceite, etiqueta frente, etiqueta retro, envase, transporte, total.
    expect(lineas).toHaveLength(6);
    expect(lineas[1].antes).toContain("Etiqueta chica frente");
    expect(lineas[2].antes).toContain("Etiqueta chica retro");
  });

  it("cuenta completa: aceite, 1 etiqueta, envase, transporte % y el total", () => {
    const lineas = construirLineasCostoBotellaDetallada({
      aceite: { cantidad: 0.25, costoUnitarioCentavos: 500_000, totalCentavos: 125_000 },
      etiquetas: [
        {
          nombreInsumo: "Etiqueta chica frente",
          cantidad: 1,
          netoCentavos: 10_000,
          envioCentavos: 500,
          costoUnitarioCentavos: 12_600,
          totalCentavos: 12_600,
        },
      ],
      envase: { cantidad: 1, netoCentavos: 100_000, costoUnitarioCentavos: 121_000, totalCentavos: 121_000 },
      transporteCentavos: 19_680,
      transportePct: 8,
      otrosCentavos: 0,
      totalCentavos: 278_280,
      costoUnitarioCentavos: 278_280,
      cantidadBotellas: 1,
      ivaPct: 21,
      incluyeIva: false,
    });

    expect(lineas).toHaveLength(5); // aceite, etiqueta, envase, transporte, total
    expect(lineas[0].antes).toContain("Aceite 0,25 L");
    expect(lineas[1].antes).toBe(
      "Etiqueta chica frente 1 × $ 126,00 (sin IVA $ 100,00 + IVA 21%), envío $ 5,00 = ",
    );
    expect(lineas[2].antes).toContain("(sin IVA $ 1.000,00 + IVA 21%)");
    expect(lineas[3].antes).toBe("Transporte (8% sobre aceite + envasado + etiquetas) = ");
    expect(lineas.at(-1)!.antes).toContain("Costo de producción");
  });

  it("aceite con dolarCentavos/usdPorLitroCentavos (0030, USD×dólar): la línea muestra la cuenta completa en vez del ARS/L ya resuelto", () => {
    const lineas = construirLineasCostoBotellaDetallada({
      aceite: {
        cantidad: 0.25,
        costoUnitarioCentavos: 500_000,
        totalCentavos: 125_000,
        dolarCentavos: 100_000,
        usdPorLitroCentavos: 500,
      },
      etiquetas: [],
      envase: null,
      transporteCentavos: 0,
      transportePct: null,
      otrosCentavos: 0,
      totalCentavos: 125_000,
      costoUnitarioCentavos: 125_000,
      cantidadBotellas: 1,
      ivaPct: 21,
      incluyeIva: false,
    });
    expect(lineas[0].antes).toBe("Aceite 0,25 L × USD 5,00 × $ 1.000,00 = ");
    expect(lineas[0].resultado).toBe("$ 1.250,00");
  });

  it("aceite SIN dolarCentavos/usdPorLitroCentavos (override ARS explícito o tanque): fórmula de siempre, ARS/L", () => {
    const lineas = construirLineasCostoBotellaDetallada({
      aceite: { cantidad: 0.25, costoUnitarioCentavos: 500_000, totalCentavos: 125_000 },
      etiquetas: [],
      envase: null,
      transporteCentavos: 0,
      transportePct: null,
      otrosCentavos: 0,
      totalCentavos: 125_000,
      costoUnitarioCentavos: 125_000,
      cantidadBotellas: 1,
      ivaPct: 21,
      incluyeIva: false,
    });
    expect(lineas[0].antes).toBe("Aceite 0,25 L × $ 5.000,00/L = ");
  });

  it("incluyeIva = true: sin la nota 'sin IVA + IVA%'", () => {
    const lineas = construirLineasCostoBotellaDetallada({
      aceite: null,
      etiquetas: [],
      envase: { cantidad: 1, netoCentavos: 121_000, costoUnitarioCentavos: 121_000, totalCentavos: 121_000 },
      transporteCentavos: 0,
      transportePct: null,
      otrosCentavos: 0,
      totalCentavos: 121_000,
      costoUnitarioCentavos: 121_000,
      cantidadBotellas: 1,
      ivaPct: 21,
      incluyeIva: true,
    });
    expect(lineas[0].antes).not.toContain("sin IVA");
  });

  it("transporte compartido (modo fijo, transportePct null): 'su parte'", () => {
    const lineas = construirLineasCostoBotellaDetallada({
      aceite: null,
      etiquetas: [],
      envase: null,
      transporteCentavos: 30_000,
      transportePct: null,
      otrosCentavos: 0,
      totalCentavos: 30_000,
      costoUnitarioCentavos: 30_000,
      cantidadBotellas: 1,
      ivaPct: 21,
      incluyeIva: false,
    });
    expect(lineas[0].antes).toBe("Transporte (su parte) = ");
  });

  it("sin ningún costo cargado: solo la línea de total, en 0", () => {
    const lineas = construirLineasCostoBotellaDetallada({
      aceite: null,
      etiquetas: [],
      envase: null,
      transporteCentavos: 0,
      transportePct: null,
      otrosCentavos: 0,
      totalCentavos: 0,
      costoUnitarioCentavos: 0,
      cantidadBotellas: 100,
      ivaPct: 21,
      incluyeIva: false,
    });
    expect(lineas).toHaveLength(1);
    expect(lineas[0].resultado).toBe("$ 0,00 por botella");
  });
});

describe("compararCostoUnitario", () => {
  it("costo más alto que el anterior: pctCambio positivo, subio true", () => {
    const resultado = compararCostoUnitario(216_00, 200_00);
    expect(resultado).toEqual({ pctCambio: 8, subio: true });
  });

  it("costo más bajo que el anterior: pctCambio negativo, subio false", () => {
    const resultado = compararCostoUnitario(180_00, 200_00);
    expect(resultado).toEqual({ pctCambio: -10, subio: false });
  });

  it("sin lote anterior (null/undefined): no compara", () => {
    expect(compararCostoUnitario(200_00, null)).toBeNull();
    expect(compararCostoUnitario(200_00, undefined)).toBeNull();
  });

  it("anterior o actual en 0: no compara", () => {
    expect(compararCostoUnitario(200_00, 0)).toBeNull();
    expect(compararCostoUnitario(0, 200_00)).toBeNull();
  });

  it("sin cambio real tras redondear: null", () => {
    expect(compararCostoUnitario(1_000, 999)).toBeNull();
  });
});

describe("etiquetaSaldoPendiente", () => {
  it("saldo positivo: texto con el monto", () => {
    expect(etiquetaSaldoPendiente(150_000)).toBe("Pago pendiente $ 1.500,00");
  });

  it("saldo en 0 o negativo: null (lote saldado)", () => {
    expect(etiquetaSaldoPendiente(0)).toBeNull();
    expect(etiquetaSaldoPendiente(-100)).toBeNull();
  });
});

describe("calcularPoolSinAsignarPorProducto", () => {
  it("BLOCKER (review de 0028): entrega 5 sin lote + devolución 5 sin lote → pool vuelve a 0, no queda en 5", () => {
    // Antes del fix, pool_sin_asignar solo sumaba egresos y nunca restaba
    // la devolución — v_stock_actual volvía a la base pero Σquedan se
    // quedaba 5 corto. Repro verificado también contra la base local.
    const movimientos: MovimientoSinLoteInput[] = [
      { productoId: "p500", tipo: "egreso", cantidad: 5, esDevolucion: false },
      { productoId: "p500", tipo: "ingreso", cantidad: 5, esDevolucion: true },
    ];
    expect(calcularPoolSinAsignarPorProducto(movimientos).get("p500") ?? 0).toBe(0);
  });

  it("una venta real sin lote SÍ queda en el pool (no es una devolución)", () => {
    const movimientos: MovimientoSinLoteInput[] = [
      { productoId: "p500", tipo: "egreso", cantidad: 5, esDevolucion: false },
      { productoId: "p500", tipo: "ingreso", cantidad: 5, esDevolucion: true },
      { productoId: "p500", tipo: "egreso", cantidad: 10, esDevolucion: false },
    ];
    expect(calcularPoolSinAsignarPorProducto(movimientos).get("p500")).toBe(10);
  });

  it("un ingreso sin lote que NO es devolución (ajuste manual) no resta del pool", () => {
    const movimientos: MovimientoSinLoteInput[] = [
      { productoId: "p500", tipo: "egreso", cantidad: 10, esDevolucion: false },
      { productoId: "p500", tipo: "ingreso", cantidad: 3, esDevolucion: false },
    ];
    expect(calcularPoolSinAsignarPorProducto(movimientos).get("p500")).toBe(10);
  });

  it("nunca da negativo (piso en 0) aunque las devoluciones superen los egresos sin lote", () => {
    const movimientos: MovimientoSinLoteInput[] = [
      { productoId: "p500", tipo: "egreso", cantidad: 3, esDevolucion: false },
      { productoId: "p500", tipo: "ingreso", cantidad: 5, esDevolucion: true },
    ];
    expect(calcularPoolSinAsignarPorProducto(movimientos).get("p500")).toBe(0);
  });
});

describe("Σquedan == stock (invariante end-to-end del blocker)", () => {
  it("entrega+devolución sin lote no perturban Σquedan; una venta real sin lote sí la baja", () => {
    const lotes: LoteStockInput[] = [
      {
        loteId: "lote-unico",
        productoId: "p500",
        fecha: "2026-08-01",
        createdAt: "2026-08-01T00:00:00Z",
        producido: 60,
        egresosDirectos: 0,
        devolucionesDirectas: 0,
      },
    ];

    // Ciclo entrega-sin-lote (5) + devolución-sin-lote (5): stock real
    // vuelve a 60, Σquedan tiene que hacerlo también.
    const poolTrasCiclo = calcularPoolSinAsignarPorProducto([
      { productoId: "p500", tipo: "egreso", cantidad: 5, esDevolucion: false },
      { productoId: "p500", tipo: "ingreso", cantidad: 5, esDevolucion: true },
    ]);
    const stockSimuladoTrasCiclo = 60; // v_stock_actual: 60 - 5 (entrega) + 5 (devolución)
    const quedanTrasCiclo = calcularStockPorLote(lotes, poolTrasCiclo).reduce(
      (acc, r) => acc + r.quedan,
      0,
    );
    expect(quedanTrasCiclo).toBe(stockSimuladoTrasCiclo);

    // Ahora una venta real de 10 sin elegir lote: stock y Σquedan bajan igual.
    const poolTrasVenta = calcularPoolSinAsignarPorProducto([
      { productoId: "p500", tipo: "egreso", cantidad: 5, esDevolucion: false },
      { productoId: "p500", tipo: "ingreso", cantidad: 5, esDevolucion: true },
      { productoId: "p500", tipo: "egreso", cantidad: 10, esDevolucion: false },
    ]);
    const stockSimuladoTrasVenta = 50;
    const quedanTrasVenta = calcularStockPorLote(lotes, poolTrasVenta).reduce(
      (acc, r) => acc + r.quedan,
      0,
    );
    expect(quedanTrasVenta).toBe(stockSimuladoTrasVenta);
  });
});

/**
 * Espejo de supabase/migrations/0029_costos_reales_lote.sql — IVA no
 * recuperable (monotributo), transporte %, etiquetas frente/reverso,
 * tanque de aceite, pérdidas y cobranza esperada. Valores verificados a
 * mano contra la base local (ver reporte).
 */

describe("aplicarIva", () => {
  it("neto -> grossed-up por iva_pct", () => {
    expect(aplicarIva(100_000, 21, false)).toBe(121_000);
    expect(aplicarIva(120_000, 21, false)).toBe(145_200);
  });

  it("incluyeIva = true: se usa tal cual, sin volver a aplicar IVA", () => {
    expect(aplicarIva(121_000, 21, true)).toBe(121_000);
  });
});

describe("calcularTransportePct", () => {
  it("% sobre aceite + envase (con IVA) de una presentación", () => {
    // 250 ml: aceite 125.000 + envase con IVA 121.000 = 246.000; 8% = 19.680.
    expect(calcularTransportePct(125_000 + 121_000, 8)).toBe(19_680);
    // 500 ml: 250.000 + 145.200 = 395.200; 8% = 31.616.
    expect(calcularTransportePct(250_000 + 145_200, 8)).toBe(31_616);
  });

  it("base 0 (sin aceite ni envase todavía): 0, no error", () => {
    expect(calcularTransportePct(0, 8)).toBe(0);
  });
});

describe("calcularCostoUnitarioEtiqueta", () => {
  it("precio grossed-up por IVA + envío SIN IVA", () => {
    // Etiqueta chica frente: neto 100,00 -> con IVA 121,00 + envío 5,00 =
    // 126,00.
    expect(
      calcularCostoUnitarioEtiqueta(
        { precioUnitarioCentavos: 10_000, envioUnitarioCentavos: 500 },
        21,
        false,
      ),
    ).toBe(12_600);
  });

  it("incluyeIva = true: el precio no se vuelve a grossear, el envío sigue sumándose aparte", () => {
    expect(
      calcularCostoUnitarioEtiqueta(
        { precioUnitarioCentavos: 12_100, envioUnitarioCentavos: 500 },
        21,
        true,
      ),
    ).toBe(12_600);
  });

  it("0053_pago_vs_costo_insumo.sql: sin precioCostoUnitarioCentavos, usa el pagado (sin cambios)", () => {
    expect(
      calcularCostoUnitarioEtiqueta(
        { precioUnitarioCentavos: 10_000, envioUnitarioCentavos: 500, precioCostoUnitarioCentavos: null },
        21,
        false,
      ),
    ).toBe(12_600);
  });

  it("0053: con precioCostoUnitarioCentavos distinto, el costo lo usa a ÉL, no al pagado — el envío no tiene versión 'para costo'", () => {
    // Pagado $100,00 (ya comprado/referencia), pero el costo se quiere
    // calcular con $150 — envío $5,00 sigue siendo el mismo, sin IVA.
    expect(
      calcularCostoUnitarioEtiqueta(
        { precioUnitarioCentavos: 10_000, envioUnitarioCentavos: 500, precioCostoUnitarioCentavos: 15_000 },
        21,
        false,
      ),
    ).toBe(Math.round((15_000 * 121) / 100) + 500);
  });
});

describe("calcularCostoPromedioPonderado / calcularTanqueAceite", () => {
  it("promedio ponderado = Σ monto / Σ cantidad de las compras", () => {
    // Dos compras (1000 L × $5.000.000 y 500 L × $2.600.000) ->
    // (5.000.000+2.600.000)/1500 = 5.066,67 -> 5.067.
    expect(
      calcularCostoPromedioPonderado([
        { cantidad: 1000, montoCentavos: 5_000_000 },
        { cantidad: 500, montoCentavos: 2_600_000 },
      ]),
    ).toBe(5_067);
  });

  it("sin compras: null (no hay costo basis)", () => {
    expect(calcularCostoPromedioPonderado([])).toBeNull();
  });

  it("calcularTanqueAceite: litros restantes usa TODOS los ingresos, no solo compras", () => {
    const tanque = calcularTanqueAceite({
      compras: [
        { cantidad: 1000, montoCentavos: 5_000_000 },
        { cantidad: 500, montoCentavos: 2_600_000 },
      ],
      litrosIngresados: 1500,
      litrosConsumidos: 3.25,
    });
    expect(tanque.litrosComprados).toBe(1500);
    expect(tanque.litrosConsumidos).toBe(3.25);
    expect(tanque.litrosRestantes).toBe(1496.75);
    expect(tanque.costoPromedioCentavosPorLitro).toBe(5_067);
    expect(tanque.valorRestanteCentavos).toBe(7_583_533);
  });


  it("sin compras ni última compra: todo en null, no falla", () => {
    const tanque = calcularTanqueAceite({
      compras: [],
      litrosIngresados: 0,
      litrosConsumidos: 0,
    });
    expect(tanque.costoPromedioCentavosPorLitro).toBeNull();
    expect(tanque.valorRestanteCentavos).toBeNull();
  });
});

describe("calcularPerdidasLote", () => {
  it("agrupa por motivo (degustación/rotura/regalo/ajuste/otro), excluye venta y null", () => {
    const movimientos: MovimientoConMotivo[] = [
      { motivo: "venta", cantidad: 60 },
      { motivo: "degustacion", cantidad: 5 },
      { motivo: "rotura", cantidad: 3 },
      { motivo: null, cantidad: 2 }, // legado: no se puede llamar "pérdida"
    ];
    const perdidas = calcularPerdidasLote(movimientos, 300_000);
    expect(perdidas).toEqual([
      { motivo: "degustacion", unidades: 5, costoTotalCentavos: 1_500_000 },
      { motivo: "rotura", unidades: 3, costoTotalCentavos: 900_000 },
    ]);
  });

  it("sin pérdidas: lista vacía", () => {
    expect(calcularPerdidasLote([{ motivo: "venta", cantidad: 10 }], 1000)).toEqual([]);
  });
});

describe("calcularCobranzaLote", () => {
  it("esperado total = costo Ananja × (producidas - perdidas); esperado por vendidas = costo Ananja × vendidas", () => {
    // 100 producidas, 60 vendidas, 8 perdidas, costo Ananja 400.000 ->
    // esperado total 400.000 × 92 = 36.800.000; esperado por vendidas
    // 400.000 × 60 = 24.000.000.
    const resultado = calcularCobranzaLote({
      producidas: 100,
      vendidas: 60,
      perdidas: 8,
      costoAnanjaCentavos: 400_000,
    });
    expect(resultado.esperadoTotalCentavos).toBe(36_800_000);
    expect(resultado.esperadoPorVendidasCentavos).toBe(24_000_000);
  });
});

describe("calcularVendidasNetas", () => {
  it("egresos motivo 'venta' netos de sus devoluciones", () => {
    const movimientos: MovimientoParaCobranza[] = [
      { productoId: "p250", tipo: "egreso", cantidad: 30, esVenta: true, esDevolucion: false },
      { productoId: "p250", tipo: "ingreso", cantidad: 10, esVenta: false, esDevolucion: true },
    ];
    expect(calcularVendidasNetas(movimientos)).toBe(20);
  });

  it("nunca negativo: una devolución que supera lo vendido no cruza a negativo", () => {
    const movimientos: MovimientoParaCobranza[] = [
      { productoId: "p250", tipo: "egreso", cantidad: 5, esVenta: true, esDevolucion: false },
      { productoId: "p250", tipo: "ingreso", cantidad: 8, esVenta: false, esDevolucion: true },
    ];
    expect(calcularVendidasNetas(movimientos)).toBe(0);
  });

  it("un ingreso que NO es devolución (ajuste manual) no resta", () => {
    const movimientos: MovimientoParaCobranza[] = [
      { productoId: "p250", tipo: "egreso", cantidad: 30, esVenta: true, esDevolucion: false },
      { productoId: "p250", tipo: "ingreso", cantidad: 10, esVenta: false, esDevolucion: false },
    ];
    expect(calcularVendidasNetas(movimientos)).toBe(30);
  });

  it("un egreso que NO es venta (degustación/rotura/etc.) no cuenta como vendido", () => {
    expect(
      calcularVendidasNetas([
        { productoId: "p250", tipo: "egreso", cantidad: 5, esVenta: false, esDevolucion: false },
      ]),
    ).toBe(0);
  });
});

/**
 * Invariante de v_cobranza_lote: producidas − vendidas − perdidas =
 * en_depósito. BLOCKER corregido en review de 0029 (vendidas no neteaba
 * devoluciones) — se verifica acá combinando `calcularVendidasNetas`,
 * `calcularPerdidasLote` y `calcularStockPorLote`/
 * `calcularPoolSinAsignarPorProducto` (en_depósito = quedan), igual que se
 * verificó contra la base local real.
 */
describe("invariante producidas - vendidas - perdidas = en_depósito (v_cobranza_lote)", () => {
  it("escenario entrega -> devolución parcial: 100 producidas, entrega 30, devolución 10", () => {
    const producidas = 100;
    const lote: LoteStockInput = {
      loteId: "lote1",
      productoId: "p250",
      fecha: "2026-09-01",
      createdAt: "2026-09-01T00:00:00Z",
      producido: producidas,
      // La entrega (egreso 30) y su devolución (ingreso 10, esDevolucion)
      // son movimientos DIRECTOS de este lote — mismo criterio que
      // v_stock_por_lote.
      egresosDirectos: 30,
      devolucionesDirectas: 10,
    };
    const enDeposito = calcularStockPorLote([lote], new Map()).reduce(
      (acc, r) => acc + r.quedan,
      0,
    );

    const vendidas = calcularVendidasNetas([
      { productoId: "p250", tipo: "egreso", cantidad: 30, esVenta: true, esDevolucion: false },
      { productoId: "p250", tipo: "ingreso", cantidad: 10, esVenta: false, esDevolucion: true },
    ]);
    const perdidas = calcularPerdidasLote([], 0).reduce((acc, p) => acc + p.unidades, 0);

    expect(vendidas).toBe(20);
    expect(enDeposito).toBe(80);
    expect(producidas - vendidas - perdidas).toBe(enDeposito);
  });

  it("escenario comprobante editado: venta de 15 editada a 5 unidades (delete+insert, sin fila fantasma)", () => {
    // El estado FINAL tras editar es lo único que existe en movimientos_stock
    // (actualizar_comprobante borra la fila vieja e inserta la nueva) — acá
    // se parte directo del estado final: entrega 30 - devolución 10 (del
    // escenario anterior) + venta directa de 5 (ya editada, no 15).
    const producidas = 100;
    const lote: LoteStockInput = {
      loteId: "lote1",
      productoId: "p250",
      fecha: "2026-09-01",
      createdAt: "2026-09-01T00:00:00Z",
      producido: producidas,
      egresosDirectos: 30 + 5,
      devolucionesDirectas: 10,
    };
    const enDeposito = calcularStockPorLote([lote], new Map()).reduce(
      (acc, r) => acc + r.quedan,
      0,
    );

    const vendidas = calcularVendidasNetas([
      { productoId: "p250", tipo: "egreso", cantidad: 30, esVenta: true, esDevolucion: false },
      { productoId: "p250", tipo: "ingreso", cantidad: 10, esVenta: false, esDevolucion: true },
      { productoId: "p250", tipo: "egreso", cantidad: 5, esVenta: true, esDevolucion: false },
    ]);
    const perdidas = 0;

    expect(vendidas).toBe(25);
    expect(enDeposito).toBe(75);
    expect(producidas - vendidas - perdidas).toBe(enDeposito);
  });

  it("con pérdidas: 100 producidas, 60 vendidas, 5 degustación, 3 rotura", () => {
    const producidas = 100;
    const lote: LoteStockInput = {
      loteId: "lote1",
      productoId: "p250",
      fecha: "2026-09-01",
      createdAt: "2026-09-01T00:00:00Z",
      producido: producidas,
      // Las salidas por degustación/rotura también son egresos CON lote_id
      // (cuentan para v_stock_por_lote igual que una venta), aunque su
      // motivo no sea 'venta' — solo importan para "vendidas" cuando
      // esVenta es true.
      egresosDirectos: 60 + 5 + 3,
      devolucionesDirectas: 0,
    };
    const enDeposito = calcularStockPorLote([lote], new Map()).reduce(
      (acc, r) => acc + r.quedan,
      0,
    );

    const vendidas = calcularVendidasNetas([
      { productoId: "p250", tipo: "egreso", cantidad: 60, esVenta: true, esDevolucion: false },
    ]);
    const perdidas = calcularPerdidasLote(
      [
        { motivo: "degustacion", cantidad: 5 },
        { motivo: "rotura", cantidad: 3 },
      ],
      0,
    ).reduce((acc, p) => acc + p.unidades, 0);

    expect(vendidas).toBe(60);
    expect(perdidas).toBe(8);
    expect(enDeposito).toBe(32);
    expect(producidas - vendidas - perdidas).toBe(enDeposito);
  });
});

/**
 * Ejemplo ilustrativo de costo de botella (valores inventados, IVA 21%).
 * Insumos: aceite $1.250 (250 ml) / $2.500 (500 ml); envase sin IVA
 * 250=$1.000/500=$1.200; etiqueta frente neto 250=$100/500=$150 + envío
 * $5; etiqueta reverso neto 250=$110/500=$160 + envío $10; transporte 8%
 * sobre aceite+envase con IVA; márgenes 30/15/40 encadenados.
 *
 * Los esperados salen de hacer la cuenta a mano, no de correr el código:
 * cada línea (aceite, envase con IVA, transporte, etiqueta total) se
 * calcula por separado y después se suman y se encadenan los márgenes.
 */
describe("ejemplo de costo de botella (0029_costos_reales_lote.sql)", () => {
  const iva = 21;

  function costoBotella(presentacionMl: 250 | 500) {
    const aceiteCentavos = presentacionMl === 250 ? 125_000 : 250_000;
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

  it("250 ml: envase, transporte, etiqueta y costo total", () => {
    const { aceiteCentavos, envaseCentavos, transporteCentavos, etiquetaCentavos } = costoBotella(250);
    expect(aceiteCentavos).toBe(125_000); // $1.250,00
    expect(envaseCentavos).toBe(121_000); // $1.210,00 (1.000 + 21%)
    expect(transporteCentavos).toBe(19_680); // $196,80 = 8% de 2.460
    expect(etiquetaCentavos).toBe(26_910); // $269,10 = 126,00 + 143,10

    const totalCentavos = aceiteCentavos + envaseCentavos + transporteCentavos + etiquetaCentavos;
    expect(totalCentavos).toBe(292_590); // $2.925,90

    const precios = calcularPreciosSugeridos(totalCentavos, {
      gananciaPct: 30,
      mayoristaPct: 15,
      minoristaPct: 40,
    });
    expect(precios.costoAnanjaCentavos).toBe(380_367); // 292.590 × 1,30
    expect(precios.mayoristaSugeridoCentavos).toBe(437_422); // × 1,15
    expect(precios.minoristaSugeridoCentavos).toBe(612_391); // × 1,40
  });

  it("500 ml: envase, transporte, etiqueta y costo total", () => {
    const { aceiteCentavos, envaseCentavos, transporteCentavos, etiquetaCentavos } = costoBotella(500);
    expect(aceiteCentavos).toBe(250_000); // $2.500,00
    expect(envaseCentavos).toBe(145_200); // $1.452,00 (1.200 + 21%)
    expect(transporteCentavos).toBe(31_616); // $316,16 = 8% de 3.952
    expect(etiquetaCentavos).toBe(39_010); // $390,10 = 186,50 + 203,60

    const totalCentavos = aceiteCentavos + envaseCentavos + transporteCentavos + etiquetaCentavos;
    expect(totalCentavos).toBe(465_826); // $4.658,26

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

/**
 * `construirPreviewCostosLote` — el mismo builder que usa
 * `CostosLoteCampos` para la vista previa en vivo de "Costos del pedido",
 * con los datos ilustrativos del describe de arriba: 250 ml y 500 ml en el
 * mismo pedido, cada uno con sus 2 insumos de etiqueta propios (chica frente/retro, grande frente/retro — ver
 * `supabase/migrations/0017_insumos.sql` § seed), transporte 8% y márgenes
 * 30/15/40. Un pedido de 1 botella de cada presentación para que
 * "costo unitario" sea directamente comparable línea a línea con ese ejemplo.
 */
describe("construirPreviewCostosLote", () => {
  const items: ItemPesoInput[] = [
    { productoId: "p250", presentacionMl: 250, cantidad: 1 },
    { productoId: "p500", presentacionMl: 500, cantidad: 1 },
  ];

  const recetasEtiqueta: RecetaEtiquetaConInsumo[] = [
    { productoId: "p250", insumoId: "chica-frente", cantidad: 1 },
    { productoId: "p250", insumoId: "chica-retro", cantidad: 1 },
    { productoId: "p500", insumoId: "grande-frente", cantidad: 1 },
    { productoId: "p500", insumoId: "grande-retro", cantidad: 1 },
  ];

  const etiquetas: PreviewEtiquetaInput[] = [
    { insumoId: "chica-frente", precioUnitarioCentavos: 10_000, envioUnitarioCentavos: 500 },
    { insumoId: "chica-retro", precioUnitarioCentavos: 11_000, envioUnitarioCentavos: 1_000 },
    { insumoId: "grande-frente", precioUnitarioCentavos: 15_000, envioUnitarioCentavos: 500 },
    { insumoId: "grande-retro", precioUnitarioCentavos: 16_000, envioUnitarioCentavos: 1_000 },
  ];

  const envasePorProducto = new Map([
    ["p250", 100_000],
    ["p500", 120_000],
  ]);

  it("ejemplo con transporte % sobre aceite + envasado + etiquetas (0039), 250 ml y 500 ml a la vez", () => {
    const resultado = construirPreviewCostosLote({
      items,
      recetasEtiqueta,
      precioLitroAceiteCentavos: 500_000,
      etiquetas,
      envasePorProducto,
      transporte: { modo: "porcentaje", porcentajeSobreAceiteMasEnvase: 8 },
      otrosCentavos: 0,
      ivaPct: 21,
      incluyeIva: false,
      pcts: { gananciaPct: 30, mayoristaPct: 15, minoristaPct: 40 },
    });

    const p250 = resultado.find((r) => r.productoId === "p250")!;
    const p500 = resultado.find((r) => r.productoId === "p500")!;

    // Mismos insumos que el describe de arriba, ahora ensamblados por el
    // builder completo en vez de a mano. Acá el transporte (0039) es 8% de
    // aceite + envase + etiquetas: 8% de 272.910 = 21.832,8 -> 21.833
    // (250 ml); 8% de 434.210 = 34.736,8 -> 34.737 (500 ml).
    expect(p250.aceiteCentavos).toBe(125_000);
    expect(p250.envaseCentavos).toBe(121_000);
    expect(p250.transporteCentavos).toBe(21_833);
    expect(p250.etiquetaCentavos).toBe(26_910);
    expect(p250.totalCentavos).toBe(294_743);
    expect(p250.costoUnitarioCentavos).toBe(294_743);
    expect(p250.precios.costoAnanjaCentavos).toBe(383_166);
    expect(p250.precios.mayoristaSugeridoCentavos).toBe(440_641);
    expect(p250.precios.minoristaSugeridoCentavos).toBe(616_897);

    expect(p500.aceiteCentavos).toBe(250_000);
    expect(p500.envaseCentavos).toBe(145_200);
    expect(p500.transporteCentavos).toBe(34_737);
    expect(p500.etiquetaCentavos).toBe(39_010);
    expect(p500.totalCentavos).toBe(468_947);
    expect(p500.precios.costoAnanjaCentavos).toBe(609_631);
    expect(p500.precios.mayoristaSugeridoCentavos).toBe(701_076);
    expect(p500.precios.minoristaSugeridoCentavos).toBe(981_506);
  });

  it("sin ningún precio cargado: todo en 0, no error", () => {
    const resultado = construirPreviewCostosLote({
      items,
      recetasEtiqueta,
      precioLitroAceiteCentavos: null,
      etiquetas: [],
      envasePorProducto: new Map(),
      transporte: { modo: "porcentaje", porcentajeSobreAceiteMasEnvase: 8 },
      otrosCentavos: 0,
      ivaPct: 21,
      incluyeIva: false,
      pcts: { gananciaPct: 30, mayoristaPct: 15, minoristaPct: 40 },
    });
    for (const r of resultado) {
      expect(r.totalCentavos).toBe(0);
      expect(r.costoUnitarioCentavos).toBe(0);
    }
  });

  it("transporte en modo fijo: se reparte por volumen, no por presentación", () => {
    const resultado = construirPreviewCostosLote({
      items,
      recetasEtiqueta,
      precioLitroAceiteCentavos: 500_000,
      etiquetas,
      envasePorProducto,
      transporte: { modo: "fijo", totalCentavos: 100_000 },
      otrosCentavos: 0,
      ivaPct: 21,
      incluyeIva: false,
      pcts: { gananciaPct: 30, mayoristaPct: 15, minoristaPct: 40 },
    });
    // Peso: 250×1=250, 500×1=500 -> reparto 1/3 · 2/3.
    const p250 = resultado.find((r) => r.productoId === "p250")!;
    const p500 = resultado.find((r) => r.productoId === "p500")!;
    expect(p250.transporteCentavos).toBe(33_333);
    expect(p500.transporteCentavos).toBe(66_667);
  });
});

/**
 * Build "costos del pedido simple" (2026-09-15): un solo campo para
 * frente + reverso de etiqueta (sin envío aparte) que reproduce, con los
 * datos de hoy, el mismo costo total que las dos filas separadas — y la
 * cuenta explícita junto al campo de envasado.
 */
describe("precioNetoEquivalenteEtiqueta", () => {
  it("con IVA incluido, el envío se suma directo (ninguno de los dos lleva IVA de por sí)", () => {
    expect(
      precioNetoEquivalenteEtiqueta(
        { precioUnitarioCentavos: 1_000, envioUnitarioCentavos: 200 },
        21,
        true,
      ),
    ).toBe(1_200);
  });

  it("sin envío, da el precio tal cual (con o sin IVA incluido)", () => {
    expect(
      precioNetoEquivalenteEtiqueta(
        { precioUnitarioCentavos: 1_000, envioUnitarioCentavos: 0 },
        21,
        false,
      ),
    ).toBe(1_000);
  });

  it("precio neto (sin IVA incluido) con envío: desgrosea el envío antes de sumarlo", () => {
    // precio 1000 + envío 210 desgroseado (210 × 100 / 121 ≈ 173,55) ≈ 1174.
    const equivalente = precioNetoEquivalenteEtiqueta(
      { precioUnitarioCentavos: 1_000, envioUnitarioCentavos: 210 },
      21,
      false,
    );
    expect(equivalente).toBe(1_174);
    // Reproduce el costo original a menos de un centavo de diferencia (el
    // doble redondeo del fold no es bit-exacto, pero es despreciable) — ver
    // el comentario de la función.
    const totalOriginal = aplicarIva(1_000, 21, false) + 210;
    const totalConEquivalente = aplicarIva(equivalente, 21, false);
    expect(Math.abs(totalConEquivalente - totalOriginal)).toBeLessThanOrEqual(1);
  });
});

describe("fusionarPrecioEtiquetaGrupo", () => {
  it("el ejemplo de Fran: frente $100 + reverso $120 → campo $220 (suma, no promedio)", () => {
    const miembros: EtiquetaGrupoMiembro[] = [
      { precioUnitarioCentavos: 10_000, envioUnitarioCentavos: 0, cantidad: 1 },
      { precioUnitarioCentavos: 12_000, envioUnitarioCentavos: 0, cantidad: 1 },
    ];
    expect(fusionarPrecioEtiquetaGrupo(miembros, 21, true)).toBe(22_000);
  });

  it("frente y reverso al mismo precio: la suma es el doble, no ese mismo precio", () => {
    const miembros: EtiquetaGrupoMiembro[] = [
      { precioUnitarioCentavos: 600, envioUnitarioCentavos: 0, cantidad: 1 },
      { precioUnitarioCentavos: 600, envioUnitarioCentavos: 0, cantidad: 1 },
    ];
    expect(fusionarPrecioEtiquetaGrupo(miembros, 21, true)).toBe(1_200);
  });

  it("con envío: suma los netos equivalentes (`precioNetoEquivalenteEtiqueta`) de cada lado, no los precios crudos", () => {
    const miembros: EtiquetaGrupoMiembro[] = [
      // Con IVA incluido, el envío se suma directo (precioNetoEquivalenteEtiqueta): 1000 + 200 = 1200.
      { precioUnitarioCentavos: 1_000, envioUnitarioCentavos: 200, cantidad: 1 },
      { precioUnitarioCentavos: 1_200, envioUnitarioCentavos: 0, cantidad: 1 },
    ];
    expect(fusionarPrecioEtiquetaGrupo(miembros, 21, true)).toBe(1_200 + 1_200);
  });

  it("un solo miembro cargado (el otro con cantidad 0 = sin cargar): la suma es solo ese", () => {
    const miembros: EtiquetaGrupoMiembro[] = [
      { precioUnitarioCentavos: 900, envioUnitarioCentavos: 0, cantidad: 1 },
      { precioUnitarioCentavos: 0, envioUnitarioCentavos: 0, cantidad: 0 },
    ];
    expect(fusionarPrecioEtiquetaGrupo(miembros, 21, true)).toBe(900);
  });

  it("ningún miembro cargado: null", () => {
    const miembros: EtiquetaGrupoMiembro[] = [
      { precioUnitarioCentavos: 0, envioUnitarioCentavos: 0, cantidad: 0 },
    ];
    expect(fusionarPrecioEtiquetaGrupo(miembros, 21, true)).toBeNull();
  });
});

describe("repartirPrecioEtiquetaGrupo", () => {
  it("total par entre dos insumos: mitad y mitad exacto", () => {
    expect(repartirPrecioEtiquetaGrupo(22_000, 2)).toEqual([11_000, 11_000]);
  });

  it("total impar entre dos insumos: el resto (1 centavo) va al primer insumo del grupo", () => {
    expect(repartirPrecioEtiquetaGrupo(22_001, 2)).toEqual([11_001, 11_000]);
  });

  it("es la inversa exacta de fusionarPrecioEtiquetaGrupo: la suma del reparto vuelve al total original", () => {
    const total = 22_001;
    const partes = repartirPrecioEtiquetaGrupo(total, 2);
    expect(partes.reduce((acc, p) => acc + p, 0)).toBe(total);
  });

  it("un solo insumo en el grupo: el total entero va ahí (nada que repartir)", () => {
    expect(repartirPrecioEtiquetaGrupo(9_00, 1)).toEqual([9_00]);
  });

  it("cero insumos: array vacío", () => {
    expect(repartirPrecioEtiquetaGrupo(1_000, 0)).toEqual([]);
  });
});

describe("cuentaEnvaseCampo", () => {
  it("el ejemplo de Fran: 200 × $1.000 + IVA 21% = $242.000", () => {
    // 200 × $ 1.000,00 × 1,21 = $ 242.000,00.
    expect(cuentaEnvaseCampo(200, 100_000, 24_200_000, 21, true)).toBe(
      "200 × $ 1.000,00 + IVA 21% = $ 242.000,00",
    );
  });

  it("sin el switch de IVA activado, no muestra la nota de IVA", () => {
    expect(cuentaEnvaseCampo(200, 100_000, 20_000_000, 21, false)).toBe(
      "200 × $ 1.000,00 = $ 200.000,00",
    );
  });
});
