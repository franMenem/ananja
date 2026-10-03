import { describe, expect, it } from "vitest";
import {
  agruparPerdidasPorMotivo,
  construirPedidosCards,
  estadoPedido,
  itemsDeLote,
  sumarCobranzaLote,
  type DesgloseLoteProducto,
  type FilaCobranzaLote,
  type FilaPerdidaLote,
  type PedidoInput,
} from "@/lib/dominio/pedidos-lote";

describe("itemsDeLote", () => {
  it("castea el JSON de v_costo_lote.items a un array de ítems", () => {
    const items = [{ producto_id: "p1", producto_nombre: "Botella 250 ml", presentacion_ml: 250, cantidad: 100 }];
    expect(itemsDeLote({ items })).toEqual(items);
  });

  it("items no es un array (null/objeto raro): lista vacía en vez de romper", () => {
    expect(itemsDeLote({ items: null })).toEqual([]);
  });
});

describe("estadoPedido", () => {
  it("sin costos: manda por sobre el saldo (que siempre viene en 0)", () => {
    expect(estadoPedido({ tieneCostos: false, saldoCentavos: 0 })).toEqual({
      tipo: "sin-costos",
      label: "Sin costos",
    });
  });

  it("con costos y saldo > 0: falta pagar", () => {
    expect(estadoPedido({ tieneCostos: true, saldoCentavos: 500000 })).toEqual({
      tipo: "falta",
      label: "Falta pagar $ 5.000,00",
    });
  });

  it("con costos y saldo en 0: pagado", () => {
    expect(estadoPedido({ tieneCostos: true, saldoCentavos: 0 })).toEqual({
      tipo: "pagado",
      label: "Pagado",
    });
  });
});

describe("construirPedidosCards", () => {
  const lotes: PedidoInput[] = [
    {
      loteId: "l1",
      fecha: "2026-08-27",
      items: [
        { productoId: "p250", presentacionMl: 250, cantidad: 600 },
        { productoId: "p500", presentacionMl: 500, cantidad: 400 },
      ],
    },
    {
      loteId: "l2",
      fecha: "2026-09-01",
      items: [{ productoId: "p250", presentacionMl: 250, cantidad: 100 }],
    },
  ];

  it("una tarjeta por lote, con el costo Ananja de cada ítem en orden", () => {
    const desglose = new Map<string, DesgloseLoteProducto>([
      ["l1:p250", { costoAnanjaCentavos: 518400, costoAnanjaCalculadoCentavos: 518400, tieneCostos: true }],
      ["l1:p500", { costoAnanjaCentavos: 800300, costoAnanjaCalculadoCentavos: 800300, tieneCostos: true }],
    ]);
    const saldoPorLote = new Map([["l1", 0]]);

    const [primera] = construirPedidosCards({ lotes: [lotes[0]], desglosePorLoteProducto: desglose, saldoPorLote });

    expect(primera.loteId).toBe("l1");
    expect(primera.items).toEqual([
      {
        productoId: "p250",
        presentacionMl: 250,
        cantidad: 600,
        costoAnanjaCentavos: 518400,
        costoAnanjaCalculadoCentavos: 518400,
      },
      {
        productoId: "p500",
        presentacionMl: 500,
        cantidad: 400,
        costoAnanjaCentavos: 800300,
        costoAnanjaCalculadoCentavos: 800300,
      },
    ]);
    expect(primera.estado).toEqual({ tipo: "pagado", label: "Pagado" });
  });

  it("un lote sin ninguna fila de desglose: todos los ítems null y 'Sin costos'", () => {
    const [card] = construirPedidosCards({
      lotes: [lotes[1]],
      desglosePorLoteProducto: new Map(),
      saldoPorLote: new Map(),
    });
    expect(card.items).toEqual([
      {
        productoId: "p250",
        presentacionMl: 250,
        cantidad: 100,
        costoAnanjaCentavos: null,
        costoAnanjaCalculadoCentavos: null,
      },
    ]);
    expect(card.estado).toEqual({ tipo: "sin-costos", label: "Sin costos" });
  });

  it("cada ítem lleva su productoId — no hay que zipear por posición contra los ítems crudos del lote", () => {
    // Regresión: `/stock/lotes` (page.tsx) buscaba el producto vigente de
    // cada ítem zipeando `pedido.items[i]` con `lote.items[i]` por índice,
    // asumiendo el mismo orden. Un lote cuyos ítems vienen en otro orden
    // (ej. la presentación más grande primero) desalinearía ese zip.
    const loteDesordenado: PedidoInput = {
      loteId: "l3",
      fecha: "2026-09-05",
      items: [
        { productoId: "p500", presentacionMl: 500, cantidad: 10 },
        { productoId: "p250", presentacionMl: 250, cantidad: 20 },
      ],
    };
    const desglose = new Map<string, DesgloseLoteProducto>([
      ["l3:p250", { costoAnanjaCentavos: 111, costoAnanjaCalculadoCentavos: 111, tieneCostos: true }],
      ["l3:p500", { costoAnanjaCentavos: 222, costoAnanjaCalculadoCentavos: 222, tieneCostos: true }],
    ]);
    const [card] = construirPedidosCards({
      lotes: [loteDesordenado],
      desglosePorLoteProducto: desglose,
      saldoPorLote: new Map(),
    });
    // El costo de cada ítem tiene que corresponder a SU productoId, en el
    // mismo orden en el que vino (500 ml primero).
    expect(card.items.map((i) => [i.productoId, i.costoAnanjaCentavos])).toEqual([
      ["p500", 222],
      ["p250", 111],
    ]);
  });

  it("una presentación sin costos (tiene_costos: false) no cuenta como costo real aunque venga costo_ananja = 0", () => {
    const desglose = new Map<string, DesgloseLoteProducto>([
      ["l1:p250", { costoAnanjaCentavos: 0, costoAnanjaCalculadoCentavos: 0, tieneCostos: false }],
      ["l1:p500", { costoAnanjaCentavos: 800300, costoAnanjaCalculadoCentavos: 800300, tieneCostos: true }],
    ]);
    const [card] = construirPedidosCards({
      lotes: [lotes[0]],
      desglosePorLoteProducto: desglose,
      saldoPorLote: new Map([["l1", 12000]]),
    });
    expect(card.items[0].costoAnanjaCentavos).toBeNull();
    expect(card.items[1].costoAnanjaCentavos).toBe(800300);
    // Alguna presentación con costos ya es "tiene costos" para el chip.
    expect(card.estado).toEqual({ tipo: "falta", label: "Falta pagar $ 120,00" });
  });
});

