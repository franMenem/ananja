import { describe, expect, it } from "vitest";
import {
  fusionarPrecioEtiquetaGrupo,
  repartirPrecioEtiquetaGrupo,
  type EtiquetaGrupoMiembro,
} from "@/lib/dominio/costos-lote";
import { agruparEtiquetasPorLado } from "@/lib/dominio/insumos";
import {
  construirPCostosLote,
  costosLoteStateVacio,
  mensajeErrorLote,
  prefillCostosLote,
  prefillCostosLoteDesdeValoracion,
  tieneCostoEtiquetaLegado,
  type LoteCostoRow,
  type PCostosLote,
} from "@/lib/dominio/lotes";

/**
 * `lib/lotes.ts`: adaptadores entre el estado de pantalla (strings de
 * `<input>`) de "Costos del pedido" y el jsonb `p_costos` de
 * `crear_lote`/`fijar_costos_lote` (`supabase/migrations/0029_costos_reales_lote.sql`).
 */

describe("prefillCostosLote", () => {
  const filas: LoteCostoRow[] = [
    {
      concepto: "aceite",
      producto_id: "p500",
      insumo_id: null,
      costo_unitario_centavos: 200_000,
      neto_centavos: null,
      costo_neto_centavos: null,
      envio_centavos: null,
      total_centavos: 10_000_000,
      descripcion: null,
    },
    {
      concepto: "etiqueta",
      producto_id: "p500",
      insumo_id: "frente",
      costo_unitario_centavos: 6_050,
      neto_centavos: 5_000,
      costo_neto_centavos: null,
      envio_centavos: 1_050,
      total_centavos: 1_000_000,
      descripcion: null,
    },
    {
      concepto: "envase",
      producto_id: "p500",
      insumo_id: null,
      costo_unitario_centavos: 9_680,
      neto_centavos: 8_000,
      costo_neto_centavos: null,
      envio_centavos: null,
      total_centavos: 800_000,
      descripcion: null,
    },
    {
      concepto: "envase",
      producto_id: "p250",
      insumo_id: null,
      costo_unitario_centavos: 6_050,
      neto_centavos: 5_000,
      costo_neto_centavos: null,
      envio_centavos: null,
      total_centavos: 250_000,
      descripcion: null,
    },
    {
      concepto: "transporte",
      producto_id: null,
      insumo_id: null,
      costo_unitario_centavos: null,
      neto_centavos: null,
      costo_neto_centavos: null,
      envio_centavos: null,
      total_centavos: 300_000,
      descripcion: null,
    },
    {
      concepto: "otro",
      producto_id: null,
      insumo_id: null,
      costo_unitario_centavos: null,
      neto_centavos: null,
      costo_neto_centavos: null,
      envio_centavos: null,
      total_centavos: 50_000,
      descripcion: "Envasado",
    },
  ];

  it("prefija aceite/etiqueta/transporte(fijo)/otros con formato argentino", () => {
    const resultado = prefillCostosLote(filas, ["p500"]);
    expect(resultado.precioLitroAceite).toBe("2.000,00");
    expect(resultado.etiquetasPorInsumo.frente).toEqual({
      precioUnitario: "50,00",
      envio: "10,50",
      precioCosto: "",
    });
    expect(resultado.transporteModo).toBe("fijo");
    expect(resultado.transporteFijo).toBe("3.000,00");
    expect(resultado.otros).toBe("500,00");
    expect(resultado.otrosDescripcion).toBe("Envasado");
  });

  it("prefija envase (neto) solo para los producto_id pedidos", () => {
    const resultado = prefillCostosLote(filas, ["p500", "p250"]);
    expect(resultado.envasePorProducto.p500).toBe("80,00");
    expect(resultado.envasePorProducto.p250).toBe("50,00");
  });

  it("una presentación nueva (sin envase en el lote de referencia) queda sin prefijar", () => {
    const resultado = prefillCostosLote(filas, ["p1000"]);
    expect(resultado.envasePorProducto.p1000).toBeUndefined();
  });

  it("sin ninguna fila: todo vacío, no error", () => {
    const resultado = prefillCostosLote([], ["p500"]);
    expect(resultado).toEqual(costosLoteStateVacio());
  });

  it("sin `config`: ganancia/mayorista/minorista quedan en el default 30/15/40, transporte en % 8", () => {
    const resultado = prefillCostosLote(filas.filter((f) => f.concepto !== "transporte"), ["p500"]);
    expect(resultado.gananciaPct).toBe("30");
    expect(resultado.mayoristaPct).toBe("15");
    expect(resultado.minoristaPct).toBe("40");
    expect(resultado.transporteModo).toBe("porcentaje");
    expect(resultado.transportePct).toBe("8");
  });

  it("con `config.pcts`: se prefijan los % reales del lote de referencia (propio o el anterior)", () => {
    const resultado = prefillCostosLote(filas, ["p500"], {
      pcts: { gananciaPct: 35, mayoristaPct: 25, minoristaPct: 55 },
    });
    expect(resultado.gananciaPct).toBe("35");
    expect(resultado.mayoristaPct).toBe("25");
    expect(resultado.minoristaPct).toBe("55");
  });

  it("con `config.transportePct`: gana sobre la fila fija del lote de referencia", () => {
    const resultado = prefillCostosLote(filas, ["p500"], { transportePct: 8 });
    expect(resultado.transporteModo).toBe("porcentaje");
    expect(resultado.transportePct).toBe("8");
  });

  it("con `config.ivaPct`/`precioIncluyeIva`: se prefijan tal cual", () => {
    const resultado = prefillCostosLote(filas, ["p500"], {
      ivaPct: 10.5,
      precioIncluyeIva: true,
    });
    expect(resultado.ivaPct).toBe("10.5");
    expect(resultado.sinIva).toBe(false);
  });

  it("con `config.tanquePrecioLitroAceiteCentavos`: gana sobre la fila `aceite` del lote de referencia", () => {
    const resultado = prefillCostosLote(filas, ["p500"], {
      tanquePrecioLitroAceiteCentavos: 480_000,
    });
    expect(resultado.precioLitroAceite).toBe("4.800,00");
  });

  it("`config.tanquePrecioLitroAceiteCentavos` en null (tanque sin compras): precio de aceite vacío, no usa la fila vieja", () => {
    const resultado = prefillCostosLote(filas, ["p500"], {
      tanquePrecioLitroAceiteCentavos: null,
    });
    expect(resultado.precioLitroAceite).toBe("");
  });

  it("0053_pago_vs_costo_insumo.sql: prefija envaseCostoPorProducto/precioCosto SOLO cuando la fila guardada tenía un costo_neto_centavos distinto del pagado — vacío = 'usa el mismo que pagás'", () => {
    const filasConCosto: LoteCostoRow[] = filas.map((f) =>
      f.concepto === "envase" && f.producto_id === "p500"
        ? { ...f, costo_neto_centavos: 10_000 }
        : f.concepto === "etiqueta" && f.insumo_id === "frente"
          ? { ...f, costo_neto_centavos: 15_000 }
          : f,
    );
    const resultado = prefillCostosLote(filasConCosto, ["p500", "p250"], null, [
      { productoId: "p500", insumoId: "frente" },
    ]);
    // p500 (envase) tenía costo_neto_centavos: prefija "100,00" — p250 no
    // tenía ninguna fila de costo distinto: queda ausente ("usa el pagado").
    expect(resultado.envaseCostoPorProducto.p500).toBe("100,00");
    expect(resultado.envaseCostoPorProducto.p250).toBeUndefined();
    expect(resultado.etiquetasPorInsumo.frente.precioCosto).toBe("150,00");
  });
});

