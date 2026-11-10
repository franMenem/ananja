import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/0093_admin_resuelve_pagos_ajenos.sql"), "utf8");
const codigo = sql
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");

const [confirmar, rechazar] = codigo.split("create or replace function public.rechazar_pago_revendedor");

describe("migración 0093 (un admin resuelve pagos informados a otro admin)", () => {
  it("recrea las dos funciones con la misma firma, security definer y search_path sin comillas", () => {
    expect(codigo).toContain(
      "create or replace function public.confirmar_pago_revendedor(p_pago_id uuid)\nreturns json\nlanguage plpgsql\nsecurity definer\nset search_path = public\n",
    );
    expect(codigo).toContain(
      "create or replace function public.rechazar_pago_revendedor(p_pago_id uuid, p_motivo text)\nreturns json\nlanguage plpgsql\nsecurity definer\nset search_path = public\n",
    );
    expect(codigo).not.toContain("search_path = 'public'");
  });

  it("no contiene el bloqueo de destinatario ajeno en ninguna de las dos", () => {
    for (const cuerpo of [confirmar, rechazar]) {
      expect(cuerpo).not.toContain("v_pago.destinatario_id <> v_admin_id");
      expect(cuerpo).not.toContain("v_pago.vendedor_id <> v_admin_id");
    }
  });

  it("conserva los chequeos de integridad y de rol", () => {
    for (const cuerpo of [confirmar, rechazar]) {
      expect(cuerpo).toContain("if not public.es_admin() then");
      expect(cuerpo).toContain("raise exception 'PAGO_NO_ENCONTRADO'");
      expect(cuerpo).toContain("raise exception 'PAGO_YA_RESUELTO'");
    }
    expect(confirmar).toContain("raise exception 'MEDIO_INVALIDO'");
    expect(rechazar).toContain("raise exception 'MOTIVO_REQUERIDO'");
  });

  it("no cambia a manos de quién va la plata: el tenedor sigue siendo el destinatario", () => {
    expect(confirmar).toContain("when v_tenedor_valido then v_pago.destinatario_id\n    else v_admin_id");
    expect(confirmar).toContain("v_tenedor_valido := v_destinatario_admin_activo or v_destinatario_coordinador_activo;");
    expect(confirmar).toContain("v_via := case when v_pago.destinatario_id is null then 'directo_cuenta' else 'encargado' end;");
  });

  it("rechazar no deja variables muertas del bloqueo", () => {
    expect(rechazar).not.toContain("v_destinatario");
  });

  it("no reintroduce PAGO_PROPIO", () => {
    expect(codigo).not.toContain("PAGO_PROPIO");
  });

  it("repite revoke y grant explícitos", () => {
    expect(codigo).toContain("revoke execute on function public.confirmar_pago_revendedor(uuid) from anon, public;");
    expect(codigo).toContain("grant execute on function public.confirmar_pago_revendedor(uuid) to authenticated;");
    expect(codigo).toContain("revoke execute on function public.rechazar_pago_revendedor(uuid, text) from anon, public;");
    expect(codigo).toContain("grant execute on function public.rechazar_pago_revendedor(uuid, text) to authenticated;");
  });
});
