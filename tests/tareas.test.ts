import { describe, expect, it } from "vitest";

import {
  agruparPedidosPorPagar,
  calcularTareas,
  comprobantePathDeTarea,
  conComprobanteUrl,
  contarTareasPendientes,
  diasEntre,
  esPedidoViejoSinCostos,
  faltantesCostosLote,
  fechaPlataEnManoMasVieja,
  fechaVentaImpagaMasVieja,
  filtrarDeudasNegocioPendientes,
  ordenarTareas,
  type CalcularTareasInput,
  type DepositoInformadoTarea,
  type DeudaNegocioFila,
  type LoteCostosInput,
  type PagoPorConfirmarTarea,
  type PlataEnManoTarea,
  type Tarea,
  validarMontoDeposito,
} from "@/lib/dominio/tareas";

const HOY = "2026-09-15";
const YO = "yo-id";

const BASE: CalcularTareasInput = {
  hoy: HOY,
  miVendedorId: YO,
  pagosPorConfirmar: [],
  depositosInformados: [],
  plataEnManos: [],
  pedidosPorPagar: [],
  deudasNegocio: [],
  revendedorasConDeuda: [],
  revendedorasSinPrecio: [],
  lotesIncompletos: [],
  stock: [],
  insumos: [],
  clientesConDeuda: [],
};

function pago(extra: Partial<PagoPorConfirmarTarea> = {}): PagoPorConfirmarTarea {
  return {
    pago_id: "p1",
    vendedor_id: "ana-id",
    vendedor_nombre: "Ana",
    monto_centavos: 500000,
    medio_pago: "mercado_pago",
    fecha: HOY,
    informado_el: HOY,
    destinatario_id: YO,
    destinatario_nombre: "Yo",
    destinatario_activo: true,
    destinatario_es_coordinador: false,
    imagen_path: null,
    ...extra,
  };
}

function depositoInformado(extra: Partial<DepositoInformadoTarea> = {}): DepositoInformadoTarea {
  return {
    deposito_informado_id: "d1",
    tenedor_id: "laura-id",
    tenedor_nombre: "Laura",
    monto_centavos: 400_000_00,
    medio_pago: "mercado_pago",
    informado_el: HOY,
    imagen_path: null,
    ...extra,
  };
}

describe("diasEntre", () => {
  it("cuenta días completos entre fechas puras, cruzando meses", () => {
    expect(diasEntre("2026-08-31", "2026-09-02")).toBe(2);
    expect(diasEntre(HOY, HOY)).toBe(0);
  });
});

describe("sin nada pendiente", () => {
  it("da una lista vacía", () => {
    expect(calcularTareas(BASE)).toEqual([]);
  });
});

