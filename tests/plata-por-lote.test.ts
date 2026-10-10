import { describe, expect, it } from "vitest";

import { calcularParteAnanjaFifo } from "@/lib/dominio/plata";
import {
  armarDesglose,
  calcularLineasPorLote,
  imputarDepositos,
  recibidoPorLote,
  repartirEnterosRestoMayor,
  repartirRendicionesPorLote,
  type LineaLote,
  type LoteFecha,
  type RendicionConParteAnanja,
  type VentaConLote,
} from "@/lib/dominio/plata-por-lote";

// Datos ficticios: Coordinadora A/B, Revendedora 1/2, lotes L1/L2/L3.
const COORD_A = "coordinadora-a";
const COORD_B = "coordinadora-b";
const REV_1 = "revendedora-1";
const REV_2 = "revendedora-2";

const LOTES: LoteFecha[] = [
  { id: "L1", fecha: "2026-09-14" },
  { id: "L2", fecha: "2026-10-02" },
  { id: "L3", fecha: "2026-10-20" },
];

function venta(
  vendedorId: string,
  cantidad: number,
  precioCostoCentavos: number,
  costoAnanjaCentavos: number,
  loteId: string | null,
): VentaConLote {
  return { vendedorId, cantidad, precioCostoCentavos, costoAnanjaCentavos, loteId };
}

/** Rendiciones con su parte Ananja calculada por el espejo real de la vista (`calcularParteAnanjaFifo`). */
function rendicionesConParte(
  ventas: VentaConLote[],
  crudas: { id: string; tenedorId: string; vendedorId: string; montoCentavos: number }[],
): RendicionConParteAnanja[] {
  const partes = calcularParteAnanjaFifo(ventas, crudas);
  return crudas.map((r, i) => ({ ...r, montoAnanjaCentavos: partes[i].monto_centavos }));
}

function aporteDe(
  repartos: ReturnType<typeof repartirRendicionesPorLote>,
  rendicionId: string,
): Record<string, number> {
  const reparto = repartos.find((r) => r.rendicionId === rendicionId)!;
  return Object.fromEntries(reparto.aportes.map((a) => [a.loteId ?? "null", a.centavos]));
}

describe("repartirEnterosRestoMayor", () => {
  it("suma exactamente el total y reparte los centavos que sobran por mayor decimal", () => {
    const r = repartirEnterosRestoMayor(100, new Map([["a", 1], ["b", 1], ["c", 1]]));
    expect([...r.values()]).toEqual([34, 33, 33]);

    const s = repartirEnterosRestoMayor(10, new Map([["a", 2], ["b", 1]]));
    expect(s.get("a")).toBe(7); // 6,67 -> 7
    expect(s.get("b")).toBe(3); // 3,33 -> 3
  });

  it("el resto va a quien tiene el decimal más grande, no al primero", () => {
    // 7 * [1, 5, 1] / 7 = [1, 5, 1] exacto; con 8: [1,14; 5,71; 1,14] -> piso [1,5,1] sobra 1 -> el 5,71
    const r = repartirEnterosRestoMayor(8, new Map([["a", 1], ["b", 5], ["c", 1]]));
    expect(r.get("a")).toBe(1);
    expect(r.get("b")).toBe(6);
    expect(r.get("c")).toBe(1);
  });

  it("devuelve vacío si no hay nada que repartir", () => {
    expect(repartirEnterosRestoMayor(0, new Map([["a", 1]])).size).toBe(0);
    expect(repartirEnterosRestoMayor(50, new Map()).size).toBe(0);
    expect(repartirEnterosRestoMayor(50, new Map([["a", 0]])).size).toBe(0);
  });
});

