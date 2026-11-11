import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sqlCompleto = readFileSync(join(process.cwd(), "supabase/migrations/0095_retirar_feria_vieja_tabla.sql"), "utf8");
const sql = sqlCompleto
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");

describe("migración 0095 (retirar feria vieja: columnas y tabla)", () => {
  it("empieza por precondiciones: sin datos y 0094 aplicada", () => {
    const pre = sql.indexOf("do $$");
    const primera = sql.search(/\b(drop|alter)\s/i);
    expect(pre).toBeGreaterThan(-1);
    expect(pre).toBeLessThan(primera);
    for (const t of [
      "select 1 from public.ferias)",
      "from public.comprobantes where feria_id is not null",
      "from public.gastos where feria_id is not null",
      "from public.movimientos_stock where feria_id is not null",
      "from public.movimientos_stock_borrados where feria_id is not null",
      "to_regprocedure('public.validar_feria_abierta()') is not null",
      "pg_get_function_arguments(oid) ilike '%feria%'",
      "attrelid = 'public.v_margen_ventas'::regclass",
    ]) {
      expect(sql, t).toContain(t);
    }
    expect(sql.match(/raise exception 'PRECONDICION_FALLIDA/g)).toHaveLength(8);
  });

  it("ningún cascade, public. explícito y no toca miel", () => {
    expect(sql).not.toMatch(/\bcascade\b/i);
    expect(sql).not.toMatch(/\bmiel\b/);
    expect(sql).not.toContain("__SCHEMA__");
    for (const d of sql.match(/\b(drop|alter)\s+(table|index|function)\s+[^;]+;/gi) ?? []) {
      expect(d, d).toMatch(/public\./);
    }
  });

  it("dropea FK, índice y columna de cada tabla, en ese orden", () => {
    for (const [tabla, idx] of [
      ["comprobantes", "idx_comprobantes_feria_id"],
      ["gastos", "idx_gastos_feria_id"],
      ["movimientos_stock", "idx_movimientos_stock_feria_id"],
    ]) {
      const fk = sql.indexOf(`alter table public.${tabla} drop constraint ${tabla}_feria_id_fkey;`);
      const ix = sql.indexOf(`drop index public.${idx};`);
      const col = sql.indexOf(`alter table public.${tabla} drop column feria_id;`);
      expect(fk, tabla).toBeGreaterThan(-1);
      expect(ix).toBeGreaterThan(fk);
      expect(col).toBeGreaterThan(ix);
    }
    expect(sql).toContain("alter table public.movimientos_stock_borrados drop column feria_id;");
  });

  it("dropea la tabla ferias y sus dos funciones, y nada más", () => {
    expect(sql).toContain("drop table public.ferias;");
    expect(sql).toContain("drop function public.forzar_vendedor_feria();");
    expect(sql).toContain("drop function public.proteger_estado_feria();");
    expect(sql.match(/\bdrop\s+table\b/gi)).toHaveLength(1);
    expect(sql.match(/\bdrop\s+function\b/gi)).toHaveLength(2);
  });

  it("redefine feria_quitar_degustacion y feria_reabrir_participacion ANTES de cualquier drop", () => {
    const primerDrop = sql.search(/\b(drop|alter)\s/i);
    for (const [nombre, firma, inserts] of [
      ["feria_quitar_degustacion", "uuid, uuid, uuid", 1],
      ["feria_reabrir_participacion", "uuid, uuid", 2],
    ] as const) {
      const inicio = sql.indexOf(`create or replace function public.${nombre}(`);
      expect(inicio, nombre).toBeGreaterThan(-1);
      expect(inicio, `${nombre} antes del primer drop`).toBeLessThan(primerDrop);
      const fin = sql.indexOf("$function$;", sql.indexOf("$function$", inicio) + 1);
      const f = sql.slice(inicio, fin);
      expect(f).toContain("security definer");
      expect(f).toMatch(/set search_path = public\n/);
      expect(f).not.toMatch(/search_path\s*=\s*'/);
      expect(sql).toContain(`revoke all on function public.${nombre}(${firma}) from public, anon;`);
      expect(sql).toContain(`grant execute on function public.${nombre}(${firma}) to authenticated, service_role;`);
      const archivos = f.match(/insert\s+into\s+movimientos_stock_borrados\s*\([^)]*\)/gi) ?? [];
      expect(archivos, nombre).toHaveLength(inserts);
      for (const a of archivos) {
        expect(a).not.toContain("feria_id");
        expect(a).toContain("lote_id, entrega_id, motivo, borrado_por");
      }
      // El select hermano tampoco lee feria_id de movimientos_stock.
      expect(f).not.toMatch(/lote_id,\s*feria_id/);
      expect(f).not.toContain("PAGO_PROPIO");
    }
  });

  it("verifica que ninguna función siga archivando feria_id, después de las redefiniciones y antes de los drop", () => {
    const check = sql.indexOf("VERIFICACION_FALLIDA");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(sql.indexOf("create or replace function public.feria_reabrir_participacion("));
    expect(check).toBeLessThan(sql.search(/\b(drop|alter)\s/i));
    expect(sql).toContain("insert\\s+into\\s+(public\\.)?movimientos_stock_borrados\\s*\\([^)]*feria_id");
  });

  it("no toca el sistema nuevo de ferias con drop ni alter", () => {
    const destructivo = (sql.match(/\b(drop|alter)\s[^;]*;/gi) ?? []).join("\n");
    for (const nuevo of [
      "feria_revendedoras",
      "feria_participantes",
      "feria_precios",
      "feria_degustaciones",
      "entregas_revendedor",
      "ventas_revendedor",
      "v_feria_participantes",
      "v_feria_participante_productos",
      "set_updated_at",
      "feria_quitar_degustacion",
      "feria_reabrir_participacion",
    ]) {
      expect(destructivo, nuevo).not.toContain(nuevo);
    }
    expect(sql).not.toMatch(/drop\s+table[^;]*public\.ferias_/i);
  });
});
