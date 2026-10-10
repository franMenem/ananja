import { describe, expect, it } from "vitest";

import {
  describirDeposito,
  describirRendicion,
  detalleDeposito,
  diasEnManoPorPersona,
  esMovimientoInterno,
  esVentaPropia,
  impactosDe,
  ingresosEnManos,
  montoEnCuenta,
  montoEnManos,
  NOTA_DEPOSITO_AVISADO_POR_DEFECTO,
  textoDonde,
  ventasPropiasEnManos,
  type MovimientoPlata,
} from "@/lib/dominio/movimientos-plata";

const LAURA = "laura-id";
const FRAN = "fran-id";
const nombres: Record<string, string> = { [LAURA]: "Laura", [FRAN]: "Fran" };
const nombreDe = (id: string | null) => (id ? (nombres[id] ?? "—") : "—");

function rendicion(extra: Partial<Extract<MovimientoPlata, { tipo: "rendicion" }>> = {}): MovimientoPlata {
  return {
    tipo: "rendicion",
    via: "encargado",
    medioPago: "mercado_pago",
    tenedorId: LAURA,
    montoCentavos: 100_00,
    ...extra,
  };
}

describe("pagos de revendedora (rendiciones)", () => {
  it("'se la dio a su encargada' por Mercado Pago NO entra a Mercado Pago: queda en manos de la encargada", () => {
    const m = rendicion();
    expect(montoEnCuenta(m, "mercado_pago")).toBeNull();
    expect(montoEnCuenta(m, "banco")).toBeNull();
    expect(montoEnManos(m, LAURA)).toBe(100_00);
    expect(montoEnManos(m, FRAN)).toBeNull();
  });

  it("'directo a la cuenta' y 'un cliente pagó directo' entran a la cuenta de su medio", () => {
    for (const via of ["directo_cuenta", "cliente_directo"] as const) {
      const m = rendicion({ via, medioPago: "banco" });
      expect(montoEnCuenta(m, "banco")).toBe(100_00);
      expect(montoEnCuenta(m, "mercado_pago")).toBeNull();
      expect(montoEnManos(m, LAURA)).toBeNull();
    }
  });

  it("describe dónde quedó la plata", () => {
    expect(
      describirRendicion({ via: "encargado", medioPago: "mercado_pago", revendedora: "Sofi", tenedor: "Laura" }),
    ).toBe("Pago de Sofi recibido por Laura · por Mercado Pago");
    expect(
      describirRendicion({ via: "directo_cuenta", medioPago: "banco", revendedora: "Sofi", tenedor: "Laura" }),
    ).toBe("Pago de Sofi directo a la cuenta");
    expect(describirDeposito("Laura")).toBe("Laura pasó a la cuenta");
  });
});

describe("depósitos y transferencias", () => {
  it("un depósito sale de la mano del tenedor y entra a la cuenta", () => {
    const m: MovimientoPlata = { tipo: "deposito", medioPago: "mercado_pago", tenedorId: LAURA, montoCentavos: 50_00 };
    expect(montoEnManos(m, LAURA)).toBe(-50_00);
    expect(montoEnCuenta(m, "mercado_pago")).toBe(50_00);
    expect(montoEnCuenta(m, "banco")).toBeNull();
    expect(esMovimientoInterno(m)).toBe(true);
    expect(textoDonde(m, nombreDe)).toBe("Laura → Mercado Pago");
  });

  it("una transferencia efectivo → banco resta en la mano de quien la cargó y suma al banco", () => {
    const m: MovimientoPlata = {
      tipo: "transferencia",
      origen: "efectivo",
      destino: "banco",
      vendedorId: FRAN,
      montoCentavos: 30_00,
    };
    expect(montoEnManos(m, FRAN)).toBe(-30_00);
    expect(montoEnCuenta(m, "banco")).toBe(30_00);
    expect(textoDonde(m, nombreDe)).toBe("Fran → Banco");
  });

  it("una transferencia banco → mercado pago no toca la mano de nadie", () => {
    const m: MovimientoPlata = {
      tipo: "transferencia",
      origen: "banco",
      destino: "mercado_pago",
      vendedorId: FRAN,
      montoCentavos: 30_00,
    };
    expect(montoEnManos(m, FRAN)).toBeNull();
    expect(montoEnCuenta(m, "banco")).toBe(-30_00);
    expect(montoEnCuenta(m, "mercado_pago")).toBe(30_00);
  });
});

