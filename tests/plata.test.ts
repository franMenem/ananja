import { describe, expect, it } from "vitest";

import { calcularSaldos } from "@/lib/dominio/calculos";
import { montoEnManos, type MovimientoPlata } from "@/lib/dominio/movimientos-plata";
import {
  calcularCuentaAnanja,
  calcularDeudaVendedor,
  calcularParteAnanjaFifo,
  calcularPlataEnManos,
  contribucionTransferenciaEfectivo,
  medioParaCaja,
  type MovimientoTenedor,
  type RendicionEncargado,
  type TransferenciaEfectivo,
  type VentaCostoAnanjaRevendedor,
} from "@/lib/dominio/plata";

/**
 * Espejo de v_plata_en_manos / v_cuenta_ananja / v_deuda_vendedor
 * (supabase/migrations/0037_plata_en_manos.sql). Los tres escenarios de
 * "Plata en manos de personas" que motivaron el diseño (ver esa migración
 * § cabecera) se reproducen acá integrando `lib/calculos.ts` + `lib/plata.ts`
 * tal como los usaría un caller real (RSC que arma los arrays a partir de
 * las tablas, ya filtrados por origen).
 */

describe("medioParaCaja", () => {
  it("via 'encargado' siempre cae en efectivo, sin importar el medio_pago cargado", () => {
    expect(medioParaCaja("encargado", "banco")).toBe("efectivo");
    expect(medioParaCaja("encargado", "mercado_pago")).toBe("efectivo");
    expect(medioParaCaja("encargado", "efectivo")).toBe("efectivo");
  });

  it("via 'directo_cuenta'/'cliente_directo' usan su propio medio_pago", () => {
    expect(medioParaCaja("directo_cuenta", "banco")).toBe("banco");
    expect(medioParaCaja("cliente_directo", "mercado_pago")).toBe(
      "mercado_pago",
    );
  });
});

describe("Escenario 1 — Fran vende en efectivo en una feria y después deposita", () => {
  const FRAN = "fran-id";

  it("Fran vende $200.000 en efectivo en una feria → Fran tiene $200.000 en mano", () => {
    const ventasCobros: MovimientoTenedor[] = [
      { tenedor_id: FRAN, monto_centavos: 20000000 },
    ];

    const [fran] = calcularPlataEnManos(
      [{ id: FRAN, nombre: "Fran" }],
      ventasCobros,
      [],
      [],
      [],
      [],
      [],
      [],
    );

    expect(fran.totalCentavos).toBe(20000000);

    const saldos = calcularSaldos(
      { banco: 0, mercado_pago: 0, efectivo: 0 },
      [{ medio_pago: "efectivo", monto_centavos: 20000000 }],
      [],
      [],
    );
    expect(
      saldos.find((s) => s.medio_pago === "efectivo")!.saldo_centavos,
    ).toBe(fran.totalCentavos);
  });

  it("Fran deposita $150.000 a Mercado Pago → Cuenta Ananja +$150.000, Fran queda con $50.000 en mano", () => {
    const ventasCobros: MovimientoTenedor[] = [
      { tenedor_id: FRAN, monto_centavos: 20000000 },
    ];
    const depositos: MovimientoTenedor[] = [
      { tenedor_id: FRAN, monto_centavos: 15000000 },
    ];

    const [fran] = calcularPlataEnManos(
      [{ id: FRAN, nombre: "Fran" }],
      ventasCobros,
      [],
      [],
      [],
      [],
      [],
      depositos,
    );
    expect(fran.totalCentavos).toBe(5000000);

    const saldos = calcularSaldos(
      { banco: 0, mercado_pago: 0, efectivo: 0 },
      [{ medio_pago: "efectivo", monto_centavos: 20000000 }],
      [],
      [],
      [],
      [],
      [],
      [],
      [{ medio_pago: "mercado_pago", monto_centavos: 15000000 }],
    );

    const cuenta = calcularCuentaAnanja(saldos);
    expect(cuenta.mercadoPagoCentavos).toBe(15000000);
    expect(cuenta.bancoCentavos).toBe(0);
    expect(cuenta.totalCentavos).toBe(15000000);

    // El total general (mano + cuenta) no cambió con el depósito.
    expect(fran.totalCentavos + cuenta.totalCentavos).toBe(20000000);
  });
});

