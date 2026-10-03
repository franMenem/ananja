import { describe, expect, it } from "vitest";
import {
  calcularSaldo,
  calcularSaldos,
  type AjusteCajaMovimiento,
  type DepositoCuentaMovimiento,
  type MovimientoCaja,
  type TransferenciaCajaMovimiento,
} from "@/lib/dominio/calculos";

/**
 * Espejo de v_saldos_caja (supabase/migrations/0002_views_rpcs.sql) —
 * ver contracts/database.md, invariante 1: total = Σ de las tres cajas.
 */

describe("calcularSaldo — caja individual", () => {
  it("caja completamente vacía da saldo 0", () => {
    expect(calcularSaldo("efectivo", 0, [], [], [])).toBe(0);
  });

  it("solo saldo inicial, sin movimientos", () => {
    expect(calcularSaldo("banco", 10000000, [], [], [])).toBe(10000000);
  });

  it("suma comprobantes del medio correspondiente", () => {
    const comprobantes: MovimientoCaja[] = [
      { medio_pago: "mercado_pago", monto_centavos: 1500000 },
      { medio_pago: "mercado_pago", monto_centavos: 500000 },
    ];
    expect(calcularSaldo("mercado_pago", 0, comprobantes, [], [])).toBe(
      2000000,
    );
  });

  it("resta gastos del medio correspondiente", () => {
    const gastos: MovimientoCaja[] = [
      { medio_pago: "efectivo", monto_centavos: 850000 },
    ];
    expect(calcularSaldo("efectivo", 0, [], gastos, [])).toBe(-850000);
  });

  it("un gasto de banco no afecta el saldo de efectivo (medios de pago mezclados)", () => {
    const gastos: MovimientoCaja[] = [
      { medio_pago: "banco", monto_centavos: 500000 },
    ];
    const comprobantes: MovimientoCaja[] = [
      { medio_pago: "efectivo", monto_centavos: 300000 },
    ];
    expect(calcularSaldo("efectivo", 0, comprobantes, gastos, [])).toBe(
      300000,
    );
    expect(calcularSaldo("banco", 0, comprobantes, gastos, [])).toBe(
      -500000,
    );
  });

  it("mezcla de comprobantes de distintos medios: cada caja solo ve lo propio", () => {
    const comprobantes: MovimientoCaja[] = [
      { medio_pago: "banco", monto_centavos: 1000000 },
      { medio_pago: "mercado_pago", monto_centavos: 1500000 },
      { medio_pago: "efectivo", monto_centavos: 200000 },
    ];
    expect(calcularSaldo("banco", 0, comprobantes, [], [])).toBe(1000000);
    expect(calcularSaldo("mercado_pago", 0, comprobantes, [], [])).toBe(
      1500000,
    );
    expect(calcularSaldo("efectivo", 0, comprobantes, [], [])).toBe(200000);
  });

  it("ajustes positivos suman", () => {
    const ajustes: AjusteCajaMovimiento[] = [
      { medio_pago: "efectivo", monto_centavos: 850000 },
    ];
    expect(calcularSaldo("efectivo", 0, [], [], ajustes)).toBe(850000);
  });

  it("ajustes negativos restan (llevan signo propio)", () => {
    const ajustes: AjusteCajaMovimiento[] = [
      { medio_pago: "efectivo", monto_centavos: -300000 },
    ];
    expect(calcularSaldo("efectivo", 1000000, [], [], ajustes)).toBe(
      700000,
    );
  });

  it("borrar un gasto (no incluirlo en el array) recalcula el saldo sin él", () => {
    const gastosConDosCargados: MovimientoCaja[] = [
      { medio_pago: "efectivo", monto_centavos: 850000 },
      { medio_pago: "efectivo", monto_centavos: 200000 },
    ];
    const saldoConDos = calcularSaldo(
      "efectivo",
      0,
      [],
      gastosConDosCargados,
      [],
    );
    expect(saldoConDos).toBe(-1050000);

    // Simula el borrado del segundo gasto: ya no está en el array de entrada.
    const gastosTrasBorrar: MovimientoCaja[] = [
      { medio_pago: "efectivo", monto_centavos: 850000 },
    ];
    const saldoTrasBorrar = calcularSaldo(
      "efectivo",
      0,
      [],
      gastosTrasBorrar,
      [],
    );
    expect(saldoTrasBorrar).toBe(-850000);
  });

  it("combina saldo inicial + comprobante + gasto + ajuste (caso del quickstart §US4)", () => {
    // banco = 100.000 inicial; efectivo con un gasto de 8.500 y un ajuste +8.500;
    // mercado_pago con un comprobante de 15.000.
    expect(calcularSaldo("banco", 10000000, [], [], [])).toBe(10000000);
    expect(
      calcularSaldo(
        "mercado_pago",
        0,
        [{ medio_pago: "mercado_pago", monto_centavos: 1500000 }],
        [],
        [],
      ),
    ).toBe(1500000);
    expect(
      calcularSaldo(
        "efectivo",
        0,
        [],
        [{ medio_pago: "efectivo", monto_centavos: 850000 }],
        [{ medio_pago: "efectivo", monto_centavos: 850000 }],
      ),
    ).toBe(0);
  });
});

