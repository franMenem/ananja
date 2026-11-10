import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/0083_retirar_feria_vieja_segura.sql"), "utf8");
const codigo = sql
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");

describe("migración 0083 (retirar feria vieja, parte segura)", () => {
  it("empieza por precondiciones que abortan si hay filas o feria_id viejos", () => {
    const pre = codigo.indexOf("do $$");
    const primerDrop = codigo.search(/\bdrop\s/i);
    expect(pre).toBeGreaterThan(-1);
    expect(pre).toBeLessThan(primerDrop);
    for (const t of [
      "select 1 from public.ferias)",
      "select 1 from public.feria_productos)",
      "from public.comprobantes where feria_id is not null",
      "from public.gastos where feria_id is not null",
      "from public.movimientos_stock where feria_id is not null",
    ]) {
      expect(codigo, t).toContain(t);
    }
    expect(codigo.match(/raise exception 'PRECONDICION_FALLIDA/g)).toHaveLength(5);
  });

  it("todos los drop llevan if exists, public. explícito y ningún cascade", () => {
    const drops = codigo.match(/\bdrop\s+[^;]+;/gi) ?? [];
    expect(drops.length).toBe(8);
    for (const d of drops) {
      expect(d, d).toMatch(/if exists public\./i);
    }
    expect(codigo).not.toMatch(/\bcascade\b/i);
    expect(codigo).not.toMatch(/__SCHEMA__/);
  });

  it("la vista que depende de otra se dropea primero", () => {
    expect(codigo.indexOf("v_resultado_feria")).toBeLessThan(codigo.indexOf("v_feria_totales"));
  });

  it("no toca nada del sistema nuevo de ferias ni la tabla ferias, columnas o RPC vivas", () => {
    for (const nuevo of [
      "feria_revendedoras",
      "feria_participantes",
      "feria_precios",
      "feria_degustaciones",
      "entregas_revendedor",
      "ventas_revendedor",
      "v_margen_ventas",
    ]) {
      expect(codigo, nuevo).not.toContain(nuevo);
    }
    expect(codigo).not.toMatch(/drop\s+table[^;]*public\.ferias\b(?!_)/i);
    expect(codigo).not.toMatch(/alter\s+table/i);
    expect(codigo).not.toMatch(/drop\s+column/i);
    expect(codigo).not.toMatch(/drop\s+trigger/i);
    for (const viva of ["crear_comprobante", "actualizar_comprobante", "crear_gasto", "validar_feria_abierta"]) {
      expect(codigo, viva).not.toContain(viva);
    }
  });

  it("las funciones que dropea no son llamadas por el código de la app", () => {
    for (const f of ["crear_feria", "reabrir_feria"]) {
      expect(codigo).toContain(`public.${f}(`);
    }
    expect(codigo).not.toContain("search_path");
  });
});