describe("Escenario 2 — una revendedora le rinde a su encargada, que después deposita", () => {
  const MARTA = "marta-id";
  const LAURA = "laura-id";

  it("Marta vende botellas por $80.000 de costo Ananja → debe $80.000", () => {
    const deuda = calcularDeudaVendedor(
      MARTA,
      "Marta",
      [
        {
          cantidad: 20,
          precioVentaCentavos: 500000,
          precioCostoCentavos: 400000,
        },
      ],
      [],
    );
    expect(deuda.costoVendidoCentavos).toBe(8000000);
    expect(deuda.saldoCentavos).toBe(8000000);
  });

  it("Marta le entrega los $80.000 a Laura (su encargada) → Laura tiene $80.000 en mano, Marta debe $0", () => {
    const deuda = calcularDeudaVendedor(
      MARTA,
      "Marta",
      [
        {
          cantidad: 20,
          precioVentaCentavos: 500000,
          precioCostoCentavos: 400000,
        },
      ],
      [{ montoCentavos: 8000000 }],
    );
    expect(deuda.saldoCentavos).toBe(0);

    // La rendición fue 'encargado' con medio_pago = 'efectivo' (Marta se la
    // dio en mano a Laura) — medioParaCaja no cambia nada acá, pero se usa
    // igual para dejar explícito el mapeo que haría el caller real.
    const medioEfectivo = medioParaCaja("encargado", "efectivo");
    const rendicionesRecibidas: MovimientoTenedor[] = [
      { tenedor_id: LAURA, monto_centavos: 8000000 },
    ];

    const [laura] = calcularPlataEnManos(
      [{ id: LAURA, nombre: "Laura" }],
      [],
      rendicionesRecibidas,
      [],
      [],
      [],
      [],
      [],
    );
    expect(laura.rendicionesCentavos).toBe(8000000);
    expect(laura.totalCentavos).toBe(8000000);

    const saldos = calcularSaldos(
      { banco: 0, mercado_pago: 0, efectivo: 0 },
      [],
      [],
      [],
      [{ medio_pago: medioEfectivo, monto_centavos: 8000000 }],
    );
    expect(
      saldos.find((s) => s.medio_pago === "efectivo")!.saldo_centavos,
    ).toBe(laura.totalCentavos);
  });

  it("Laura deposita los $80.000 → Cuenta Ananja +$80.000, Laura queda en $0", () => {
    const rendicionesRecibidas: MovimientoTenedor[] = [
      { tenedor_id: LAURA, monto_centavos: 8000000 },
    ];
    const depositos: MovimientoTenedor[] = [
      { tenedor_id: LAURA, monto_centavos: 8000000 },
    ];

    const [laura] = calcularPlataEnManos(
      [{ id: LAURA, nombre: "Laura" }],
      [],
      rendicionesRecibidas,
      [],
      [],
      [],
      [],
      depositos,
    );
    expect(laura.totalCentavos).toBe(0);

    const saldos = calcularSaldos(
      { banco: 0, mercado_pago: 0, efectivo: 0 },
      [],
      [],
      [],
      [{ medio_pago: "efectivo", monto_centavos: 8000000 }],
      [],
      [],
      [],
      [{ medio_pago: "banco", monto_centavos: 8000000 }],
    );
    const cuenta = calcularCuentaAnanja(saldos);
    expect(cuenta.bancoCentavos).toBe(8000000);
    expect(
      saldos.find((s) => s.medio_pago === "efectivo")!.saldo_centavos,
    ).toBe(0);
  });
});

