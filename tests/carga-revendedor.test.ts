import { describe, expect, it } from "vitest";

import {
  ENTREGA_NUEVA_ID,
  armarPedidoCarga,
  disponiblePorProducto,
  entregadoPorProducto,
  fechaVentasPorDefecto,
  leerResultadoCarga,
  montoPagoSugerido,
  precioSugeridoVenta,
  resumirCarga,
  stockConEntregaNueva,
  traducirErrorCarga,
  validarCarga,
  loteParaEntrega,
  yaTeniaAntesDeLaEntrega,
  type CargaInput,
  type EstadoRevendedora,
  type TextosCarga,
} from "@/lib/dominio/carga-revendedor";
import type { LoteConStockDeProducto } from "@/lib/dominio/lotes-disponibles";
import type { EntregaItemFifo } from "@/lib/dominio/revendedor-stock";

/**
 * Espejo de `registrar_carga_revendedor`
 * (supabase/migrations/0043_carga_unificada_revendedor.sql): entrega →
 * ventas (FIFO sobre stock existente + la entrega nueva) → pago, con el
 * resumen en vivo, la validación por sección y la traducción de errores.
 */

const HOY = "2026-09-15";

const textos: TextosCarga = {
  nombres: { p500: "Botella 500 ml", p250: "Botella 250 ml" },
  negocio: "Ananja",
  envasePlural: "botellas",
  formatFecha: (f) => f.split("-").reverse().join("/"),
};

function estado(parcial: Partial<EstadoRevendedora> = {}): EstadoRevendedora {
  return {
    items: [],
    ventas: [],
    preciosManuales: {},
    deudaCentavos: 0,
    hoy: HOY,
    ...parcial,
  };
}

function item(parcial: Partial<EntregaItemFifo> & { id: string }): EntregaItemFifo {
  return {
    entregaId: `e-${parcial.id}`,
    tipo: "entrega",
    fecha: "2026-08-01",
    createdAt: "2026-08-01T10:00:00+00:00",
    productoId: "p500",
    loteId: "lote-a",
    cantidad: 10,
    costoAnanjaUnitarioCentavos: 1_000_000,
    precioSugeridoCentavos: 1_600_000,
    ...parcial,
  };
}

const vacio: CargaInput = { entrega: null, ventas: null, pago: null };

describe("entrega + ventas + pago juntos", () => {
  // "En agosto se llevó 30 del lote X, vendió 25, de 10 no sabemos el
  // precio y le dio $200.000 en efectivo a Laura."
  const input: CargaInput = {
    entrega: {
      fecha: "2026-08-10",
      filas: [
        {
          productoId: "p500",
          loteId: "lote-x",
          cantidad: 30,
          costoCentavos: 1_000_000,
          sugeridoCentavos: 1_600_000,
        },
      ],
    },
    ventas: {
      fecha: "2026-08-20",
      medioPago: null,
      filas: [
        { productoId: "p500", cantidad: 15, precioVentaCentavos: 1_500_000, sinPrecio: false, loteId: null },
        { productoId: "p500", cantidad: 10, precioVentaCentavos: 1_500_000, sinPrecio: true, loteId: null },
      ],
    },
    pago: {
      fecha: "2026-08-25",
      montoCentavos: 20_000_000,
      medioPago: "efectivo",
      via: "encargado",
      nota: "  Se lo dio a Laura ",
    },
  };

  it("resume entregadas, vendidas con y sin precio, deuda, ganancia y saldo final", () => {
    const r = resumirCarga(estado({ deudaCentavos: 1_000_000 }), input);
    expect(r.botellasEntregadas).toBe(30);
    expect(r.costoEntregaCentavos).toBe(30_000_000);
    expect(r.vendidasConPrecio).toBe(15);
    expect(r.vendidasSinPrecio).toBe(10);
    expect(r.deudaAntesCentavos).toBe(1_000_000);
    expect(r.costoVentasCentavos).toBe(25_000_000);
    expect(r.deudaDespuesVentasCentavos).toBe(26_000_000);
    expect(r.gananciaConPrecioCentavos).toBe(15 * 500_000);
    expect(r.pagoCentavos).toBe(20_000_000);
    expect(r.saldoFinalCentavos).toBe(6_000_000);
    // todas las botellas vendidas salen de la entrega que se está cargando
    expect(r.ventas.flatMap((v) => v.tramos).every((t) => t.entregaId === ENTREGA_NUEVA_ID)).toBe(true);
    expect(r.ventas[1].precioVentaCentavos).toBeNull();
    expect(r.ventas[1].gananciaCentavos).toBeNull();
  });

  it("precarga el pago con lo que debe después de las ventas", () => {
    const r = resumirCarga(estado({ deudaCentavos: 1_000_000 }), { ...input, pago: null });
    expect(montoPagoSugerido(r.deudaDespuesVentasCentavos)).toBe(26_000_000);
    expect(montoPagoSugerido(-5)).toBe(0);
  });

  it("no tiene nada para corregir", () => {
    expect(validarCarga(estado(), input, textos)).toEqual([]);
  });

  it("arma el pedido con las tres secciones", () => {
    expect(armarPedidoCarga(input)).toEqual({
      p_entrega: {
        fecha: "2026-08-10",
        permitir_negativo: false,
        items: [
          {
            producto_id: "p500",
            lote_id: "lote-x",
            cantidad: 30,
            costo_ananja_unitario_centavos: 1_000_000,
            precio_sugerido_centavos: 1_600_000,
          },
        ],
      },
      p_ventas: {
        fecha: "2026-08-20",
        medio_pago: null,
        items: [
          { producto_id: "p500", cantidad: 15, precio_venta_centavos: 1_500_000, lote_id: null },
          // "No sé a cuánto la vendió" manda null aunque haya quedado texto
          { producto_id: "p500", cantidad: 10, precio_venta_centavos: null, lote_id: null },
        ],
      },
      p_pago: {
        fecha: "2026-08-25",
        monto_centavos: 20_000_000,
        medio_pago: "efectivo",
        via: "encargado",
        nota: "Se lo dio a Laura",
      },
    });
  });

  it("precargas: fecha de ventas, «Todo lo entregado», disponible y precio sugerido", () => {
    expect(fechaVentasPorDefecto(input.entrega, HOY)).toBe("2026-08-10");
    expect(fechaVentasPorDefecto(null, HOY)).toBe(HOY);
    expect(entregadoPorProducto(input.entrega)).toEqual({ p500: 30 });
    const tramos = stockConEntregaNueva(
      estado({ items: [item({ id: "e1", productoId: "p250", cantidad: 4 })] }),
      input.entrega,
    );
    expect(disponiblePorProducto(tramos)).toEqual({ p250: 4, p500: 30 });
    expect(precioSugeridoVenta(tramos, "p500")).toBe(1_600_000);
  });
});