describe("ventas, cobros, gastos, pagos de deuda y ajustes", () => {
  it("en efectivo quedan en manos de quien los registró; si no, en la cuenta de su medio", () => {
    const tipos = ["comprobante", "cobro", "gasto", "pago_deuda", "ajuste"] as const;
    for (const tipo of tipos) {
      const signo = tipo === "gasto" || tipo === "pago_deuda" ? -1 : 1;
      const efectivo = { tipo, medioPago: "efectivo", vendedorId: FRAN, montoCentavos: 10_00 } as MovimientoPlata;
      expect(montoEnManos(efectivo, FRAN)).toBe(signo * 10_00);
      expect(montoEnCuenta(efectivo, "mercado_pago")).toBeNull();

      const mp = { tipo, medioPago: "mercado_pago", vendedorId: FRAN, montoCentavos: 10_00 } as MovimientoPlata;
      expect(montoEnCuenta(mp, "mercado_pago")).toBe(signo * 10_00);
      expect(montoEnManos(mp, FRAN)).toBeNull();
      expect(esMovimientoInterno(mp)).toBe(false);
    }
  });

  it("un ajuste negativo resta", () => {
    const m: MovimientoPlata = { tipo: "ajuste", medioPago: "banco", vendedorId: FRAN, montoCentavos: -5_00 };
    expect(montoEnCuenta(m, "banco")).toBe(-5_00);
  });
});

describe("ejemplo: 7 pagos a Laura por Mercado Pago y 4 depósitos", () => {
  const movimientos: MovimientoPlata[] = [
    ...[500_000, 120_000, 80_000, 90_000, 60_000, 70_000, 80_000].map((pesos) =>
      rendicion({ montoCentavos: pesos * 100 }),
    ),
    ...[200_000, 100_000, 90_000, 60_000].map(
      (pesos): MovimientoPlata => ({
        tipo: "deposito",
        medioPago: "mercado_pago",
        tenedorId: LAURA,
        montoCentavos: pesos * 100,
      }),
    ),
  ];

  const sumaCuenta = movimientos.reduce((acc, m) => acc + (montoEnCuenta(m, "mercado_pago") ?? 0), 0);
  const sumaLaura = movimientos.reduce((acc, m) => acc + (montoEnManos(m, LAURA) ?? 0), 0);

  it("a Mercado Pago solo entraron los depósitos ($450.000)", () => {
    expect(sumaCuenta).toBe(450_000_00);
    expect(movimientos.filter((m) => montoEnCuenta(m, "mercado_pago") !== null)).toHaveLength(4);
  });

  it("Laura tiene $550.000 en mano, explicado línea por línea", () => {
    expect(sumaLaura).toBe(550_000_00);
    expect(movimientos.filter((m) => montoEnManos(m, LAURA) !== null)).toHaveLength(11);
  });

  it("cada peso está en un solo lugar: cuenta + en manos = lo que pagaron las revendedoras", () => {
    const total = movimientos.flatMap(impactosDe).reduce((acc, i) => acc + i.montoCentavos, 0);
    expect(total).toBe(1_000_000_00);
    expect(sumaCuenta + sumaLaura).toBe(total);
  });
});

