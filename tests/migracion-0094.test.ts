import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sqlCompleto = readFileSync(
  join(process.cwd(), "supabase/migrations/0094_retirar_feria_vieja_rpc_vista.sql"),
  "utf8",
);
const sql = sqlCompleto
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");

function cuerpo(nombre: string): string {
  const inicio = sql.search(new RegExp(`create (or replace )?function public\\.${nombre}\\(`));
  expect(inicio, nombre).toBeGreaterThan(-1);
  return sql.slice(inicio, sql.indexOf("$$;", sql.indexOf("as $$", inicio)));
}

const CC_NUEVA =
  "(bigint, public.medio_pago, text, date, text, public.estado_ocr, bigint, jsonb, boolean, uuid, bigint)";
const AC_NUEVA =
  "(uuid, bigint, public.medio_pago, text, date, text, public.estado_ocr, bigint, jsonb, boolean, uuid, bigint)";
const G_NUEVA = "(bigint, uuid, public.medio_pago, date, text, text, uuid, uuid)";

describe("migración 0094 (retirar feria vieja: RPC, triggers y vista)", () => {
  it("empieza por precondiciones que abortan si hay datos de feria vieja o firmas distintas", () => {
    const pre = sql.indexOf("do $$");
    const primerDrop = sql.search(/\bdrop\s/i);
    expect(pre).toBeGreaterThan(-1);
    expect(pre).toBeLessThan(primerDrop);
    for (const t of [
      "select 1 from public.ferias)",
      "from public.comprobantes where feria_id is not null",
      "from public.gastos where feria_id is not null",
      "from public.movimientos_stock where feria_id is not null",
      "from public.movimientos_stock_borrados where feria_id is not null",
    ]) {
      expect(sql, t).toContain(t);
    }
    expect(sql.match(/raise exception 'PRECONDICION_FALLIDA/g)).toHaveLength(8);
    expect(sql.match(/to_regprocedure\(/g)).toHaveLength(3);
  });

  it("ningún drop lleva cascade, todo va con public. explícito y no toca miel", () => {
    expect(sql).not.toMatch(/\bcascade\b/i);
    expect(sql).not.toMatch(/\bmiel\b/);
    expect(sql).not.toContain("__SCHEMA__");
    for (const d of sql.match(/\bdrop\s+[^;]+;/gi) ?? []) {
      expect(d, d).toMatch(/public\./);
    }
  });

  it("no borra columnas ni la tabla ferias (eso es de la 0095)", () => {
    expect(sql).not.toMatch(/drop\s+column/i);
    expect(sql).not.toMatch(/drop\s+table/i);
    expect(sql).not.toMatch(/alter\s+table/i);
  });

  it("dropea los tres triggers de validación y su función", () => {
    for (const t of [
      "drop trigger trg_comprobantes_validar_feria on public.comprobantes;",
      "drop trigger trg_gastos_validar_feria on public.gastos;",
      "drop trigger trg_movimientos_stock_validar_feria on public.movimientos_stock;",
      "drop function public.validar_feria_abierta();",
    ]) {
      expect(sql, t).toContain(t);
    }
  });

  it("las tres RPC se recrean con drop + create (nunca create or replace), sin p_feria_id", () => {
    for (const f of ["crear_comprobante", "actualizar_comprobante", "crear_gasto"]) {
      expect(sql).toContain(`drop function public.${f}(`);
      expect(sql).toMatch(new RegExp(`create function public\\.${f}\\(`));
      expect(sql).not.toMatch(new RegExp(`create or replace function public\\.${f}\\(`));
      const c = cuerpo(f);
      expect(c, f).not.toMatch(/feria/i);
      expect(c).toContain("security definer");
      expect(c).toContain("set search_path = public\n");
      expect(c).toContain("if not public.es_admin() then");
    }
    expect(sql).not.toContain("search_path = 'public'");
  });

  it("repite revoke y grant explícitos con la firma nueva", () => {
    for (const [f, firma] of [
      ["crear_comprobante", CC_NUEVA],
      ["actualizar_comprobante", AC_NUEVA],
      ["crear_gasto", G_NUEVA],
      ["eliminar_movimiento_stock", "(uuid)"],
    ] as const) {
      expect(sql).toContain(`revoke all on function public.${f}${firma} from public, anon;`);
      expect(sql).toContain(`grant execute on function public.${f}${firma} to authenticated, service_role;`);
    }
  });

  it("conserva los chequeos de integridad de las RPC (cobrado, stock, cliente, lote)", () => {
    const cc = cuerpo("crear_comprobante");
    for (const e of ["COBRADO_INVALIDO", "CREDITO_REQUIERE_CLIENTE", "CLIENTE_INVALIDO", "STOCK_LOTE_INSUFICIENTE", "ITEM_DUPLICADO"]) {
      expect(cc, e).toContain(e);
    }
    const ac = cuerpo("actualizar_comprobante");
    for (const e of ["COMPROBANTE_NO_ENCONTRADO", "MONTO_MENOR_A_COBRADO", "COBRADO_INVALIDO", "STOCK_INSUFICIENTE"]) {
      expect(ac, e).toContain(e);
    }
    expect(ac).toContain("select cobrado_centavos into v_cobrado_actual");
    const g = cuerpo("crear_gasto");
    for (const e of ["MONTO_INVALIDO", "LOTE_NO_ENCONTRADO", "PRODUCTO_NO_EN_LOTE"]) {
      expect(g, e).toContain(e);
    }
  });

  it("eliminar_movimiento_stock: misma firma (create or replace) y regla manual sin feria ni feria_id copiada", () => {
    expect(sql).toContain("create or replace function public.eliminar_movimiento_stock(p_movimiento_id uuid)");
    const c = cuerpo("eliminar_movimiento_stock");
    expect(c).toContain("or v_mov.comprobante_id is not null");
    expect(c).toContain("or v_mov.entrega_id is not null");
    expect(c).toContain("MOVIMIENTO_NO_MANUAL");
    expect(c).toContain("MOVIMIENTO_INVALIDO");
    expect(c).toContain("movimientos_stock_borrados");
    expect(c).toContain("for update");
    expect(c.replace(/--[^\n]*/g, "")).not.toMatch(/feria/i);
  });

  it("v_margen_ventas: drop + create con security_invoker, solo select, sin feria_id", () => {
    const iDrop = sql.indexOf("drop view public.v_margen_ventas;");
    const iCreate = sql.indexOf("create view public.v_margen_ventas\nwith (security_invoker = true)\nas\n");
    expect(iDrop).toBeGreaterThan(-1);
    expect(iCreate).toBeGreaterThan(iDrop);
    const vista = sql.slice(iCreate);
    expect(vista).not.toMatch(/feria_id/);
    expect(vista).not.toMatch(/create or replace view/);
    expect(vista).toContain("revoke all on public.v_margen_ventas from public, anon, authenticated;");
    expect(vista).toContain("grant select on public.v_margen_ventas to authenticated;");
    expect(vista).not.toMatch(/grant (insert|update|delete|truncate|references|trigger|all)/i);
    // La seguridad: sigue filtrando por es_admin() y ya no hay llamadas sin qualify.
    expect(vista).toContain("WHERE public.es_admin();");
    // Las columnas que lee la app y el motor de margen siguen.
    for (const col of [
      "t.origen",
      "t.documento_id",
      "t.fecha",
      "t.vendedor_id",
      "AS ingreso_ananja_centavos",
      "AS margen_ananja_centavos",
      "AS margen_vendedor_centavos",
      "AS margen_encargado_centavos",
      "AS precio_unitario_venta_centavos",
      "t.costo_estimado",
    ]) {
      expect(vista, col).toContain(col);
    }
  });

  it("la vista nueva es la de prod sin las 13 líneas feria_id (mismas relaciones y mismas CTE)", () => {
    const vista = sql.slice(sql.indexOf("create view public.v_margen_ventas"));
    for (const cte of [
      "lote_directo",
      "lote_capacidad",
      "lote_capacidad_off",
      "lote_capacidad_rango",
      "demanda_sin_lote",
      "demanda_off",
      "demanda_con_frontera",
      "sin_lote_resuelto",
      "sin_lote_no_resuelto",
      "sin_lote_agregado",
      "con_lote",
      "todas",
      "costo_seguro",
      "costo_venta_revendedor",
    ]) {
      expect(vista, cte).toMatch(new RegExp(`\\b${cte} AS \\(`));
    }
    for (const rel of [
      "comprobante_items",
      "ventas_revendedor",
      "comprobantes",
      "lote_items",
      "lotes_produccion",
      "vendedores",
      "v_costo_lote_vigente",
      "v_costo_lote_venta",
    ]) {
      expect(vista, rel).toMatch(new RegExp(`(FROM|JOIN) public\\.${rel}\\b`));
    }
    // Sin la columna, `NULL::uuid AS feria_id` tampoco queda.
    expect(vista).not.toMatch(/AS feria_id/);
  });

  it("no reintroduce PAGO_PROPIO ni toca funciones ajenas a la feria", () => {
    expect(sql).not.toContain("PAGO_PROPIO");
    const definidas = [...sql.matchAll(/create (?:or replace )?function public\.([a-z_]+)\(/g)].map((m) => m[1]);
    expect(definidas.sort()).toEqual(
      ["actualizar_comprobante", "crear_comprobante", "crear_gasto", "eliminar_movimiento_stock"].sort(),
    );
  });
});