describe("prefillCostosLote — costo Ananja redondeado (0054_costo_ananja_redondeado.sql)", () => {
  it("prefija costoAnanjaRedondeadoPorProducto SOLO para los productos con redondeo cargado (lote_items) — sin entrada, no aparece la clave", () => {
    const resultado = prefillCostosLote([], ["p500", "p250"], null, [], {
      p500: 250_000,
      p250: null,
    });
    expect(resultado.costoAnanjaRedondeadoPorProducto.p500).toBe("2.500,00");
    expect(resultado.costoAnanjaRedondeadoPorProducto.p250).toBeUndefined();
  });

  it("sin `redondeoAnanjaPorProducto` (parámetro por default): queda vacío, no rompe callers viejos", () => {
    const resultado = prefillCostosLote([], ["p500"]);
    expect(resultado.costoAnanjaRedondeadoPorProducto).toEqual({});
  });
});

describe("prefillCostosLote — dólar / USD del litro de aceite (0030)", () => {
  const filas: LoteCostoRow[] = [
    {
      concepto: "aceite",
      producto_id: "p500",
      insumo_id: null,
      costo_unitario_centavos: 450_000,
      neto_centavos: null,
      costo_neto_centavos: null,
      envio_centavos: null,
      total_centavos: 306_000,
      descripcion: "USD 5.00/L × $1000.00",
    },
  ];

  it("con `config.dolarCentavos`/`precioLitroAceiteUsdCentavos`: se prefijan tal cual", () => {
    const resultado = prefillCostosLote(filas, ["p500"], {
      dolarCentavos: 100_000,
      precioLitroAceiteUsdCentavos: 500,
    });
    expect(resultado.dolar).toBe("1.000,00");
    expect(resultado.precioLitroAceiteUsd).toBe("5,00");
  });

  it("sin `config.dolarCentavos`/`precioLitroAceiteUsdCentavos`: quedan vacíos", () => {
    const resultado = prefillCostosLote(filas, ["p500"]);
    expect(resultado.dolar).toBe("");
    expect(resultado.precioLitroAceiteUsd).toBe("");
  });

  it("una fila `aceite` con `descripcion` (vino de USD×dólar): el override ARS NO se prefija — ya lo cubren dolar/precioLitroAceiteUsd, prefijarlo también lo dejaría 'pegado' como override explícito la próxima vez que se guarde", () => {
    const resultado = prefillCostosLote(filas, ["p500"], {
      dolarCentavos: 100_000,
      precioLitroAceiteUsdCentavos: 500,
    });
    expect(resultado.precioLitroAceite).toBe("");
  });

  it("una fila `aceite` SIN `descripcion` (override ARS explícito o tanque, formato pre-0030): el override ARS se sigue prefijando como siempre", () => {
    const filasArs: LoteCostoRow[] = [
      { ...filas[0], descripcion: null },
    ];
    const resultado = prefillCostosLote(filasArs, ["p500"]);
    expect(resultado.precioLitroAceite).toBe("4.500,00");
  });

  it("`config.tanquePrecioLitroAceiteCentavos` presente (/stock/lotes/nuevo): sigue ganando sobre la fila `aceite`, con o sin descripcion", () => {
    const resultado = prefillCostosLote(filas, ["p500"], {
      tanquePrecioLitroAceiteCentavos: 500_000,
      dolarCentavos: 100_000,
      precioLitroAceiteUsdCentavos: 500,
    });
    expect(resultado.precioLitroAceite).toBe("5.000,00");
    expect(resultado.dolar).toBe("1.000,00");
    expect(resultado.precioLitroAceiteUsd).toBe("5,00");
  });
});