describe("confirmar pago de revendedora — a quién le toca y urgencia", () => {
  it("le toca al encargado destinatario", () => {
    const tareas = calcularTareas({ ...BASE, pagosPorConfirmar: [pago()] });
    expect(tareas).toHaveLength(1);
    expect(tareas[0].tipo).toBe("confirmar_pago_revendedor");
    expect(tareas[0].accion).toMatchObject({ tipo: "confirmar_pago", pagoId: "p1", destino: "A vos" });
  });

  it("no le toca a otro admin si el encargado está activo", () => {
    const tareas = calcularTareas({
      ...BASE,
      pagosPorConfirmar: [pago({ destinatario_id: "otro-admin", destinatario_nombre: "Laura" })],
    });
    expect(tareas).toEqual([]);
  });

  it("le toca a cualquier admin si fue a la Cuenta Ananja o si el encargado ya no está activo", () => {
    const tareas = calcularTareas({
      ...BASE,
      pagosPorConfirmar: [
        pago({ pago_id: "cuenta", destinatario_id: null, destinatario_nombre: null }),
        pago({ pago_id: "inactivo", destinatario_id: "otro", destinatario_activo: false }),
      ],
    });
    expect(tareas.map((t) => t.id).sort()).toEqual(["confirmar-pago-cuenta", "confirmar-pago-inactivo"]);
  });

  it("le toca a cualquier admin si el destinatario es un coordinador activo (0055, BLOCKER corregido)", () => {
    const tareas = calcularTareas({
      ...BASE,
      pagosPorConfirmar: [
        pago({
          pago_id: "coord",
          destinatario_id: "coord-1",
          destinatario_nombre: "Martín",
          destinatario_activo: true,
          destinatario_es_coordinador: true,
        }),
      ],
    });
    expect(tareas).toHaveLength(1);
    expect(tareas[0].accion).toMatchObject({ tipo: "confirmar_pago", destino: "A Martín" });
  });

  it("le toca a quien pagó, si es un admin (pago propio, 0046)", () => {
    const tareas = calcularTareas({
      ...BASE,
      pagosPorConfirmar: [pago({ vendedor_id: YO, destinatario_id: null })],
    });
    expect(tareas).toHaveLength(1);
    expect(tareas[0].accion).toMatchObject({ tipo: "confirmar_pago", destino: `A la cuenta de Ananja` });
  });

  it("le toca a quien pagó aunque el destinatario sea otro admin activo (pago propio, 0046)", () => {
    const tareas = calcularTareas({
      ...BASE,
      pagosPorConfirmar: [
        pago({ vendedor_id: YO, destinatario_id: "otro-admin", destinatario_nombre: "Laura" }),
      ],
    });
    expect(tareas).toHaveLength(1);
    expect(tareas[0].accion).toMatchObject({ tipo: "confirmar_pago", destino: "A Laura" });
  });

  it("es urgente si lleva más de 2 días sin confirmar", () => {
    const [dosDias] = calcularTareas({ ...BASE, pagosPorConfirmar: [pago({ informado_el: "2026-09-13" })] });
    const [tresDias] = calcularTareas({ ...BASE, pagosPorConfirmar: [pago({ informado_el: "2026-09-12" })] });
    expect(dosDias.urgencia).toBe("normal");
    expect(tresDias.urgencia).toBe("urgente");
  });
});

/**
 * Depósito que un coordinador avisó (0057_coordinador_plata_stock.sql,
 * `informar_deposito_cuenta`) — a diferencia de un pago de revendedora no
 * hay destinatario: le toca a CUALQUIER admin, sin importar `miVendedorId`.
 */
describe("confirmar depósito informado por un coordinador", () => {
  it("le toca a cualquier admin, con el nombre del coordinador y el monto", () => {
    const [tarea] = calcularTareas({ ...BASE, depositosInformados: [depositoInformado()] });
    expect(tarea.tipo).toBe("confirmar_deposito_informado");
    expect(tarea.etiqueta).toBe("Plata");
    expect(tarea.titulo).toBe("Confirmar $ 400.000,00 que pasó Laura");
    expect(tarea.accion).toEqual({
      tipo: "confirmar_deposito",
      depositoInformadoId: "d1",
      montoCentavos: 400_000_00,
      medioPago: "mercado_pago",
      tenedorNombre: "Laura",
      imagenPath: null,
    });
  });

  it("lleva el path del comprobante que adjuntó (0071)", () => {
    const [tarea] = calcularTareas({
      ...BASE,
      depositosInformados: [depositoInformado({ imagen_path: "coordinadores/laura-id/2026/09/a.jpg" })],
    });
    expect(tarea.accion).toMatchObject({ tipo: "confirmar_deposito", imagenPath: "coordinadores/laura-id/2026/09/a.jpg" });
  });

  it("le toca a cualquier admin aunque miVendedorId sea null o distinto del tenedor", () => {
    const conMiId = calcularTareas({ ...BASE, miVendedorId: "otro-admin", depositosInformados: [depositoInformado()] });
    const sinMiId = calcularTareas({ ...BASE, miVendedorId: null, depositosInformados: [depositoInformado()] });
    expect(conMiId).toHaveLength(1);
    expect(sinMiId).toHaveLength(1);
  });

  it("es urgente si lleva más de 2 días sin confirmar", () => {
    const [dosDias] = calcularTareas({ ...BASE, depositosInformados: [depositoInformado({ informado_el: "2026-09-13" })] });
    const [tresDias] = calcularTareas({ ...BASE, depositosInformados: [depositoInformado({ informado_el: "2026-09-12" })] });
    expect(dosDias.urgencia).toBe("normal");
    expect(tresDias.urgencia).toBe("urgente");
  });

  it("suma varios depósitos informados como tareas separadas", () => {
    const tareas = calcularTareas({
      ...BASE,
      depositosInformados: [depositoInformado({ deposito_informado_id: "d1" }), depositoInformado({ deposito_informado_id: "d2", tenedor_nombre: "Martín" })],
    });
    expect(tareas).toHaveLength(2);
  });
});

