import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const dir = join(process.cwd(), "supabase/migrations");
const sinComentarios = (sql: string) =>
  sql
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

const sqlA = readFileSync(join(dir, "0088_rpc_escrituras_2.sql"), "utf8");
const a = sinComentarios(sqlA);
const sqlB = readFileSync(join(dir, "0089_revocar_escrituras_directas_2.sql"), "utf8");
const b = sinComentarios(sqlB);
const lee = (r: string) => readFileSync(join(process.cwd(), r), "utf8");

const FUNCIONES: [string, string][] = [
  ["crear_categoria_gasto", "(text)"],
  ["crear_cliente", "(text, text, text, text, text)"],
  ["editar_cliente", "(uuid, text, text, text, text, text)"],
  ["cambiar_estado_cliente", "(uuid, boolean)"],
  ["crear_material", "(text, text, integer, boolean)"],
  ["actualizar_material", "(uuid, text, text, boolean)"],
  ["eliminar_material", "(uuid)"],
  ["reordenar_materiales", "(jsonb)"],
  ["actualizar_umbral_producto", "(uuid, integer)"],
];

describe("migración 0088 (RPC de escrituras, segunda tanda)", () => {
  it("crea las 9 funciones, security definer, search_path sin comillas, con public. explícito", () => {
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

  it("crear_categoria_gasto escribe solo nombre y traduce el duplicado", () => {
    expect(a).toContain("insert into public.categorias_gasto (nombre)");
    expect(a).toContain("raise exception 'CATEGORIA_DUPLICADA'");
  });

  it("las funciones de material no tocan actualizado_por (lo fija el trigger) y actualizar no toca orden", () => {
    expect(a).not.toMatch(/actualizado_por\s*=/);
    const act = a.slice(
      a.indexOf("create function public.actualizar_material("),
      a.indexOf("create function public.eliminar_material("),
    );
    expect(act).not.toMatch(/orden\s*=/);
  });

  it("reordenar_materiales valida la forma de cada item y es todo o nada", () => {
    expect(a).toContain("raise exception 'ITEMS_INVALIDOS'");
    expect(a).toContain("raise exception 'MATERIAL_NO_ENCONTRADO'");
  });

  it("el umbral de producto exige entero >= 0 y solo toca umbral_minimo", () => {
    expect(a).toContain("p_umbral_minimo is null or p_umbral_minimo < 0");
    expect(a).toContain("update public.productos set umbral_minimo = p_umbral_minimo where id = p_producto_id;");
  });

  it("la cabecera trae verificación de solo lectura y rollback", () => {
    expect(sqlA).toContain("Verificación posterior (solo lectura)");
    expect(sqlA).toContain("Rollback");
  });
});

describe("migración 0089 (revocar escrituras directas, segunda tanda)", () => {
  it("revoca exactamente lo que dejó de usarse y nada de select", () => {
    expect(b).toContain("revoke insert, update on public.categorias_gasto from authenticated, anon;");
    expect(b).toContain("revoke insert, update, delete on public.clientes from authenticated, anon;");
    expect(b).toContain("revoke insert, update, delete on public.materiales_venta from authenticated, anon;");
    expect(b).toContain("revoke update on public.productos from authenticated, anon;");
    expect(b).toContain("revoke insert, delete on public.push_subscriptions from authenticated, anon;");
    expect(b).toContain("revoke update on public.cajas from authenticated, anon;");
    expect(b).toContain("revoke update on public.vendedores from authenticated, anon;");
    expect(b).not.toMatch(/revoke\s+select/);
    expect(b.match(/revoke /g)).toHaveLength(7);
    expect(b).not.toContain("miel");
  });

  it("la cabecera exige aplicarla después de desplegar el código, con verificación y rollback", () => {
    expect(sqlB).toContain("ORDEN DE DESPLIEGUE");
    expect(sqlB).toContain("Verificación posterior (solo lectura)");
    expect(sqlB).toContain("Rollback");
  });
});

describe("el código ya no escribe directo en las tablas revocadas", () => {
  it("las pantallas y librerías usan RPC", () => {
    const archivos = [
      "app/(app)/gastos/categoria-select.tsx",
      "components/cliente-select.tsx",
      "components/cliente-form.tsx",
      "components/cliente-baja-button.tsx",
      "components/stock/umbral-editable.tsx",
      "lib/material.ts",
      "app/api/push/subscribe/route.ts",
    ];
    for (const f of archivos) {
      expect(lee(f), f).not.toMatch(
        /\.from\("(categorias_gasto|clientes|materiales_venta|productos|push_subscriptions|cajas|vendedores)"\)\s*\.(insert|update|delete|upsert)\(/,
      );
    }
    expect(lee("app/(app)/gastos/categoria-select.tsx")).toContain('rpc("crear_categoria_gasto"');
    expect(lee("components/cliente-select.tsx")).toContain('rpc("crear_cliente"');
    expect(lee("components/cliente-form.tsx")).toContain('rpc("crear_cliente"');
    expect(lee("components/cliente-form.tsx")).toContain('rpc("editar_cliente"');
    expect(lee("components/cliente-baja-button.tsx")).toContain('rpc("cambiar_estado_cliente"');
    expect(lee("components/stock/umbral-editable.tsx")).toContain('rpc("actualizar_umbral_producto"');
    const material = lee("lib/material.ts");
    for (const f of ["crear_material", "actualizar_material", "eliminar_material", "reordenar_materiales"]) {
      expect(material).toContain(`rpc("${f}"`);
    }
    expect(lee("app/api/push/subscribe/route.ts")).toContain('rpc("guardar_suscripcion_push"');
  });
});