describe("prefillCostosLote — etiqueta legada (pre-0029, insumo_id null)", () => {
  // `supabase/migrations/0028_costos_por_lote.sql`: antes de 0029 una sola
  // fila `concepto='etiqueta'` por presentación (insumo_id null) cargaba el
  // precio que se aplicaba a TODOS sus insumos de etiqueta (frente + retro
  // al mismo precio). Esa fila nunca se backfillea con `insumo_id`.
  const filaLegada: LoteCostoRow = {
    concepto: "etiqueta",
    producto_id: "p500",
    insumo_id: null,
    costo_unitario_centavos: 6_050,
    neto_centavos: null,
    costo_neto_centavos: null,
    envio_centavos: null,
    total_centavos: 1_210_000,
    descripcion: null,
  };

  it("reconstruye un precio por cada insumo de etiqueta que usa la presentación, envío 0", () => {
    const resultado = prefillCostosLote([filaLegada], ["p500"], null, [
      { productoId: "p500", insumoId: "frente" },
      { productoId: "p500", insumoId: "retro" },
    ]);
    expect(resultado.etiquetasPorInsumo.frente).toEqual({
      precioUnitario: "60,50",
      envio: "0,00",
      precioCosto: "",
    });
    expect(resultado.etiquetasPorInsumo.retro).toEqual({
      precioUnitario: "60,50",
      envio: "0,00",
      precioCosto: "",
    });
  });

  it("una fila 0029+ (insumo_id tagueado) gana sobre el fallback legado para ese insumo", () => {
    const filas: LoteCostoRow[] = [
      filaLegada,
      {
        concepto: "etiqueta",
        producto_id: "p500",
        insumo_id: "frente",
        costo_unitario_centavos: 9_000,
        neto_centavos: 7_000,
        costo_neto_centavos: null,
        envio_centavos: 500,
        total_centavos: 750_000,
        descripcion: null,
      },
    ];
    const resultado = prefillCostosLote(filas, ["p500"], null, [
      { productoId: "p500", insumoId: "frente" },
      { productoId: "p500", insumoId: "retro" },
    ]);
    expect(resultado.etiquetasPorInsumo.frente).toEqual({
      precioUnitario: "70,00",
      envio: "5,00",
      precioCosto: "",
    });
    expect(resultado.etiquetasPorInsumo.retro).toEqual({
      precioUnitario: "60,50",
      envio: "0,00",
      precioCosto: "",
    });
  });

  it("sin `recetasEtiqueta`: no hay con qué reconstruir, pero tampoco explota", () => {
    const resultado = prefillCostosLote([filaLegada], ["p500"]);
    expect(resultado.etiquetasPorInsumo).toEqual({});
  });

  it("round-trip: prefill de una fila legada -> construirPCostosLote conserva el costo (no lo pierde)", () => {
    const prefill = prefillCostosLote([filaLegada], ["p500"], null, [
      { productoId: "p500", insumoId: "frente" },
    ]);
    const resultado = construirPCostosLote(prefill, ["p500"], ["frente"]);
    expect(resultado?.etiquetas).toEqual([
      { insumo_id: "frente", precio_unitario_centavos: 6_050, envio_unitario_centavos: 0, precio_costo_unitario_centavos: null },
    ]);
  });
});

