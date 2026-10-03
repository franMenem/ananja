import { describe, expect, it } from "vitest";

import {
  buscarProductoConLotesDescuadrados,
  calcularTotalPreciosComprobante,
  construirItemsPayloadComprobante,
  construirResumenDescuentoComprobante,
  interpretarErrorComprobante,
  resumenMesComprobantes,
  sincronizarPreciosSugeridosComprobante,
  tabComprobantesDeParam,
  validarComprobanteForm,
  type ComprobanteParaResumenMes,
} from "@/lib/dominio/comprobantes";

function comprobante(extra: Partial<ComprobanteParaResumenMes> = {}): ComprobanteParaResumenMes {
  return {
    fecha: "2026-09-05",
    monto_centavos: 100000,
    medio_pago: "efectivo",
    comprobante_items: [{ cantidad: 1 }],
    ...extra,
  };
}

describe("resumenMesComprobantes — sin comprobantes", () => {
  it("da todo en cero y sin medio más usado", () => {
    expect(resumenMesComprobantes([], "2026-09")).toEqual({
      cantidad: 0,
      totalCentavos: 0,
      unidades: 0,
      ticketPromedioCentavos: 0,
      medioMasUsado: null,
    });
  });
});

describe("resumenMesComprobantes — filtra por mes", () => {
  it("solo cuenta los comprobantes del mes pedido", () => {
    const rows = [
      comprobante({ fecha: "2026-09-01", monto_centavos: 100000 }),
      comprobante({ fecha: "2026-08-31", monto_centavos: 999999 }),
      comprobante({ fecha: "2026-09-30", monto_centavos: 200000 }),
    ];
    const resumen = resumenMesComprobantes(rows, "2026-09");
    expect(resumen.cantidad).toBe(2);
    expect(resumen.totalCentavos).toBe(300000);
  });
});

describe("resumenMesComprobantes — unidades y ticket promedio", () => {
  it("suma cantidades de todos los ítems y redondea el promedio", () => {
    const rows = [
      comprobante({
        monto_centavos: 100000,
        comprobante_items: [{ cantidad: 2 }, { cantidad: 3 }],
      }),
      comprobante({ monto_centavos: 50001, comprobante_items: [{ cantidad: 1 }] }),
    ];
    const resumen = resumenMesComprobantes(rows, "2026-09");
    expect(resumen.unidades).toBe(6);
    expect(resumen.totalCentavos).toBe(150001);
    expect(resumen.ticketPromedioCentavos).toBe(75001); // 150001 / 2 redondeado
  });
});

describe("resumenMesComprobantes — medio más usado", () => {
  it("elige el medio de pago con más comprobantes del mes", () => {
    const rows = [
      comprobante({ medio_pago: "efectivo" }),
      comprobante({ medio_pago: "banco" }),
      comprobante({ medio_pago: "banco" }),
    ];
    expect(resumenMesComprobantes(rows, "2026-09").medioMasUsado).toBe("banco");
  });

  it("ignora comprobantes de otros meses al elegir el medio más usado", () => {
    const rows = [
      comprobante({ fecha: "2026-08-01", medio_pago: "banco" }),
      comprobante({ fecha: "2026-08-01", medio_pago: "banco" }),
      comprobante({ fecha: "2026-09-01", medio_pago: "efectivo" }),
    ];
    expect(resumenMesComprobantes(rows, "2026-09").medioMasUsado).toBe("efectivo");
  });
});

// --- ComprobanteForm: ítems, validación y traducción de errores ---------

const PRODUCTO_A = { id: "prod-a", nombre: "Botella 750ml", presentacion_ml: 750 };
const PRODUCTO_B = { id: "prod-b", nombre: "Botella 500ml", presentacion_ml: 500 };

