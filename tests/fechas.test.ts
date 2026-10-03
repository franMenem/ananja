import { describe, expect, it } from "vitest";

import {
  NOMBRES_MES,
  NOMBRES_MES_MAYUS,
  compararPorFechaDesc,
  formatDiaMesAbrev,
  formatFecha,
  formatFechaCorta,
  formatFechaHora,
  formatFechaHoraSinAnio,
  labelDeMes,
  labelDePeriodo,
  rotuloGrupoFecha,
} from "@/lib/fechas";

describe("formatFecha", () => {
  it("convierte yyyy-mm-dd a dd/mm/aaaa", () => {
    expect(formatFecha("2026-09-05")).toBe("05/09/2026");
  });

  it("no rellena ni recorta el año", () => {
    expect(formatFecha("2024-01-31")).toBe("31/01/2024");
  });
});

describe("labelDeMes", () => {
  it("arma \"Mes año\" a partir de yyyy-mm", () => {
    expect(labelDeMes("2026-09")).toBe("Septiembre 2026");
  });

  it("resuelve el primer y el último mes del año", () => {
    expect(labelDeMes("2026-01")).toBe("Enero 2026");
    expect(labelDeMes("2026-12")).toBe("Diciembre 2026");
  });
});

describe("labelDePeriodo", () => {
  it("un período de mes (\"yyyy-mm\") delega en labelDeMes", () => {
    expect(labelDePeriodo("2026-09")).toBe("Septiembre 2026");
  });

  it("un período de año (\"yyyy\", 4 caracteres) se devuelve tal cual", () => {
    expect(labelDePeriodo("2026")).toBe("2026");
  });
});

describe("NOMBRES_MES", () => {
  it("tiene los 12 meses en orden, empezando en Enero", () => {
    expect(NOMBRES_MES).toHaveLength(12);
    expect(NOMBRES_MES[0]).toBe("Enero");
    expect(NOMBRES_MES[11]).toBe("Diciembre");
  });
});

describe("NOMBRES_MES_MAYUS", () => {
  it("es NOMBRES_MES en mayúsculas, mismo orden", () => {
    expect(NOMBRES_MES_MAYUS).toHaveLength(12);
    expect(NOMBRES_MES_MAYUS[0]).toBe("ENERO");
    expect(NOMBRES_MES_MAYUS[11]).toBe("DICIEMBRE");
    expect(NOMBRES_MES_MAYUS).toEqual(NOMBRES_MES.map((m) => m.toUpperCase()));
  });
});

describe("formatFechaCorta", () => {
  it("convierte yyyy-mm-dd a dd/mm/aa", () => {
    expect(formatFechaCorta("2026-09-05")).toBe("05/09/26");
  });

  it("recorta el año a 2 dígitos", () => {
    expect(formatFechaCorta("2024-01-31")).toBe("31/01/24");
  });
});

// Según la versión de ICU/Node, Intl separa "a."/"p." de "m." con un espacio
// irrompible (U+00A0), uno angosto (U+202F) o uno común: se normaliza a
// espacio común para que el test no dependa de la versión de Node.
const sinEspaciosEspeciales = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");

// Las fechas de entrada no llevan offset de TZ (hora "local" del entorno
// que corre el test), igual que en las páginas que originaban este
// formato — así el resultado no depende de la TZ del runner. Ojo: Intl puede usar
// un espacio irrompible entre "a."/"p." y "m." (ver sinEspaciosEspeciales).
describe("formatFechaHora", () => {
  it("arma dd/mm/aa, hh:mm con año 2 dígitos (AM)", () => {
    expect(sinEspaciosEspeciales(formatFechaHora("2026-09-05T09:07:00"))).toBe("05/09/26, 09:07 a. m.");
  });

  it("arma dd/mm/aa, hh:mm con año 2 dígitos (PM)", () => {
    expect(sinEspaciosEspeciales(formatFechaHora("2026-12-31T23:59:00"))).toBe("31/12/26, 11:59 p. m.");
  });
});

