import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const dir = join(process.cwd(), "supabase/migrations");
const sql = readFileSync(join(dir, "0084_carga_permite_pago_propio.sql"), "utf8");
const codigo = sql
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");

const FIRMA = "(uuid, jsonb, jsonb, jsonb, uuid)";

describe("migración 0084 (carga permite pago propio)", () => {
  it("recrea registrar_carga_revendedor con la misma firma, sin comillas en search_path", () => {
    expect(codigo).toContain(
      "create or replace function public.registrar_carga_revendedor(\n  p_vendedor_id uuid,\n  p_entrega jsonb,\n  p_ventas jsonb,\n  p_pago jsonb,\n  p_clave uuid\n)\nreturns json",
    );
    expect(codigo).toContain("security definer");
    expect(codigo).toContain("set search_path = public\n");
    expect(codigo).not.toContain("search_path = 'public'");
  });

  it("no contiene el bloqueo PAGO_PROPIO pero conserva el chequeo de rol", () => {
    expect(codigo).not.toContain("PAGO_PROPIO");
    expect(codigo).toContain("if not public.es_admin() then");
    expect(codigo).toContain("registrar_rendicion(");
  });

  it("repite revoke y grant", () => {
    expect(codigo).toContain(
      `revoke execute on function public.registrar_carga_revendedor${FIRMA} from anon, public;`,
    );
    expect(codigo).toContain(
      `grant execute on function public.registrar_carga_revendedor${FIRMA} to authenticated;`,
    );
  });
});

describe("regresión: la decisión de 0046 (un admin puede registrarse su pago)", () => {
  const archivos = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  function ultimaQueDefine(nombre: string) {
    const re = new RegExp(`create\\s+or\\s+replace\\s+function\\s+(public\\.)?${nombre}\\s*\\(`, "i");
    const definen = archivos.filter((f) => re.test(readFileSync(join(dir, f), "utf8")));
    const ultima = definen[definen.length - 1];
    const texto = readFileSync(join(dir, ultima), "utf8");
    const desde = texto.search(re);
    const fin = texto.indexOf("\n$$;", desde);
    const cuerpo = texto
      .slice(desde, fin)
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    return { ultima, cuerpo };
  }

  for (const fn of ["registrar_carga_revendedor", "registrar_rendicion"]) {
    it(`la última migración que define ${fn} no bloquea el pago propio`, () => {
      const { ultima, cuerpo } = ultimaQueDefine(fn);
      expect(cuerpo.length, `${ultima} no se pudo leer`).toBeGreaterThan(200);
      expect(
        cuerpo,
        `${ultima} reintroduce PAGO_PROPIO en ${fn}: es la decisión de 0046, no reintroducir al recrear la función`,
      ).not.toContain("PAGO_PROPIO");
    });
  }
});