describe("prefillCostosLote — última compra por insumo de etiqueta (build \"insumos en cero\")", () => {
  // Precedencia: el lote de referencia (`filas`) gana; si no tiene ese
  // insumo, la última compra (`config.ultimasComprasEtiquetas`); si tampoco
  // hay compra, queda vacío.
  const filaFrente0029 = {
    concepto: "etiqueta" as const,
    producto_id: "p500",
    insumo_id: "frente",
    costo_unitario_centavos: 9_000,
    neto_centavos: 7_000,
    costo_neto_centavos: null,
    envio_centavos: 500,
    total_centavos: 750_000,
    descripcion: null,
  };

  it("sin nada cargado en el lote de referencia ni compras registradas: queda vacío, no explota", () => {
    const resultado = prefillCostosLote([], ["p500"]);
    expect(resultado.etiquetasPorInsumo).toEqual({});
  });

  it("sin lote de referencia, con última compra: prefija precio de esa compra, envío vacío", () => {
    const resultado = prefillCostosLote([], ["p500"], {
      ultimasComprasEtiquetas: {
        frente: { precioUnitarioCentavos: 12_000, fecha: "2026-09-12" },
      },
    });
    expect(resultado.etiquetasPorInsumo.frente).toEqual({
      precioUnitario: "120,00",
      envio: "",
      precioCosto: "",
    });
  });

  it("el lote de referencia YA trae ese insumo: gana sobre la última compra (no la pisa)", () => {
    const resultado = prefillCostosLote([filaFrente0029], ["p500"], {
      ultimasComprasEtiquetas: {
        frente: { precioUnitarioCentavos: 12_000, fecha: "2026-09-12" },
      },
    });
    expect(resultado.etiquetasPorInsumo.frente).toEqual({
      precioUnitario: "70,00", // neto_centavos de la fila, no el de la compra
      envio: "5,00",
      precioCosto: "",
    });
  });

  it("compras de OTROS insumos no pisan uno que el lote de referencia sí trae, y sí prefijan los que faltan", () => {
    const resultado = prefillCostosLote([filaFrente0029], ["p500"], {
      ultimasComprasEtiquetas: {
        frente: { precioUnitarioCentavos: 12_000, fecha: "2026-09-12" },
        retro: { precioUnitarioCentavos: 9_500, fecha: "2026-09-05" },
      },
    });
    expect(resultado.etiquetasPorInsumo.frente).toEqual({ precioUnitario: "70,00", envio: "5,00", precioCosto: "" });
    expect(resultado.etiquetasPorInsumo.retro).toEqual({ precioUnitario: "95,00", envio: "", precioCosto: "" });
  });

  it("`ultimasComprasEtiquetas` ausente o `{}`: se comporta igual que sin config, no explota", () => {
    expect(prefillCostosLote([], ["p500"], {}).etiquetasPorInsumo).toEqual({});
    expect(
      prefillCostosLote([], ["p500"], { ultimasComprasEtiquetas: {} }).etiquetasPorInsumo,
    ).toEqual({});
    expect(
      prefillCostosLote([], ["p500"], { ultimasComprasEtiquetas: null }).etiquetasPorInsumo,
    ).toEqual({});
  });
});

describe("tieneCostoEtiquetaLegado", () => {
  it("true con una fila etiqueta sin insumo_id", () => {
    expect(
      tieneCostoEtiquetaLegado([{ concepto: "etiqueta", insumo_id: null }]),
    ).toBe(true);
  });

  it("false con filas etiqueta tagueadas, sin filas, u otros conceptos", () => {
    expect(tieneCostoEtiquetaLegado([{ concepto: "etiqueta", insumo_id: "frente" }])).toBe(false);
    expect(tieneCostoEtiquetaLegado([{ concepto: "aceite", insumo_id: null }])).toBe(false);
    expect(tieneCostoEtiquetaLegado([])).toBe(false);
  });
});