function plata(extra: Partial<PlataEnManoTarea> = {}): PlataEnManoTarea {
  return { tenedor_id: YO, nombre: "Fran", total_centavos: 250000, activo: true, desde: "2026-09-10", ...extra };
}

describe("plata en mano — quien la tiene", () => {
  it("dice 'Tenés' y ofrece depositar", () => {
    const [tarea] = calcularTareas({ ...BASE, plataEnManos: [plata()] });
    expect(tarea.titulo).toBe("Tenés $ 2.500,00 en mano para pasar a la cuenta");
    expect(tarea.detalle).toContain("hace 5 días");
    expect(tarea.urgencia).toBe("normal");
    expect(tarea.accion).toEqual({ tipo: "depositar", tenedorId: YO, montoCentavos: 250000, tenedorNombre: null });
    expect(contarTareasPendientes([tarea])).toBe(1);
  });

  it("es urgente con más de 7 días", () => {
    const [siete] = calcularTareas({ ...BASE, plataEnManos: [plata({ total_centavos: 1, desde: "2026-09-08" })] });
    const [ocho] = calcularTareas({ ...BASE, plataEnManos: [plata({ total_centavos: 1, desde: "2026-09-07" })] });
    expect(siete.urgencia).toBe("normal");
    expect(ocho.urgencia).toBe("urgente");
    expect(contarTareasPendientes([ocho])).toBe(1);
  });

  it("no aparece si el total no es positivo", () => {
    expect(calcularTareas({ ...BASE, plataEnManos: [plata({ total_centavos: 0 })] })).toEqual([]);
    expect(calcularTareas({ ...BASE, plataEnManos: [plata({ total_centavos: -50 })] })).toEqual([]);
  });
});

describe("plata en mano — los demás admins", () => {
  const laura = plata({ tenedor_id: "laura", nombre: "Laura", total_centavos: 80000 });

  it("la ven como aviso con el nombre, link a /plata y 'Registrar que lo pasó'", () => {
    const [tarea] = calcularTareas({ ...BASE, plataEnManos: [laura] });
    expect(tarea.titulo).toBe("Laura tiene $ 800,00 para pasar a la cuenta");
    expect(tarea.detalle).toContain("hace 5 días");
    expect(tarea.etiqueta).toBe("Plata");
    expect(tarea.urgencia).toBe("informativo");
    expect(tarea.href).toBe("/plata");
    expect(tarea.accion).toEqual({
      tipo: "depositar",
      tenedorId: "laura",
      montoCentavos: 80000,
      tenedorNombre: "Laura",
    });
  });

  it("con más de 7 días pasa a normal, pero nunca urgente (aunque sigue contando en el total)", () => {
    const [tarea] = calcularTareas({ ...BASE, plataEnManos: [{ ...laura, desde: "2026-08-01" }] });
    expect(tarea.urgencia).toBe("normal");
    expect(contarTareasPendientes([tarea])).toBe(1);
  });

  it("el total cuenta la plata de todos, no solo la de quien mira (badge = página)", () => {
    const input = {
      ...BASE,
      plataEnManos: [plata({ desde: "2026-09-01" }), { ...laura, desde: "2026-08-01" }],
    };
    const mias = calcularTareas(input);
    expect(mias.map((t) => t.titulo)).toEqual([
      "Tenés $ 2.500,00 en mano para pasar a la cuenta",
      "Laura tiene $ 800,00 para pasar a la cuenta",
    ]);
    expect(contarTareasPendientes(mias)).toBe(2);

    // Mismas filas vistas por Laura: cambia a quién le toca cada una, pero
    // el total sigue siendo 2 (misma cantidad de tareas en la lista).
    const deLaura = calcularTareas({ ...input, miVendedorId: "laura" });
    expect(deLaura.find((t) => t.accion?.tipo === "depositar" && t.accion.tenedorId === "laura")?.titulo).toBe(
      "Tenés $ 800,00 en mano para pasar a la cuenta",
    );
    expect(deLaura.find((t) => t.accion?.tipo === "depositar" && t.accion.tenedorId === YO)?.titulo).toBe(
      "Fran tiene $ 2.500,00 para pasar a la cuenta",
    );
    expect(contarTareasPendientes(deLaura)).toBe(2);
  });

  it("sin sesión de vendedor (miVendedorId null) todas son de otra persona, pero igual cuentan", () => {
    const tareas = calcularTareas({ ...BASE, miVendedorId: null, plataEnManos: [plata()] });
    expect(tareas[0].titulo).toBe("Fran tiene $ 2.500,00 para pasar a la cuenta");
    expect(contarTareasPendientes(tareas)).toBe(1);
  });

  it("si quien la tiene ya no es admin activo, sale sin botón (el RPC lo rechazaría)", () => {
    const [tarea] = calcularTareas({ ...BASE, plataEnManos: [{ ...laura, activo: false }] });
    expect(tarea.titulo).toBe("Laura tiene $ 800,00 para pasar a la cuenta");
    expect(tarea.accion).toBeUndefined();
  });

  it("sin antigüedad calculada sale igual, como informativa", () => {
    const [tarea] = calcularTareas({ ...BASE, plataEnManos: [{ ...laura, desde: null }] });
    expect(tarea.urgencia).toBe("informativo");
    expect(tarea.detalle).toBe("Todavía no la pasó a la cuenta de Ananja.");
  });
});