describe("construirItemsPayloadComprobante", () => {
  it("manda una sola fila sin lote_id cuando el producto no tiene split cargado", () => {
    const items = construirItemsPayloadComprobante(
      [PRODUCTO_A],
      { "prod-a": 5 },
      {},
      {},
    );
    expect(items).toEqual([{ producto_id: "prod-a", cantidad: 5, precio_unitario_centavos: undefined }]);
  });

  it("ignora productos con cantidad 0 o sin cargar", () => {
    const items = construirItemsPayloadComprobante(
      [PRODUCTO_A, PRODUCTO_B],
      { "prod-a": 0 },
      {},
      {},
    );
    expect(items).toEqual([]);
  });

  it("manda una fila por lote y fusiona duplicados", () => {
    const items = construirItemsPayloadComprobante(
      [PRODUCTO_A],
      { "prod-a": 5 },
      { "prod-a": [{ loteId: "lote-1", cantidad: 2 }, { loteId: "lote-1", cantidad: 1 }, { loteId: "lote-2", cantidad: 2 }] },
      {},
    );
    expect(items).toEqual([
      { producto_id: "prod-a", cantidad: 3, lote_id: "lote-1", precio_unitario_centavos: undefined },
      { producto_id: "prod-a", cantidad: 2, lote_id: "lote-2", precio_unitario_centavos: undefined },
    ]);
  });

  it("repite el precio por botella en cada fila del mismo producto", () => {
    const items = construirItemsPayloadComprobante(
      [PRODUCTO_A],
      { "prod-a": 5 },
      { "prod-a": [{ loteId: "lote-1", cantidad: 3 }, { loteId: "lote-2", cantidad: 2 }] },
      { "prod-a": "1.500,00" },
    );
    expect(items.every((i) => i.precio_unitario_centavos === 150000)).toBe(true);
  });

  it("omite el precio si el campo está vacío o resuelve a un número <= 0", () => {
    const items = construirItemsPayloadComprobante(
      [PRODUCTO_A],
      { "prod-a": 5 },
      {},
      { "prod-a": "0" },
    );
    expect(items[0].precio_unitario_centavos).toBeUndefined();
  });
});

describe("buscarProductoConLotesDescuadrados", () => {
  it("null si ningún producto tiene split cargado", () => {
    expect(
      buscarProductoConLotesDescuadrados([PRODUCTO_A], { "prod-a": 5 }, {}),
    ).toBeNull();
  });

  it("null si el split suma igual a la cantidad", () => {
    const lotesPorProducto = { "prod-a": [{ loteId: "lote-1", cantidad: 5 }] };
    expect(
      buscarProductoConLotesDescuadrados([PRODUCTO_A], { "prod-a": 5 }, lotesPorProducto),
    ).toBeNull();
  });

  it("devuelve el producto cuyo split no suma la cantidad total", () => {
    const lotesPorProducto = { "prod-a": [{ loteId: "lote-1", cantidad: 3 }] };
    expect(
      buscarProductoConLotesDescuadrados([PRODUCTO_A], { "prod-a": 5 }, lotesPorProducto),
    ).toBe(PRODUCTO_A);
  });
});

describe("construirResumenDescuentoComprobante", () => {
  it("junta las presentaciones vendidas de mayor a menor", () => {
    const resumen = construirResumenDescuentoComprobante(
      [PRODUCTO_B, PRODUCTO_A],
      { "prod-a": 2, "prod-b": 1 },
    );
    expect(resumen).toBe("2×750 ml y 1×500 ml");
  });

  it("cadena vacía sin nada cargado", () => {
    expect(construirResumenDescuentoComprobante([PRODUCTO_A], {})).toBe("");
  });
});

describe("calcularTotalPreciosComprobante", () => {
  it("null si ningún producto tiene precio cargado", () => {
    expect(calcularTotalPreciosComprobante([PRODUCTO_A], { "prod-a": 2 }, {})).toBeNull();
  });

  it("suma cantidad × precio de los productos con precio cargado", () => {
    const total = calcularTotalPreciosComprobante(
      [PRODUCTO_A, PRODUCTO_B],
      { "prod-a": 2, "prod-b": 1 },
      { "prod-a": "1.000,00", "prod-b": "500,00" },
    );
    expect(total).toBe(250000);
  });
});