describe("ingresosEnManos (antigüedad de la plata en mano)", () => {
  it("cuenta solo lo que entró a la mano de esa persona, fechado por el registro, sin ajustes ni salidas", () => {
    const dia = (iso: string) => iso.slice(0, 10);
    const filas = [
      { mov: rendicion({ montoCentavos: 70_00 }), createdAt: "2026-09-10T12:00:00Z" },
      { mov: rendicion({ tenedorId: FRAN }), createdAt: "2026-09-11T12:00:00Z" },
      {
        mov: { tipo: "deposito", medioPago: "banco", tenedorId: LAURA, montoCentavos: 20_00 } as MovimientoPlata,
        createdAt: "2026-09-12T12:00:00Z",
      },
      {
        mov: { tipo: "ajuste", medioPago: "efectivo", vendedorId: LAURA, montoCentavos: 5_00 } as MovimientoPlata,
        createdAt: "2026-09-13T12:00:00Z",
      },
      {
        mov: { tipo: "comprobante", medioPago: "efectivo", vendedorId: LAURA, montoCentavos: 9_00 } as MovimientoPlata,
        createdAt: "2026-09-14T12:00:00Z",
      },
    ];
    expect(ingresosEnManos(filas, LAURA, dia)).toEqual([
      { fecha: "2026-09-10", montoCentavos: 70_00 },
      { fecha: "2026-09-14", montoCentavos: 9_00 },
    ]);
  });
});

describe("diasEnManoPorPersona", () => {
  it("solo calcula para quien tiene saldo positivo — deja afuera negativos y en cero", () => {
    const personas = [
      { tenedor_id: LAURA, total_centavos: 100_00 },
      { tenedor_id: FRAN, total_centavos: -50_00 },
      { tenedor_id: "otro-id", total_centavos: 0 },
    ];
    const filas = [{ mov: rendicion({ montoCentavos: 100_00 }), createdAt: "2026-09-10T12:00:00Z" }];

    const dias = diasEnManoPorPersona(personas, filas, "2026-09-15");

    expect(dias.has(LAURA)).toBe(true);
    expect(dias.has(FRAN)).toBe(false);
    expect(dias.has("otro-id")).toBe(false);
  });

  it("cuenta los días desde el ingreso más viejo que todavía cubre el saldo (FIFO)", () => {
    const personas = [{ tenedor_id: LAURA, total_centavos: 70_00 }];
    const filas = [
      { mov: rendicion({ montoCentavos: 100_00 }), createdAt: "2026-09-05T12:00:00Z" },
      { mov: rendicion({ montoCentavos: 30_00 }), createdAt: "2026-09-10T12:00:00Z" },
    ];

    const dias = diasEnManoPorPersona(personas, filas, "2026-09-15");

    // El saldo (70) cubre el ingreso más nuevo (30, del 10/09) y una parte
    // del anterior (100, del 05/09) recorriendo del más nuevo al más viejo
    // — la plata más vieja en mano es la del 05/09, 10 días antes de "hoy".
    expect(dias.get(LAURA)).toBe(10);
  });

  it("null si no hay ningún ingreso que explique el saldo", () => {
    const personas = [{ tenedor_id: LAURA, total_centavos: 50_00 }];

    const dias = diasEnManoPorPersona(personas, [], "2026-09-15");

    expect(dias.get(LAURA)).toBeNull();
  });
});

/**
 * Detalle de la fila de un depósito ("pasó a la cuenta"): si lo cargó un admin
 * a mano o si nació del aviso de una coordinadora (0057/0071).
 */