describe("calcularSaldos — las tres cajas + total (invariante 1)", () => {
  it("todo vacío: las tres cajas y el total dan 0", () => {
    const resultado = calcularSaldos(
      { banco: 0, mercado_pago: 0, efectivo: 0 },
      [],
      [],
      [],
    );
    expect(resultado).toEqual([
      { medio_pago: "banco", saldo_centavos: 0 },
      { medio_pago: "mercado_pago", saldo_centavos: 0 },
      { medio_pago: "efectivo", saldo_centavos: 0 },
      { medio_pago: "total", saldo_centavos: 0 },
    ]);
  });

  it("invariante 1: total siempre es la suma de las tres cajas", () => {
    const resultado = calcularSaldos(
      { banco: 10000000, mercado_pago: 0, efectivo: 0 },
      [
        { medio_pago: "mercado_pago", monto_centavos: 1500000 },
        { medio_pago: "efectivo", monto_centavos: 300000 },
      ],
      [{ medio_pago: "efectivo", monto_centavos: 850000 }],
      [{ medio_pago: "efectivo", monto_centavos: 850000 }],
    );

    const total = resultado.find((r) => r.medio_pago === "total")!;
    const sumaCajas = resultado
      .filter((r) => r.medio_pago !== "total")
      .reduce((acc, r) => acc + r.saldo_centavos, 0);

    expect(total.saldo_centavos).toBe(sumaCajas);
    // banco 100.000 + MP 15.000 + efectivo (3.000 comprobante − 8.500 gasto + 8.500 ajuste = 3.000) = 118.000.
    expect(total.saldo_centavos).toBe(11800000);
  });

  it("el total también puede ser negativo si una caja quedó muy en rojo", () => {
    const resultado = calcularSaldos(
      { banco: 0, mercado_pago: 0, efectivo: 0 },
      [],
      [{ medio_pago: "efectivo", monto_centavos: 500000 }],
      [],
    );
    const total = resultado.find((r) => r.medio_pago === "total")!;
    expect(total.saldo_centavos).toBe(-500000);
  });
});

describe("calcularSaldo — rendiciones (Revendedores)", () => {
  it("una rendición sola sube el saldo del medio correspondiente", () => {
    const rendiciones: MovimientoCaja[] = [
      { medio_pago: "efectivo", monto_centavos: 500000 },
    ];
    expect(calcularSaldo("efectivo", 0, [], [], [], rendiciones)).toBe(500000);
  });

  it("una rendición de un medio no afecta el saldo de otro medio", () => {
    const rendiciones: MovimientoCaja[] = [
      { medio_pago: "banco", monto_centavos: 500000 },
    ];
    expect(calcularSaldo("efectivo", 0, [], [], [], rendiciones)).toBe(0);
    expect(calcularSaldo("banco", 0, [], [], [], rendiciones)).toBe(500000);
  });

  it("combina saldo inicial + comprobante + gasto + ajuste + rendición", () => {
    const saldo = calcularSaldo(
      "efectivo",
      1000000,
      [{ medio_pago: "efectivo", monto_centavos: 300000 }],
      [{ medio_pago: "efectivo", monto_centavos: 200000 }],
      [{ medio_pago: "efectivo", monto_centavos: -100000 }],
      [{ medio_pago: "efectivo", monto_centavos: 400000 }],
    );
    // 1.000.000 + 300.000 - 200.000 - 100.000 + 400.000 = 1.400.000
    expect(saldo).toBe(1400000);
  });

  it("sin pasar el parámetro rendiciones, calcularSaldo funciona igual que antes (default [])", () => {
    expect(calcularSaldo("efectivo", 100000, [], [], [])).toBe(100000);
  });
});