describe("validarMontoDeposito", () => {
  it("acepta el monto precargado o una parte", () => {
    expect(validarMontoDeposito("2.500,00", 250000)).toEqual({ tipo: "ok", centavos: 250000 });
    expect(validarMontoDeposito("1000", 250000)).toEqual({ tipo: "ok", centavos: 100000 });
  });

  it("rechaza vacío, cero, negativo o texto inválido", () => {
    for (const texto of ["", "0", "0,00", "-5", "abc"]) {
      expect(validarMontoDeposito(texto, 250000)).toEqual({ tipo: "invalido" });
    }
  });

  it("si supera lo disponible pide elegir; con 'Guardar igual' lo deja pasar", () => {
    expect(validarMontoDeposito("2.500,01", 250000)).toEqual({
      tipo: "excede",
      centavos: 250001,
      disponibleCentavos: 250000,
    });
    expect(validarMontoDeposito("2.500,01", 250000, true)).toEqual({ tipo: "ok", centavos: 250001 });
  });
});

describe("fechaPlataEnManoMasVieja (FIFO)", () => {
  it("lo que queda en mano son los ingresos más nuevos", () => {
    const ingresos = [
      { fecha: "2026-09-01", montoCentavos: 1000 },
      { fecha: "2026-09-05", montoCentavos: 500 },
      { fecha: "2026-09-10", montoCentavos: 300 },
    ];
    // Saldo 700: cubren el del 10 (300) y parte del 5 → la más vieja es del 5.
    expect(fechaPlataEnManoMasVieja(ingresos, 700)).toBe("2026-09-05");
    expect(fechaPlataEnManoMasVieja(ingresos, 300)).toBe("2026-09-10");
    expect(fechaPlataEnManoMasVieja(ingresos, 1800)).toBe("2026-09-01");
  });

  it("si los ingresos no alcanzan (ajuste), toma el más viejo; sin saldo o sin ingresos, null", () => {
    expect(fechaPlataEnManoMasVieja([{ fecha: "2026-09-03", montoCentavos: 100 }], 500)).toBe("2026-09-03");
    expect(fechaPlataEnManoMasVieja([{ fecha: "2026-09-03", montoCentavos: 100 }], 0)).toBeNull();
    expect(fechaPlataEnManoMasVieja([], 500)).toBeNull();
  });
});

describe("fechaVentaImpagaMasVieja (FIFO de deuda)", () => {
  const ventas = [
    { fecha: "2026-08-20", montoCentavos: 1000 },
    { fecha: "2026-07-01", montoCentavos: 1000 },
    { fecha: "2026-09-01", montoCentavos: 1000 },
  ];

  it("lo entregado paga primero las ventas más viejas", () => {
    expect(fechaVentaImpagaMasVieja(ventas, 0)).toBe("2026-07-01");
    expect(fechaVentaImpagaMasVieja(ventas, 1000)).toBe("2026-08-20");
    expect(fechaVentaImpagaMasVieja(ventas, 1500)).toBe("2026-08-20");
    expect(fechaVentaImpagaMasVieja(ventas, 2000)).toBe("2026-09-01");
  });

  it("todo pago da null", () => {
    expect(fechaVentaImpagaMasVieja(ventas, 3000)).toBeNull();
  });
});

