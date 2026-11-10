import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { faltantesCostosLote, type LoteCostosInput } from "@/lib/dominio/tareas";

/**
 * La regla "los costos de un pedido están completos" vive dos veces:
 *  - SQL: la vista `v_lote_costos_completos` (una fila por lote y producto,
 *    definida en `0044_diferencia_encargado.sql`), usada por
 *    `lote_costos_completos()` para congelar la foto de costo al entregar.
 *  - TS: `faltantesCostosLote` (lib/dominio/tareas.ts), que decide la tarea
 *    "costos incompletos".
 * Estos tests no necesitan base: la tabla de casos documenta, al lado de cada
 * uno, qué diría la vista según su definición vigente.
 */

const pres = new Map<string, number | null>([
  ["a", 500],
  ["b", 250],
]);

type Costo = LoteCostosInput["costos"][number];
const aceiteUsd = { dolarCentavos: 100000, precioLitroAceiteUsdCentavos: 500 };
const envase = (productoId: string, total = 1000): Costo => ({
  concepto: "envase",
  productoId,
  costoUnitarioCentavos: total,
  totalCentavos: total,
});
const transporte = (total = 1000): Costo => ({
  concepto: "transporte",
  productoId: null,
  costoUnitarioCentavos: null,
  totalCentavos: total,
});
const aceitePesos = (total: number, unitario: number | null = null): Costo => ({
  concepto: "aceite",
  productoId: "a",
  costoUnitarioCentavos: unitario,
  totalCentavos: total,
});

function lote(parcial: Partial<LoteCostosInput>): LoteCostosInput {
  return {
    loteId: "lote-sintetico",
    fecha: "2026-01-01",
    dolarCentavos: null,
    precioLitroAceiteUsdCentavos: null,
    productoIds: ["a", "b"],
    costos: [],
    tieneGastosViejos: false,
    ...parcial,
  };
}

interface Caso {
  nombre: string;
  lote: LoteCostosInput;
  /** Lo que devuelve `faltantesCostosLote`. */
  faltantes: string[];
  /**
   * Qué dice `v_lote_costos_completos.completo` por producto, a mano, leyendo
   * la definición de 0044. "sin filas" = el lote no tiene `lote_items`, la
   * vista no devuelve nada y `lote_costos_completos()` da false.
   */
  vista: Record<string, boolean> | "sin filas";
}