describe("calcularSaldos — rendiciones incluidas en el total (invariante 1)", () => {
  it("el total sigue siendo la suma de las tres cajas con rendiciones incluidas", () => {
    const resultado = calcularSaldos(
      { banco: 0, mercado_pago: 0, efectivo: 0 },
      [],
      [],
      [],
      [
        { medio_pago: "efectivo", monto_centavos: 200000 },
        { medio_pago: "banco", monto_centavos: 300000 },
      ],
    );

    const total = resultado.find((r) => r.medio_pago === "total")!;
    const sumaCajas = resultado
      .filter((r) => r.medio_pago !== "total")
      .reduce((acc, r) => acc + r.saldo_centavos, 0);

    expect(total.saldo_centavos).toBe(sumaCajas);
    expect(total.saldo_centavos).toBe(500000);
  });

  it("sin pasar el parámetro rendiciones, calcularSaldos funciona igual que antes (default [])", () => {
    const resultado = calcularSaldos(
      { banco: 10000000, mercado_pago: 0, efectivo: 0 },
      [],
      [],
      [],
    );
    expect(resultado.find((r) => r.medio_pago === "total")!.saldo_centavos).toBe(
      10000000,
    );
  });
});

describe("calcularSaldo — transferencias (Tareas)", () => {
  it("una transferencia resta del origen", () => {
    const transferencias: TransferenciaCajaMovimiento[] = [
      { origen: "efectivo", destino: "mercado_pago", monto_centavos: 500000 },
    ];
    expect(calcularSaldo("efectivo", 1000000, [], [], [], [], transferencias)).toBe(
      500000,
    );
  });

  it("una transferencia suma al destino", () => {
    const transferencias: TransferenciaCajaMovimiento[] = [
      { origen: "efectivo", destino: "mercado_pago", monto_centavos: 500000 },
    ];
    expect(calcularSaldo("mercado_pago", 0, [], [], [], [], transferencias)).toBe(
      500000,
    );
  });

  it("una transferencia no afecta a un tercer medio ajeno", () => {
    const transferencias: TransferenciaCajaMovimiento[] = [
      { origen: "efectivo", destino: "mercado_pago", monto_centavos: 500000 },
    ];
    expect(calcularSaldo("banco", 1000000, [], [], [], [], transferencias)).toBe(
      1000000,
    );
  });

  it("varias transferencias del mismo origen se acumulan", () => {
    const transferencias: TransferenciaCajaMovimiento[] = [
      { origen: "efectivo", destino: "mercado_pago", monto_centavos: 300000 },
      { origen: "efectivo", destino: "banco", monto_centavos: 200000 },
    ];
    expect(calcularSaldo("efectivo", 1000000, [], [], [], [], transferencias)).toBe(
      500000,
    );
  });

  it("combina saldo inicial + comprobante + gasto + ajuste + rendición + transferencia", () => {
    const saldo = calcularSaldo(
      "efectivo",
      1000000,
      [{ medio_pago: "efectivo", monto_centavos: 300000 }],
      [{ medio_pago: "efectivo", monto_centavos: 200000 }],
      [{ medio_pago: "efectivo", monto_centavos: -100000 }],
      [{ medio_pago: "efectivo", monto_centavos: 400000 }],
      [{ origen: "efectivo", destino: "mercado_pago", monto_centavos: 700000 }],
    );
    // 1.000.000 + 300.000 - 200.000 - 100.000 + 400.000 - 700.000 = 700.000
    expect(saldo).toBe(700000);
  });

  it("sin pasar el parámetro transferencias, calcularSaldo funciona igual que antes (default [])", () => {
    expect(calcularSaldo("efectivo", 100000, [], [], [], [])).toBe(100000);
  });
});