describe("sincronizarPreciosSugeridosComprobante", () => {
  it("no toca el precio de un producto ya tocado a mano", () => {
    const sugeridos = new Map([["lote-1:prod-a", 100000]]);
    const prev = { "prod-a": "50,00" };
    const next = sincronizarPreciosSugeridosComprobante(
      prev,
      [PRODUCTO_A],
      { "prod-a": 1 },
      { "prod-a": [{ loteId: "lote-1", cantidad: 1 }] },
      { "prod-a": true },
      sugeridos,
    );
    expect(next).toBe(prev);
  });

  it("precarga el sugerido del primer lote elegido si no está tocado", () => {
    const sugeridos = new Map([["lote-1:prod-a", 100000]]);
    const next = sincronizarPreciosSugeridosComprobante(
      {},
      [PRODUCTO_A],
      { "prod-a": 1 },
      { "prod-a": [{ loteId: "lote-1", cantidad: 1 }] },
      {},
      sugeridos,
    );
    expect(next["prod-a"]).toBe("1.000,00");
  });

  it("devuelve el mismo objeto si no hay ningún cambio", () => {
    const prev = { "prod-a": "1.000,00" };
    const sugeridos = new Map([["lote-1:prod-a", 100000]]);
    const next = sincronizarPreciosSugeridosComprobante(
      prev,
      [PRODUCTO_A],
      { "prod-a": 1 },
      { "prod-a": [{ loteId: "lote-1", cantidad: 1 }] },
      {},
      sugeridos,
    );
    expect(next).toBe(prev);
  });
});

describe("validarComprobanteForm", () => {
  function inputValido(extra: Partial<Parameters<typeof validarComprobanteForm>[0]> = {}) {
    return {
      uploading: false,
      montoInput: "1.000,00",
      cobradoCentavos: 100000,
      clienteId: null,
      medioPago: "efectivo" as const,
      itemsCount: 1,
      productos: [PRODUCTO_A],
      cantidades: { "prod-a": 1 },
      precios: {},
      lotesPorProducto: {},
      ...extra,
    };
  }

  it("ok con un formulario válido", () => {
    const resultado = validarComprobanteForm(inputValido());
    expect(resultado).toEqual({
      ok: true,
      montoCentavos: 100000,
      cobradoCentavos: 100000,
      medioPago: "efectivo",
    });
  });

  it("bloquea mientras se está subiendo la foto", () => {
    const resultado = validarComprobanteForm(inputValido({ uploading: true }));
    expect(resultado).toEqual({ ok: false, error: "Esperá a que termine de subir la foto." });
  });

  it("exige un monto válido", () => {
    expect(validarComprobanteForm(inputValido({ montoInput: "" }))).toEqual({
      ok: false,
      error: "Ingresá un monto válido.",
    });
    expect(validarComprobanteForm(inputValido({ montoInput: "0" }))).toEqual({
      ok: false,
      error: "Ingresá un monto válido.",
    });
  });

  it("exige que 'cobrado ahora' se pueda entender", () => {
    const resultado = validarComprobanteForm(inputValido({ cobradoCentavos: null }));
    expect(resultado).toEqual({
      ok: false,
      error: "Revisá lo cobrado ahora: hay una cuenta sin terminar o un número que no se entiende.",
    });
  });

  it("lo cobrado no puede superar el monto", () => {
    const resultado = validarComprobanteForm(
      inputValido({ montoInput: "1.000,00", cobradoCentavos: 200000 }),
    );
    expect(resultado).toEqual({ ok: false, error: "Lo cobrado no puede superar el monto." });
  });

  it("venta a crédito (cobrado < monto) exige cliente", () => {
    const resultado = validarComprobanteForm(
      inputValido({ montoInput: "1.000,00", cobradoCentavos: 50000, clienteId: null }),
    );
    expect(resultado).toEqual({ ok: false, error: "Para dejar saldo a cobrar elegí un cliente." });
  });

  it("exige medio de pago", () => {
    const resultado = validarComprobanteForm(inputValido({ medioPago: null }));
    expect(resultado).toEqual({ ok: false, error: "Elegí un medio de pago." });
  });

  it("exige al menos un ítem", () => {
    const resultado = validarComprobanteForm(inputValido({ itemsCount: 0 }));
    expect(resultado).toEqual({
      ok: false,
      error: "Indicá cuántas botellas se vendieron.",
    });
  });

  it("bloquea si el split por lote de un producto está descuadrado", () => {
    const resultado = validarComprobanteForm(
      inputValido({
        cantidades: { "prod-a": 5 },
        lotesPorProducto: { "prod-a": [{ loteId: "lote-1", cantidad: 3 }] },
      }),
    );
    expect(resultado).toEqual({
      ok: false,
      error: "Revisá de qué lote sale Botella 750ml: las cantidades por lote no suman 5.",
    });
  });

  it("exige que el precio por botella cargado sea mayor a 0", () => {
    const resultado = validarComprobanteForm(inputValido({ precios: { "prod-a": "0" } }));
    expect(resultado).toEqual({
      ok: false,
      error: "El precio por botella de Botella 750ml tiene que ser mayor a $ 0.",
    });
  });
});