const casos: Caso[] = [
  {
    nombre: "completo: aceite en USD + envase de cada presentación + transporte",
    lote: lote({ ...aceiteUsd, costos: [envase("a"), envase("b"), transporte()] }),
    faltantes: [],
    vista: { a: true, b: true },
  },
  {
    nombre: "aceite en pesos (línea con total > 0) en vez de USD",
    lote: lote({ costos: [aceitePesos(5000), envase("a"), envase("b"), transporte()] }),
    faltantes: [],
    vista: { a: true, b: true },
  },
  {
    nombre: "aceite en pesos: alcanza costo unitario > 0 con total 0",
    lote: lote({ costos: [aceitePesos(0, 300), envase("a"), envase("b"), transporte()] }),
    faltantes: [],
    vista: { a: true, b: true },
  },
  {
    nombre: "aceite en pesos con total 0 y unitario 0 o nulo: no cuenta",
    lote: lote({ costos: [aceitePesos(0, 0), envase("a"), envase("b"), transporte()] }),
    faltantes: ["aceite"],
    vista: { a: false, b: false },
  },
  {
    nombre: "dólar sin precio del litro (o al revés) no alcanza",
    lote: lote({
      dolarCentavos: 100000,
      precioLitroAceiteUsdCentavos: null,
      costos: [envase("a"), envase("b"), transporte()],
    }),
    faltantes: ["aceite"],
    vista: { a: false, b: false },
  },
  {
    nombre: "dólar en 0 con precio del litro cargado no alcanza",
    lote: lote({
      dolarCentavos: 0,
      precioLitroAceiteUsdCentavos: 500,
      costos: [envase("a"), envase("b"), transporte()],
    }),
    faltantes: ["aceite"],
    vista: { a: false, b: false },
  },
  {
    nombre: "línea de aceite cuenta aunque sea de otra presentación (no se compara producto)",
    lote: lote({ costos: [aceitePesos(5000), envase("a"), envase("b"), transporte()] }),
    faltantes: [],
    vista: { a: true, b: true },
  },
  {
    nombre: "envase en $ 0 cuenta como cargado",
    lote: lote({ ...aceiteUsd, costos: [envase("a", 0), envase("b"), transporte()] }),
    faltantes: [],
    vista: { a: true, b: true },
  },
  {
    nombre: "falta el envase de una presentación: la vista marca solo ese producto, TS marca el lote",
    lote: lote({ ...aceiteUsd, costos: [envase("a"), transporte()] }),
    faltantes: ["envase 250 ml"],
    vista: { a: true, b: false },
  },
  {
    nombre: "sin transporte: faltante lote-wide en las dos",
    lote: lote({ ...aceiteUsd, costos: [envase("a"), envase("b")] }),
    faltantes: ["transporte"],
    vista: { a: false, b: false },
  },
  {
    nombre: "transporte en $ 0 cuenta como cargado",
    lote: lote({ ...aceiteUsd, costos: [envase("a"), envase("b"), transporte(0)] }),
    faltantes: [],
    vista: { a: true, b: true },
  },
  {
    nombre: "transporte asignado a una presentación (producto_id no nulo) también cuenta",
    lote: lote({
      ...aceiteUsd,
      costos: [
        envase("a"),
        envase("b"),
        { concepto: "transporte", productoId: "a", costoUnitarioCentavos: null, totalCentavos: 900 },
      ],
    }),
    faltantes: [],
    vista: { a: true, b: true },
  },
  {
    nombre: "un envase de otro lote/producto no cuenta: el envase se compara por producto",
    lote: lote({ ...aceiteUsd, costos: [envase("a"), envase("zzz"), transporte()] }),
    faltantes: ["envase 250 ml"],
    vista: { a: true, b: false },
  },
  {
    nombre: "etiqueta, otro y gastos viejos no cuentan para 'completo'",
    lote: lote({
      ...aceiteUsd,
      tieneGastosViejos: true,
      costos: [
        envase("a"),
        envase("b"),
        { concepto: "etiqueta", productoId: "a", costoUnitarioCentavos: 10, totalCentavos: 10 },
        { concepto: "otro", productoId: null, costoUnitarioCentavos: null, totalCentavos: 50 },
      ],
    }),
    faltantes: ["transporte"],
    vista: { a: false, b: false },
  },
  {
    nombre: "nada cargado",
    lote: lote({}),
    faltantes: ["aceite", "envase 500 ml", "envase 250 ml", "transporte"],
    vista: { a: false, b: false },
  },
  {
    nombre: "un solo producto, completo",
    lote: lote({ ...aceiteUsd, productoIds: ["a"], costos: [envase("a"), transporte()] }),
    faltantes: [],
    vista: { a: true },
  },
  {
    nombre: "producto repetido en lote_items: TS lo deduplica, la vista da dos filas iguales",
    lote: lote({ ...aceiteUsd, productoIds: ["a", "a"], costos: [envase("a"), transporte()] }),
    faltantes: [],
    vista: { a: true },
  },
  {
    // DIVERGENCIA DE BORDE (no alcanzable por la app: crear_lote exige items,
    // 'SIN_ITEMS'): la vista no tiene filas y dice "no completo"; TS no chequea
    // ningún envase y puede decir "completo".
    nombre: "lote sin items (borde, no alcanzable por la app)",
    lote: lote({ ...aceiteUsd, productoIds: [], costos: [transporte()] }),
    faltantes: [],
    vista: "sin filas",
  },
];

/** El lote es "completo" para TS si no falta nada; para la vista, si TODAS sus filas lo son. */
function vistaDelLote(vista: Caso["vista"]): boolean {
  return vista === "sin filas" ? false : Object.values(vista).every(Boolean);
}

