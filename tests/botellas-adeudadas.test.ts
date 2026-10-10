import { describe, expect, it } from "vitest";

import {
  TOLERANCIA_CENTAVOS,
  armarResumenBotellas,
  calcularSinPagar,
  calcularSinPasar,
  filasEnPoder,
  redondearBotellas,
  type CoordinadoraEntrada,
  type FilaBotellas,
  type ProductoRef,
  type VentaBotellas,
} from "@/lib/dominio/botellas-adeudadas";
import type { EnManosFila } from "@/lib/dominio/lote-en-manos";
import { calcularParteAnanjaFifo } from "@/lib/dominio/plata";
import {
  calcularLineasPorLote,
  type LoteFecha,
  type RendicionConParteAnanja,
} from "@/lib/dominio/plata-por-lote";

// Datos ficticios: Coordinadora A/B, Revendedora 1/2/3, lotes L1/L2/L3.
const COORD_A = "coordinadora-a";
const COORD_B = "coordinadora-b";
const REV_1 = "revendedora-1";
const REV_2 = "revendedora-2";
const REV_3 = "revendedora-3";

const P250 = "p250";
const P500 = "p500";
const PRODUCTOS: ProductoRef[] = [
  { id: P250, nombre: "Botella 250 ml", presentacionMl: 250 },
  { id: P500, nombre: "Botella 500 ml", presentacionMl: 500 },
];

const LOTES: LoteFecha[] = [
  { id: "L1", fecha: "2026-09-14" },
  { id: "L2", fecha: "2026-10-02" },
  { id: "L3", fecha: "2026-10-20" },
];

/** Precios en centavos redondos para que las cuentas se lean: 250 ml cuesta 500 pesos, 500 ml 900. */
const C250 = 50000;
const C500 = 90000;

function venta(
  vendedorId: string,
  productoId: string,
  cantidad: number,
  loteId: string | null,
  precioCostoCentavos: number,
  costoAnanjaCentavos = precioCostoCentavos,
): VentaBotellas {
  return { vendedorId, productoId, cantidad, loteId, precioCostoCentavos, costoAnanjaCentavos };
}

/** Rendiciones con su parte Ananja calculada por el espejo real de la vista (`calcularParteAnanjaFifo`). */
function rendiciones(
  ventas: VentaBotellas[],
  crudas: { id: string; tenedorId: string; vendedorId: string; montoCentavos: number }[],
): RendicionConParteAnanja[] {
  const partes = calcularParteAnanjaFifo(ventas, crudas);
  return crudas.map((r, i) => ({ ...r, montoAnanjaCentavos: partes[i].monto_centavos }));
}

const coord = (id: string, depositosCentavos: number, totalCentavos: number): CoordinadoraEntrada => ({
  id,
  depositosCentavos,
  totalCentavos,
});

function cantidad(filas: FilaBotellas[], filtro: Partial<FilaBotellas>): number {
  return filas
    .filter((f) => Object.entries(filtro).every(([k, v]) => f[k as keyof FilaBotellas] === v))
    .reduce((acc, f) => acc + f.cantidad, 0);
}

describe("redondearBotellas", () => {
  it("redondea hacia arriba: una botella a medio pagar cuenta como debida", () => {
    expect(redondearBotellas(0.4, C250)).toBe(1);
    expect(redondearBotellas(2.01, C250)).toBe(3);
    expect(redondearBotellas(3, C250)).toBe(3);
  });

  it("un sobrante de hasta 2 centavos es ruido y no inventa una botella", () => {
    expect(TOLERANCIA_CENTAVOS).toBe(2);
    expect(redondearBotellas(2 + 1 / C250, C250)).toBe(2); // 1 centavo de más
    expect(redondearBotellas(2 + 2 / C250, C250)).toBe(2); // 2 centavos de más
    expect(redondearBotellas(2 + 3 / C250, C250)).toBe(3); // 3 centavos ya es plata
    expect(redondearBotellas(3 - 1 / C250, C250)).toBe(3); // faltando 1 centavo sigue siendo la tercera
  });

  it("nada o negativo da 0", () => {
    expect(redondearBotellas(0, C250)).toBe(0);
    expect(redondearBotellas(-1, C250)).toBe(0);
    expect(redondearBotellas(0.00001, C250)).toBe(0); // menos de 1 centavo
  });
});