describe("ventas solo del stock existente", () => {
  const items = [
    item({ id: "e1", fecha: "2026-07-01", loteId: "lote-a", cantidad: 5, costoAnanjaUnitarioCentavos: 900_000 }),
    item({ id: "e2", fecha: "2026-08-01", loteId: "lote-b", cantidad: 10 }),
  ];
  const base = estado({
    items,
    ventas: [{ productoId: "p500", cantidad: 3, entregaItemId: "e1" }],
    deudaCentavos: 2_700_000,
  });

  it("toma primero lo que queda de la entrega más vieja", () => {
    const input: CargaInput = {
      ...vacio,
      ventas: {
        fecha: "2026-08-15",
        medioPago: "efectivo",
        filas: [{ productoId: "p500", cantidad: 6, precioVentaCentavos: 1_500_000, sinPrecio: false, loteId: null }],
      },
    };
    const r = resumirCarga(base, input);
    expect(r.ventas[0].tramos.map((t) => [t.entregaItemId, t.cantidad])).toEqual([
      ["e1", 2],
      ["e2", 4],
    ]);
    expect(r.costoVentasCentavos).toBe(2 * 900_000 + 4 * 1_000_000);
    expect(r.gananciaConPrecioCentavos).toBe(6 * 1_500_000 - 5_800_000);
    expect(r.deudaDespuesVentasCentavos).toBe(2_700_000 + 5_800_000);
    expect(r.botellasEntregadas).toBe(0);
    expect(validarCarga(base, input, textos)).toEqual([]);
    expect(armarPedidoCarga(input).p_entrega).toBeNull();
  });

  it("una entrega nueva con fecha más vieja se vende antes que las existentes", () => {
    const input: CargaInput = {
      entrega: {
        fecha: "2026-06-01",
        filas: [{ productoId: "p500", loteId: "lote-z", cantidad: 4, costoCentavos: 800_000, sugeridoCentavos: null }],
      },
      ventas: {
        fecha: "2026-08-15",
        medioPago: null,
        filas: [{ productoId: "p500", cantidad: 5, precioVentaCentavos: null, sinPrecio: true, loteId: null }],
      },
      pago: null,
    };
    const r = resumirCarga(base, input);
    expect(r.ventas[0].tramos.map((t) => [t.entregaId, t.cantidad])).toEqual([
      [ENTREGA_NUEVA_ID, 4],
      ["e-e1", 1],
    ]);
    expect(r.costoVentasCentavos).toBe(4 * 800_000 + 900_000);
  });

  it("la misma fecha que una entrega existente va después de ella", () => {
    const input: CargaInput = {
      entrega: {
        fecha: "2026-08-01",
        filas: [{ productoId: "p500", loteId: "lote-z", cantidad: 4, costoCentavos: 800_000, sugeridoCentavos: null }],
      },
      ventas: {
        fecha: "2026-08-15",
        medioPago: null,
        filas: [{ productoId: "p500", cantidad: 13, precioVentaCentavos: 1_500_000, sinPrecio: false, loteId: null }],
      },
      pago: null,
    };
    const r = resumirCarga(base, input);
    expect(r.ventas[0].tramos.map((t) => [t.entregaId, t.cantidad])).toEqual([
      ["e-e1", 2],
      ["e-e2", 10],
      [ENTREGA_NUEVA_ID, 1],
    ]);
  });

  it("avisa cuando carga más de las que va a tener", () => {
    const input: CargaInput = {
      ...vacio,
      ventas: {
        fecha: "2026-08-15",
        medioPago: null,
        filas: [
          { productoId: "p500", cantidad: 10, precioVentaCentavos: 1_500_000, sinPrecio: false, loteId: null },
          { productoId: "p500", cantidad: 3, precioVentaCentavos: null, sinPrecio: true, loteId: null },
        ],
      },
    };
    const problemas = validarCarga(base, input, textos);
    expect(problemas).toEqual([
      {
        seccion: "ventas",
        productoId: "p500",
        mensaje: "Botella 500 ml: va a tener 12 y cargaste 13 vendidas.",
      },
    ]);
  });

  it("usa el precio manual en entregas viejas sin costo, y sin ninguno no deja guardar", () => {
    const viejo = estado({
      items: [item({ id: "e0", costoAnanjaUnitarioCentavos: null })],
      preciosManuales: { p500: 700_000 },
    });
    const input: CargaInput = {
      ...vacio,
      ventas: {
        fecha: "2026-08-15",
        medioPago: null,
        filas: [{ productoId: "p500", cantidad: 2, precioVentaCentavos: null, sinPrecio: true, loteId: null }],
      },
    };
    expect(resumirCarga(viejo, input).costoVentasCentavos).toBe(1_400_000);
    const sinPrecioManual = { ...viejo, preciosManuales: {} };
    expect(validarCarga(sinPrecioManual, input, textos)[0].mensaje).toContain(
      "no tienen costo aprobado ni precio manual",
    );
  });
});