describe("construirPCostosLote", () => {
  it("arma el jsonb completo cuando todos los campos están cargados (transporte %, IVA, etiquetas)", () => {
    const resultado = construirPCostosLote(
      {
        dolar: "1.000,00",
        precioLitroAceiteUsd: "5,00",
        precioLitroAceite: "4.500,00",
        etiquetasPorInsumo: {
          frente: { precioUnitario: "100,00", envio: "5,00", precioCosto: "" },
          retro: { precioUnitario: "110,00", envio: "10,00", precioCosto: "" },
        },
        envasePorProducto: { p500: "1.200,00", p250: "1.000,00" },
        envaseCostoPorProducto: {},
        costoAnanjaRedondeadoPorProducto: {},
        transporteModo: "porcentaje",
        transportePct: "8",
        transporteFijo: "",
        otros: "500,00",
        otrosDescripcion: "Envasado",
        sinIva: true,
        envaseSinIva: false,
        ivaPct: "21",
        gananciaPct: "30",
        mayoristaPct: "15",
        minoristaPct: "40",
      },
      ["p500", "p250"],
      ["frente", "retro"],
    );
    expect(resultado).toEqual({
      dolar_centavos: 100_000,
      precio_litro_aceite_usd_centavos: 500,
      precio_litro_aceite_centavos: 450_000,
      precio_etiqueta_centavos: null,
      etiquetas: [
        {
          insumo_id: "frente",
          precio_unitario_centavos: 10_000,
          envio_unitario_centavos: 500,
          precio_costo_unitario_centavos: null,
        },
        {
          insumo_id: "retro",
          precio_unitario_centavos: 11_000,
          envio_unitario_centavos: 1_000,
          precio_costo_unitario_centavos: null,
        },
      ],
      envases: [
        { producto_id: "p500", precio_unitario_centavos: 120_000, precio_costo_unitario_centavos: null },
        { producto_id: "p250", precio_unitario_centavos: 100_000, precio_costo_unitario_centavos: null },
      ],
      transporte_centavos: null,
      transporte_pct: 8,
      otros_centavos: 50_000,
      otros_descripcion: "Envasado",
      ganancia_pct: 30,
      mayorista_pct: 15,
      minorista_pct: 40,
      iva_pct: 21,
      precios_incluyen_iva: false,
      envase_cobrado_sin_iva: false,
      redondeos: [],
      costos_ananja_redondeados: [
        { producto_id: "p500", monto_centavos: null },
        { producto_id: "p250", monto_centavos: null },
      ],
    });
  });

  it("0053_pago_vs_costo_insumo.sql: manda precio_costo_unitario_centavos SOLO para los envases/etiquetas con un precio para costo distinto cargado", () => {
    const resultado = construirPCostosLote(
      {
        ...costosLoteStateVacio(),
        envasePorProducto: { p500: "1.500,00", p250: "1.250,00" },
        envaseCostoPorProducto: { p500: "2.000,00" },
        etiquetasPorInsumo: {
          frente: { precioUnitario: "100,00", envio: "5,00", precioCosto: "150,00" },
          retro: { precioUnitario: "110,00", envio: "10,00", precioCosto: "" },
        },
      },
      ["p500", "p250"],
      ["frente", "retro"],
    );
    expect(resultado?.envases).toEqual([
      { producto_id: "p500", precio_unitario_centavos: 150_000, precio_costo_unitario_centavos: 200_000 },
      { producto_id: "p250", precio_unitario_centavos: 125_000, precio_costo_unitario_centavos: null },
    ]);
    expect(resultado?.etiquetas).toEqual([
      {
        insumo_id: "frente",
        precio_unitario_centavos: 10_000,
        envio_unitario_centavos: 500,
        precio_costo_unitario_centavos: 15_000,
      },
      {
        insumo_id: "retro",
        precio_unitario_centavos: 11_000,
        envio_unitario_centavos: 1_000,
        precio_costo_unitario_centavos: null,
      },
    ]);
  });

  it("transporte fijo: manda transporte_centavos y transporte_pct null (nunca los dos)", () => {
    const resultado = construirPCostosLote(
      {
        ...costosLoteStateVacio(),
        transporteModo: "fijo",
        transporteFijo: "3.000,00",
      },
      [],
    );
    expect(resultado?.transporte_centavos).toBe(300_000);
    expect(resultado?.transporte_pct).toBeNull();
  });

  it("sin ningún campo de costo cargado: null (el lote se guarda sin costos), aunque los % y transporte % tengan su default", () => {
    expect(construirPCostosLote(costosLoteStateVacio(), ["p500"])).toBeNull();
  });

  it("solo dólar cargado (sin USD/L todavía): NO es null — se persiste igual para que el próximo pedido lo herede (o para no perderlo al guardar)", () => {
    const resultado = construirPCostosLote(
      { ...costosLoteStateVacio(), dolar: "1.000,00" },
      ["p500"],
    );
    expect(resultado?.dolar_centavos).toBe(100_000);
    expect(resultado?.precio_litro_aceite_usd_centavos).toBeNull();
  });

  it("solo precio del litro en USD cargado (sin dólar todavía): tampoco es null, mismo criterio", () => {
    const resultado = construirPCostosLote(
      { ...costosLoteStateVacio(), precioLitroAceiteUsd: "5,00" },
      ["p500"],
    );
    expect(resultado?.dolar_centavos).toBeNull();
    expect(resultado?.precio_litro_aceite_usd_centavos).toBe(500);
  });

  it("dólar + USD/L cargados: arma los dos campos (0030)", () => {
    const resultado = construirPCostosLote(
      { ...costosLoteStateVacio(), dolar: "1.000,00", precioLitroAceiteUsd: "5,00" },
      ["p500"],
    );
    expect(resultado?.dolar_centavos).toBe(100_000);
    expect(resultado?.precio_litro_aceite_usd_centavos).toBe(500);
    expect(resultado?.precio_litro_aceite_centavos).toBeNull();
  });

  it("un solo campo cargado (precio de aceite): arma el jsonb con ese + los % (default 30/15/40) e IVA (default 21/incluido — el dueño carga los precios CON IVA)", () => {
    const resultado = construirPCostosLote(
      { ...costosLoteStateVacio(), precioLitroAceite: "1.500,00" },
      ["p500"],
    );
    expect(resultado).toEqual({
      dolar_centavos: null,
      precio_litro_aceite_usd_centavos: null,
      precio_litro_aceite_centavos: 150_000,
      precio_etiqueta_centavos: null,
      etiquetas: [],
      envases: [],
      transporte_centavos: null,
      transporte_pct: 8,
      otros_centavos: null,
      otros_descripcion: null,
      ganancia_pct: 30,
      mayorista_pct: 15,
      minorista_pct: 40,
      iva_pct: 21,
      precios_incluyen_iva: true,
      envase_cobrado_sin_iva: false,
      redondeos: [],
      costos_ananja_redondeados: [{ producto_id: "p500", monto_centavos: null }],
    });
  });

  it("otros sin descripción: otros_descripcion null", () => {
    const resultado = construirPCostosLote(
      { ...costosLoteStateVacio(), otros: "500,00" },
      [],
    );
    expect(resultado?.otros_descripcion).toBeNull();
  });

  it("envase de un producto que no está en productoIds no se agrega igual (defensivo)", () => {
    const resultado = construirPCostosLote(
      { ...costosLoteStateVacio(), otros: "500,00", envasePorProducto: { p500: "80,00" } },
      ["p250"],
    );
    expect(resultado?.envases).toEqual([]);
  });

  it("etiqueta de un insumo que no está en etiquetaInsumoIds no se agrega igual (defensivo)", () => {
    const resultado = construirPCostosLote(
      {
        ...costosLoteStateVacio(),
        otros: "500,00",
        etiquetasPorInsumo: { frente: { precioUnitario: "100,00", envio: "5,00", precioCosto: "" } },
      },
      [],
      ["retro"],
    );
    expect(resultado?.etiquetas).toEqual([]);
  });

  it("etiqueta sin envío cargado: envio_unitario_centavos 0", () => {
    const resultado = construirPCostosLote(
      {
        ...costosLoteStateVacio(),
        etiquetasPorInsumo: { frente: { precioUnitario: "100,00", envio: "", precioCosto: "" } },
      },
      [],
      ["frente"],
    );
    expect(resultado?.etiquetas).toEqual([
      { insumo_id: "frente", precio_unitario_centavos: 10_000, envio_unitario_centavos: 0, precio_costo_unitario_centavos: null },
    ]);
  });

  it("sinIva = false: precios_incluyen_iva true", () => {
    const resultado = construirPCostosLote(
      { ...costosLoteStateVacio(), otros: "500,00", sinIva: false },
      [],
    );
    expect(resultado?.precios_incluyen_iva).toBe(true);
  });
});