describe("A. en poder", () => {
  it("pasa las filas de stock a botellas por persona, lote y producto (solo > 0)", () => {
    const enManos: EnManosFila[] = [
      { vendedorId: REV_1, loteId: "L1", productoId: P250, enPoder: 5 },
      { vendedorId: REV_1, loteId: "L2", productoId: P500, enPoder: 2 },
      { vendedorId: REV_2, loteId: null, productoId: P250, enPoder: 3 },
      { vendedorId: REV_2, loteId: "L1", productoId: P500, enPoder: 0 },
    ];
    const filas = filasEnPoder(enManos);
    expect(filas).toHaveLength(3);
    expect(filas.every((f) => f.estado === "enPoder")).toBe(true);
    expect(cantidad(filas, { personaId: REV_1 })).toBe(7);
    expect(cantidad(filas, { personaId: REV_2, loteId: null })).toBe(3);
  });

  it("solo en poder: el total es lo que tienen y no aparece ninguna coordinadora", () => {
    const resumen = armarResumenBotellas({
      filas: filasEnPoder([
        { vendedorId: REV_1, loteId: "L1", productoId: P250, enPoder: 5 },
        { vendedorId: REV_2, loteId: "L1", productoId: P500, enPoder: 2 },
      ]),
      sinBotella: [],
      productos: PRODUCTOS,
      nombres: new Map([[REV_1, "Revendedora 1"], [REV_2, "Revendedora 2"]]),
      coordinadoraIds: new Set(),
      lotes: LOTES,
    });
    expect(resumen.total).toBe(7);
    expect(resumen.estados).toEqual({ enPoder: 7, sinPagar: 0, sinPasar: 0 });
    expect(resumen.coordinadoras).toEqual([]);
    // De la presentación más grande a la más chica.
    expect(resumen.productos.map((p) => [p.nombre, p.cantidad])).toEqual([
      ["Botella 500 ml", 2],
      ["Botella 250 ml", 5],
    ]);
  });
});