describe("repartirRendicionesPorLote", () => {
  it("un solo lote: toda la parte Ananja es de ese lote", () => {
    const ventas = [venta(REV_1, 10, 1000, 800, "L1")];
    const rendiciones = rendicionesConParte(ventas, [
      { id: "r1", tenedorId: COORD_A, vendedorId: REV_1, montoCentavos: 10000 },
    ]);
    const repartos = repartirRendicionesPorLote(ventas, rendiciones);
    expect(aporteDe(repartos, "r1")).toEqual({ L1: 8000 });
  });

  it("dos lotes con un pago que cruza de uno a otro", () => {
    const ventas = [venta(REV_1, 5, 1000, 800, "L1"), venta(REV_1, 5, 1000, 900, "L2")];
    const rendiciones = rendicionesConParte(ventas, [
      { id: "r1", tenedorId: COORD_A, vendedorId: REV_1, montoCentavos: 3000 },
      { id: "r2", tenedorId: COORD_A, vendedorId: REV_1, montoCentavos: 4000 },
    ]);
    const repartos = repartirRendicionesPorLote(ventas, rendiciones);
    // r1: 3000 de L1 -> 2400. r2: 2000 que terminan L1 (1600) + 2000 de L2 (1800).
    expect(aporteDe(repartos, "r1")).toEqual({ L1: 2400 });
    expect(aporteDe(repartos, "r2")).toEqual({ L1: 1600, L2: 1800 });
  });

  it("coordinadora con margen propio: reparte la parte Ananja, no lo cobrado a la revendedora", () => {
    // La coordinadora le cobra 1500 a la revendedora; Ananja le exige 1000 (L1) y 1200 (L2).
    const ventas = [venta(REV_1, 5, 1500, 1000, "L1"), venta(REV_1, 5, 1500, 1200, "L2")];
    const rendiciones = rendicionesConParte(ventas, [
      { id: "r1", tenedorId: COORD_A, vendedorId: REV_1, montoCentavos: 9000 },
    ]);
    // 7500 de L1 (5000 para Ananja) + 1500 de L2 (1200) = 6200
    expect(rendiciones[0].montoAnanjaCentavos).toBe(6200);

    const repartos = repartirRendicionesPorLote(ventas, rendiciones);
    expect(aporteDe(repartos, "r1")).toEqual({ L1: 5000, L2: 1200 });
    // Repartir en proporción a lo cobrado (7500 / 1500) daría 5167 / 1033.
  });

  it("el reparto suma exactamente el monto Ananja de la rendición y redondea con resto mayor", () => {
    const ventas = [venta(REV_1, 1, 1000, 1000, "L1"), venta(REV_1, 1, 1000, 1000, "L2"), venta(REV_1, 1, 1000, 1000, "L3")];
    // Monto Ananja dado a mano (la vista lo redondeó distinto de la suma exacta): 100 entre 3 pesos iguales.
    const rendiciones: RendicionConParteAnanja[] = [
      { id: "r1", tenedorId: COORD_A, vendedorId: REV_1, montoCentavos: 3000, montoAnanjaCentavos: 100 },
    ];
    const [reparto] = repartirRendicionesPorLote(ventas, rendiciones);
    expect(reparto.aportes.map((a) => a.centavos)).toEqual([34, 33, 33]);
    expect(reparto.aportes.reduce((acc, a) => acc + a.centavos, 0)).toBe(100);
  });

  it("venta sin lote y excedente van a 'sin lote' (null)", () => {
    const ventas = [venta(REV_1, 1, 1000, 800, null), venta(REV_1, 1, 1000, 800, "L1")];
    const rendiciones = rendicionesConParte(ventas, [
      { id: "r1", tenedorId: COORD_A, vendedorId: REV_1, montoCentavos: 2500 },
    ]);
    // 800 (sin lote) + 800 (L1) + 500 de excedente (100% Ananja, sin lote) = 2100
    expect(rendiciones[0].montoAnanjaCentavos).toBe(2100);
    const repartos = repartirRendicionesPorLote(ventas, rendiciones);
    expect(aporteDe(repartos, "r1")).toEqual({ null: 1300, L1: 800 });
  });

  it("sin ventas, toda la rendición es excedente: va a null", () => {
    const rendiciones = rendicionesConParte([], [
      { id: "r1", tenedorId: COORD_A, vendedorId: REV_1, montoCentavos: 1234 },
    ]);
    const repartos = repartirRendicionesPorLote([], rendiciones);
    expect(aporteDe(repartos, "r1")).toEqual({ null: 1234 });
  });

  it("si no hay tramos pero el monto Ananja es > 0, todo va a null; si es 0, no hay aportes", () => {
    const repartos = repartirRendicionesPorLote(
      [],
      [
        { id: "r1", tenedorId: COORD_A, vendedorId: REV_1, montoCentavos: 0, montoAnanjaCentavos: 50 },
        { id: "r2", tenedorId: COORD_A, vendedorId: REV_1, montoCentavos: 0, montoAnanjaCentavos: 0 },
      ],
    );
    expect(aporteDe(repartos, "r1")).toEqual({ null: 50 });
    expect(repartos[1].aportes).toEqual([]);
  });

  it("dos revendedoras de la misma coordinadora: cada una con su propio FIFO", () => {
    const ventas = [
      venta(REV_1, 5, 1000, 800, "L1"),
      venta(REV_2, 5, 1000, 800, "L2"),
      venta(REV_1, 5, 1000, 800, "L2"),
    ];
    const rendiciones = rendicionesConParte(ventas, [
      { id: "r1", tenedorId: COORD_A, vendedorId: REV_1, montoCentavos: 6000 },
      { id: "r2", tenedorId: COORD_A, vendedorId: REV_2, montoCentavos: 2000 },
    ]);
    const repartos = repartirRendicionesPorLote(ventas, rendiciones);
    // Rev 1: 5000 de L1 (4000) + 1000 de L2 (800). Rev 2: 2000 de L2 (1600).
    expect(aporteDe(repartos, "r1")).toEqual({ L1: 4000, L2: 800 });
    expect(aporteDe(repartos, "r2")).toEqual({ L2: 1600 });
    expect([...recibidoPorLote(repartos, COORD_A)]).toEqual([["L1", 4000], ["L2", 2400]]);
  });

  it("una revendedora con rendiciones a dos tenedores: cuentan las del pedido, pero el FIFO considera todas", () => {
    const ventas = [venta(REV_1, 5, 1000, 800, "L1"), venta(REV_1, 5, 1000, 800, "L2")];
    const rendiciones = rendicionesConParte(ventas, [
      { id: "r1", tenedorId: COORD_A, vendedorId: REV_1, montoCentavos: 4000 },
      { id: "r2", tenedorId: COORD_B, vendedorId: REV_1, montoCentavos: 4000 },
    ]);
    const repartos = repartirRendicionesPorLote(ventas, rendiciones);
    // r1 (A) cubre 4000 de L1; r2 (B) termina L1 (1000) y empieza L2 (3000).
    expect(Object.fromEntries(recibidoPorLote(repartos, COORD_A))).toEqual({ L1: 3200 });
    expect(Object.fromEntries(recibidoPorLote(repartos, COORD_B))).toEqual({ L1: 800, L2: 2400 });
    // Mirando solo las de B (sin las de A) todo caería en L1: el FIFO no se puede cortar por tenedor.
    const soloB = repartirRendicionesPorLote(ventas, rendicionesConParte(ventas, [rendiciones[1]]));
    expect(Object.fromEntries(recibidoPorLote(soloB, COORD_B))).toEqual({ L1: 3200 });
  });

  it("propiedad: para cualquier mezcla, los aportes de cada rendición suman su monto Ananja", () => {
    let semilla = 12345;
    const azar = (max: number) => {
      semilla = (semilla * 1103515245 + 12345) % 2147483648;
      return semilla % max;
    };
    const idsLote = [null, "L1", "L2", "L3"];
    for (let caso = 0; caso < 50; caso++) {
      const ventas: VentaConLote[] = [];
      for (let i = 0; i < 1 + azar(6); i++) {
        const precio = 100 + azar(5000);
        ventas.push(venta(REV_1, 1 + azar(9), precio, Math.max(1, precio - azar(60)), idsLote[azar(4)]));
      }
      const crudas = Array.from({ length: 1 + azar(5) }, (_, i) => ({
        id: `r${i}`,
        tenedorId: COORD_A,
        vendedorId: REV_1,
        montoCentavos: 1 + azar(40000),
      }));
      const rendiciones = rendicionesConParte(ventas, crudas);
      const repartos = repartirRendicionesPorLote(ventas, rendiciones);
      repartos.forEach((reparto, i) => {
        const suma = reparto.aportes.reduce((acc, a) => acc + a.centavos, 0);
        expect(suma).toBe(rendiciones[i].montoAnanjaCentavos);
        expect(reparto.aportes.every((a) => Number.isInteger(a.centavos) && a.centavos >= 0)).toBe(true);
      });
    }
  });
});

