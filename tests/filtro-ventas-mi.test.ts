import { describe, expect, it } from "vitest";

import {
  filtrarVentasMi,
  hayVentasSinMedio,
  mensajeSinVentas,
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
