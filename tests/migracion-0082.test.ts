import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/0082_cerrar_escrituras_directas.sql"), "utf8");
const codigo = sql
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");

describe("migración 0082 (cerrar escrituras directas)", () => {
  it("solo revoca grants de la feria vieja y no toca las tablas que la app sí escribe", () => {
    expect(codigo).toContain("revoke delete on public.ferias from authenticated;");
    expect(codigo).toContain(
      "revoke update (nombre, lugar, fecha_inicio, fecha_fin, nota) on public.ferias from authenticated;",
    );
    expect(codigo).toContain(
      "revoke update (precio_centavos, cantidad_llevada) on public.feria_productos from authenticated;",
    );
    for (const tabla of ["deudas", "movimientos_stock", "gastos", "comprobantes", "insumos"]) {
      expect(codigo, `no debe revocar nada de ${tabla}`).not.toMatch(new RegExp(`revoke[^;]*\\b${tabla}\\b`));
    }
    expect(codigo).not.toMatch(/revoke\s+(select|all)/i);
  });

  it("redefine feria_quitar_participante con la misma firma, exige feria abierta y conserva permisos", () => {
    expect(codigo).toContain("create or replace function public.feria_quitar_participante(p_feria_id uuid, p_vendedor_id uuid)");
    expect(codigo).toContain("returns json");
    expect(codigo).toContain("security definer");
    expect(codigo).toContain("set search_path = public\n");
    expect(codigo).not.toContain("search_path = 'public'");
    expect(codigo).toContain("if not public.es_admin() then");
    expect(codigo).toContain("from feria_revendedoras where id = p_feria_id for share;");
    expect(codigo).toContain("raise exception 'FERIA_NO_ENCONTRADA';");
    expect(codigo).toContain("raise exception 'FERIA_CERRADA';");
    expect(codigo).toContain("raise exception 'PARTICIPANTE_CON_MOVIMIENTOS';");
    expect(codigo).toContain("revoke execute on function public.feria_quitar_participante(uuid, uuid) from anon, public;");
    expect(codigo).toContain("grant execute on function public.feria_quitar_participante(uuid, uuid) to authenticated;");
  });

  it("el orden de locks es feria -> participante y los chequeos van antes del delete", () => {
    const feria = codigo.indexOf("from feria_revendedoras where id = p_feria_id for share;");
    const participante = codigo.indexOf("from feria_participantes\n  where feria_id = p_feria_id and vendedor_id = p_vendedor_id\n  for update;");
    const movimientos = codigo.indexOf("raise exception 'PARTICIPANTE_CON_MOVIMIENTOS';");
    const borrar = codigo.indexOf("delete from feria_participantes");
    expect(feria).toBeGreaterThan(-1);
    expect(participante).toBeGreaterThan(feria);
    expect(movimientos).toBeGreaterThan(participante);
    expect(borrar).toBeGreaterThan(movimientos);
  });

  it("los códigos de error existen en el mapa de la UI", () => {
    const feria = readFileSync(join(process.cwd(), "lib/dominio/feria.ts"), "utf8");
    for (const c of ["FERIA_CERRADA", "FERIA_NO_ENCONTRADA", "PARTICIPANTE_CON_MOVIMIENTOS", "NO_AUTORIZADO"]) {
      expect(feria + readFileSync(join(process.cwd(), "lib/dominio/errores-rpc.ts"), "utf8").toString()).toContain(c);
    }
  });

  it("usa public. explícito, sin cascade y sin escribir datos", () => {
    expect(codigo).not.toMatch(/\bcascade\b/i);
    expect(codigo).not.toMatch(/__SCHEMA__/);
    expect(codigo).not.toMatch(/\b(insert\s+into|update\s+\w|delete\s+from\s+(?!feria_participantes))/i);
  });
});