describe("B. vendidas sin pagar", () => {
  it("sin rendiciones se debe todo lo vendido", () => {
    const ventas = [venta(REV_1, P250, 4, "L1", C250), venta(REV_1, P500, 2, "L1", C500)];
    const filas = calcularSinPagar(ventas, new Map());
    expect(cantidad(filas, { productoId: P250 })).toBe(4);
    expect(cantidad(filas, { productoId: P500 })).toBe(2);
    expect(filas.every((f) => f.estado === "sinPagar" && f.personaId === REV_1)).toBe(true);
  });

  it("un pago parcial cubre las ventas de la más vieja a la más nueva", () => {
    // Dos ventas del mismo lote/producto: 3 y 2 botellas. Rindió 1,5 botellas.
    const ventas = [venta(REV_1, P250, 3, "L1", C250), venta(REV_1, P250, 2, "L1", C250)];
    const filas = calcularSinPagar(ventas, new Map([[REV_1, 1.5 * C250]]));
    // Quedan 1,5 + 2 = 3,5 botellas sin pagar -> 4 (hacia arriba).
    expect(filas).toEqual([{ estado: "sinPagar", personaId: REV_1, loteId: "L1", productoId: P250, cantidad: 4 }]);
  });

  it("el pago cubre primero la venta más vieja, aunque sea de otro lote", () => {
    const ventas = [venta(REV_1, P250, 2, "L1", C250), venta(REV_1, P250, 2, "L2", C250)];
    const filas = calcularSinPagar(ventas, new Map([[REV_1, 2 * C250]]));
    expect(cantidad(filas, { loteId: "L1" })).toBe(0);
    expect(cantidad(filas, { loteId: "L2" })).toBe(2);
  });

  it("tolerancia: faltando 1 o 2 centavos no inventa una botella, 3 centavos sí", () => {
    const ventas = [venta(REV_1, P250, 3, "L1", C250), venta(REV_1, P250, 2, "L1", C250)];
    const total = 5 * C250;
    // Pagó todo menos X centavos: queda X/50000 de botella sin pagar.
    const debe = (faltan: number) =>
      cantidad(calcularSinPagar(ventas, new Map([[REV_1, total - faltan]])), { estado: "sinPagar" });
    expect(debe(1)).toBe(0);
    expect(debe(2)).toBe(0);
    expect(debe(3)).toBe(1);
    expect(debe(C250)).toBe(1); // una botella entera sin pagar
    expect(debe(C250 + 1)).toBe(1); // la botella y 1 centavo: el centavo es ruido
    expect(debe(C250 + 3)).toBe(2);

    // Las ventas dividen en dos grupos (lotes): 2 botellas pagadas del L1 y falta 1 centavo en L2.
    const dosLotes = [venta(REV_1, P250, 2, "L1", C250), venta(REV_1, P250, 2, "L2", C250)];
    const filas = calcularSinPagar(dosLotes, new Map([[REV_1, 4 * C250 - 1]]));
    expect(cantidad(filas, { loteId: "L2" })).toBe(0); // 1 centavo de 2 botellas = ruido
    const filas3 = calcularSinPagar(dosLotes, new Map([[REV_1, 4 * C250 - 3]]));
    expect(cantidad(filas3, { loteId: "L2" })).toBe(1); // 3 centavos ya cuentan
  });

  it("si rindió de más no debe nada", () => {
    const ventas = [venta(REV_1, P250, 2, "L1", C250)];
    expect(calcularSinPagar(ventas, new Map([[REV_1, 10 * C250]]))).toEqual([]);
    expect(calcularSinPagar(ventas, new Map([[REV_1, 2 * C250]]))).toEqual([]);
  });

  it("cada revendedora usa solo sus propios pagos", () => {
    const ventas = [venta(REV_1, P250, 2, "L1", C250), venta(REV_2, P250, 2, "L1", C250)];
    const filas = calcularSinPagar(ventas, new Map([[REV_1, 2 * C250]]));
    expect(cantidad(filas, { personaId: REV_1 })).toBe(0);
    expect(cantidad(filas, { personaId: REV_2 })).toBe(2);
  });

  it("con margen de la coordinadora se cuenta con el precio cobrado a la revendedora", () => {
    // Le cobra 600 pesos por una botella que a Ananja le cuesta 500.
    const ventas = [venta(REV_1, P250, 4, "L1", 60000, C250)];
    // Pagó $1.200 = 2 botellas al precio cobrado.
    const filas = calcularSinPagar(ventas, new Map([[REV_1, 120000]]));
    expect(filas).toEqual([{ estado: "sinPagar", personaId: REV_1, loteId: "L1", productoId: P250, cantidad: 2 }]);
  });

  it("una venta sin lote queda en el grupo sin lote", () => {
    const filas = calcularSinPagar([venta(REV_1, P250, 2, null, C250)], new Map());
    expect(filas).toEqual([{ estado: "sinPagar", personaId: REV_1, loteId: null, productoId: P250, cantidad: 2 }]);
  });
});