describe("mensajeErrorLote", () => {
  it("COSTOS_MENORES_A_PAGADO sin detalle: mensaje genérico del caso", () => {
    expect(mensajeErrorLote("COSTOS_MENORES_A_PAGADO")).toBe(
      "No podés bajar los costos por debajo de lo que ya se pagó de este pedido. Revisá los pagos registrados.",
    );
  });

  it("COSTOS_MENORES_A_PAGADO con detalle: incluye los montos pagado/nuevo total", () => {
    const detalle = JSON.stringify({ pagado_centavos: 500_000, nuevo_total_centavos: 300_000 });
    const mensaje = mensajeErrorLote("COSTOS_MENORES_A_PAGADO", detalle);
    expect(mensaje).toContain("$ 5.000,00");
    expect(mensaje).toContain("$ 3.000,00");
  });

  it("COSTOS_MENORES_A_PAGADO con detalle inválido: cae al mensaje genérico, no explota", () => {
    expect(mensajeErrorLote("COSTOS_MENORES_A_PAGADO", "no es json")).toBe(
      "No podés bajar los costos por debajo de lo que ya se pagó de este pedido. Revisá los pagos registrados.",
    );
  });

  it("DEUDA_ACEITE_MENOR_A_PAGADO sin detalle: mensaje genérico del caso", () => {
    expect(mensajeErrorLote("DEUDA_ACEITE_MENOR_A_PAGADO")).toBe(
      "No podés bajar la deuda con el proveedor de aceite por debajo de lo que ya se le pagó. Revisá los pagos registrados en Deudas.",
    );
  });

  it("DEUDA_ACEITE_MENOR_A_PAGADO con detalle: incluye los montos pagado/nuevo total, en USD", () => {
    const detalle = JSON.stringify({ pagado_centavos: 50_000, nuevo_total_centavos: 30_000 });
    const mensaje = mensajeErrorLote("DEUDA_ACEITE_MENOR_A_PAGADO", detalle);
    expect(mensaje).toContain("USD 500,00");
    expect(mensaje).toContain("USD 300,00");
  });

  it("DEUDA_ACEITE_MENOR_A_PAGADO con detalle inválido: cae al mensaje genérico, no explota", () => {
    expect(mensajeErrorLote("DEUDA_ACEITE_MENOR_A_PAGADO", "no es json")).toBe(
      "No podés bajar la deuda con el proveedor de aceite por debajo de lo que ya se le pagó. Revisá los pagos registrados en Deudas.",
    );
  });

  it("COSTO_ENVASE_DUPLICADO: mensaje amigable", () => {
    expect(mensajeErrorLote("COSTO_ENVASE_DUPLICADO")).toBe(
      "Cada presentación puede tener un solo precio de envase — revisá que no esté repetida.",
    );
  });

  it("COSTO_ETIQUETA_INVALIDO / COSTO_ETIQUETA_DUPLICADO / TRANSPORTE_AMBIGUO: mensajes amigables", () => {
    expect(mensajeErrorLote("COSTO_ETIQUETA_INVALIDO")).toBe(
      "Revisá el precio o el envío de etiqueta cargado.",
    );
    expect(mensajeErrorLote("COSTO_ETIQUETA_DUPLICADO")).toBe(
      "Cada insumo de etiqueta puede tener un solo precio — revisá que no esté repetido.",
    );
    expect(mensajeErrorLote("TRANSPORTE_AMBIGUO")).toBe(
      "Elegí transporte como % o como monto fijo, no los dos a la vez.",
    );
  });

  it("COSTOS_ORIGINALES_INCOMPLETOS: mensaje de actualizar_costo_lote_vigente (0052)", () => {
    expect(mensajeErrorLote("COSTOS_ORIGINALES_INCOMPLETOS")).toBe(
      "Este pedido todavía no tiene sus costos originales completos — primero completalos en \"Editar costos\".",
    );
  });

  it("SIN_ITEMS / CANTIDAD_INVALIDA / PRODUCTO_INVALIDO: mensajes de crear_lote (antes solo en LoteForm)", () => {
    expect(mensajeErrorLote("SIN_ITEMS")).toBe("Cargá al menos una cantidad.");
    expect(mensajeErrorLote("CANTIDAD_INVALIDA")).toBe("Revisá las cantidades.");
    expect(mensajeErrorLote("PRODUCTO_INVALIDO")).toBe("Faltan datos de los productos.");
  });

  it("código desconocido: mensaje genérico de guardado", () => {
    expect(mensajeErrorLote("ALGO_QUE_NO_EXISTE")).toBe("No se pudo guardar. Probá de nuevo.");
  });
});

