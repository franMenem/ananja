import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const dir = join(process.cwd(), "supabase/migrations");
const sinComentarios = (sql: string) =>
  sql
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

const sqlA = readFileSync(join(dir, "0086_rpc_escrituras.sql"), "utf8");
const a = sinComentarios(sqlA);
const sqlB = readFileSync(join(dir, "0087_revocar_escrituras_directas.sql"), "utf8");
const b = sinComentarios(sqlB);

const FUNCIONES: [string, string][] = [
  ["crear_deuda", "(text, text, bigint, date, text)"],
  ["marcar_deuda_saldada", "(uuid, date)"],
  ["registrar_egreso_manual", "(uuid, text, jsonb, text)"],
  ["editar_gasto", "(uuid, bigint, uuid, public.medio_pago, date, text)"],
  ["eliminar_gasto", "(uuid)"],
  ["eliminar_comprobante", "(uuid)"],
  ["actualizar_umbral_insumo", "(uuid, numeric)"],
];

describe("migración 0086 (RPC de escrituras)", () => {
  it("crea las 7 funciones, security definer, search_path sin comillas, con public. explícito", () => {
    expect(a.match(/create function public\./g)).toHaveLength(FUNCIONES.length);
    expect(a.match(/security definer/g)).toHaveLength(FUNCIONES.length);
    expect(a.match(/set search_path = public\n/g)).toHaveLength(FUNCIONES.length);
    expect(a).not.toContain("search_path = 'public'");
    expect(a).not.toContain("create or replace");
    expect(a).not.toContain("miel");
  });

  it("cada función chequea es_admin() antes de escribir", () => {
    expect(a.match(/if not public\.es_admin\(\) then\s+raise exception 'NO_AUTORIZADO';/g)).toHaveLength(FUNCIONES.length);
  });

  for (const [nombre, firma] of FUNCIONES) {
    it(`${nombre}: revoke a public/anon y grant solo a authenticated`, () => {
      expect(a).toContain(`create function public.${nombre}(`);
      expect(a).toContain(`revoke all on function public.${nombre}${firma} from public, anon;`);
      expect(a).toContain(`grant execute on function public.${nombre}${firma} to authenticated;`);
    });
  }

  it("no revoca ni cambia permisos de tablas (es aditiva)", () => {
    expect(a).not.toMatch(/revoke\s+(insert|update|delete|select)/);
    expect(a).not.toMatch(/\bdrop\b/);
  });

  it("el egreso manual fija tipo egreso y deja comprobante, feria y entrega en null", () => {
    expect(a).toContain("values (p_producto_id, 'egreso', v_cantidad::integer, v_vendedor_id, v_nota, p_motivo, v_lote_id)");
    expect(a).toContain("p_motivo not in ('venta', 'degustacion', 'rotura', 'regalo', 'otro')");
  });

  it("editar_gasto replica gastos_proteger_pago_diferencia y no toca encargado_beneficiario_id", () => {
    expect(a).toContain("raise exception 'CATEGORIA_NO_EDITABLE'");
    expect(a).toContain("v_gasto.encargado_beneficiario_id is not null");
    expect(a).toContain("'Diferencias de encargados'");
    const update = a.slice(a.indexOf("update public.gastos"), a.indexOf("return json_build_object('id', p_gasto_id);"));
    expect(update).not.toContain("encargado_beneficiario_id");
    expect(update).not.toContain("vendedor_id");
  });

  it("marcar_deuda_saldada usa la fecha del parámetro (sin current_date) y no reabre ni pisa", () => {
    expect(a).not.toContain("current_date");
    expect(a).toContain("raise exception 'DEUDA_YA_SALDADA'");
  });

  it("la cabecera trae verificación de solo lectura y rollback", () => {
    expect(sqlA).toContain("Verificación posterior (solo lectura)");
    expect(sqlA).toContain("Rollback");
  });
});

describe("migración 0087 (revocar escrituras directas)", () => {
  it("revoca exactamente lo que dejó de usarse y nada de select", () => {
    expect(b).toContain("revoke insert, update on public.deudas from authenticated, anon;");
    expect(b).toContain("revoke insert on public.movimientos_stock from authenticated, anon;");
    expect(b).toContain("revoke update, delete on public.gastos from authenticated, anon;");
    expect(b).toContain("revoke delete on public.comprobantes from authenticated, anon;");
    expect(b).toContain("revoke delete on public.comprobante_items from authenticated, anon;");
    expect(b).toContain("revoke update on public.insumos from authenticated, anon;");
    expect(b).not.toMatch(/revoke\s+select/);
    expect(b.match(/revoke /g)).toHaveLength(6);
  });

  it("no toca tablas que todavía se escriben directo ni el schema miel", () => {
    for (const t of ["categorias_gasto", "clientes", "materiales_venta", "productos", "push_subscriptions"]) {
      expect(b).not.toContain(t);
    }
    expect(b).not.toContain("miel");
  });

  it("la cabecera exige aplicarla después de desplegar el código, con verificación y rollback", () => {
    expect(sqlB).toContain("ORDEN DE DESPLIEGUE");
    expect(sqlB).toContain("Verificación posterior (solo lectura)");
    expect(sqlB).toContain("Rollback");
  });
});

describe("el código ya no escribe directo en las tablas revocadas", () => {
  it("lib/precios.ts, lib/insumos.ts y las pantallas usan RPC", () => {
    const lee = (r: string) => readFileSync(join(process.cwd(), r), "utf8");
    const archivos = [
      "lib/precios.ts",
      "lib/insumos.ts",
      "components/stock/movimiento-form.tsx",
      "components/comprobante-delete-button.tsx",
      "app/(app)/gastos/[id]/page.tsx",
    ];
    for (const f of archivos) {
      expect(lee(f), f).not.toMatch(/\.from\("(deudas|movimientos_stock|gastos|comprobantes|insumos)"\)\s*\.(insert|update|delete|upsert)\(/);
    }
    expect(lee("lib/precios.ts")).toContain('rpc("crear_deuda"');
    expect(lee("lib/precios.ts")).toContain('rpc("marcar_deuda_saldada"');
    expect(lee("lib/insumos.ts")).toContain('rpc("actualizar_umbral_insumo"');
    expect(lee("components/stock/movimiento-form.tsx")).toContain('rpc("registrar_egreso_manual"');
    expect(lee("components/comprobante-delete-button.tsx")).toContain('rpc("eliminar_comprobante"');
    expect(lee("app/(app)/gastos/[id]/page.tsx")).toContain('rpc("editar_gasto"');
    expect(lee("app/(app)/gastos/[id]/page.tsx")).toContain('rpc("eliminar_gasto"');
  });
});