describe("revendedora con deuda vieja", () => {
  const deudora = (desde: string | null, extra = {}) => ({
    vendedor_id: "ana-id",
    nombre: "Ana",
    saldo_centavos: 400000,
    venta_impaga_desde: desde,
    ...extra,
  });

  it("no aparece con 30 días o menos", () => {
    expect(calcularTareas({ ...BASE, revendedorasConDeuda: [deudora("2026-08-16")] })).toEqual([]);
  });

  it("normal con más de 30, urgente con más de 60", () => {
    const [normal] = calcularTareas({ ...BASE, revendedorasConDeuda: [deudora("2026-08-15")] });
    const [urgente] = calcularTareas({ ...BASE, revendedorasConDeuda: [deudora("2026-07-16")] });
    expect(normal.urgencia).toBe("normal");
    expect(normal.titulo).toBe("Ana debe $ 4.000,00 desde hace 31 días");
    expect(urgente.urgencia).toBe("urgente");
  });

  it("nunca muestra mi propia deuda", () => {
    expect(
      calcularTareas({ ...BASE, revendedorasConDeuda: [deudora("2026-01-01", { vendedor_id: YO })] }),
    ).toEqual([]);
  });
});

describe("ventas sin precio", () => {
  it("una tarea normal por revendedora, sin la mía", () => {
    const tareas = calcularTareas({
      ...BASE,
      revendedorasSinPrecio: [
        { vendedor_id: "ana-id", nombre: "Ana", unidades_sin_precio: 3 },
        { vendedor_id: YO, nombre: "Yo", unidades_sin_precio: 2 },
      ],
    });
    expect(tareas).toHaveLength(1);
    expect(tareas[0].href).toBe("/revendedores/ana-id");
    expect(tareas[0].urgencia).toBe("normal");
  });
});

describe("faltantesCostosLote", () => {
  const presentaciones = new Map<string, number | null>([
    ["p500", 500],
    ["p250", 250],
  ]);
  const completo: LoteCostosInput = {
    loteId: "l1",
    fecha: "2026-08-15",
    dolarCentavos: 100000,
    precioLitroAceiteUsdCentavos: 500,
    productoIds: ["p500", "p250"],
    costos: [
      { concepto: "envase", productoId: "p500", costoUnitarioCentavos: 181500, totalCentavos: 36300000 },
      { concepto: "envase", productoId: "p250", costoUnitarioCentavos: 121000, totalCentavos: 12100000 },
      { concepto: "transporte", productoId: "p500", costoUnitarioCentavos: null, totalCentavos: 9000000 },
    ],
    tieneGastosViejos: false,
  };

  it("una línea de envase en $ 0 cuenta como cargada", () => {
    const lote = {
      ...completo,
      costos: completo.costos.map((c) =>
        c.productoId === "p250" && c.concepto === "envase" ? { ...c, costoUnitarioCentavos: 0, totalCentavos: 0 } : c,
      ),
    };
    expect(faltantesCostosLote(lote, presentaciones)).toEqual([]);
  });

  it("pedido viejo: sin líneas de costos pero con gastos viejos → informativa, no pide cada costo", () => {
    const viejo = { ...completo, dolarCentavos: null, costos: [], tieneGastosViejos: true };
    expect(esPedidoViejoSinCostos(viejo)).toBe(true);
    expect(esPedidoViejoSinCostos({ ...viejo, tieneGastosViejos: false })).toBe(false);
    const [tarea] = calcularTareas({
      ...BASE,
      lotesIncompletos: [{ loteId: "l0", fecha: "2026-05-01", faltantes: [], viejo: true }],
    });
    expect(tarea.urgencia).toBe("informativo");
    expect(tarea.titulo).toBe("Pedido viejo sin costos: del 01/05/2026");
    expect(contarTareasPendientes([tarea])).toBe(1);
  });

  it("un pedido completo (como el de prod) no tiene faltantes", () => {
    expect(faltantesCostosLote(completo, presentaciones)).toEqual([]);
  });

  it("aceite: vale el dólar + USD, o una línea con precio en pesos", () => {
    const sinDolar = { ...completo, dolarCentavos: null };
    expect(faltantesCostosLote(sinDolar, presentaciones)).toEqual(["aceite"]);
    expect(
      faltantesCostosLote(
        {
          ...sinDolar,
          costos: [...completo.costos, { concepto: "aceite", productoId: "p500", costoUnitarioCentavos: 600000, totalCentavos: 0 }],
        },
        presentaciones,
      ),
    ).toEqual([]);
  });

  it("envase por presentación producida y transporte", () => {
    const lote = { ...completo, costos: [completo.costos[1]] };
    expect(faltantesCostosLote(lote, presentaciones)).toEqual(["envase 500 ml", "transporte"]);
  });

  it("genera la tarea con link a costos", () => {
    const [tarea] = calcularTareas({
      ...BASE,
      lotesIncompletos: [{ loteId: "l1", fecha: "2026-08-15", faltantes: ["aceite", "transporte"] }],
    });
    expect(tarea.href).toBe("/stock/lotes/l1/costos");
    expect(tarea.detalle).toBe("Falta cargar el aceite y el transporte.");
    expect(tarea.etiqueta).toBe("Pedido");
  });
});