/**
 * Integración entre "Actualizar costos del depósito" (0052,
 * `actualizarCostoLoteVigente`/`prefillCostosLoteDesdeValoracion`) y
 * "etiquetas suma" (campo unificado = SUMA de frente + reverso,
 * `fusionarPrecioEtiquetaGrupo`/`repartirPrecioEtiquetaGrupo` en
 * `components/stock/costos-lote-campos.tsx`): la precarga desde
 * `lote_valoraciones.costos_jsonb` sigue guardando una fila por insumo (el
 * contrato de `p_costos` no cambia con "etiquetas suma"), y
 * `CostosLoteCampos` agrupa esas filas con `agruparEtiquetasPorLado` +
 * `fusionarPrecioEtiquetaGrupo` para MOSTRAR el campo unificado — acá se
 * reproduce ese cálculo sin renderizar el componente.
 */
describe("prefillCostosLoteDesdeValoracion + etiquetas suma (0052 × etiquetas-suma)", () => {
  const costosJsonb: PCostosLote = {
    dolar_centavos: null,
    precio_litro_aceite_usd_centavos: null,
    precio_litro_aceite_centavos: null,
    precio_etiqueta_centavos: null,
    etiquetas: [
      // Frente $100 + reverso $120 (el ejemplo de Fran) — misma
      // presentación, dos insumos, `p_costos` guarda cada uno por
      // separado.
      { insumo_id: "frente", precio_unitario_centavos: 10_000, envio_unitario_centavos: 0 },
      { insumo_id: "reverso", precio_unitario_centavos: 12_000, envio_unitario_centavos: 0 },
    ],
    envases: [],
    transporte_centavos: null,
    transporte_pct: 8,
    otros_centavos: null,
    otros_descripcion: null,
    ganancia_pct: null,
    mayorista_pct: null,
    minorista_pct: null,
    iva_pct: 21,
    precios_incluyen_iva: true,
    envase_cobrado_sin_iva: false,
    redondeos: [],
  };

  const margenes = { gananciaPct: 30, mayoristaPct: 15, minoristaPct: 40 };

  it("la precarga muestra la SUMA de frente + reverso, no un promedio", () => {
    const state = prefillCostosLoteDesdeValoracion(costosJsonb, margenes);

    // Cada insumo conserva su propio precio en el estado — el contrato de
    // `p_costos` sigue siendo una fila por insumo.
    expect(state.etiquetasPorInsumo["frente"].precioUnitario).toBe("100,00");
    expect(state.etiquetasPorInsumo["reverso"].precioUnitario).toBe("120,00");

    // `CostosLoteCampos` agrupa por lado y suma los netos equivalentes
    // cargados — mismo cálculo que hace el campo unificado en pantalla.
    const [grupo] = agruparEtiquetasPorLado([
      { insumoId: "frente", nombre: "Etiqueta grande frente" },
      { insumoId: "reverso", nombre: "Etiqueta grande reverso" },
    ]);
    const miembros: EtiquetaGrupoMiembro[] = grupo.insumoIds.map((insumoId) => {
      const fila = state.etiquetasPorInsumo[insumoId];
      return {
        precioUnitarioCentavos: Math.round(parseFloat(fila.precioUnitario.replace(",", ".")) * 100),
        envioUnitarioCentavos: 0,
        cantidad: 1,
      };
    });
    const suma = fusionarPrecioEtiquetaGrupo(miembros, 21, true);

    expect(suma).toBe(22_000); // $220 — la suma, no el promedio ($110).
  });

  it("al guardar, el total editado se reparte mitad y mitad entre frente y reverso", () => {
    const [grupo] = agruparEtiquetasPorLado([
      { insumoId: "frente", nombre: "Etiqueta grande frente" },
      { insumoId: "reverso", nombre: "Etiqueta grande reverso" },
    ]);

    // El dueño edita el campo unificado a $250 (25.000 centavos) — total
    // impar entre dos insumos: el resto (1 centavo) va al primer insumo
    // del grupo ("frente").
    const partes = repartirPrecioEtiquetaGrupo(25_001, grupo.insumoIds.length);
    expect(partes).toEqual([12_501, 12_500]);

    const pCostos = construirPCostosLote(
      {
        ...costosLoteStateVacio(),
        etiquetasPorInsumo: {
          frente: { precioUnitario: "125,01", envio: "", precioCosto: "" },
          reverso: { precioUnitario: "125,00", envio: "", precioCosto: "" },
        },
      },
      [],
      grupo.insumoIds,
    );

    // El reparto guardado en `p_costos` suma exactamente el total que
    // escribió el dueño — sin perder ni ganar centavos en el redondeo.
    const totalGuardado = (pCostos?.etiquetas ?? []).reduce(
      (acc, e) => acc + e.precio_unitario_centavos,
      0,
    );
    expect(totalGuardado).toBe(25_001);
  });
});