describe("calcularSaldos — transferencias no cambian el total (invariante 14)", () => {
  it("una transferencia entre dos cajas deja el total intacto", () => {
    const sinTransferencia = calcularSaldos(
      { banco: 0, mercado_pago: 0, efectivo: 1000000 },
      [],
      [],
      [],
    );
    const conTransferencia = calcularSaldos(
      { banco: 0, mercado_pago: 0, efectivo: 1000000 },
      [],
      [],
      [],
      [],
      [{ origen: "efectivo", destino: "mercado_pago", monto_centavos: 400000 }],
    );

    const totalSin = sinTransferencia.find((r) => r.medio_pago === "total")!;
    const totalCon = conTransferencia.find((r) => r.medio_pago === "total")!;
    expect(totalCon.saldo_centavos).toBe(totalSin.saldo_centavos);

    const efectivoConTransferencia = conTransferencia.find(
      (r) => r.medio_pago === "efectivo",
    )!;
    const mpConTransferencia = conTransferencia.find(
      (r) => r.medio_pago === "mercado_pago",
    )!;
    expect(efectivoConTransferencia.saldo_centavos).toBe(600000);
    expect(mpConTransferencia.saldo_centavos).toBe(400000);
  });

  it("varias transferencias encadenadas (efectivo -> MP -> banco) siguen sin cambiar el total", () => {
    const resultado = calcularSaldos(
      { banco: 0, mercado_pago: 0, efectivo: 1000000 },
      [],
      [],
      [],
      [],
      [
        { origen: "efectivo", destino: "mercado_pago", monto_centavos: 1000000 },
        { origen: "mercado_pago", destino: "banco", monto_centavos: 600000 },
      ],
    );

    const total = resultado.find((r) => r.medio_pago === "total")!;
    const sumaCajas = resultado
      .filter((r) => r.medio_pago !== "total")
      .reduce((acc, r) => acc + r.saldo_centavos, 0);

    expect(total.saldo_centavos).toBe(sumaCajas);
    expect(total.saldo_centavos).toBe(1000000);
    expect(resultado.find((r) => r.medio_pago === "efectivo")!.saldo_centavos).toBe(0);
    expect(resultado.find((r) => r.medio_pago === "mercado_pago")!.saldo_centavos).toBe(
      400000,
    );
    expect(resultado.find((r) => r.medio_pago === "banco")!.saldo_centavos).toBe(600000);
  });

  it("sin pasar el parámetro transferencias, calcularSaldos funciona igual que antes (default [])", () => {
    const resultado = calcularSaldos(
      { banco: 10000000, mercado_pago: 0, efectivo: 0 },
      [],
      [],
      [],
    );
    expect(resultado.find((r) => r.medio_pago === "total")!.saldo_centavos).toBe(
      10000000,
    );
  });
});

describe("calcularSaldo — cobros (Ventas a crédito)", () => {
  it("un cobro suma al medio en el que se cobró", () => {
    const cobros: MovimientoCaja[] = [
      { medio_pago: "efectivo", monto_centavos: 200000 },
    ];
    expect(calcularSaldo("efectivo", 0, [], [], [], [], [], cobros)).toBe(200000);
  });

  it("un cobro no afecta a un medio ajeno", () => {
    const cobros: MovimientoCaja[] = [
      { medio_pago: "efectivo", monto_centavos: 200000 },
    ];
    expect(calcularSaldo("banco", 1000000, [], [], [], [], [], cobros)).toBe(1000000);
  });

  it("varios cobros del mismo medio se acumulan", () => {
    const cobros: MovimientoCaja[] = [
      { medio_pago: "mercado_pago", monto_centavos: 100000 },
      { medio_pago: "mercado_pago", monto_centavos: 50000 },
    ];
    expect(calcularSaldo("mercado_pago", 0, [], [], [], [], [], cobros)).toBe(150000);
  });

  it("una venta a crédito solo suma lo cobrado en el momento, el cobro posterior suma aparte", () => {
    // Venta de $1000 con $400 cobrados en el momento (comprobantes ya
    // mapeado con cobrado_centavos, no monto_centavos) + un cobro
    // posterior de $600 en el mismo medio.
    const comprobantes: MovimientoCaja[] = [
      { medio_pago: "efectivo", monto_centavos: 400 },
    ];
    const cobros: MovimientoCaja[] = [
      { medio_pago: "efectivo", monto_centavos: 600 },
    ];
    expect(calcularSaldo("efectivo", 0, comprobantes, [], [], [], [], cobros)).toBe(1000);
  });

  it("sin pasar el parámetro cobros, calcularSaldo funciona igual que antes (default [])", () => {
    expect(calcularSaldo("efectivo", 100000, [], [], [], [], [])).toBe(100000);
  });
});

