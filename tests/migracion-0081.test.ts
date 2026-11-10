import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/0081_estados_coherentes.sql"), "utf8");
const codigo = sql
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");

describe("migración 0081 (estados coherentes)", () => {
  it("redefine sincronizar_deuda_aceite_lote con la misma firma, sin comillas y con revoke", () => {
    expect(codigo).toContain("create or replace function public.sincronizar_deuda_aceite_lote(p_lote_id uuid)");
    expect(codigo).toContain("security definer");
    expect(codigo).toContain("set search_path = public\n");
    expect(codigo).not.toContain("search_path = 'public'");
    expect(codigo).toContain(
      "revoke execute on function public.sincronizar_deuda_aceite_lote(uuid) from anon, authenticated, public;",
    );
  });

  it("la fecha de saldada_en sale de los pagos, no de current_date", () => {
    expect(codigo).toContain("select max(fecha) from pagos_deuda");
    expect(codigo).not.toContain("current_date");
  });

  it("los CHECK van NOT VALID y se validan aparte", () => {
    for (const c of [
      ["feria_participantes", "feria_participantes_estado_coherente"],
      ["rendiciones", "rendiciones_via_tenedor_coherente"],
    ]) {
      expect(codigo).toContain(`alter table public.${c[0]}\n  add constraint ${c[1]}`);
      expect(codigo).toContain(`alter table public.${c[0]}\n  validate constraint ${c[1]};`);
    }
    expect(codigo.match(/\) not valid;/g)).toHaveLength(2);
  });
});
