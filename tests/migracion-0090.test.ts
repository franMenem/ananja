import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const dir = join(process.cwd(), "supabase/migrations");
const sql = readFileSync(join(dir, "0090_vistas_solo_lectura.sql"), "utf8");
const codigo = sql
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");

const vistas = [...codigo.matchAll(/'public\.(v_[a-z_]+)'/g)].map((m) => m[1]);

describe("migración 0090 (vistas de public en solo lectura)", () => {
  it("revoca todo menos select a anon y authenticated", () => {
    expect(codigo).toContain(
      "revoke insert, update, delete, truncate, references, trigger on %s from anon, authenticated",
    );
    expect(codigo).not.toMatch(/revoke[^;]*\bselect\b/i);
    expect(codigo).not.toContain("service_role");
  });

  it("usa lista explícita con guarda to_regclass y relkind de vista, sin tocar miel ni default privileges", () => {
    expect(vistas.length).toBe(35);
    expect(new Set(vistas).size).toBe(vistas.length);
    expect(codigo).toContain("to_regclass(v) is not null");
    expect(codigo).toContain("= 'v'");
    expect(codigo).not.toContain("miel");
    expect(codigo).not.toContain("default privileges");
  });

  it("cubre toda vista v_* creada en las migraciones anteriores y aún existente", () => {
    const creadas = new Set<string>();
    const borradas = new Set<string>();
    const archivos = readdirSync(dir)
      .filter((f) => f.endsWith(".sql") && f < "0090")
      .sort();
    for (const f of archivos) {
      const txt = readFileSync(join(dir, f), "utf8")
        .split("\n")
        .filter((l) => !l.trimStart().startsWith("--"))
        .join("\n");
      for (const m of txt.matchAll(/create\s+(?:or\s+replace\s+)?view\s+(?:public\.)?(v_[a-z_]+)/gi)) {
        creadas.add(m[1]);
        borradas.delete(m[1]);
      }
      for (const m of txt.matchAll(/drop\s+view\s+(?:if\s+exists\s+)?(?:public\.)?(v_[a-z_]+)/gi)) {
        borradas.add(m[1]);
      }
    }
    const faltan = [...creadas].filter((v) => !borradas.has(v) && !vistas.includes(v));
    expect(faltan).toEqual([]);
  });

  it("la cabecera trae verificación de solo lectura y rollback", () => {
    expect(sql).toContain("Verificación posterior (solo lectura)");
    expect(sql).toContain("esperado: 0 filas");
    expect(sql).toContain("Rollback");
  });
});
