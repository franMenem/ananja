import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/0092_eliminar_pago_revendedor.sql"), "utf8");
const codigo = sql
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");

describe("migración 0092 (eliminar pago de revendedora)", () => {
  it("define una sola función, security definer, sin comillas en search_path", () => {
    expect(codigo).toContain("create function public.eliminar_rendicion_revendedor(p_rendicion_id uuid)");
    expect(codigo).not.toContain("create or replace");
    expect(codigo).toContain("security definer");
    expect(codigo).toContain("set search_path = public\n");
    expect(codigo).not.toContain("search_path = 'public'");
  });

  it("solo admin y permisos cerrados a anon", () => {
    expect(codigo).toContain("if not public.es_admin() then");
    expect(codigo).toContain("raise exception 'NO_AUTORIZADO'");
    expect(codigo).toContain("revoke all on function public.eliminar_rendicion_revendedor(uuid) from public, anon;");
    expect(codigo).toContain("grant execute on function public.eliminar_rendicion_revendedor(uuid) to authenticated;");
  });

  it("bloquea las filas antes de decidir", () => {
    expect(codigo).toContain("for no key update");
    expect(codigo).toMatch(/from public\.rendiciones\s+where id = p_rendicion_id\s+for update/);
    expect(codigo).toMatch(/from public\.pagos_revendedor\s+where rendicion_id = v_rend\.id\s+for update/);
  });

  it("lanza cada código de rechazo", () => {
    for (const c of [
      "RENDICION_NO_ENCONTRADA",
      "RENDICION_DE_VENTA",
      "PLATA_YA_DEPOSITADA",
      "CAJA_SIN_SALDO",
      "DIFERENCIA_YA_PAGADA",
    ]) {
      expect(codigo).toContain(`raise exception '${c}'`);
    }
  });

  it("archiva, deja el pago rechazado sin rendición y borra la rendición, en ese orden", () => {
    const archivo = codigo.indexOf("insert into public.rendiciones_borradas");
    const pago = codigo.indexOf("update public.pagos_revendedor");
    const borrar = codigo.indexOf("delete from public.rendiciones where id = v_rend.id");
    expect(archivo).toBeGreaterThan(0);
    expect(pago).toBeGreaterThan(archivo);
    expect(borrar).toBeGreaterThan(pago);
    expect(codigo).toContain("estado = 'rechazado'");
    expect(codigo).toContain("rendicion_id = null");
    expect(codigo).toContain("motivo_rechazo = ");
  });

  it("revisa plata en manos, cajas y diferencias DESPUÉS de borrar y contra la foto de antes", () => {
    const borrar = codigo.indexOf("delete from public.rendiciones where id = v_rend.id");
    for (const vista of ["v_plata_en_manos pm", "v_saldos_caja\n    where", "v_deuda_encargados de"]) {
      expect(codigo.indexOf(vista, borrar)).toBeGreaterThan(borrar);
    }
    expect(codigo.indexOf("v_pre_manos from public.v_plata_en_manos")).toBeLessThan(borrar);
    expect(codigo).toContain("depositos_informados");
  });

  it("no agrega columnas, estados ni toca otras funciones o vistas", () => {
    expect(codigo).not.toMatch(/alter table|create table|create or replace|create view|drop /i);
  });
});