describe("Escenario 3 — un cliente le paga directo a la cuenta por la venta de una revendedora", () => {
  const MARTA = "marta-id";

  it("cliente paga $30.000 directo a la cuenta → la deuda de Marta baja $30.000 y nadie la tiene en mano", () => {
    const ventas = [
      { cantidad: 5, precioVentaCentavos: 500000, precioCostoCentavos: 600000 },
    ];
    // via = 'cliente_directo': esta rendición NO tiene tenedor_id (nadie la
    // tiene en mano) — no se pasa a calcularPlataEnManos en absoluto.
    const rendiciones = [{ montoCentavos: 3000000 }];

    const deuda = calcularDeudaVendedor(MARTA, "Marta", ventas, rendiciones);
    expect(deuda.costoVendidoCentavos).toBe(3000000);
    expect(deuda.saldoCentavos).toBe(0);

    // Nadie la tiene en mano: v_plata_en_manos no debe reflejar nada de
    // este monto para ningún tenedor.
    const personas = calcularPlataEnManos(
      [{ id: "laura-id", nombre: "Laura" }, { id: "fran-id", nombre: "Fran" }],
      [],
      [], // rendicionesRecibidas: vacío, porque via != 'encargado'
      [],
      [],
      [],
      [],
      [],
    );
    expect(personas.every((p) => p.totalCentavos === 0)).toBe(true);

    // La caja sí sube — usa su propio medio_pago (mercado_pago, en este caso).
    const medioDestino = medioParaCaja("cliente_directo", "mercado_pago");
    const saldos = calcularSaldos(
      { banco: 0, mercado_pago: 0, efectivo: 0 },
      [],
      [],
      [],
      [{ medio_pago: medioDestino, monto_centavos: 3000000 }],
    );
    const cuenta = calcularCuentaAnanja(saldos);
    expect(cuenta.mercadoPagoCentavos).toBe(3000000);
    expect(
      saldos.find((s) => s.medio_pago === "efectivo")!.saldo_centavos,
    ).toBe(0);
  });
});

/**
 * Corrección SHOULD-FIX de la revisión adversarial de 0037: una
 * `transferencias_caja` que toca 'efectivo' (la pantalla /tareas/transferir
 * ya deployada sigue creando estas filas) tiene que atribuirse a quien la
 * cargó (`vendedor_id`) para que el invariante de la cabecera
 * (`v_saldos_caja.efectivo === Σ v_plata_en_manos.totalCentavos`) siga
 * valiendo para TODAS las filas, viejas o nuevas — no solo para
 * `depositos_cuenta`.
 */
describe("contribucionTransferenciaEfectivo", () => {
  it("resta cuando 'efectivo' es el origen", () => {
    const t: TransferenciaEfectivo = {
      vendedor_id: "fran-id",
      origen: "efectivo",
      destino: "mercado_pago",
      monto_centavos: 1500000,
    };
    expect(contribucionTransferenciaEfectivo(t)).toEqual({
      tenedor_id: "fran-id",
      monto_centavos: -1500000,
    });
  });

  it("suma cuando 'efectivo' es el destino", () => {
    const t: TransferenciaEfectivo = {
      vendedor_id: "fran-id",
      origen: "banco",
      destino: "efectivo",
      monto_centavos: 500000,
    };
    expect(contribucionTransferenciaEfectivo(t)).toEqual({
      tenedor_id: "fran-id",
      monto_centavos: 500000,
    });
  });

  it("devuelve null si no toca 'efectivo' en absoluto (banco <-> mercado_pago)", () => {
    const t: TransferenciaEfectivo = {
      vendedor_id: "fran-id",
      origen: "banco",
      destino: "mercado_pago",
      monto_centavos: 100000,
    };
    expect(contribucionTransferenciaEfectivo(t)).toBeNull();
  });
});