describe("pago solo", () => {
  const input: CargaInput = {
    ...vacio,
    pago: { fecha: HOY, montoCentavos: 3_000_000, medioPago: "banco", via: "directo_cuenta", nota: "" },
  };

  it("baja la deuda y no manda entrega ni ventas", () => {
    const r = resumirCarga(estado({ deudaCentavos: 3_000_000 }), input);
    expect(r.saldoFinalCentavos).toBe(0);
    expect(r.ventas).toEqual([]);
    expect(validarCarga(estado(), input, textos)).toEqual([]);
    expect(armarPedidoCarga(input)).toEqual({
      p_entrega: null,
      p_ventas: null,
      p_pago: { fecha: HOY, monto_centavos: 3_000_000, medio_pago: "banco", via: "directo_cuenta", nota: null },
    });
  });

  it("pide monto y medio", () => {
    const problemas = validarCarga(
      estado(),
      { ...vacio, pago: { ...input.pago!, montoCentavos: null, medioPago: null } },
      textos,
    );
    expect(problemas.map((p) => p.seccion)).toEqual(["pago", "pago"]);
  });
});

describe("ventas con precio desconocido", () => {
  it("suman a la deuda pero no a la ganancia", () => {
    const e = estado({ items: [item({ id: "e1" })] });
    const r = resumirCarga(e, {
      ...vacio,
      ventas: {
        fecha: "2026-08-15",
        medioPago: null,
        filas: [{ productoId: "p500", cantidad: 4, precioVentaCentavos: null, sinPrecio: true, loteId: null }],
      },
    });
    expect(r.vendidasSinPrecio).toBe(4);
    expect(r.vendidasConPrecio).toBe(0);
    expect(r.costoVentasCentavos).toBe(4_000_000);
    expect(r.gananciaConPrecioCentavos).toBe(0);
  });

  it("sin precio y sin marcar «No sé» pide el precio", () => {
    const e = estado({ items: [item({ id: "e1" })] });
    const problemas = validarCarga(
      e,
      {
        ...vacio,
        ventas: {
          fecha: "2026-08-15",
          medioPago: null,
          filas: [{ productoId: "p500", cantidad: 4, precioVentaCentavos: null, sinPrecio: false, loteId: null }],
        },
      },
      textos,
    );
    expect(problemas).toEqual([
      {
        seccion: "ventas",
        productoId: "p500",
        mensaje: "Cargá a cuánto vendió Botella 500 ml, o marcá «No sé a cuánto la vendió».",
      },
    ]);
  });
});