describe("imputarDepositos", () => {
  // Recibido: sin lote 1000, L1 (el más viejo) 8000, L2 5000. Se pasan en desorden a propósito.
  const recibido = new Map<string | null, number>([
    ["L2", 5000],
    ["L1", 8000],
    [null, 1000],
  ]);

  it("sin depósitos: todo pendiente, ordenado sin lote, lote más viejo, más nuevo", () => {
    const lineas = imputarDepositos(recibido, 0, LOTES);
    expect(lineas.map((l) => l.loteId)).toEqual([null, "L1", "L2"]);
    expect(lineas.map((l) => l.pendienteCentavos)).toEqual([1000, 8000, 5000]);
    expect(lineas[0].fecha).toBeNull();
    expect(lineas[1].fecha).toBe("2026-09-14");
  });

  it("un depósito que cancela justo 'sin lote'", () => {
    const lineas = imputarDepositos(recibido, 1000, LOTES);
    expect(lineas.map((l) => l.pendienteCentavos)).toEqual([0, 8000, 5000]);
    expect(lineas[0].pasadoCentavos).toBe(1000);
  });

  it("un depósito que cancela justo un lote y deja el siguiente intacto", () => {
    const lineas = imputarDepositos(recibido, 9000, LOTES);
    expect(lineas.map((l) => l.pendienteCentavos)).toEqual([0, 0, 5000]);
  });

  it("un depósito parcial entra al lote más viejo", () => {
    const lineas = imputarDepositos(recibido, 4000, LOTES);
    expect(lineas.map((l) => l.pasadoCentavos)).toEqual([1000, 3000, 0]);
    expect(lineas.map((l) => l.pendienteCentavos)).toEqual([0, 5000, 5000]);
  });

  it("varios depósitos juntos se descuentan igual que uno solo (se suman antes)", () => {
    expect(imputarDepositos(recibido, 1500 + 2500, LOTES)).toEqual(imputarDepositos(recibido, 4000, LOTES));
  });

  it("un depósito mayor que todo lo recibido deja todo en cero (sin pendiente negativo)", () => {
    const lineas = imputarDepositos(recibido, 20000, LOTES);
    expect(lineas.map((l) => l.pendienteCentavos)).toEqual([0, 0, 0]);
    expect(lineas.reduce((acc, l) => acc + l.pasadoCentavos, 0)).toBe(14000);
  });

  it("desempata fechas iguales por id y manda al final un lote que no figura en la lista", () => {
    const lineas = imputarDepositos(
      new Map<string | null, number>([["z", 1], ["b", 1], ["a", 1], ["desconocido", 1]]),
      0,
      [
        { id: "a", fecha: "2026-01-01" },
        { id: "b", fecha: "2026-01-01" },
        { id: "z", fecha: "2025-12-31" },
      ],
    );
    expect(lineas.map((l) => l.loteId)).toEqual(["z", "a", "b", "desconocido"]);
    expect(lineas[3].fecha).toBeNull();
  });
});