describe("C. cobradas por la coordinadora, sin pasar a Ananja", () => {
  // Revendedora 1 vendió en dos lotes y dos productos y le pagó todo a la Coordinadora A.
  const ventas = [
    venta(REV_1, P250, 4, "L1", C250),
    venta(REV_1, P500, 2, "L1", C500),
    venta(REV_1, P250, 3, "L2", C250),
    venta(REV_1, P500, 1, "L2", C500),
  ];
  const TOTAL_VENDIDO = 4 * C250 + 2 * C500 + 3 * C250 + 1 * C500; // 620.000
  const pagoTodo = [{ id: "r1", tenedorId: COORD_A, vendedorId: REV_1, montoCentavos: TOTAL_VENDIDO }];

  it("sin depósitos: todo lo que cobró está pendiente, abierto por lote y producto", () => {
    const r = calcularSinPasar({
      ventas,
      rendiciones: rendiciones(ventas, pagoTodo),
      coordinadoras: [coord(COORD_A, 0, TOTAL_VENDIDO)],
      lotes: LOTES,
      productos: PRODUCTOS,
    });
    expect(r.sinBotella).toEqual([]);
    expect(r.filas.every((f) => f.estado === "sinPasar" && f.personaId === COORD_A)).toBe(true);
    expect(cantidad(r.filas, { loteId: "L1", productoId: P250 })).toBe(4);
    expect(cantidad(r.filas, { loteId: "L1", productoId: P500 })).toBe(2);
    expect(cantidad(r.filas, { loteId: "L2", productoId: P250 })).toBe(3);
    expect(cantidad(r.filas, { loteId: "L2", productoId: P500 })).toBe(1);
  });

  it("un depósito cancela el lote más viejo entero y parte del siguiente, de a un producto por nombre", () => {
    // L1 = 380.000; L2 = 240.000. Pasó 430.000: L1 entero + 50.000 de L2.
    const deposito = 4 * C250 + 2 * C500 + C250;
    const r = calcularSinPasar({
      ventas,
      rendiciones: rendiciones(ventas, pagoTodo),
      coordinadoras: [coord(COORD_A, deposito, TOTAL_VENDIDO - deposito)],
      lotes: LOTES,
      productos: PRODUCTOS,
    });
    expect(cantidad(r.filas, { loteId: "L1" })).toBe(0);
    // En L2 los 50.000 salen primero de "Botella 250 ml" (nombre asc): quedan 2 de 250 y la de 500 entera.
    expect(cantidad(r.filas, { loteId: "L2", productoId: P250 })).toBe(2);
    expect(cantidad(r.filas, { loteId: "L2", productoId: P500 })).toBe(1);
    expect(r.sinBotella).toEqual([]);
  });

  it("dentro de un lote el orden es por nombre de producto, no por id", () => {
    // Ids al revés del nombre: "pz" se llama 250 ml y "pa" se llama 500 ml.
    const productos: ProductoRef[] = [
      { id: "pa", nombre: "Botella 500 ml", presentacionMl: 500 },
      { id: "pz", nombre: "Botella 250 ml", presentacionMl: 250 },
    ];
    const v = [venta(REV_1, "pa", 2, "L1", C500), venta(REV_1, "pz", 2, "L1", C250)];
    const total = 2 * C500 + 2 * C250;
    const r = calcularSinPasar({
      ventas: v,
      rendiciones: rendiciones(v, [{ id: "r1", tenedorId: COORD_A, vendedorId: REV_1, montoCentavos: total }]),
      coordinadoras: [coord(COORD_A, 2 * C250, total - 2 * C250)],
      lotes: LOTES,
      productos,
    });
    // El depósito de 2 botellas de 250 se descuenta de "Botella 250 ml" (id pz), aunque su id sea mayor.
    expect(cantidad(r.filas, { productoId: "pz" })).toBe(0);
    expect(cantidad(r.filas, { productoId: "pa" })).toBe(2);
  });

  it("el pendiente por lote coincide EXACTAMENTE con calcularLineasPorLote (lo que muestra la pantalla de plata)", () => {
    const deposito = 4 * C250 + 2 * C500 + C250 + 7;
    const crudas = [
      { id: "r1", tenedorId: COORD_A, vendedorId: REV_1, montoCentavos: 300000 },
      { id: "r2", tenedorId: COORD_A, vendedorId: REV_1, montoCentavos: TOTAL_VENDIDO - 300000 },
    ];
    const rends = rendiciones(ventas, crudas);
    const lineas = calcularLineasPorLote({
      tenedorId: COORD_A,
      ventas,
      rendiciones: rends,
      depositosCentavos: deposito,
      lotes: LOTES,
    });
    const r = calcularSinPasar({
      ventas,
      rendiciones: rends,
      coordinadoras: [coord(COORD_A, deposito, TOTAL_VENDIDO - deposito)],
      lotes: LOTES,
      productos: PRODUCTOS,
    });
    // 7 centavos de más descontados no se pueden convertir en botellas enteras: las botellas
    // (con costo parejo) valen exactamente el pendiente de la línea redondeado hacia arriba.
    const costo = new Map([[P250, C250], [P500, C500]]);
    for (const linea of lineas) {
      if (linea.loteId === null) continue;
      const pesos = r.filas
        .filter((f) => f.loteId === linea.loteId)
        .reduce((acc, f) => acc + f.cantidad * (costo.get(f.productoId) ?? 0), 0);
      // Cada botella a medio pagar cuenta entera: las botellas valen >= al pendiente en pesos, a lo sumo
      // 2 botellas (una por producto) más.
      expect(pesos).toBeGreaterThanOrEqual(linea.pendienteCentavos);
      expect(pesos - linea.pendienteCentavos).toBeLessThan(2 * C500);
    }
    // Y sin fracciones el cálculo es exacto: L2 pendiente = 240.000 - 50.000 - 7 = 189.993 -> 2×250 + 1×500 (= 190.000).
    expect(lineas.find((l) => l.loteId === "L2")?.pendienteCentavos).toBe(240000 - 50000 - 7);
  });

  it("con depósitos exactos el pendiente en pesos por lote es igual al de la pantalla", () => {
    const deposito = 4 * C250 + 2 * C500 + C250;
    const rends = rendiciones(ventas, pagoTodo);
    const lineas = calcularLineasPorLote({
      tenedorId: COORD_A,
      ventas,
      rendiciones: rends,
      depositosCentavos: deposito,
      lotes: LOTES,
    });
    const r = calcularSinPasar({
      ventas,
      rendiciones: rends,
      coordinadoras: [coord(COORD_A, deposito, TOTAL_VENDIDO - deposito)],
      lotes: LOTES,
      productos: PRODUCTOS,
    });
    const costo = new Map([[P250, C250], [P500, C500]]);
    for (const linea of lineas) {
      const pesos = r.filas
        .filter((f) => f.loteId === linea.loteId)
        .reduce((acc, f) => acc + f.cantidad * (costo.get(f.productoId) ?? 0), 0);
      expect(pesos).toBe(linea.pendienteCentavos);
    }
  });

  it("coordinadora con margen propio: C se convierte con el costo Ananja", () => {
    // Le cobra $600 a la revendedora una botella que a Ananja le cuesta $500.
    const v = [venta(REV_1, P250, 4, "L1", 60000, C250), venta(REV_2, P250, 4, "L1", 60000, C250)];
    const crudas = [
      { id: "r1", tenedorId: COORD_A, vendedorId: REV_1, montoCentavos: 4 * 60000 }, // pagó todo
      { id: "r2", tenedorId: COORD_A, vendedorId: REV_2, montoCentavos: 2 * 60000 }, // pagó la mitad
    ];
    const rends = rendiciones(v, crudas);
    // A Ananja le tocan 200.000 + 100.000.
    expect(rends.map((x) => x.montoAnanjaCentavos)).toEqual([200000, 100000]);

    const r = calcularSinPasar({
      ventas: v,
      rendiciones: rends,
      coordinadoras: [coord(COORD_A, 0, 300000)],
      lotes: LOTES,
      productos: PRODUCTOS,
    });
    expect(cantidad(r.filas, { estado: "sinPasar", loteId: "L1", productoId: P250 })).toBe(6);
    expect(r.sinBotella).toEqual([]);

    // Y la Revendedora 2 todavía debe las otras 2 (B, con el precio cobrado).
    const b = calcularSinPagar(v, new Map([[REV_1, 4 * 60000], [REV_2, 2 * 60000]]));
    expect(b).toEqual([{ estado: "sinPagar", personaId: REV_2, loteId: "L1", productoId: P250, cantidad: 2 }]);
  });

  it("un pago parcial de una botella la cuenta entera (hacia arriba) en C", () => {
    const v = [venta(REV_1, P250, 2, "L1", C250)];
    const rends = rendiciones(v, [{ id: "r1", tenedorId: COORD_A, vendedorId: REV_1, montoCentavos: 25000 }]);
    const r = calcularSinPasar({
      ventas: v,
      rendiciones: rends,
      coordinadoras: [coord(COORD_A, 0, 25000)],
      lotes: LOTES,
      productos: PRODUCTOS,
    });
    expect(cantidad(r.filas, { loteId: "L1", productoId: P250 })).toBe(1); // media botella cobrada
  });

  it("el excedente de pagos, las ventas sin lote y 'otros movimientos' quedan en pesos sin botella", () => {
    // Venta sin lote + venta con lote; la revendedora pagó 20.000 de más.
    const v = [venta(REV_1, P250, 2, null, C250), venta(REV_1, P250, 2, "L1", C250)];
    const pagado = 4 * C250 + 20000;
    const rends = rendiciones(v, [{ id: "r1", tenedorId: COORD_A, vendedorId: REV_1, montoCentavos: pagado }]);
    // El total de la pantalla trae además 7.777 de "otros movimientos" (efectivo de ventas, por ejemplo).
    const total = pagado + 7777;
    const r = calcularSinPasar({
      ventas: v,
      rendiciones: rends,
      coordinadoras: [coord(COORD_A, 0, total)],
      lotes: LOTES,
      productos: PRODUCTOS,
    });
    expect(cantidad(r.filas, { loteId: "L1", productoId: P250 })).toBe(2);
    expect(r.filas).toHaveLength(1);
    // sinBotella = total - lo convertido a botellas (2 × 500 pesos) = sin lote + excedente + otros.
    expect(r.sinBotella).toEqual([{ coordinadoraId: COORD_A, centavos: total - 2 * C250 }]);
    expect(total - 2 * C250).toBe(2 * C250 + 20000 + 7777);
  });

  it("si el total no es positivo no se muestra nada (igual que el desglose por lote)", () => {
    const rends = rendiciones(ventas, pagoTodo);
    const r = calcularSinPasar({
      ventas,
      rendiciones: rends,
      coordinadoras: [coord(COORD_A, TOTAL_VENDIDO, 0), coord(COORD_B, 0, -500)],
      lotes: LOTES,
      productos: PRODUCTOS,
    });
    expect(r).toEqual({ filas: [], sinBotella: [] });
  });

  it("solo cuentan las rendiciones recibidas por coordinadoras; cada una su propia plata", () => {
    const v = [venta(REV_1, P250, 2, "L1", C250), venta(REV_2, P250, 3, "L2", C250)];
    const rends = rendiciones(v, [
      { id: "r1", tenedorId: COORD_A, vendedorId: REV_1, montoCentavos: 2 * C250 },
      { id: "r2", tenedorId: COORD_B, vendedorId: REV_2, montoCentavos: 3 * C250 },
      // La Revendedora 3 no vendió nada: lo que rindió es excedente.
      { id: "r3", tenedorId: "admin-1", vendedorId: REV_3, montoCentavos: 1000 },
    ]);
    const r = calcularSinPasar({
      ventas: v,
      rendiciones: rends,
      coordinadoras: [coord(COORD_A, 0, 2 * C250), coord(COORD_B, 0, 3 * C250)],
      lotes: LOTES,
      productos: PRODUCTOS,
    });
    expect(cantidad(r.filas, { personaId: COORD_A })).toBe(2);
    expect(cantidad(r.filas, { personaId: COORD_B })).toBe(3);
    expect(r.filas.some((f) => f.personaId === "admin-1")).toBe(false);
  });
});