describe("calcularSaldos — cobros incluidos en el total", () => {
  it("un cobro suma al total igual que a su caja", () => {
    const cobros: MovimientoCaja[] = [
      { medio_pago: "banco", monto_centavos: 300000 },
    ];
    const resultado = calcularSaldos(
      { banco: 0, mercado_pago: 0, efectivo: 0 },
      [],
      [],
      [],
      [],
      [],
      cobros,
    );
    expect(resultado.find((r) => r.medio_pago === "banco")!.saldo_centavos).toBe(300000);
    expect(resultado.find((r) => r.medio_pago === "total")!.saldo_centavos).toBe(300000);
  });

  it("sin pasar el parámetro cobros, calcularSaldos funciona igual que antes (default [])", () => {
    const resultado = calcularSaldos(
      { banco: 10000000, mercado_pago: 0, efectivo: 0 },
      [],
      [],
      [],
    );
    expect(resultado.find((r) => r.medio_pago === "total")!.saldo_centavos).toBe(10000000);
  });
});

describe("calcularSaldo — pagos de deuda (0027_pagos_deuda.sql)", () => {
  it("un pago de deuda resta del medio de donde salió la plata", () => {
    const pagosDeuda: MovimientoCaja[] = [
      { medio_pago: "efectivo", monto_centavos: 40000 },
    ];
    expect(
      calcularSaldo("efectivo", 100000, [], [], [], [], [], [], pagosDeuda),
    ).toBe(60000);
  });

  it("un pago de deuda no afecta a un medio ajeno", () => {
    const pagosDeuda: MovimientoCaja[] = [
      { medio_pago: "banco", monto_centavos: 40000 },
    ];
    expect(
      calcularSaldo("efectivo", 100000, [], [], [], [], [], [], pagosDeuda),
    ).toBe(100000);
  });

  it("varios pagos del mismo medio se acumulan", () => {
    const pagosDeuda: MovimientoCaja[] = [
      { medio_pago: "mercado_pago", monto_centavos: 10000 },
      { medio_pago: "mercado_pago", monto_centavos: 5000 },
    ];
    expect(
      calcularSaldo("mercado_pago", 100000, [], [], [], [], [], [], pagosDeuda),
    ).toBe(85000);
  });

  it("una deuda en USD resta el monto en pesos que salió de la caja (monto_caja_centavos), no el monto en USD", () => {
    // El caller mapea pagos_deuda.monto_caja_centavos (no monto_centavos)
    // al armar el MovimientoCaja[] — acá se simula ya mapeado.
    const pagosDeuda: MovimientoCaja[] = [
      { medio_pago: "banco", monto_centavos: 760000 },
    ];
    expect(calcularSaldo("banco", 1000000, [], [], [], [], [], [], pagosDeuda)).toBe(
      240000,
    );
  });

  it("sin pasar el parámetro pagosDeuda, calcularSaldo funciona igual que antes (default [])", () => {
    expect(calcularSaldo("efectivo", 100000, [], [], [], [], [], [])).toBe(100000);
  });
});