describe("prefillCostosLoteDesdeValoracion — costo Ananja redondeado (0054)", () => {
  const margenes = { gananciaPct: 30, mayoristaPct: 15, minoristaPct: 40 };
  const base: PCostosLote = {
    dolar_centavos: null,
    precio_litro_aceite_usd_centavos: null,
    precio_litro_aceite_centavos: null,
    precio_etiqueta_centavos: null,
    etiquetas: [],
    envases: [],
    transporte_centavos: null,
    transporte_pct: null,
    otros_centavos: null,
    otros_descripcion: null,
    ganancia_pct: null,
    mayorista_pct: null,
    minorista_pct: null,
    iva_pct: 21,
    precios_incluyen_iva: true,
    envase_cobrado_sin_iva: false,
    redondeos: [],
  };

  it("round trip: lee de vuelta exactamente lo que costos_jsonb ya tenía guardado (0052, 'inverso de construirPCostosLote')", () => {
    const state = prefillCostosLoteDesdeValoracion(
      {
        ...base,
        costos_ananja_redondeados: [
          { producto_id: "p500", monto_centavos: 250_000 },
          { producto_id: "p250", monto_centavos: null },
        ],
      },
      margenes,
    );
    expect(state.costoAnanjaRedondeadoPorProducto.p500).toBe("2.500,00");
    expect(state.costoAnanjaRedondeadoPorProducto.p250).toBeUndefined();
  });

  it("costos_jsonb sin la clave (valoración de antes de 0054): queda vacío, no explota", () => {
    const state = prefillCostosLoteDesdeValoracion(base, margenes);
    expect(state.costoAnanjaRedondeadoPorProducto).toEqual({});
  });
});