describe("faltantesCostosLote vs v_lote_costos_completos (casos sintéticos)", () => {
  for (const c of casos) {
    it(c.nombre, () => {
      expect(faltantesCostosLote(c.lote, pres)).toEqual(c.faltantes);
    });
  }

  it("para todo lote con items, 'sin faltantes' en TS equivale a 'todas las filas completas' en la vista", () => {
    for (const c of casos.filter((x) => x.vista !== "sin filas")) {
      const sinFaltantes = faltantesCostosLote(c.lote, pres).length === 0;
      expect(sinFaltantes, c.nombre).toBe(vistaDelLote(c.vista));
    }
  });

  it("único desacuerdo conocido: lote sin items (la vista no tiene filas)", () => {
    const distintos = casos.filter((c) => (faltantesCostosLote(c.lote, pres).length === 0) !== vistaDelLote(c.vista));
    expect(distintos.map((c) => c.vista)).toEqual(["sin filas"]);
  });
});

// ─── Red de seguridad sobre las migraciones ────────────────────────────────

const DIR = join(process.cwd(), "supabase/migrations");
const archivos = readdirSync(DIR)
  .filter((f) => /^\d{4}_.*\.sql$/.test(f))
  .sort();
const sinComentarios = (sql: string) =>
  sql
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

describe("definición vigente de v_lote_costos_completos", () => {
  const redefine = /\b(create\s+(or\s+replace\s+)?view|drop\s+view(\s+if\s+exists)?|alter\s+view[^;]*rename)\s+(public\.|__SCHEMA__\.)?v_lote_costos_completos\b/i;
  const redefineFuncion = /\b(create\s+(or\s+replace\s+)?function|drop\s+function(\s+if\s+exists)?)\s+(public\.|__SCHEMA__\.)?lote_costos_completos\b/i;

  it("solo la define 0044; si otra migración la redefine, hay que revisar también `faltantesCostosLote`", () => {
    const definen = archivos.filter((f) => redefine.test(sinComentarios(readFileSync(join(DIR, f), "utf8"))));
    expect(
      definen,
      "v_lote_costos_completos cambió: revisá también `faltantesCostosLote` (lib/dominio/tareas.ts) y la tabla de casos de este test",
    ).toEqual(["0044_diferencia_encargado.sql"]);
  });

  it("solo 0044 define lote_costos_completos(lote, producto)", () => {
    const definen = archivos.filter((f) => redefineFuncion.test(sinComentarios(readFileSync(join(DIR, f), "utf8"))));
    expect(
      definen,
      "lote_costos_completos() cambió: revisá también `faltantesCostosLote` (lib/dominio/tareas.ts)",
    ).toEqual(["0044_diferencia_encargado.sql"]);
  });

  it("la definición de 0044 sigue siendo la que espeja la regla de TS", () => {
    const sql = sinComentarios(readFileSync(join(DIR, "0044_diferencia_encargado.sql"), "utf8"));
    const m = sql.match(/create view v_lote_costos_completos as([\s\S]*?);/);
    expect(m, "no se encontró la vista en 0044").not.toBeNull();
    const def = m![1].replace(/\s+/g, " ").trim();
    const esperada = [
      "select li.lote_id, li.producto_id,",
      "( ( (coalesce(l.dolar_centavos, 0) > 0 and coalesce(l.precio_litro_aceite_usd_centavos, 0) > 0)",
      "or exists ( select 1 from lote_costos c where c.lote_id = li.lote_id and c.concepto = 'aceite'",
      "and (coalesce(c.total_centavos, 0) > 0 or coalesce(c.costo_unitario_centavos, 0) > 0) ) )",
      "and exists ( select 1 from lote_costos c where c.lote_id = li.lote_id and c.concepto = 'envase' and c.producto_id = li.producto_id )",
      "and exists ( select 1 from lote_costos c where c.lote_id = li.lote_id and c.concepto = 'transporte' )",
      ") as completo from lote_items li join lotes_produccion l on l.id = li.lote_id",
    ].join(" ");
    expect(def, "v_lote_costos_completos cambió: revisá también `faltantesCostosLote`").toBe(esperada);
  });
});
