import { describe, expect, it } from "vitest";

import {
  filtrarVentasMi,
  hayVentasSinMedio,
  mensajeSinVentas,
  resumenFiltroMi,
  resumenVentasMi,
  type MesVentasMi,
  type VentaAgrupadaMi,
} from "@/lib/dominio/filtro-ventas-mi";

const v = (id: string, fecha: string, medioPago: VentaAgrupadaMi["medioPago"]): VentaAgrupadaMi => ({
  id,
  fecha,
  productoNombre: "Aceite",
  cantidad: 1,
  totalCentavos: 1000,
  medioPago,
});

const HOY = "2026-10-20";
const MESES: MesVentasMi[] = [
  {
    periodo: "2026-10",
    ventas: [v("a", "2026-10-20", "efectivo"), v("b", "2026-10-05", "banco"), v("c", "2026-10-20", null)],
  },
  { periodo: "2026-09", ventas: [v("d", "2026-09-30", "efectivo"), v("e", "2026-09-01", "mercado_pago")] },
];
const ids = (m: MesVentasMi[]) => m.flatMap((x) => x.ventas.map((y) => y.id));

describe("filtrarVentasMi", () => {
  it("todo + todos devuelve todo", () => {
    expect(ids(filtrarVentasMi(MESES, { periodo: "todo", medio: "todos", hoy: HOY }))).toEqual(["a", "b", "c", "d", "e"]);
  });
  it("hoy deja solo la fecha de hoy y descarta meses vacíos", () => {
    const r = filtrarVentasMi(MESES, { periodo: "hoy", medio: "todos", hoy: HOY });
    expect(ids(r)).toEqual(["a", "c"]);
    expect(r.map((m) => m.periodo)).toEqual(["2026-10"]);
  });
  it("mes deja solo el mes de hoy", () => {
    expect(ids(filtrarVentasMi(MESES, { periodo: "mes", medio: "todos", hoy: HOY }))).toEqual(["a", "b", "c"]);
  });
  it("por medio concreto", () => {
    expect(ids(filtrarVentasMi(MESES, { periodo: "todo", medio: "efectivo", hoy: HOY }))).toEqual(["a", "d"]);
  });
  it("sin_cargar deja las de medio null", () => {
    expect(ids(filtrarVentasMi(MESES, { periodo: "todo", medio: "sin_cargar", hoy: HOY }))).toEqual(["c"]);
  });
  it("combina período y medio", () => {
    expect(ids(filtrarVentasMi(MESES, { periodo: "mes", medio: "efectivo", hoy: HOY }))).toEqual(["a"]);
    expect(filtrarVentasMi(MESES, { periodo: "hoy", medio: "banco", hoy: HOY })).toEqual([]);
  });
  it("no muta la entrada", () => {
    const copia = structuredClone(MESES);
    filtrarVentasMi(MESES, { periodo: "hoy", medio: "efectivo", hoy: HOY });
    expect(MESES).toEqual(copia);
  });
});

describe("hayVentasSinMedio", () => {
  it("detecta ventas sin medio", () => {
    expect(hayVentasSinMedio(MESES)).toBe(true);
    expect(hayVentasSinMedio([MESES[1]])).toBe(false);
    expect(hayVentasSinMedio([])).toBe(false);
  });
});

describe("mensajeSinVentas", () => {
  it("textos por combinación", () => {
    expect(mensajeSinVentas("todo", "todos")).toBe("Todavía no cargaste ventas.");
    expect(mensajeSinVentas("hoy", "todos")).toBe("No hay ventas hoy.");
    expect(mensajeSinVentas("mes", "todos")).toBe("No hay ventas este mes.");
    expect(mensajeSinVentas("todo", "efectivo")).toBe("No hay ventas en efectivo.");
    expect(mensajeSinVentas("hoy", "efectivo")).toBe("No hay ventas en efectivo hoy.");
    expect(mensajeSinVentas("mes", "mercado_pago")).toBe("No hay ventas en Mercado Pago este mes.");
    expect(mensajeSinVentas("todo", "sin_cargar")).toBe("No hay ventas sin medio de pago cargado.");
  });
});

describe("filtro por día", () => {
  it("deja solo las ventas de ese día", () => {
    const r = filtrarVentasMi(MESES, { periodo: "dia", dia: "2026-10-05", medio: "todos", hoy: HOY });
    expect(ids(r)).toEqual(["b"]);
    expect(ids(filtrarVentasMi(MESES, { periodo: "dia", dia: "2026-09-30", medio: "efectivo", hoy: HOY }))).toEqual(["d"]);
    expect(filtrarVentasMi(MESES, { periodo: "dia", dia: "2026-10-05", medio: "efectivo", hoy: HOY })).toEqual([]);
  });
  it("mensaje vacío y resumen del filtro", () => {
    expect(mensajeSinVentas("dia", "todos", "2026-11-09")).toBe("No hay ventas el 9 de noviembre.");
    expect(mensajeSinVentas("dia", "efectivo", "2026-11-09")).toBe("No hay ventas en efectivo el 9 de noviembre.");
    expect(resumenFiltroMi("todo", "todos")).toBe("Todo el tiempo · Todos los medios");
    expect(resumenFiltroMi("dia", "efectivo", "2026-11-09")).toBe("9 de noviembre · Efectivo");
  });
});

describe("resumenVentasMi", () => {
  const w = (id: string, producto: string, cantidad: number, total: number | null): VentaAgrupadaMi => ({
    id,
    fecha: "2026-10-05",
    productoNombre: producto,
    cantidad,
    totalCentavos: total,
    medioPago: "efectivo",
  });
  it("suma botellas, plata y agrupa por producto (cantidad desc, luego nombre)", () => {
    const r = resumenVentasMi([
      { periodo: "2026-10", ventas: [w("a", "Aceite 500 ml", 2, 20000), w("b", "Aceite 250 ml", 3, 30000)] },
      { periodo: "2026-09", ventas: [w("c", "Aceite 500 ml", 2, null), w("d", "Aceite 100 ml", 3, 5000)] },
    ]);
    expect(r.botellas).toBe(10);
    expect(r.totalCentavos).toBe(55000);
    expect(r.sinPrecio).toBe(1);
    expect(r.porProducto).toEqual([
      { productoNombre: "Aceite 500 ml", cantidad: 4 },
      { productoNombre: "Aceite 100 ml", cantidad: 3 },
      { productoNombre: "Aceite 250 ml", cantidad: 3 },
    ].sort((x, y) => y.cantidad - x.cantidad || x.productoNombre.localeCompare(y.productoNombre)));
  });
  it("sin ventas devuelve ceros", () => {
    expect(resumenVentasMi([])).toEqual({ botellas: 0, totalCentavos: 0, sinPrecio: 0, porProducto: [] });
  });
});