describe("armarResumenBotellas", () => {
  const nombres = new Map([
    [REV_1, "Revendedora 1"],
    [REV_2, "Revendedora 2"],
    [COORD_A, "Coordinadora A"],
    [COORD_B, "Coordinadora B"],
  ]);
  const filas: FilaBotellas[] = [
    { estado: "enPoder", personaId: REV_1, loteId: "L2", productoId: P250, cantidad: 5 },
    { estado: "enPoder", personaId: REV_2, loteId: "L1", productoId: P500, cantidad: 2 },
    { estado: "sinPagar", personaId: REV_1, loteId: "L1", productoId: P250, cantidad: 3 },
    { estado: "sinPagar", personaId: REV_2, loteId: null, productoId: P250, cantidad: 1 },
    { estado: "sinPasar", personaId: COORD_A, loteId: "L1", productoId: P250, cantidad: 4 },
    { estado: "sinPasar", personaId: COORD_B, loteId: "L2", productoId: P500, cantidad: 6 },
  ];
  const resumen = armarResumenBotellas({
    filas,
    sinBotella: [{ coordinadoraId: COORD_B, centavos: 1234 }],
    productos: PRODUCTOS,
    nombres,
    coordinadoraIds: new Set([COORD_A, COORD_B]),
    lotes: LOTES,
  });

  it("total general, por estado y por producto", () => {
    expect(resumen.total).toBe(21);
    expect(resumen.estados).toEqual({ enPoder: 7, sinPagar: 4, sinPasar: 10 });
    expect(resumen.productos.map((p) => [p.productoId, p.cantidad])).toEqual([
      [P500, 8],
      [P250, 13],
    ]);
    expect(resumen.productosPorEstado.sinPasar.map((p) => [p.productoId, p.cantidad])).toEqual([
      [P500, 6],
      [P250, 4],
    ]);
  });

  it("por lote: del más viejo al más nuevo y el sin lote al final, con el detalle por estado", () => {
    expect(resumen.porLote.map((l) => [l.loteId, l.total])).toEqual([
      ["L1", 9],
      ["L2", 11],
      [null, 1],
    ]);
    const l1 = resumen.porLote[0];
    expect(l1.fecha).toBe("2026-09-14");
    expect(l1.estados).toEqual({ enPoder: 2, sinPagar: 3, sinPasar: 4 });
    expect(l1.productos.map((p) => [p.productoId, p.cantidad])).toEqual([
      [P500, 2],
      [P250, 7],
    ]);
  });

  it("por persona: de la que más debe a la que menos, marcando a las coordinadoras", () => {
    expect(resumen.porPersona.map((p) => [p.nombre, p.total, p.esCoordinadora])).toEqual([
      ["Revendedora 1", 8, false],
      ["Coordinadora B", 6, true],
      ["Coordinadora A", 4, true],
      ["Revendedora 2", 3, false],
    ]);
    expect(resumen.porPersona.find((p) => p.personaId === REV_1)?.estados).toEqual({
      enPoder: 5,
      sinPagar: 3,
      sinPasar: 0,
    });
  });

  it("una línea por coordinadora con sus botellas sin pasar y sus pesos sin botella", () => {
    expect(resumen.coordinadoras.map((c) => [c.nombre, c.total, c.sinBotellaCentavos])).toEqual([
      ["Coordinadora B", 6, 1234],
      ["Coordinadora A", 4, 0],
    ]);
  });

  it("una coordinadora sin botellas pero con pesos sin botella también tiene su línea", () => {
    const solo = armarResumenBotellas({
      filas: [],
      sinBotella: [{ coordinadoraId: COORD_A, centavos: 5000 }],
      productos: PRODUCTOS,
      nombres,
      coordinadoraIds: new Set([COORD_A]),
      lotes: LOTES,
    });
    expect(solo.total).toBe(0);
    expect(solo.coordinadoras).toEqual([
      expect.objectContaining({ personaId: COORD_A, total: 0, sinBotellaCentavos: 5000 }),
    ]);
  });

  it("sin nada: todo en cero", () => {
    const vacio = armarResumenBotellas({
      filas: [],
      sinBotella: [],
      productos: PRODUCTOS,
      nombres,
      coordinadoraIds: new Set(),
      lotes: LOTES,
    });
    expect(vacio.total).toBe(0);
    expect(vacio.productos).toEqual([]);
    expect(vacio.porLote).toEqual([]);
    expect(vacio.porPersona).toEqual([]);
    expect(vacio.coordinadoras).toEqual([]);
  });
});