describe("sumarCobranzaLote", () => {
  it("suma las filas de todas las presentaciones de un pedido", () => {
    const filas: FilaCobranzaLote[] = [
      {
        producidas: 600,
        enDeposito: 400,
        vendidas: 150,
        perdidas: 5,
        esperadoTotalCentavos: 3110400,
        esperadoPorVendidasCentavos: 777600,
      },
      {
        producidas: 400,
        enDeposito: 300,
        vendidas: 80,
        perdidas: 0,
        esperadoTotalCentavos: 3201200,
        esperadoPorVendidasCentavos: 640240,
      },
    ];
    expect(sumarCobranzaLote(filas)).toEqual({
      producidas: 1000,
      enDeposito: 700,
      vendidas: 230,
      perdidas: 5,
      esperadoTotalCentavos: 6311600,
      esperadoPorVendidasCentavos: 1417840,
    });
  });

  it("sin filas, todo en 0", () => {
    expect(sumarCobranzaLote([])).toEqual({
      producidas: 0,
      enDeposito: 0,
      vendidas: 0,
      perdidas: 0,
      esperadoTotalCentavos: 0,
      esperadoPorVendidasCentavos: 0,
    });
  });
});

describe("agruparPerdidasPorMotivo", () => {
  it("suma unidades y costo por motivo, entre presentaciones", () => {
    const filas: FilaPerdidaLote[] = [
      { motivo: "degustacion", unidades: 2, costo_total_centavos: 1000 },
      { motivo: "degustacion", unidades: 1, costo_total_centavos: 800 },
      { motivo: "rotura", unidades: 3, costo_total_centavos: 2400 },
    ];
    expect(agruparPerdidasPorMotivo(filas)).toEqual([
      { motivo: "degustacion", unidades: 3, costoCentavos: 1800 },
      { motivo: "rotura", unidades: 3, costoCentavos: 2400 },
    ]);
  });

  it("ignora filas sin motivo", () => {
    expect(agruparPerdidasPorMotivo([{ motivo: null, unidades: 5, costo_total_centavos: 500 }])).toEqual([]);
  });

  it("sin filas, lista vacía", () => {
    expect(agruparPerdidasPorMotivo([])).toEqual([]);
  });
});
