import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/0078_feria_revendedoras.sql"), "utf8");
// Sin comentarios de línea: los textos explicativos nombran cosas que no se crean.
const codigo = sql
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");

const FUNCIONES_NUEVAS = [
  "feria_crear",
  "feria_editar",
  "feria_agregar_participante",
  "feria_quitar_participante",
  "feria_cerrar",
  "feria_reabrir",
  "feria_cerrar_participacion",
  "feria_reabrir_participacion",
];

describe("migración 0078 (feria de revendedoras)", () => {
  it("crea las tablas, con RLS y solo select para authenticated", () => {
    for (const t of ["feria_revendedoras", "feria_precios", "feria_participantes", "feria_degustaciones"]) {
      expect(codigo).toContain(`create table public.${t}`);
      expect(codigo).toContain(`alter table public.${t} enable row level security`);
      expect(codigo).toContain(`revoke all on public.${t} from anon, authenticated, public`);
      expect(codigo).toContain(`grant select on public.${t} to authenticated`);
    }
    expect(codigo).not.toMatch(/grant (insert|update|delete)[^;]* on public\.feria_/);
  });

  it("agrega feria_id a entregas y ventas", () => {
    expect(codigo).toContain("alter table public.entregas_revendedor\n  add column feria_id uuid");
    expect(codigo).toContain("alter table public.ventas_revendedor\n  add column feria_id uuid");
  });

  it("cada función nueva es security definer, con search_path sin comillas y permisos", () => {
    for (const f of FUNCIONES_NUEVAS) {
      const inicio = codigo.indexOf(`create function public.${f}(`);
      expect(inicio, f).toBeGreaterThan(-1);
      const cabecera = codigo.slice(inicio, codigo.indexOf("as $$", inicio));
      expect(cabecera, f).toContain("security definer");
      expect(cabecera, f).toContain("set search_path = public");
      expect(codigo, f).toMatch(new RegExp(`revoke execute on function public\\.${f}\\([^)]*\\) from anon, public;`));
      expect(codigo, f).toMatch(new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to authenticated;`));
    }
  });

  it("no usa search_path con comillas", () => {
    expect(codigo).not.toMatch(/search_path\s*=\s*'/);
    for (const m of codigo.matchAll(/set search_path = (\S+)/g)) expect(m[1]).toBe("public");
  });

  it("cambia las dos firmas con drop + create, nunca create or replace", () => {
    const dropEntrega = codigo.indexOf(
      "drop function public.registrar_entrega_revendedor(uuid, text, date, text, jsonb, boolean);",
    );
    const createEntrega = codigo.indexOf("create function public.registrar_entrega_revendedor(");
    expect(dropEntrega).toBeGreaterThan(-1);
    expect(createEntrega).toBeGreaterThan(dropEntrega);

    const dropVenta = codigo.indexOf(
      "drop function public.insertar_venta_revendedor(uuid, uuid, int, bigint, medio_pago, date, text, uuid, uuid, uuid);",
    );
    const createVenta = codigo.indexOf("create function public.insertar_venta_revendedor(");
    expect(dropVenta).toBeGreaterThan(-1);
    expect(createVenta).toBeGreaterThan(dropVenta);

    expect(codigo).not.toContain("create or replace function public.registrar_entrega_revendedor");
    expect(codigo).not.toContain("create or replace function public.insertar_venta_revendedor");
    expect(codigo).toContain("p_feria_id uuid default null");
  });

  it("mantiene permisos: entrega para authenticated, venta interna sin grant", () => {
    expect(codigo).toContain(
      "grant execute on function public.registrar_entrega_revendedor(uuid, text, date, text, jsonb, boolean, uuid) to authenticated;",
    );
    expect(codigo).toContain(
      "revoke execute on function public.insertar_venta_revendedor(uuid, uuid, int, bigint, medio_pago, date, text, uuid, uuid, uuid, uuid) from anon, authenticated, public;",
    );
    expect(codigo).not.toMatch(/grant execute on function public\.insertar_venta_revendedor/);
  });

  it("las vistas son security_invoker y de lectura para authenticated", () => {
    for (const v of ["v_feria_participante_productos", "v_feria_participantes"]) {
      expect(codigo).toMatch(new RegExp(`create view public\\.${v}\\s+with \\(security_invoker = true\\)`));
      expect(codigo).toContain(`grant select on public.${v} to authenticated;`);
    }
  });

  it("no usa la feria vieja (movimientos_stock.feria_id ni la tabla ferias)", () => {
    expect(codigo).not.toMatch(/\bferias\b/);
    expect(codigo).not.toMatch(/movimientos_stock\s*\([^)]*feria_id/);
  });

  it("las vistas de feria leen los nombres de v_productos_publicos y cuentan ventas previas", () => {
    const vista = codigo.slice(codigo.indexOf("create view public.v_feria_participante_productos"), codigo.indexOf("create view public.v_feria_participantes"));
    expect(vista).toContain("join public.v_productos_publicos p on p.id = c.producto_id");
    expect(vista).not.toMatch(/join public\.productos\b/);
    expect(vista).toContain("entrega_item_id");
    expect(vista).toContain("vr.feria_id is null");
    const totales = codigo.slice(codigo.indexOf("create view public.v_feria_participantes"));
    expect(totales).toContain("entrega_item_id");
  });

  it("el cierre descuenta las ventas previas, toma los locks en orden y valida la fecha", () => {
    const i = codigo.indexOf("create function public.feria_cerrar_participacion(");
    const cierre = codigo.slice(i, codigo.indexOf("revoke execute on function public.feria_cerrar_participacion"));
    expect(cierre).toContain("v_ya");
    expect(cierre).toContain("'ya_vendidas'");
    expect(cierre).toContain("'diferencia_centavos'");
    expect(cierre).toContain("FECHA_ANTERIOR_A_ENTREGA");
    expect(cierre.indexOf("from vendedores where id = v_vendedor for no key update")).toBeGreaterThan(-1);
    expect(cierre.indexOf("from vendedores where id = v_vendedor for no key update")).toBeLessThan(
      cierre.indexOf("from feria_revendedoras where id = p_feria_id for share"),
    );
    expect(cierre.indexOf("from feria_revendedoras where id = p_feria_id for share")).toBeLessThan(
      cierre.indexOf("from feria_participantes\n  where feria_id = p_feria_id and vendedor_id = v_vendedor\n  for update"),
    );
    expect(cierre).toContain("movimiento_ids");
  });

  it("reabrir participación deshace el cierre (no rechaza)", () => {
    const i = codigo.indexOf("create function public.feria_reabrir_participacion(");
    const f = codigo.slice(i, codigo.indexOf("revoke execute on function public.feria_reabrir_participacion"));
    expect(f).not.toContain("PARTICIPACION_CON_MOVIMIENTOS");
    expect(f).toContain("delete from ventas_revendedor where feria_id = p_feria_id");
    expect(f).toContain("movimiento_ids");
    expect(f).toContain("delete from entregas_revendedor where id = v_dev.id");
    expect(f).toContain("STOCK_REVENDEDOR_INSUFICIENTE");
    expect(codigo).toContain("alter table public.ventas_revendedor_borradas add column feria_id uuid");
    expect(codigo).toContain("movimiento_ids uuid[] not null default '{}'");
  });

  it("una venta de feria no la corrige la revendedora (eliminar/editar)", () => {
    expect(codigo.match(/raise exception 'VENTA_DE_FERIA'/g)?.length).toBe(2);
    expect(codigo).toContain("create or replace function public.eliminar_venta_revendedor(p_venta_id uuid)");
    expect(codigo).toContain("create or replace function public.editar_venta_revendedor(");
  });

  it("feria_editar no borra precios de productos ya entregados", () => {
    const i = codigo.indexOf("create function public.feria_editar(");
    const f = codigo.slice(i, codigo.indexOf("revoke execute on function public.feria_editar"));
    expect(f).toContain("not exists");
    expect(f).toContain("entrega_items ei");
  });

  it("tiene cabecera con cómo verificar y rollback", () => {
    expect(sql).toContain("Cómo verificar");
    expect(sql).toContain("Rollback");
  });
});