describe("pedidos por pagar", () => {
  it("agrupa los conceptos pendientes por lote y arma la tarea", () => {
    const pedidos = agruparPedidosPorPagar(
      [
        { lote_id: "l1", fecha: "2026-08-15", saldo_centavos: 150000 },
        { lote_id: "l2", fecha: "2026-09-01", saldo_centavos: 0 },
      ],
      [
        { lote_id: "l1", concepto: "envase", producto_id: "p500", saldo_centavos: 100000 },
        { lote_id: "l1", concepto: "transporte", producto_id: null, saldo_centavos: 50000 },
        { lote_id: "l1", concepto: "envase", producto_id: "p250", saldo_centavos: 0 },
      ],
      new Map([["p500", 500]]),
    );
    expect(pedidos).toEqual([
      {
        loteId: "l1",
        fecha: "2026-08-15",
        saldoCentavos: 150000,
        conceptos: [
          { etiqueta: "Envasado 500 ml", saldoCentavos: 100000 },
          { etiqueta: "Transporte", saldoCentavos: 50000 },
        ],
      },
    ]);
    const [tarea] = calcularTareas({ ...BASE, pedidosPorPagar: pedidos });
    expect(tarea.detalle).toBe("Envasado 500 ml $ 1.000,00 · Transporte $ 500,00");
    expect(tarea.href).toBe("/stock/lotes/l1/pago");
  });
});

describe("filtrarDeudasNegocioPendientes", () => {
  const fila = (extra: Partial<DeudaNegocioFila> = {}): DeudaNegocioFila => ({
    deuda_id: "d1",
    descripcion: "Deuda de prueba",
    fecha: "2026-08-01",
    moneda: "ARS",
    restante_centavos: 100000,
    saldada_en: null,
    ...extra,
  });

  it("descarta una deuda marcada saldada aunque el restante siga positivo (tarea fantasma)", () => {
    expect(filtrarDeudasNegocioPendientes([fila({ saldada_en: "2026-09-01" })])).toEqual([]);
  });

  it("descarta una deuda ya cubierta (restante 0) aunque no esté marcada saldada", () => {
    expect(filtrarDeudasNegocioPendientes([fila({ restante_centavos: 0 })])).toEqual([]);
  });

  it("una deuda pendiente sin saldar y con restante positivo sí genera la tarea", () => {
    const [d] = filtrarDeudasNegocioPendientes([fila()]);
    expect(d).toEqual({
      deuda_id: "d1",
      descripcion: "Deuda de prueba",
      fecha: "2026-08-01",
      moneda: "ARS",
      restante_centavos: 100000,
    });
  });
});

describe("informativas", () => {
  it("stock e insumos bajos nombran qué está bajo", () => {
    const tareas = calcularTareas({
      ...BASE,
      stock: [
        { nombre: "Aceite 500 ml", bajo_umbral: true },
        { nombre: "Aceite 250 ml", bajo_umbral: false },
      ],
      insumos: [{ nombre: "Etiqueta frente", bajo_umbral: true }],
      clientesConDeuda: [{ cliente_id: "c1", deuda_centavos: 1000 }],
    });
    expect(tareas.map((t) => t.titulo)).toContain("Stock bajo: Aceite 500 ml");
    expect(tareas.map((t) => t.titulo)).toContain("Insumos bajos: Etiqueta frente");
    expect(tareas.every((t) => t.urgencia === "informativo")).toBe(true);
  });
});