describe("v_plata_en_manos — transferencias_caja atribuidas a quien las carga", () => {
  const FRAN = "fran-id";
  const LAURA = "laura-id";

  it("repro del revisor: $70.000 en mano + $15.000 transferidos a mercado_pago — el invariante sigue valiendo", () => {
    // Fran tiene $70.000 en mano (por ejemplo, de ventas propias) y
    // transfiere $15.000 de 'efectivo' a 'mercado_pago' (pantalla
    // /tareas/transferir, ya deployada, anterior a esta migración).
    const ventasCobros: MovimientoTenedor[] = [
      { tenedor_id: FRAN, monto_centavos: 7000000 },
    ];
    const transferenciaSalida: TransferenciaEfectivo = {
      vendedor_id: FRAN,
      origen: "efectivo",
      destino: "mercado_pago",
      monto_centavos: 1500000,
    };
    const transferencias = [transferenciaSalida]
      .map(contribucionTransferenciaEfectivo)
      .filter((c): c is MovimientoTenedor => c !== null);

    const [fran] = calcularPlataEnManos(
      [{ id: FRAN, nombre: "Fran" }],
      ventasCobros,
      [],
      [],
      [],
      [],
      transferencias,
      [],
    );
    // $70.000 − $15.000 transferidos = $55.000 en mano.
    expect(fran.transferenciasCentavos).toBe(-1500000);
    expect(fran.totalCentavos).toBe(5500000);

    const saldos = calcularSaldos(
      { banco: 0, mercado_pago: 0, efectivo: 0 },
      [{ medio_pago: "efectivo", monto_centavos: 7000000 }],
      [],
      [],
      [],
      [{ origen: "efectivo", destino: "mercado_pago", monto_centavos: 1500000 }],
    );
    const efectivo = saldos.find((s) => s.medio_pago === "efectivo")!
      .saldo_centavos;
    // El invariante de la cabecera de 0037: efectivo === Σ en manos.
    expect(efectivo).toBe(5500000);
    expect(efectivo).toBe(fran.totalCentavos);

    // El total general (mano + Cuenta Ananja) es el mismo que sin la
    // transferencia — solo se movió de bolsillo, como antes de 0037.
    const cuenta = calcularCuentaAnanja(saldos);
    expect(fran.totalCentavos + cuenta.totalCentavos).toBe(7000000);
  });

  it("una transferencia INTO efectivo (retirar plata real) suma a la mano de quien la cargó", () => {
    // Laura retira $30.000 del banco real para tener efectivo a mano.
    const transferenciaEntrada: TransferenciaEfectivo = {
      vendedor_id: LAURA,
      origen: "banco",
      destino: "efectivo",
      monto_centavos: 3000000,
    };
    const transferencias = [transferenciaEntrada]
      .map(contribucionTransferenciaEfectivo)
      .filter((c): c is MovimientoTenedor => c !== null);

    const [laura] = calcularPlataEnManos(
      [{ id: LAURA, nombre: "Laura" }],
      [],
      [],
      [],
      [],
      [],
      transferencias,
      [],
    );
    expect(laura.transferenciasCentavos).toBe(3000000);
    expect(laura.totalCentavos).toBe(3000000);

    const saldos = calcularSaldos(
      { banco: 3000000, mercado_pago: 0, efectivo: 0 },
      [],
      [],
      [],
      [],
      [{ origen: "banco", destino: "efectivo", monto_centavos: 3000000 }],
    );
    const efectivo = saldos.find((s) => s.medio_pago === "efectivo")!
      .saldo_centavos;
    expect(efectivo).toBe(3000000);
    expect(efectivo).toBe(laura.totalCentavos);

    // El total general no cambia: solo se movió de la cuenta a la mano.
    const cuenta = calcularCuentaAnanja(saldos);
    expect(laura.totalCentavos + cuenta.totalCentavos).toBe(3000000);
  });

  it("una transferencia que no toca efectivo (banco <-> mercado_pago) no afecta a ningún tenedor", () => {
    const transferencias = [
      {
        vendedor_id: FRAN,
        origen: "banco" as const,
        destino: "mercado_pago" as const,
        monto_centavos: 500000,
      },
    ]
      .map(contribucionTransferenciaEfectivo)
      .filter((c): c is MovimientoTenedor => c !== null);

    expect(transferencias).toEqual([]);

    const [fran] = calcularPlataEnManos(
      [{ id: FRAN, nombre: "Fran" }],
      [],
      [],
      [],
      [],
      [],
      transferencias,
      [],
    );
    expect(fran.totalCentavos).toBe(0);
  });
});