describe("interpretarErrorComprobante", () => {
  it("traduce un código conocido a su mensaje", () => {
    expect(interpretarErrorComprobante({ message: "MONTO_INVALIDO" }, [])).toEqual({
      tipo: "error",
      mensaje: "Ingresá un monto válido.",
    });
  });

  it("cae al mensaje de conexión con un código desconocido", () => {
    expect(interpretarErrorComprobante({ message: "ALGO_RARO" }, [])).toEqual({
      tipo: "error",
      mensaje:
        "No se pudo guardar por un problema de conexión. Los datos quedaron cargados: revisá tu conexión e intentá de nuevo.",
    });
  });

  it("STOCK_INSUFICIENTE arma la alerta desde error.details", () => {
    const resultado = interpretarErrorComprobante(
      { message: "STOCK_INSUFICIENTE", details: JSON.stringify({ producto: "Botella 750ml", disponible: 3 }) },
      [],
    );
    expect(resultado).toEqual({ tipo: "stock", alerta: { producto: "Botella 750ml", disponible: 3 } });
  });

  it("STOCK_INSUFICIENTE con details inválido usa los valores por defecto", () => {
    const resultado = interpretarErrorComprobante({ message: "STOCK_INSUFICIENTE", details: "{no-json" }, []);
    expect(resultado).toEqual({ tipo: "stock", alerta: { producto: "el producto", disponible: 0 } });
  });

  it("STOCK_LOTE_INSUFICIENTE resuelve el nombre del producto por id", () => {
    const resultado = interpretarErrorComprobante(
      {
        message: "STOCK_LOTE_INSUFICIENTE",
        details: JSON.stringify({ producto_id: "prod-a", disponible: 2 }),
      },
      [PRODUCTO_A],
    );
    expect(resultado).toEqual({ tipo: "stock", alerta: { producto: "Botella 750ml", disponible: 2 } });
  });
});

describe("tabComprobantesDeParam", () => {
  it("'pagos' abre la pestaña de pagos", () => {
    expect(tabComprobantesDeParam("pagos")).toBe("pagos");
    expect(tabComprobantesDeParam(["pagos", "ventas"])).toBe("pagos");
  });

  it("sin param, 'ventas' o cualquier valor raro cae en ventas", () => {
    expect(tabComprobantesDeParam(undefined)).toBe("ventas");
    expect(tabComprobantesDeParam("ventas")).toBe("ventas");
    expect(tabComprobantesDeParam("otra")).toBe("ventas");
    expect(tabComprobantesDeParam([])).toBe("ventas");
  });
});