describe("calcularLineasPorLote + armarDesglose", () => {
  // Coordinadora A recibió de Revendedora 1 y 2; B recibió algo de la 1 y no figura en el resultado de A.
  const ventas = [
    venta(REV_1, 5, 1000, 800, "L1"),
    venta(REV_1, 5, 1000, 800, "L2"),
    venta(REV_2, 2, 1000, 800, null),
  ];
  const rendiciones = rendicionesConParte(ventas, [
    { id: "r1", tenedorId: COORD_A, vendedorId: REV_1, montoCentavos: 6000 },
    { id: "r2", tenedorId: COORD_B, vendedorId: REV_1, montoCentavos: 1000 },
    { id: "r3", tenedorId: COORD_A, vendedorId: REV_2, montoCentavos: 2000 },
  ]);
  const base = { tenedorId: COORD_A, ventas, rendiciones, lotes: LOTES };

  it("arma recibido / pasado / pendiente por lote", () => {
    const lineas = calcularLineasPorLote({ ...base, depositosCentavos: 1000 });
    // A: sin lote 1600 (rev. 2), L1 4000, L2 800. Depósito 1000 sale de 'sin lote'.
    expect(lineas.map((l) => [l.loteId, l.recibidoCentavos, l.pasadoCentavos, l.pendienteCentavos])).toEqual([
      [null, 1600, 1000, 600],
      ["L1", 4000, 0, 4000],
      ["L2", 800, 0, 800],
    ]);
  });

  it("cuando cierra con el total no hay 'Otros movimientos'", () => {
    const lineas = calcularLineasPorLote({ ...base, depositosCentavos: 1000 });
    const desglose = armarDesglose(lineas, 600 + 4000 + 800)!;
    expect(desglose.lineas.map((l) => l.loteId)).toEqual([null, "L1", "L2"]);
    expect(desglose.otrosMovimientosCentavos).toBe(0);
  });

  it("solo lista lotes con pendiente > 0", () => {
    const lineas = calcularLineasPorLote({ ...base, depositosCentavos: 1600 + 4000 });
    const desglose = armarDesglose(lineas, 800)!;
    expect(desglose.lineas.map((l) => l.loteId)).toEqual(["L2"]);
  });

  it("si no cierra, la diferencia queda como 'Otros movimientos' (positiva o negativa)", () => {
    const lineas = calcularLineasPorLote({ ...base, depositosCentavos: 0 });
    expect(armarDesglose(lineas, 6400 + 900)!.otrosMovimientosCentavos).toBe(900);
    expect(armarDesglose(lineas, 6400 - 400)!.otrosMovimientosCentavos).toBe(-400);
  });

  it("no hay sección si el total no es positivo (depósitos de más) o no queda nada pendiente", () => {
    const deMas = calcularLineasPorLote({ ...base, depositosCentavos: 99999 });
    expect(armarDesglose(deMas, -1000)).toBeNull();
    expect(armarDesglose(deMas, 0)).toBeNull();
    // Total positivo por otros motivos, pero ningún lote con pendiente: tampoco se muestra.
    expect(armarDesglose(deMas, 500)).toBeNull();
  });

  it("un tenedor sin rendiciones recibidas no tiene líneas", () => {
    expect(calcularLineasPorLote({ ...base, tenedorId: "nadie", depositosCentavos: 0 })).toEqual([]);
    expect(armarDesglose([] as LineaLote[], 1000)).toBeNull();
  });
});