describe("calcularSaldos — pagos de deuda incluidos en el total", () => {
  it("un pago de deuda resta del total igual que de su caja", () => {
    const pagosDeuda: MovimientoCaja[] = [
      { medio_pago: "banco", monto_centavos: 300000 },
    ];
    const resultado = calcularSaldos(
      { banco: 1000000, mercado_pago: 0, efectivo: 0 },
      [],
      [],
      [],
      [],
      [],
      [],
      pagosDeuda,
    );
    expect(resultado.find((r) => r.medio_pago === "banco")!.saldo_centavos).toBe(700000);
    expect(resultado.find((r) => r.medio_pago === "total")!.saldo_centavos).toBe(700000);
  });

  it("sin pasar el parámetro pagosDeuda, calcularSaldos funciona igual que antes (default [])", () => {
    const resultado = calcularSaldos(
      { banco: 10000000, mercado_pago: 0, efectivo: 0 },
      [],
      [],
      [],
    );
    expect(resultado.find((r) => r.medio_pago === "total")!.saldo_centavos).toBe(10000000);
  });
});

/**
 * `depositos` — "pasar a la cuenta" (supabase/migrations/0037_plata_en_manos.sql):
 * a diferencia de `pagosDeuda`/`gastos`/etc, un depósito no se filtra de
 * forma simétrica por medio — SIEMPRE resta de 'efectivo' (sea cual sea su
 * `medio_pago` destino) y solo suma al medio que declara.
 */
describe("calcularSaldo — depósitos a la Cuenta Ananja", () => {
  it("un depósito resta de efectivo, sin importar su medio_pago destino", () => {
    const depositos: DepositoCuentaMovimiento[] = [
      { medio_pago: "mercado_pago", monto_centavos: 150000 },
    ];
    expect(
      calcularSaldo("efectivo", 200000, [], [], [], [], [], [], [], depositos),
    ).toBe(50000);
  });

  it("un depósito suma solo al medio que declara como destino", () => {
    const depositos: DepositoCuentaMovimiento[] = [
      { medio_pago: "mercado_pago", monto_centavos: 150000 },
    ];
    expect(
      calcularSaldo("mercado_pago", 0, [], [], [], [], [], [], [], depositos),
    ).toBe(150000);
    expect(
      calcularSaldo("banco", 0, [], [], [], [], [], [], [], depositos),
    ).toBe(0);
  });

  it("varios depósitos a distintos medios restan todos de efectivo", () => {
    const depositos: DepositoCuentaMovimiento[] = [
      { medio_pago: "banco", monto_centavos: 80000 },
      { medio_pago: "mercado_pago", monto_centavos: 40000 },
    ];
    expect(
      calcularSaldo("efectivo", 200000, [], [], [], [], [], [], [], depositos),
    ).toBe(80000);
  });

  it("sin pasar el parámetro depositos, calcularSaldo funciona igual que antes (default [])", () => {
    expect(calcularSaldo("efectivo", 100000, [], [], [], [], [], [], [])).toBe(
      100000,
    );
  });
});

describe("calcularSaldos — depósitos: el total no cambia (solo mueven entre cajas)", () => {
  it("un depósito de efectivo a mercado_pago no altera el total", () => {
    const depositos: DepositoCuentaMovimiento[] = [
      { medio_pago: "mercado_pago", monto_centavos: 150000 },
    ];
    const resultado = calcularSaldos(
      { banco: 0, mercado_pago: 0, efectivo: 200000 },
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      depositos,
    );
    expect(
      resultado.find((r) => r.medio_pago === "efectivo")!.saldo_centavos,
    ).toBe(50000);
    expect(
      resultado.find((r) => r.medio_pago === "mercado_pago")!.saldo_centavos,
    ).toBe(150000);
    expect(resultado.find((r) => r.medio_pago === "total")!.saldo_centavos).toBe(
      200000,
    );
  });

  it("sin pasar el parámetro depositos, calcularSaldos funciona igual que antes (default [])", () => {
    const resultado = calcularSaldos(
      { banco: 10000000, mercado_pago: 0, efectivo: 0 },
      [],
      [],
      [],
    );
    expect(resultado.find((r) => r.medio_pago === "total")!.saldo_centavos).toBe(10000000);
  });
});