describe("venta con fecha anterior a la entrega", () => {
  const entrega = {
    fecha: "2026-09-10",
    filas: [{ productoId: "p500", loteId: "lote-x", cantidad: 10, costoCentavos: 1_000_000, sugeridoCentavos: null }],
  };

  it("es un error si las botellas salen de la entrega que se está cargando", () => {
    const problemas = validarCarga(
      estado(),
      {
        entrega,
        ventas: {
          fecha: "2026-09-05",
          medioPago: null,
          filas: [{ productoId: "p500", cantidad: 3, precioVentaCentavos: 1_500_000, sinPrecio: false, loteId: null }],
        },
        pago: null,
      },
      textos,
    );
    expect(problemas).toEqual([
      {
        seccion: "ventas",
        productoId: "p500",
        mensaje:
          "Botella 500 ml: las ventas son del 05/09/2026 pero salen de la entrega que estás cargando del 10/09/2026. Cambiá la fecha de las ventas.",
      },
    ]);
  });

  it("no es error si el stock que ya tenía alcanza, y sí cuando se pasa", () => {
    const e = estado({ items: [item({ id: "e1", cantidad: 5 })] });
    const ventas = (cantidad: number): CargaInput => ({
      entrega,
      ventas: {
        fecha: "2026-09-05",
        medioPago: null,
        filas: [{ productoId: "p500", cantidad, precioVentaCentavos: null, sinPrecio: true, loteId: null }],
      },
      pago: null,
    });
    expect(validarCarga(e, ventas(5), textos)).toEqual([]);
    expect(validarCarga(e, ventas(6), textos)[0].mensaje).toContain("la entrega que estás cargando");
  });

  it("traduce el error del RPC con la fecha de la entrega", () => {
    const err = traducirErrorCarga(
      "ventas:FECHA_ANTERIOR_A_ENTREGA",
      JSON.stringify({
        seccion: "ventas",
        fila: 0,
        producto_id: "p500",
        codigo: "FECHA_ANTERIOR_A_ENTREGA",
        detalle: JSON.stringify({ producto: "Botella 500 ml", producto_id: "p500", entrega_fecha: "2026-09-10" }),
      }),
      textos,
    );
    expect(err.seccion).toBe("ventas");
    expect(err.productoId).toBe("p500");
    expect(err.mensaje).toBe(
      "Ventas · Botella 500 ml: Las ventas salen de una entrega del 10/09/2026, posterior a la fecha de las ventas. Cambiá la fecha.",
    );
  });

  it("no deja fechas futuras", () => {
    const problemas = validarCarga(
      estado(),
      { entrega: { ...entrega, fecha: "2026-09-16" }, ventas: null, pago: null },
      textos,
    );
    expect(problemas).toEqual([
      { seccion: "entrega", mensaje: "La fecha de la entrega no puede ser posterior a hoy." },
    ]);
  });
});

describe("pago propio (0046_admin_pago_propio)", () => {
  it("un admin SÍ puede cargar su propio pago: valida como cualquier otro", () => {
    const problemas = validarCarga(
      estado(),
      { ...vacio, pago: { fecha: HOY, montoCentavos: 100, medioPago: "banco", via: "directo_cuenta", nota: "" } },
      textos,
    );
    expect(problemas).toEqual([]);
  });
});

describe("efectivo solo vía encargado", () => {
  const pago = (via: "encargado" | "directo_cuenta" | "cliente_directo"): CargaInput => ({
    ...vacio,
    pago: { fecha: HOY, montoCentavos: 100, medioPago: "efectivo", via, nota: "" },
  });

  it("efectivo directo a la cuenta es un error; a su encargado no", () => {
    expect(validarCarga(estado(), pago("directo_cuenta"), textos)).toEqual([
      {
        seccion: "pago",
        mensaje: "Si la plata fue directo a la cuenta no puede ser Efectivo: elegí Mercado Pago o Banco.",
      },
    ]);
    expect(validarCarga(estado(), pago("cliente_directo"), textos)).toHaveLength(1);
    expect(validarCarga(estado(), pago("encargado"), textos)).toEqual([]);
  });

  it("traduce MEDIO_INVALIDO del RPC", () => {
    expect(traducirErrorCarga("pago:MEDIO_INVALIDO", null, textos).mensaje).toBe(
      "Pago: Si la plata fue directo a la cuenta no puede ser Efectivo: elegí Mercado Pago o Banco.",
    );
  });
});