describe("orden y badge", () => {
  const t = (id: string, urgencia: Tarea["urgencia"], desde: string): Tarea => ({
    id,
    tipo: "stock_bajo",
    etiqueta: "Stock",
    urgencia,
    titulo: id,
    detalle: "",
    href: "/",
    desde,
  });

  it("urgencia primero y, dentro de la misma, lo más viejo arriba", () => {
    const ordenadas = ordenarTareas([
      t("info", "informativo", "2026-01-01"),
      t("normal-nueva", "normal", "2026-09-10"),
      t("urgente", "urgente", "2026-09-14"),
      t("normal-vieja", "normal", "2026-08-01"),
    ]);
    expect(ordenadas.map((x) => x.id)).toEqual(["urgente", "normal-vieja", "normal-nueva", "info"]);
  });

  it("el badge cuenta el total, incluyendo informativas (igual que la página)", () => {
    expect(
      contarTareasPendientes([
        t("a", "urgente", HOY),
        t("b", "normal", HOY),
        t("c", "informativo", HOY),
        t("d", "informativo", HOY),
      ]),
    ).toBe(4);
  });
});

/**
 * Comprobante de las tareas de confirmar (pago de revendedora o depósito
 * avisado por una coordinadora): qué path hay que firmar y cómo se le pega
 * la URL firmada a la tarea.
 */
describe("comprobantePathDeTarea / conComprobanteUrl", () => {
  const PATH_DEPOSITO = "coordinadores/laura-id/2026/09/a.jpg";
  const PATH_PAGO = "revendedores/v1/2026/09/b.jpg";

  function tareaDeposito(imagen_path: string | null) {
    return calcularTareas({ ...BASE, depositosInformados: [depositoInformado({ imagen_path })] })[0];
  }
  function tareaPago(imagen_path: string | null) {
    return calcularTareas({ ...BASE, pagosPorConfirmar: [pago({ imagen_path })] })[0];
  }

  it("devuelve el path del comprobante de un depósito avisado y de un pago", () => {
    expect(comprobantePathDeTarea(tareaDeposito(PATH_DEPOSITO))).toBe(PATH_DEPOSITO);
    expect(comprobantePathDeTarea(tareaPago(PATH_PAGO))).toBe(PATH_PAGO);
  });

  it("devuelve null si el aviso no tiene comprobante (avisos viejos)", () => {
    expect(comprobantePathDeTarea(tareaDeposito(null))).toBeNull();
    expect(comprobantePathDeTarea(tareaPago(null))).toBeNull();
  });

  it("devuelve null para tareas que no son de confirmar", () => {
    const [tarea] = calcularTareas({
      ...BASE,
      plataEnManos: [{ tenedor_id: "x", nombre: "X", total_centavos: 1_000_00, activo: true, desde: null }],
    });
    expect(comprobantePathDeTarea(tarea)).toBeNull();
  });

  it("pega la URL firmada en la acción del depósito", () => {
    const tarea = conComprobanteUrl(tareaDeposito(PATH_DEPOSITO), { [PATH_DEPOSITO]: "https://firmada/a" });
    expect(tarea.accion).toMatchObject({ tipo: "confirmar_deposito", comprobanteUrl: "https://firmada/a" });
  });

  it("si no se pudo firmar, deja la URL en null sin romper", () => {
    const sinFirma = conComprobanteUrl(tareaDeposito(PATH_DEPOSITO), { [PATH_DEPOSITO]: null });
    const ausente = conComprobanteUrl(tareaDeposito(PATH_DEPOSITO), {});
    expect(sinFirma.accion).toMatchObject({ comprobanteUrl: null });
    expect(ausente.accion).toMatchObject({ comprobanteUrl: null });
  });

  it("deja igual una tarea sin comprobante", () => {
    const tarea = tareaDeposito(null);
    expect(conComprobanteUrl(tarea, { cualquiera: "https://x" })).toBe(tarea);
  });
});