describe("calcularPlataEnManos — comportamiento con datos vacíos", () => {
  it("sin tenedores, devuelve []", () => {
    expect(calcularPlataEnManos([], [], [], [], [], [], [], [])).toEqual([]);
  });

  it("un tenedor sin ningún movimiento da todo en 0, no undefined/NaN", () => {
    const [persona] = calcularPlataEnManos(
      [{ id: "x", nombre: "Sin actividad" }],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
    );
    expect(persona).toEqual({
      tenedorId: "x",
      nombre: "Sin actividad",
      ventasCobrosCentavos: 0,
      rendicionesCentavos: 0,
      gastosCentavos: 0,
      pagosDeudaCentavos: 0,
      ajustesCentavos: 0,
      transferenciasCentavos: 0,
      depositosCentavos: 0,
      totalCentavos: 0,
    });
  });

  it("un gasto en efectivo resta de la mano de quien lo pagó", () => {
    const gastos: MovimientoTenedor[] = [
      { tenedor_id: "fran-id", monto_centavos: 50000 },
    ];
    const [fran] = calcularPlataEnManos(
      [{ id: "fran-id", nombre: "Fran" }],
      [],
      [],
      gastos,
      [],
      [],
      [],
      [],
    );
    expect(fran.gastosCentavos).toBe(50000);
    expect(fran.totalCentavos).toBe(-50000);
  });

  it("un ajuste negativo resta, uno positivo suma (con signo, igual que ajustes_caja)", () => {
    const ajustes: MovimientoTenedor[] = [
      { tenedor_id: "fran-id", monto_centavos: -20000 },
    ];
    const [fran] = calcularPlataEnManos(
      [{ id: "fran-id", nombre: "Fran" }],
      [],
      [],
      [],
      [],
      ajustes,
      [],
      [],
    );
    expect(fran.ajustesCentavos).toBe(-20000);
    expect(fran.totalCentavos).toBe(-20000);
  });

  it("un pago de deuda en efectivo resta de la mano de quien lo pagó", () => {
    const pagosDeuda: MovimientoTenedor[] = [
      { tenedor_id: "fran-id", monto_centavos: 100000 },
    ];
    const [fran] = calcularPlataEnManos(
      [{ id: "fran-id", nombre: "Fran" }],
      [],
      [],
      [],
      pagosDeuda,
      [],
      [],
      [],
    );
    expect(fran.pagosDeudaCentavos).toBe(100000);
    expect(fran.totalCentavos).toBe(-100000);
  });

  it("movimientos de otro tenedor no se filtran a la persona equivocada", () => {
    const ventasCobros: MovimientoTenedor[] = [
      { tenedor_id: "fran-id", monto_centavos: 10000 },
      { tenedor_id: "laura-id", monto_centavos: 99999 },
    ];
    const [fran] = calcularPlataEnManos(
      [{ id: "fran-id", nombre: "Fran" }],
      ventasCobros,
      [],
      [],
      [],
      [],
      [],
      [],
    );
    expect(fran.totalCentavos).toBe(10000);
  });
});

describe("calcularCuentaAnanja — comportamiento con datos vacíos", () => {
  it("sin saldos, todo en 0", () => {
    expect(calcularCuentaAnanja([])).toEqual({
      bancoCentavos: 0,
      mercadoPagoCentavos: 0,
      totalCentavos: 0,
    });
  });

  it("suma banco + mercado_pago, ignora efectivo y total", () => {
    const cuenta = calcularCuentaAnanja([
      { medio_pago: "banco", saldo_centavos: 1000 },
      { medio_pago: "mercado_pago", saldo_centavos: 2000 },
      { medio_pago: "efectivo", saldo_centavos: 500000 },
      { medio_pago: "total", saldo_centavos: 503000 },
    ]);
    expect(cuenta).toEqual({
      bancoCentavos: 1000,
      mercadoPagoCentavos: 2000,
      totalCentavos: 3000,
    });
  });
});

describe("calcularDeudaVendedor — signo y datos vacíos", () => {
  it("sin ventas ni rendiciones, saldo 0", () => {
    const deuda = calcularDeudaVendedor("v1", "Vacío", [], []);
    expect(deuda.saldoCentavos).toBe(0);
  });

  it("si rindió/depositó de más, el saldo queda negativo (Ananja le debe a él)", () => {
    const deuda = calcularDeudaVendedor(
      "v1",
      "Sobrepago",
      [{ cantidad: 1, precioVentaCentavos: 5000, precioCostoCentavos: 4000 }],
      [{ montoCentavos: 10000 }],
    );
    expect(deuda.costoVendidoCentavos).toBe(4000);
    expect(deuda.entregadoCentavos).toBe(10000);
    expect(deuda.saldoCentavos).toBe(-6000);
  });
});