describe("reintento idempotente", () => {
  const input: CargaInput = {
    entrega: {
      fecha: "2026-08-10",
      filas: [
        { productoId: "p500", loteId: null, cantidad: 0, costoCentavos: null, sugeridoCentavos: null },
        { productoId: "p250", loteId: "lote-y", cantidad: 2, costoCentavos: 500_000, sugeridoCentavos: 900_000 },
      ],
    },
    ventas: null,
    pago: { fecha: HOY, montoCentavos: 1_000, medioPago: "mercado_pago", via: "cliente_directo", nota: "" },
  };

  it("el mismo formulario arma exactamente el mismo pedido (el RPC devuelve lo ya guardado)", () => {
    const primero = armarPedidoCarga(input);
    const reintento = armarPedidoCarga(structuredClone(input));
    expect(JSON.stringify(reintento)).toBe(JSON.stringify(primero));
    // las filas en 0 no viajan
    expect((primero.p_entrega as { items: unknown[] }).items).toHaveLength(1);
  });

  it("lee la respuesta de un reintento como «ya estaba guardada»", () => {
    const r = leerResultadoCarga({
      clave: "c-1",
      vendedor_id: "v-1",
      entrega_id: "ent-1",
      grupo_ids: [],
      rendicion_id: "ren-1",
      ya_existia: true,
    });
    expect(r).toEqual({
      clave: "c-1",
      entregaId: "ent-1",
      grupoIds: [],
      rendicionId: "ren-1",
      yaExistia: true,
    });
    expect(leerResultadoCarga({ clave: "c-2", entrega_id: null, ya_existia: false }).yaExistia).toBe(false);
  });

  it("si la misma clave llega con otros datos avisa que ya se había guardado", () => {
    const err = traducirErrorCarga("CARGA_YA_GUARDADA", "{}", textos);
    expect(err.seccion).toBe("general");
    expect(err.mensaje).toContain("ya se había guardado");
  });
});

describe("pagos informados sin confirmar", () => {
  it("se descuentan de la precarga del monto, nunca por debajo de cero", () => {
    expect(montoPagoSugerido(26_000_000, 6_000_000)).toBe(20_000_000);
    expect(montoPagoSugerido(1_000_000, 3_000_000)).toBe(0);
    expect(montoPagoSugerido(1_000_000)).toBe(1_000_000);
  });
});

describe("«Todo lo entregado» con stock anterior", () => {
  it("cuenta cuántas de las vendidas salen primero de lo que ya tenía", () => {
    const e = estado({
      items: [item({ id: "e1", fecha: "2026-07-01", cantidad: 3 })],
    });
    const entrega = {
      fecha: "2026-08-10",
      filas: [{ productoId: "p500", loteId: "l", cantidad: 10, costoCentavos: 1, sugeridoCentavos: null }],
    };
    const tramos = stockConEntregaNueva(e, entrega);
    expect(yaTeniaAntesDeLaEntrega(tramos, "p500", 10)).toBe(3);
    expect(yaTeniaAntesDeLaEntrega(stockConEntregaNueva(estado(), entrega), "p500", 10)).toBe(0);
  });
});

describe("lote precargado para una entrega histórica", () => {
  const lote = (loteId: string, fecha: string, quedan: number): LoteConStockDeProducto => ({
    loteId,
    productoId: "p500",
    fecha,
    quedan,
    costoUnitarioCentavos: null,
    precioMinoristaSugeridoCentavos: null,
    costoAnanjaCentavos: null,
  });
  const lotes = [lote("mayo", "2026-05-01", 4), lote("julio", "2026-07-01", 0), lote("sept", "2026-09-01", 50)];

  it("solo lotes producidos hasta la fecha de la entrega, el más viejo con stock", () => {
    expect(loteParaEntrega(lotes, "p500", "2026-08-10")?.loteId).toBe("mayo");
    expect(loteParaEntrega(lotes, "p500", "2026-09-15")?.loteId).toBe("mayo");
  });

  it("si ninguno tiene stock, se queda con el más nuevo igual (camino «Guardar igual»)", () => {
    const sinStock = [lote("mayo", "2026-05-01", 0), lote("julio", "2026-07-01", 0), lote("sept", "2026-09-01", 50)];
    expect(loteParaEntrega(sinStock, "p500", "2026-08-10")?.loteId).toBe("julio");
  });

  it("sin lotes hasta esa fecha, sin lote", () => {
    expect(loteParaEntrega(lotes, "p500", "2026-04-01")).toBeNull();
    expect(loteParaEntrega(lotes, "p250", "2026-09-15")).toBeNull();
  });
});

