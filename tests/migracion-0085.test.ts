import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/0085_vendedores_select_initplan.sql"), "utf8");
const codigo = sql
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");

describe("migración 0085 (vendedores_select con auth.uid() cacheado)", () => {
  it("altera la policy existente con el mismo predicado y (select auth.uid())", () => {
    expect(codigo).toContain("alter policy vendedores_select on public.vendedores");
    expect(codigo).toContain(
      "using ((user_id = (select auth.uid())) or es_vendedor() or es_coordinador_de(id));",
    );
  });

  it("no cambia la regla: sigue con es_vendedor() y es_coordinador_de(id), sin auth.uid() suelto", () => {
    expect(codigo).toContain("es_vendedor()");
    expect(codigo).toContain("es_coordinador_de(id)");
    expect(codigo.replace(/\(select auth\.uid\(\)\)/g, "")).not.toContain("auth.uid()");
  });

  it("es una sola sentencia sobre public, sin tocar miel ni with check", () => {
    expect(codigo.match(/;/g)).toHaveLength(1);
    expect(codigo).not.toContain("miel");
    expect(codigo).not.toContain("with check");
  });

  it("la cabecera trae verificación de solo lectura y rollback", () => {
    expect(sql).toContain("Verificación posterior (solo lectura)");
    expect(sql).toContain("pg_policies");
    expect(sql).toContain("Rollback");
    expect(sql).toContain("using (user_id = auth.uid() or es_vendedor() or es_coordinador_de(id));");
  });
});