describe("detalleDeposito", () => {
  const base = { tenedorId: LAURA, autorId: FRAN, avisado: false, nombreDe };

  it("cargado por un admin: la nota y 'lo anotó {admin}'", () => {
    expect(detalleDeposito({ ...base, nota: "Transferencia del viernes" })).toBe(
      "Transferencia del viernes · lo anotó Fran",
    );
    expect(detalleDeposito({ ...base, nota: null })).toBe("lo anotó Fran");
  });

  it("cargado por la misma persona que tenía la plata: no dice quién lo anotó", () => {
    expect(detalleDeposito({ ...base, autorId: LAURA, nota: null })).toBeNull();
    expect(detalleDeposito({ ...base, autorId: LAURA, nota: "Hecho" })).toBe("Hecho");
  });

  it("nacido de un aviso: 'lo avisó desde la app · lo confirmó {admin}'", () => {
    expect(detalleDeposito({ ...base, avisado: true, nota: null })).toBe(
      "lo avisó desde la app · lo confirmó Fran",
    );
  });

  it("nacido de un aviso: no repite la nota por defecto que le pone la base", () => {
    expect(detalleDeposito({ ...base, avisado: true, nota: NOTA_DEPOSITO_AVISADO_POR_DEFECTO })).toBe(
      "lo avisó desde la app · lo confirmó Fran",
    );
  });

  it("nacido de un aviso: conserva una nota propia", () => {
    expect(detalleDeposito({ ...base, avisado: true, nota: "Desde el Banco Nación" })).toBe(
      "Desde el Banco Nación · lo avisó desde la app · lo confirmó Fran",
    );
  });

  it("nacido de un aviso: usa al admin que resolvió el aviso y, si no se sabe, al autor del depósito", () => {
    expect(detalleDeposito({ ...base, avisado: true, nota: null, confirmoId: LAURA })).toBe(
      "lo avisó desde la app · lo confirmó Laura",
    );
    expect(detalleDeposito({ ...base, avisado: true, nota: null, confirmoId: null })).toBe(
      "lo avisó desde la app · lo confirmó Fran",
    );
  });
});

describe("venta propia de una coordinadora (0073)", () => {
  it("la rendición de ella hacia ella se llama 'vendió botellas', no 'pago recibido por ella misma'", () => {
    expect(
      describirRendicion({
        via: "encargado",
        medioPago: "efectivo",
        revendedora: "Teresa",
        tenedor: "Teresa",
        ventaPropia: true,
      }),
    ).toBe("Teresa vendió botellas");
    // Sin la marca, el título de siempre.
    expect(
      describirRendicion({ via: "encargado", medioPago: "efectivo", revendedora: "Sofi", tenedor: "Laura" }),
    ).toBe("Pago de Sofi recibido por Laura · por Efectivo");
  });

  it("se reconoce por vendedor = tenedor", () => {
    expect(esVentaPropia("t", "t")).toBe(true);
    expect(esVentaPropia("sofi", "t")).toBe(false);
    expect(esVentaPropia("t", null)).toBe(false);
    expect(esVentaPropia(null, null)).toBe(false);
  });

  it("sigue sumando en manos del tenedor y no toca ninguna cuenta (igual que cualquier pago recibido)", () => {
    const m: MovimientoPlata = {
      tipo: "rendicion",
      via: "encargado",
      medioPago: "efectivo",
      tenedorId: LAURA,
      montoCentavos: 24_000_00,
      ventaPropia: true,
    };
    expect(montoEnManos(m, LAURA)).toBe(24_000_00);
    expect(montoEnCuenta(m, "banco")).toBeNull();
    expect(montoEnCuenta(m, "mercado_pago")).toBeNull();
  });

  it("separa, de lo que recibió, las botellas que vendió ella (para el resumen de en-manos)", () => {
    const rend = (monto: number, ventaPropia: boolean): MovimientoPlata => ({
      tipo: "rendicion",
      via: "encargado",
      medioPago: "efectivo",
      tenedorId: LAURA,
      montoCentavos: monto,
      ventaPropia,
    });
    const items = [
      { fila: { mov: rend(10_00, false) }, montoCentavos: 10_00 },
      { fila: { mov: rend(24_00, true) }, montoCentavos: 24_00 },
      { fila: { mov: rend(6_00, true) }, montoCentavos: 6_00 },
      {
        fila: { mov: { tipo: "gasto", medioPago: "efectivo", vendedorId: LAURA, montoCentavos: 5_00 } as MovimientoPlata },
        montoCentavos: -5_00,
      },
    ];
    expect(ventasPropiasEnManos(items)).toBe(30_00);
    expect(ventasPropiasEnManos([])).toBe(0);
  });
});