describe("errores generales y de la entrega", () => {
  it("una carga vacía no se puede revisar", () => {
    expect(validarCarga(estado(), vacio, textos)).toEqual([
      { seccion: "general", mensaje: "Sumá al menos una parte: la entrega, las ventas o el pago." },
    ]);
  });

  it("pide lo que le debe por botella en cada presentación entregada", () => {
    const problemas = validarCarga(
      estado(),
      {
        ...vacio,
        entrega: {
          fecha: HOY,
          filas: [{ productoId: "p250", loteId: "l", cantidad: 3, costoCentavos: null, sugeridoCentavos: null }],
        },
      },
      textos,
    );
    expect(problemas).toEqual([
      {
        seccion: "entrega",
        productoId: "p250",
        mensaje: "Completá cuánto le cobrás por cada una en Botella 250 ml.",
      },
    ]);
  });

  it("falta de stock en el lote permite «Guardar igual»", () => {
    const err = traducirErrorCarga(
      "entrega:STOCK_LOTE_INSUFICIENTE",
      JSON.stringify({
        seccion: "entrega",
        fila: null,
        producto_id: null,
        codigo: "STOCK_LOTE_INSUFICIENTE",
        detalle: JSON.stringify({ lote_id: "l", producto_id: "p250", disponible: 2 }),
      }),
      textos,
    );
    expect(err).toEqual({
      seccion: "entrega",
      codigo: "STOCK_LOTE_INSUFICIENTE",
      productoId: "p250",
      mensaje: "Entrega · Botella 250 ml: No quedan tantas en ese lote. Quedan 2.",
      permiteGuardarIgual: true,
      disponible: 2,
    });
  });

  it("un error desconocido o sin conexión da un mensaje genérico", () => {
    expect(traducirErrorCarga("TypeError: Failed to fetch", null, textos).mensaje).toContain(
      "si ya se había guardado, no se duplica",
    );
    expect(traducirErrorCarga("ventas:algo raro", null, textos).mensaje).toBe(
      "Ventas: No se pudo guardar esta parte. No se guardó nada; revisala y probá de nuevo.",
    );
  });

  it("STOCK_INSUFICIENTE_LOTE (0062) se traduce igual que la falta de stock en el depósito", () => {
    const err = traducirErrorCarga(
      "ventas:STOCK_INSUFICIENTE_LOTE",
      JSON.stringify({
        seccion: "ventas",
        fila: 0,
        producto_id: "p500",
        codigo: "STOCK_INSUFICIENTE_LOTE",
        detalle: JSON.stringify({ lote_id: "lote-b", producto_id: "p500", disponible: 3 }),
      }),
      textos,
    );
    expect(err).toEqual({
      seccion: "ventas",
      codigo: "STOCK_INSUFICIENTE_LOTE",
      productoId: "p500",
      mensaje: "Ventas · Botella 500 ml: No quedan tantas en ese lote. Quedan 3.",
      permiteGuardarIgual: false,
      disponible: 3,
    });
  });
});

// 0062_venta_revendedor_elegir_lote.sql: elegir lote al cargar una venta,
// FIFO entre todas las entregas como default (loteId: null).
describe("elegir lote al vender (0062)", () => {
  const items = [
    item({ id: "a1", fecha: "2026-08-01", loteId: "lote-a", cantidad: 10, costoAnanjaUnitarioCentavos: 1_000_000 }),
    item({ id: "b1", fecha: "2026-08-10", loteId: "lote-b", cantidad: 8, costoAnanjaUnitarioCentavos: 1_200_000 }),
  ];
  const base = estado({ items, deudaCentavos: 0 });

  it("sin elegir lote (loteId null): FIFO de siempre, cruza lote-a -> lote-b", () => {
    const input: CargaInput = {
      ...vacio,
      ventas: {
        fecha: "2026-08-15",
        medioPago: "efectivo",
        filas: [{ productoId: "p500", cantidad: 12, precioVentaCentavos: 1_500_000, sinPrecio: false, loteId: null }],
      },
    };
    const r = resumirCarga(base, input);
    expect(r.ventas[0].tramos.map((t) => [t.loteId, t.cantidad])).toEqual([
      ["lote-a", 10],
      ["lote-b", 2],
    ]);
    expect(validarCarga(base, input, textos)).toEqual([]);
  });

  it("eligiendo lote-b: sale SOLO de ahí, aunque lote-a (más viejo) tenga stock de sobra", () => {
    const input: CargaInput = {
      ...vacio,
      ventas: {
        fecha: "2026-08-15",
        medioPago: "efectivo",
        filas: [
          { productoId: "p500", cantidad: 5, precioVentaCentavos: 1_500_000, sinPrecio: false, loteId: "lote-b" },
        ],
      },
    };
    const r = resumirCarga(base, input);
    expect(r.ventas[0].tramos).toEqual([
      expect.objectContaining({ loteId: "lote-b", cantidad: 5, costoUnitarioCentavos: 1_200_000 }),
    ]);
    expect(r.costoVentasCentavos).toBe(5 * 1_200_000);
    expect(validarCarga(base, input, textos)).toEqual([]);
    expect(armarPedidoCarga(input).p_ventas).toEqual({
      fecha: "2026-08-15",
      medio_pago: "efectivo",
      items: [{ producto_id: "p500", cantidad: 5, precio_venta_centavos: 1_500_000, lote_id: "lote-b" }],
    });
  });

  it("pedir del lote elegido más de lo que tiene: faltante y aviso, aunque el total entre lotes alcance", () => {
    const input: CargaInput = {
      ...vacio,
      ventas: {
        fecha: "2026-08-15",
        medioPago: "efectivo",
        filas: [
          { productoId: "p500", cantidad: 9, precioVentaCentavos: 1_500_000, sinPrecio: false, loteId: "lote-b" },
        ],
      },
    };
    const r = resumirCarga(base, input);
    expect(r.ventas[0].faltante).toBe(1);
    const problemas = validarCarga(base, input, textos);
    expect(problemas).toEqual([
      {
        seccion: "ventas",
        productoId: "p500",
        mensaje: "Botella 500 ml: en ese lote va a tener 8 y cargaste 9 vendidas.",
      },
    ]);
  });

  it("dos líneas del mismo producto, cada una de un lote distinto: no se mezclan ni se pisa el aviso", () => {
    const input: CargaInput = {
      ...vacio,
      ventas: {
        fecha: "2026-08-15",
        medioPago: "efectivo",
        filas: [
          { productoId: "p500", cantidad: 3, precioVentaCentavos: 1_500_000, sinPrecio: false, loteId: "lote-a" },
          { productoId: "p500", cantidad: 9, precioVentaCentavos: 1_500_000, sinPrecio: false, loteId: "lote-b" },
        ],
      },
    };
    const r = resumirCarga(base, input);
    expect(r.ventas[0].tramos).toEqual([
      expect.objectContaining({ loteId: "lote-a", cantidad: 3 }),
    ]);
    expect(r.ventas[0].faltante).toBe(0);
    expect(r.ventas[1].faltante).toBe(1);
    const problemas = validarCarga(base, input, textos);
    expect(problemas).toEqual([
      {
        seccion: "ventas",
        productoId: "p500",
        mensaje: "Botella 500 ml: en ese lote va a tener 8 y cargaste 9 vendidas.",
      },
    ]);
  });
});

