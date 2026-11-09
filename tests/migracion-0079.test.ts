import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/0079_feria_degustacion_carga.sql"), "utf8");
// Sin comentarios de línea: los textos explicativos nombran cosas que no se crean.
const codigo = sql
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");

describe("migración 0079 (degustación cargada de antemano)", () => {
  it("agrega origen a feria_degustaciones y lo suma a la clave", () => {
    expect(codigo).toContain("add column origen text not null default 'cierre'");
    expect(codigo).toContain("check (origen in ('carga', 'cierre'))");
    expect(codigo).toContain("alter column origen drop default");
    expect(codigo).toContain("primary key (feria_id, vendedor_id, producto_id, origen)");
  });

  it("crea las dos funciones nuevas, security definer, sin comillas y con permisos", () => {
    for (const [nombre, args] of [
      ["feria_cargar_degustacion", "uuid, uuid, jsonb, date, text"],
      ["feria_quitar_degustacion", "uuid, uuid, uuid"],
    ]) {
      const i = codigo.indexOf(`create function public.${nombre}(`);
      expect(i, nombre).toBeGreaterThan(-1);
      const cuerpo = codigo.slice(i, codigo.indexOf("$$;", codigo.indexOf("$$", i) + 2));
      expect(cuerpo).toContain("security definer");
      expect(cuerpo).toContain("set search_path = public\n");
      expect(cuerpo).toContain("NO_AUTORIZADO");
      expect(codigo).toContain(`revoke execute on function public.${nombre}(${args}) from anon, public`);
      expect(codigo).toContain(`grant execute on function public.${nombre}(${args}) to authenticated`);
    }
    expect(codigo).not.toContain("search_path = 'public'");
  });

  it("la carga acumula con on conflict, toma el lock del depósito y deja el egreso como degustación", () => {
    expect(codigo).toContain("on conflict (feria_id, vendedor_id, producto_id, origen) do update");
    expect(codigo).toContain("feria_degustaciones.movimiento_ids || excluded.movimiento_ids");
    expect(codigo).toContain("pg_advisory_xact_lock(hashtext('ananja:deposito'))");
    expect(codigo).toContain("'degustacion'");
    expect(codigo).toContain("STOCK_LOTE_INSUFICIENTE");
    expect(codigo).toContain("order by l.fecha, l.created_at, l.id");
  });

  it("el cierre inserta origen 'cierre' y reabrir solo deshace las de cierre", () => {
    expect(codigo).toContain("create or replace function public.feria_cerrar_participacion(");
    expect(codigo).toContain("v_deg, v_mov_ids, 'cierre')");
    expect(codigo).toContain("create or replace function public.feria_reabrir_participacion(");
    expect(codigo).toContain("and d.origen = 'cierre'");
    expect(codigo).toContain("and origen = 'cierre';");
  });

  it("quitar participante rechaza si hay degustación cargada", () => {
    const i = codigo.indexOf("create or replace function public.feria_quitar_participante(");
    expect(codigo.slice(i, i + 900)).toContain("from feria_degustaciones");
  });

  it("las vistas separan carga y cierre, con security_invoker y permisos", () => {
    expect(codigo).toContain("drop view public.v_feria_participantes;\ndrop view public.v_feria_participante_productos;");
    for (const v of ["v_feria_participante_productos", "v_feria_participantes"]) {
      expect(codigo).toContain(`create view public.${v}\nwith (security_invoker = true)`);
      expect(codigo).toContain(`revoke all on public.${v} from anon, public`);
      expect(codigo).toContain(`grant select on public.${v} to authenticated`);
    }
    expect(codigo).toContain("degustadas_carga");
    expect(codigo).toContain("degustadas_cierre");
  });

  it("faltan no resta la degustación de carga (nunca estuvo en entregadas)", () => {
    const linea = codigo.split("\n").find((l) => l.includes(" as faltan")) ?? "";
    expect(linea).toContain("degustadas_cierre");
    expect(linea).not.toContain("degustadas_carga");
  });
});