describe("formatFechaHoraSinAnio", () => {
  it("omite el año y no rellena día/mes con cero (quirk de Intl)", () => {
    expect(sinEspaciosEspeciales(formatFechaHoraSinAnio("2026-09-05T09:07:00"))).toBe("5/9, 09:07 a. m.");
  });

  it("no rellena el día cuando es de un solo dígito, pero sí la hora", () => {
    expect(sinEspaciosEspeciales(formatFechaHoraSinAnio("2026-01-15T23:59:00"))).toBe("15/1, 11:59 p. m.");
  });
});

// Historial unificado de Plata (/plata, /plata/cuenta/[medio]): ordena por
// `fecha` descendente, no por `createdAt` — ver comentario de cabecera de
// la función (lib/fechas.ts) y supabase/migrations/0033_fecha_ajuste_caja.sql.
describe("compararPorFechaDesc", () => {
  it("ordena por fecha descendente (más reciente primero)", () => {
    const movimientos = [
      { fecha: "2026-01-01", createdAt: "2026-01-01T10:00:00Z" },
      { fecha: "2026-09-05", createdAt: "2026-09-05T10:00:00Z" },
      { fecha: "2026-05-20", createdAt: "2026-05-20T10:00:00Z" },
    ];
    expect([...movimientos].sort(compararPorFechaDesc).map((m) => m.fecha)).toEqual([
      "2026-09-05",
      "2026-05-20",
      "2026-01-01",
    ]);
  });

  it("un movimiento cargado hoy pero fechado en el pasado no queda arriba de uno más reciente", () => {
    // Caso que motivó el fix: un ajuste de saldo cargado hoy (createdAt de
    // hoy) pero con fecha real de hace meses (el arranque del negocio) no
    // debe aparecer por encima de un gasto de esta semana.
    const ajusteViejoCargadoHoy = {
      fecha: "2026-01-01",
      createdAt: "2026-09-12T09:00:00Z",
    };
    const gastoReciente = {
      fecha: "2026-09-10",
      createdAt: "2026-09-10T08:00:00Z",
    };
    expect(
      [ajusteViejoCargadoHoy, gastoReciente].sort(compararPorFechaDesc),
    ).toEqual([gastoReciente, ajusteViejoCargadoHoy]);
  });

  it("con la misma fecha, desempata por createdAt descendente", () => {
    const primero = { fecha: "2026-09-05", createdAt: "2026-09-05T08:00:00Z" };
    const segundo = { fecha: "2026-09-05", createdAt: "2026-09-05T14:30:00Z" };
    expect([primero, segundo].sort(compararPorFechaDesc)).toEqual([
      segundo,
      primero,
    ]);
  });

  it("es estable ante empates totales (mismo orden relativo)", () => {
    const a = { fecha: "2026-09-05", createdAt: "2026-09-05T08:00:00Z" };
    const b = { fecha: "2026-09-05", createdAt: "2026-09-05T08:00:00Z" };
    expect(compararPorFechaDesc(a, b)).toBe(0);
  });
});

describe("formatDiaMesAbrev", () => {
  it("día sin cero y mes abreviado", () => {
    expect(formatDiaMesAbrev("2026-10-01")).toBe("1 oct");
    expect(formatDiaMesAbrev("2026-12-25")).toBe("25 dic");
  });
});

describe("rotuloGrupoFecha", () => {
  it("hoy es un grupo aparte", () => {
    expect(rotuloGrupoFecha("2026-10-03", "2026-10-03")).toBe("Hoy");
  });

  it("otro día del año actual: solo el mes", () => {
    expect(rotuloGrupoFecha("2026-10-01", "2026-10-03")).toBe("Octubre");
  });

  it("de otro año: mes y año", () => {
    expect(rotuloGrupoFecha("2025-12-31", "2026-10-03")).toBe("Diciembre 2025");
  });
});
