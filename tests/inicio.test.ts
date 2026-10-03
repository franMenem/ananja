import { describe, expect, it } from "vitest";

import { fechaArgentinaDeTimestamp, rangoDiaArgentina } from "@/lib/fechas";
import {
  inicioMesAnterior,
  personasEnManos,
  resumirClientes,
  resumirVentasMes,
} from "@/lib/dominio/inicio";

describe("día de Argentina", () => {
  it("rangoDiaArgentina arma [00:00, 00:00 del día siguiente) con offset -03:00", () => {
    expect(rangoDiaArgentina("2026-09-15")).toEqual({
      desde: "2026-09-15T00:00:00-03:00",
      hasta: "2026-09-16T00:00:00-03:00",
    });
    expect(rangoDiaArgentina("2026-12-31").hasta).toBe("2027-01-01T00:00:00-03:00");
  });

  it("un movimiento de las 22:30 de Argentina (01:30 UTC del día siguiente) cae en el día argentino", () => {
    const createdAt = "2026-09-16T01:30:00Z";
    expect(fechaArgentinaDeTimestamp(createdAt)).toBe("2026-09-15");
    const { desde, hasta } = rangoDiaArgentina("2026-09-15");
    const t = new Date(createdAt).getTime();
    expect(t >= new Date(desde).getTime() && t < new Date(hasta).getTime()).toBe(true);
    // El filtro viejo (`>= 'hoyT00:00:00'` en UTC) lo hubiera mandado al 16.
    expect(new Date(createdAt).getTime() >= new Date("2026-09-16T00:00:00Z").getTime()).toBe(true);
  });
});

describe("personasEnManos", () => {
  it("solo totales > 0, yo primero y el resto por nombre", () => {
    const personas = personasEnManos(
      [
        { tenedor_id: "t", nombre: "Laura", total_centavos: 100 },
        { tenedor_id: "yo", nombre: "Zoe", total_centavos: 50 },
        { tenedor_id: "b", nombre: "Beto", total_centavos: 300 },
        { tenedor_id: "c", nombre: "Carla", total_centavos: 0 },
        { tenedor_id: "d", nombre: "Dani", total_centavos: -20 },
      ],
      "yo",
    );
    expect(personas.map((p) => p.nombre)).toEqual(["Zoe", "Beto", "Laura"]);
    expect(personas[0].soyYo).toBe(true);
  });
});

describe("resumirClientes", () => {
  it("cuenta y suma solo deudas positivas", () => {
    expect(resumirClientes([{ deuda_centavos: 100 }, { deuda_centavos: 0 }, { deuda_centavos: 50 }])).toEqual({
      cantidad: 2,
      totalCentavos: 150,
    });
  });
});

describe("resumirVentasMes", () => {
  const fila = (fecha: string, ingreso: number | null, empresa: number | null, vendedores: number | null) => ({
    fecha,
    ingresoAnanjaCentavos: ingreso,
    gananciaEmpresaCentavos: empresa,
    gananciaVendedoresCentavos: vendedores,
  });

  it("suma el mes actual y el anterior; los null cuentan 0", () => {
    const resumen = resumirVentasMes(
      [
        fila("2026-09-02", 1000, 200, 300),
        fila("2026-09-10", 500, null, null),
        fila("2026-08-29", 1000, 100, 50),
        fila("2026-07-01", 9999, 9999, 9999),
      ],
      2026,
      8,
    );
    expect(resumen.actual).toEqual({
      ingresoAnanjaCentavos: 1500,
      gananciaEmpresaCentavos: 200,
      gananciaVendedoresCentavos: 300,
    });
    expect(resumen.anterior.ingresoAnanjaCentavos).toBe(1000);
    expect(resumen.variacionIngresoPct).toBe(50);
  });

  it("en enero compara con diciembre del año anterior; sin mes anterior no hay %", () => {
    const resumen = resumirVentasMes([fila("2025-12-20", 200, 0, 0), fila("2026-01-05", 100, 0, 0)], 2026, 0);
    expect(resumen.anterior.ingresoAnanjaCentavos).toBe(200);
    expect(resumen.variacionIngresoPct).toBe(-50);
    expect(resumirVentasMes([fila("2026-01-05", 100, 0, 0)], 2026, 0).variacionIngresoPct).toBeNull();
  });
});

describe("inicioMesAnterior", () => {
  it("primer día del mes anterior dentro del mismo año", () => {
    expect(inicioMesAnterior(2026, 8)).toBe("2026-08-01"); // setiembre (8) -> agosto
  });

  it("en enero, diciembre del año anterior", () => {
    expect(inicioMesAnterior(2026, 0)).toBe("2025-12-01");
  });
});