// Snapshot de protección (previa al refactor de `components/revendedores/
// carga-form.tsx` a `components/revendedores/carga/*`, sin cambio de
// comportamiento): el JSON que arma `armarPedidoCarga` para
// `registrar_carga_revendedor` tiene que seguir siendo BYTE A BYTE el mismo
// con entrega + ventas + pago juntos, incluyendo `null`s y el orden de las
// claves con el que Object.entries/JSON.stringify lo recorren.
describe("armarPedidoCarga: snapshot de protección del payload completo", () => {
  it("entrega + ventas (con y sin precio, con lote elegido) + pago", () => {
    const input: CargaInput = {
      entrega: {
        fecha: "2026-09-10",
        permitirNegativo: false,
        filas: [
          {
            productoId: "p500",
            loteId: "lote-a",
            cantidad: 12,
            costoCentavos: 1_000_000,
            sugeridoCentavos: 1_600_000,
          },
          { productoId: "p250", loteId: null, cantidad: 0, costoCentavos: null, sugeridoCentavos: null },
        ],
      },
      ventas: {
        fecha: "2026-09-11",
        medioPago: "efectivo",
        filas: [
          {
            productoId: "p500",
            cantidad: 5,
            precioVentaCentavos: 1_800_000,
            sinPrecio: false,
            loteId: null,
          },
          {
            productoId: "p500",
            cantidad: 2,
            precioVentaCentavos: null,
            sinPrecio: true,
            loteId: "lote-a",
          },
        ],
      },
      pago: {
        fecha: "2026-09-11",
        montoCentavos: 500_000,
        medioPago: "mercado_pago",
        via: "encargado",
        nota: "  con vuelto  ",
      },
    };

    // JSON.stringify byte a byte: mismo orden de claves y valores que espera
    // `registrar_carga_revendedor` (0043), calculado a mano acá para que un
    // cambio accidental en `armarPedidoCarga` durante el refactor lo rompa.
    const esperado = {
      p_entrega: {
        fecha: "2026-09-10",
        permitir_negativo: false,
        items: [
          {
            producto_id: "p500",
            lote_id: "lote-a",
            cantidad: 12,
            costo_ananja_unitario_centavos: 1_000_000,
            precio_sugerido_centavos: 1_600_000,
          },
        ],
      },
      p_ventas: {
        fecha: "2026-09-11",
        medio_pago: "efectivo",
        items: [
          { producto_id: "p500", cantidad: 5, precio_venta_centavos: 1_800_000, lote_id: null },
          { producto_id: "p500", cantidad: 2, precio_venta_centavos: null, lote_id: "lote-a" },
        ],
      },
      p_pago: {
        fecha: "2026-09-11",
        monto_centavos: 500_000,
        medio_pago: "mercado_pago",
        via: "encargado",
        nota: "con vuelto",
      },
    };

    const resultado = armarPedidoCarga(input);
    expect(resultado).toEqual(esperado);
    expect(JSON.stringify(resultado)).toBe(JSON.stringify(esperado));
  });

  it("las tres partes en null (nada cargado)", () => {
    const resultado = armarPedidoCarga(vacio);
    expect(resultado).toEqual({ p_entrega: null, p_ventas: null, p_pago: null });
    expect(JSON.stringify(resultado)).toBe(JSON.stringify({ p_entrega: null, p_ventas: null, p_pago: null }));
  });
});