describe("A + B + C juntos", () => {
  it("el total es la suma de los tres estados, abierto por producto", () => {
    const ventas = [venta(REV_1, P250, 4, "L1", C250), venta(REV_2, P500, 2, "L1", C500)];
    // Revendedora 1 le pagó todo a la Coordinadora A; la Revendedora 2 no pagó nada.
    const rends = rendiciones(ventas, [{ id: "r1", tenedorId: COORD_A, vendedorId: REV_1, montoCentavos: 4 * C250 }]);
    const sinPagar = calcularSinPagar(ventas, new Map([[REV_1, 4 * C250]]));
    const sinPasar = calcularSinPasar({
      ventas,
      rendiciones: rends,
      coordinadoras: [coord(COORD_A, 0, 4 * C250)],
      lotes: LOTES,
      productos: PRODUCTOS,
    });
    const enPoder = filasEnPoder([{ vendedorId: REV_1, loteId: "L2", productoId: P250, enPoder: 3 }]);

    const resumen = armarResumenBotellas({
      filas: [...enPoder, ...sinPagar, ...sinPasar.filas],
      sinBotella: sinPasar.sinBotella,
      productos: PRODUCTOS,
      nombres: new Map([[COORD_A, "Coordinadora A"]]),
      coordinadoraIds: new Set([COORD_A]),
      lotes: LOTES,
    });
    expect(resumen.estados).toEqual({ enPoder: 3, sinPagar: 2, sinPasar: 4 });
    expect(resumen.total).toBe(9);
    expect(resumen.productos.map((p) => [p.productoId, p.cantidad])).toEqual([
      [P500, 2],
      [P250, 7],
    ]);
  });
});