/**
 * Espejo de `v_rendiciones_ananja` (0061_rendiciones_ananja_fifo.sql): la
 * parte Ananja de cada rendición `via = 'encargado'` calculada FIFO —
 * reemplaza la vieja `aplicarParteAnanjaRendiciones` +
 * `calcularRatioAnanjaPorRevendedor` de 0058 (ratio PROMEDIO de toda la
 * historia de la revendedora). Con FIFO, cada pago puntual muestra la
 * parte Ananja de las botellas específicas que cubre, no un promedio.
 */
describe("calcularParteAnanjaFifo — la parte Ananja de cada rendición 'encargado', FIFO", () => {
  const LAURA = "laura-id";
  const SOFI = "sofi-id";
  const MARTIN = "martin-id";

  it("un pago que cubre EXACTO una venta de 500 ml (costo $1.000) da $1.000, no un promedio", () => {
    const ventas: VentaCostoAnanjaRevendedor[] = [
      { vendedorId: SOFI, cantidad: 1, precioCostoCentavos: 120000, costoAnanjaCentavos: 100000 },
    ];
    const rendiciones: RendicionEncargado[] = [
      { tenedorId: LAURA, vendedorId: SOFI, montoCentavos: 120000 },
    ];
    const [movimiento] = calcularParteAnanjaFifo(ventas, rendiciones);
    expect(movimiento).toEqual({ tenedor_id: LAURA, monto_centavos: 100000 });
  });

  it("un pago que cubre EXACTO una venta de 250 ml (costo $600) da $600", () => {
    const ventas: VentaCostoAnanjaRevendedor[] = [
      { vendedorId: SOFI, cantidad: 1, precioCostoCentavos: 70000, costoAnanjaCentavos: 60000 },
    ];
    const rendiciones: RendicionEncargado[] = [
      { tenedorId: LAURA, vendedorId: SOFI, montoCentavos: 70000 },
    ];
    const [movimiento] = calcularParteAnanjaFifo(ventas, rendiciones);
    expect(movimiento).toEqual({ tenedor_id: LAURA, monto_centavos: 60000 });
  });

  it("Sofi (2 presentaciones, deuda totalmente paga): la suma da EXACTO $91.000, igual que el ratio — y un pago que cruza de una presentación a otra reparte cada tramo a SU propio costo", () => {
    // Ejemplo: 58 botellas de 500 ml ($1.200 cobrado / $1.000 costo real) +
    // 55 de 250 ml ($700 / $600). Vendidas en ese orden (500 ml primero).
    const ventas: VentaCostoAnanjaRevendedor[] = [
      { vendedorId: SOFI, cantidad: 58, precioCostoCentavos: 120000, costoAnanjaCentavos: 100000 },
      { vendedorId: SOFI, cantidad: 55, precioCostoCentavos: 70000, costoAnanjaCentavos: 60000 },
    ];
    // Deuda total (precio coordinador): 58×$1.200 + 55×$700 = $108.100.
    // Costo Ananja total: 58×$1.000 + 55×$600 = $91.000 — igual que
    // daba el ratio promedio (0058) para el caso totalmente pago: el TOTAL
    // no cambia, cambia el reparto por movimiento.
    //
    // Pago 1: $50.000 — cubre solo PARTE de la venta de 500 ml (que sola
    // pesa $69.600 a precio coordinador).
    // Pago 2: $58.100 — termina de cubrir la venta de 500 ml ($19.600
    // que faltaban) y CRUZA a la venta de 250 ml (los $38.500 restantes,
    // que es exactamente toda ella).
    const rendiciones: RendicionEncargado[] = [
      { tenedorId: LAURA, vendedorId: SOFI, montoCentavos: 5000000 },
      { tenedorId: LAURA, vendedorId: SOFI, montoCentavos: 5810000 },
    ];
    const movimientos = calcularParteAnanjaFifo(ventas, rendiciones);

    // Pago 1: $50.000 de la franja de 500 ml, a ratio 1.000/1.200 → 5/6:
    // $41.666,67, redondeado.
    expect(movimientos[0].monto_centavos).toBe(4166667);
    // Pago 2: $19.600 de 500 ml (a 5/6: $16.333,33) + $38.500 de 250 ml
    // completa (a 600/700, exacta: $33.000) = $49.333,33, redondeado.
    expect(movimientos[1].monto_centavos).toBe(4933333);

    const total = movimientos.reduce((acc, m) => acc + m.monto_centavos, 0);
    expect(total).toBe(9100000); // $91.000,00 — el mismo total que daba 0058.
  });

  it("Martín paga AL COSTO (sin margen de coordinador): ratio 1, sin cambios frente a antes", () => {
    const ventas: VentaCostoAnanjaRevendedor[] = [
      { vendedorId: MARTIN, cantidad: 40, precioCostoCentavos: 100000, costoAnanjaCentavos: 100000 },
      { vendedorId: MARTIN, cantidad: 20, precioCostoCentavos: 60000, costoAnanjaCentavos: 60000 },
    ];
    const rendiciones: RendicionEncargado[] = [
      { tenedorId: LAURA, vendedorId: MARTIN, montoCentavos: 3000000 },
      { tenedorId: LAURA, vendedorId: MARTIN, montoCentavos: 1500000 },
      { tenedorId: LAURA, vendedorId: MARTIN, montoCentavos: 700000 },
    ];
    const movimientos = calcularParteAnanjaFifo(ventas, rendiciones);
    // Sin margen (costoAnanja === precioCosto para cada venta): cada pago
    // vuelve exacto, sin ningún redondeo.
    expect(movimientos).toEqual([
      { tenedor_id: LAURA, monto_centavos: 3000000 },
      { tenedor_id: LAURA, monto_centavos: 1500000 },
      { tenedor_id: LAURA, monto_centavos: 700000 },
    ]);
  });

  it("pago mayor a la deuda vendida: el excedente se atribuye a Ananja 1:1 (ratio 1) — no se pierde plata", () => {
    const ventas: VentaCostoAnanjaRevendedor[] = [
      { vendedorId: SOFI, cantidad: 1, precioCostoCentavos: 120000, costoAnanjaCentavos: 100000 },
    ];
    // Debe $1.200 (precio coordinador); paga $1.500 — $300 de más.
    const rendiciones: RendicionEncargado[] = [
      { tenedorId: LAURA, vendedorId: SOFI, montoCentavos: 150000 },
    ];
    const [movimiento] = calcularParteAnanjaFifo(ventas, rendiciones);
    // $1.000 (costo real de lo vendido) + $300 (excedente, ratio 1).
    expect(movimiento.monto_centavos).toBe(130000);
  });

  it("una revendedora sin nada vendido (sin coordinador con historial, o recién asignada): sin franjas de deuda, todo el pago es excedente a ratio 1 — mismo comportamiento viejo", () => {
    const rendiciones: RendicionEncargado[] = [
      { tenedorId: "admin-nuevo-id", vendedorId: "revendedora-nueva-id", montoCentavos: 500000 },
    ];
    const rendicionesRecibidas = calcularParteAnanjaFifo([], rendiciones);
    expect(rendicionesRecibidas).toEqual([{ tenedor_id: "admin-nuevo-id", monto_centavos: 500000 }]);

    const [tenedor] = calcularPlataEnManos(
      [{ id: "admin-nuevo-id", nombre: "Admin nuevo" }],
      [],
      rendicionesRecibidas,
      [],
      [],
      [],
      [],
      [],
    );
    expect(tenedor.totalCentavos).toBe(500000);
  });

  it("un tenedor totalmente sin rendiciones da 0, como hoy", () => {
    const ventas: VentaCostoAnanjaRevendedor[] = [
      { vendedorId: SOFI, cantidad: 10, precioCostoCentavos: 120000, costoAnanjaCentavos: 100000 },
    ];
    const rendicionesRecibidas = calcularParteAnanjaFifo(ventas, []);
    expect(rendicionesRecibidas).toEqual([]);

    const [laura] = calcularPlataEnManos(
      [{ id: LAURA, nombre: "Laura" }],
      [],
      rendicionesRecibidas,
      [],
      [],
      [],
      [],
      [],
    );
    expect(laura.totalCentavos).toBe(0);
  });

  it("venta por debajo del costo Ananja (ratio > 1 para ESA venta): NO se clampea, Ananja igual recibe su costo completo", () => {
    // Sin caso real hoy — pedido explícito de Fran: la regla es
    // que Ananja recibe su costo, así que si el coordinador cobró MENOS
    // que el costo Ananja, la parte Ananja de una rendición puede superar
    // lo que esa rendición puntual trajo.
    const ventas: VentaCostoAnanjaRevendedor[] = [
      { vendedorId: SOFI, cantidad: 10, precioCostoCentavos: 500000, costoAnanjaCentavos: 600000 },
    ];
    const rendiciones: RendicionEncargado[] = [
      { tenedorId: LAURA, vendedorId: SOFI, montoCentavos: 1000000 },
    ];
    const [movimiento] = calcularParteAnanjaFifo(ventas, rendiciones);

    // $10.000 cubre 1/5 de la franja de deuda ($50.000 en total) → ratio
    // 1,2 (6.000.000/5.000.000) aplicado a ese tramo → $12.000 — MÁS que
    // los $10.000 que rindió esa vez puntual: no hay ningún tope.
    expect(movimiento.monto_centavos).toBe(1200000);
    expect(movimiento.monto_centavos).toBeGreaterThan(rendiciones[0].montoCentavos);
  });

  it("redondeo: 3 pagos iguales que individualmente redondean para abajo — la ÚLTIMA rendición del grupo absorbe el resto para dar el total exacto", () => {
    // Deuda $3,00 (precio coordinador) / costo real $1,00 → ratio exacto
    // 1/3. Pagada en 3 cuotas iguales de $1,00: cada una cubre exactamente
    // un tercio → $0,3333... cada una, que redondeado individualmente da
    // $0,33 + $0,33 + $0,33 = $0,99 — un centavo menos que el total real
    // ($1,00). La última cuota tiene que quedar en $0,34, no $0,33.
    const ventas: VentaCostoAnanjaRevendedor[] = [
      { vendedorId: SOFI, cantidad: 1, precioCostoCentavos: 300, costoAnanjaCentavos: 100 },
    ];
    const rendiciones: RendicionEncargado[] = [
      { tenedorId: LAURA, vendedorId: SOFI, montoCentavos: 100 },
      { tenedorId: LAURA, vendedorId: SOFI, montoCentavos: 100 },
      { tenedorId: LAURA, vendedorId: SOFI, montoCentavos: 100 },
    ];
    const movimientos = calcularParteAnanjaFifo(ventas, rendiciones);
    expect(movimientos.map((m) => m.monto_centavos)).toEqual([33, 33, 34]);
    expect(movimientos.reduce((acc, m) => acc + m.monto_centavos, 0)).toBe(100);
  });

  it('BLOCKER 2 (0058) sigue cumplido con FIFO: la lista de "en manos de" reconcilia exacto con el total', () => {
    const ventas: VentaCostoAnanjaRevendedor[] = [
      { vendedorId: SOFI, cantidad: 58, precioCostoCentavos: 120000, costoAnanjaCentavos: 100000 },
      { vendedorId: SOFI, cantidad: 55, precioCostoCentavos: 70000, costoAnanjaCentavos: 60000 },
    ];
    const rendiciones: RendicionEncargado[] = [
      { tenedorId: LAURA, vendedorId: SOFI, montoCentavos: 5000000 },
      { tenedorId: LAURA, vendedorId: SOFI, montoCentavos: 5810000 },
    ];
    const rendicionesRecibidas = calcularParteAnanjaFifo(ventas, rendiciones);

    const [laura] = calcularPlataEnManos(
      [{ id: LAURA, nombre: "Laura" }],
      [],
      rendicionesRecibidas,
      [],
      [],
      [],
      [],
      [],
    );
    expect(laura.rendicionesCentavos).toBe(9100000);

    const movimientos = rendicionesRecibidas.map(
      (r): MovimientoPlata => ({
        tipo: "rendicion",
        via: "encargado",
        medioPago: "mercado_pago",
        tenedorId: r.tenedor_id,
        montoCentavos: r.monto_centavos,
      }),
    );
    const sumaLista = movimientos.reduce((acc, m) => acc + (montoEnManos(m, LAURA) ?? 0), 0);
    expect(sumaLista).toBe(laura.rendicionesCentavos);
  });
});