describe("agarra directo del depósito (0073)", () => {
  // Tiene 12 en poder (10 + 2): la persona carga 20 vendidas.
  const conStock = estado({
    items: [
      item({ id: "i1", entregaId: "e1", cantidad: 10, fecha: "2026-08-01" }),
      item({ id: "i2", entregaId: "e2", cantidad: 2, fecha: "2026-08-02", costoAnanjaUnitarioCentavos: 900_000 }),
    ],
  });
  const ventas20: CargaInput = {
    ...vacio,
    ventas: {
      fecha: "2026-08-15",
      medioPago: null,
      filas: [{ productoId: "p500", cantidad: 20, precioVentaCentavos: 1_500_000, sinPrecio: false, loteId: null }],
    },
  };

  it("sin el flag, el faltante sigue siendo un problema que bloquea (igual que hoy)", () => {
    const problemas = validarCarga(conStock, ventas20, textos);
    expect(problemas).toEqual([
      { seccion: "ventas", productoId: "p500", mensaje: "Botella 500 ml: va a tener 12 y cargaste 20 vendidas." },
    ]);
    expect(resumirCarga(conStock, ventas20).botellasDelDeposito).toBe(0);
    expect(resumirCarga(conStock, ventas20).delDeposito).toEqual([]);
  });

  it("con el flag, el faltante deja de ser un problema y se informa cuántas salen del depósito", () => {
    const e = { ...conStock, tomaDirecto: true };
    expect(validarCarga(e, ventas20, textos)).toEqual([]);
    const r = resumirCarga(e, ventas20);
    expect(r.delDeposito).toEqual([{ productoId: "p500", cantidad: 8 }]);
    expect(r.botellasDelDeposito).toBe(8);
    // Solo las 12 propias suman a la deuda: lo del depósito lo fija el servidor.
    expect(r.costoVentasCentavos).toBe(10 * 1_000_000 + 2 * 900_000);
  });

  it("con el flag y sin nada en poder, todo sale del depósito", () => {
    const e = estado({ tomaDirecto: true });
    expect(validarCarga(e, ventas20, textos)).toEqual([]);
    expect(resumirCarga(e, ventas20).delDeposito).toEqual([{ productoId: "p500", cantidad: 20 }]);
  });

  it("con el flag y lote elegido, el faltante se mide contra ESE lote", () => {
    const e = { ...conStock, tomaDirecto: true };
    const conLote: CargaInput = {
      ...vacio,
      ventas: {
        fecha: "2026-08-15",
        medioPago: null,
        filas: [{ productoId: "p500", cantidad: 15, precioVentaCentavos: 1_500_000, sinPrecio: false, loteId: "lote-a" }],
      },
    };
    expect(validarCarga(e, conLote, textos)).toEqual([]);
    expect(resumirCarga(e, conLote).delDeposito).toEqual([{ productoId: "p500", cantidad: 3 }]);
  });

  it("con el flag, lo demás se sigue validando (fecha anterior a la entrega propia)", () => {
    const e = { ...conStock, tomaDirecto: true };
    const antes: CargaInput = {
      ...vacio,
      ventas: {
        fecha: "2026-07-01",
        medioPago: null,
        filas: [{ productoId: "p500", cantidad: 20, precioVentaCentavos: 1_500_000, sinPrecio: false, loteId: null }],
      },
    };
    const problemas = validarCarga(e, antes, textos);
    expect(problemas).toHaveLength(1);
    expect(problemas[0].mensaje).toContain("Cambiá la fecha de las ventas");
  });

  it("traduce los errores nuevos del servidor, con el detalle anidado de la carga unificada", () => {
    const err = traducirErrorCarga(
      "ventas:DEPOSITO_INSUFICIENTE",
      JSON.stringify({
        seccion: "ventas",
        fila: 0,
        producto_id: "p500",
        codigo: "DEPOSITO_INSUFICIENTE",
        detalle: JSON.stringify({ producto: "Botella 500 ml", producto_id: "p500", disponible: 4 }),
      }),
      textos,
    );
    expect(err).toMatchObject({ seccion: "ventas", codigo: "DEPOSITO_INSUFICIENTE", productoId: "p500", disponible: 4 });
    expect(err.mensaje).toBe(
      "Ventas · Botella 500 ml: No hay tantas en el depósito para cubrir lo que le falta. Quedan 4.",
    );
    expect(err.permiteGuardarIgual).toBe(false);
    expect(traducirErrorCarga("ventas:COSTO_FALTANTE", null, textos).mensaje).toContain("costos");
  });
});
