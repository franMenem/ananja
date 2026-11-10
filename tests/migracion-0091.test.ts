import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sqlCompleto = readFileSync(join(process.cwd(), "supabase/migrations/0091_eliminar_movimientos.sql"), "utf8");
const sql = sqlCompleto
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");

const FUNCIONES: [string, string][] = [
  ["eliminar_transferencia_caja", "(uuid)"],
  ["eliminar_deuda", "(uuid)"],
  ["reabrir_deuda", "(uuid)"],
  ["eliminar_ajuste_insumo", "(uuid)"],
];

function cuerpo(nombre: string): string {
  const inicio = sql.indexOf(`create function public.${nombre}(`);
  const fin = sql.indexOf("$$;", inicio);
  return sql.slice(inicio, fin);
}

describe("migración 0091 (eliminar movimientos)", () => {
  it("crea 4 funciones security definer, search_path sin comillas, public. explícito", () => {
    expect(sql.match(/create function public\./g)).toHaveLength(FUNCIONES.length);
    expect(sql.match(/security definer/g)).toHaveLength(FUNCIONES.length);
    expect(sql.match(/set search_path = public\n/g)).toHaveLength(FUNCIONES.length);
    expect(sql).not.toContain("search_path = 'public'");
    expect(sql).not.toContain("create or replace");
    expect(sql).not.toContain("miel");
  });

  it("cada función chequea es_admin() primero", () => {
    expect(sql.match(/if not public\.es_admin\(\) then\s+raise exception 'NO_AUTORIZADO';/g)).toHaveLength(FUNCIONES.length);
  });

  for (const [nombre, firma] of FUNCIONES) {
    it(`${nombre}: revoke a public/anon, grant solo a authenticated, lock for update`, () => {
      expect(sql).toContain(`revoke all on function public.${nombre}${firma} from public, anon;`);
      expect(sql).toContain(`grant execute on function public.${nombre}${firma} to authenticated;`);
      expect(cuerpo(nombre)).toContain("for update");
    });
  }

  it("es aditiva: no revoca permisos de tablas ni borra objetos", () => {
    expect(sql).not.toMatch(/revoke\s+(insert|update|delete|select)/);
    expect(sql).not.toMatch(/\bdrop\b/);
    expect(sql).not.toMatch(/\balter\b/);
  });

  it("eliminar_transferencia_caja rechaza si la caja destino quedaría en negativo", () => {
    const c = cuerpo("eliminar_transferencia_caja");
    expect(c).toContain("TRANSFERENCIA_NO_ENCONTRADA");
    expect(c).toContain("v_saldos_caja");
    expect(c).toContain("coalesce(v_saldo_destino, 0) - v_transferencia.monto_centavos < 0");
    expect(c).toContain("'SALDO_INSUFICIENTE'");
    expect(c).toContain("delete from public.transferencias_caja");
  });

  it("eliminar_deuda no borra deudas de un pedido ni con pagos", () => {
    const c = cuerpo("eliminar_deuda");
    expect(c).toContain("DEUDA_NO_ENCONTRADA");
    expect(c).toContain("v_lote_id is not null");
    expect(c).toContain("DEUDA_DE_PEDIDO");
    expect(c).toContain("from public.pagos_deuda where deuda_id = p_deuda_id");
    expect(c).toContain("DEUDA_CON_PAGOS");
  });

  it("reabrir_deuda solo reabre una saldada, que no es de pedido y que los pagos no cubren", () => {
    const c = cuerpo("reabrir_deuda");
    expect(c).toContain("DEUDA_DE_PEDIDO");
    expect(c).toContain("v_deuda.saldada_en is null");
    expect(c).toContain("DEUDA_NO_SALDADA");
    expect(c).toContain("v_pagado >= v_deuda.monto_centavos");
    expect(c).toContain("DEUDA_PAGADA_COMPLETA");
    expect(c).toContain("update public.deudas set saldada_en = null");
  });

  it("eliminar_ajuste_insumo solo borra ajustes manuales y no deja el stock negativo", () => {
    const c = cuerpo("eliminar_ajuste_insumo");
    expect(c).toContain("v_mov.gasto_id is not null or v_mov.lote_id is not null");
    expect(c).toContain("MOVIMIENTO_NO_MANUAL");
    expect(c).toContain("v_mov.tipo = 'ingreso'");
    expect(c).toContain("v_stock - v_mov.cantidad < 0");
    expect(c).toContain("STOCK_INSUFICIENTE");
  });
});
