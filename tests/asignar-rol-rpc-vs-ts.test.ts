import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { TRANSICIONES_ROL, transicionRolPermitida, validarAsignacionInicial } from "@/lib/dominio/invitaciones";
import { ROLES_ENCARGADO } from "@/lib/rol-vendedor";

/**
 * Las reglas de rol de la invitación viven dos veces:
 *  - SQL: las RPC `asignar_rol_revendedor` y `asignar_encargado_revendedor`
 *    (la definición vigente es la de la ÚLTIMA migración que las crea).
 *  - TS: `TRANSICIONES_ROL` / `validarAsignacionInicial`
 *    (lib/dominio/invitaciones.ts), que usa el server action de invitar con
 *    la service role (donde `auth.uid()` es nulo y las RPC no sirven).
 * Este test lee el SQL vigente y falla si dejan de coincidir.
 */

const DIR = join(process.cwd(), "supabase/migrations");

function definicionVigente(funcion: string): string {
  const archivos = readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const re = new RegExp(`create (?:or replace )?function public\\.${funcion}\\(`, "i");
  let vigente: string | null = null;
  for (const archivo of archivos) {
    const sql = readFileSync(join(DIR, archivo), "utf8");
    const codigo = sql
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    const m = re.exec(codigo);
    if (!m) continue;
    // Hasta el cierre `$$;` de esa función.
    const resto = codigo.slice(m.index);
    const fin = resto.indexOf("$$;", resto.indexOf("$$") + 2);
    vigente = resto.slice(0, fin + 3);
  }
  if (!vigente) throw new Error(`No encontré ${funcion} en las migraciones`);
  return vigente;
}

function transicionesDelSql(cuerpo: string): Record<string, string[]> {
  const inicio = cuerpo.indexOf("if not (", cuerpo.indexOf("VENDEDOR_INVALIDO"));
  const fin = cuerpo.indexOf("TRANSICION_INVALIDA");
  expect(inicio).toBeGreaterThan(-1);
  expect(fin).toBeGreaterThan(inicio);
  const bloque = cuerpo.slice(inicio, fin);
  const tabla: Record<string, string[]> = {};
  const re = /v_rol_actual = '(\w+)' and p_rol (?:= '(\w+)'|in \(([^)]*)\))/g;
  for (const m of bloque.matchAll(re)) {
    const destinos = m[2] ? [m[2]] : [...m[3].matchAll(/'(\w+)'/g)].map((x) => x[1]);
    tabla[m[1]] = [...(tabla[m[1]] ?? []), ...destinos];
  }
  return tabla;
}

const ordenar = (t: Record<string, readonly string[]>) =>
  Object.fromEntries(Object.entries(t).map(([k, v]) => [k, [...v].sort()]));

describe("asignar_rol_revendedor (SQL vigente) vs TRANSICIONES_ROL (TS)", () => {
  const rol = definicionVigente("asignar_rol_revendedor");

  it("la tabla de transiciones es la misma", () => {
    expect(ordenar(TRANSICIONES_ROL)).toEqual(ordenar(transicionesDelSql(rol)));
  });

  it("los roles destino válidos son los mismos", () => {
    const m = /p_rol not in \(([^)]*)\)/.exec(rol);
    expect(m).not.toBeNull();
    const sql = [...m![1].matchAll(/'(\w+)'/g)].map((x) => x[1]).sort();
    const ts = [...new Set(Object.values(TRANSICIONES_ROL).flat())].sort();
    expect(ts).toEqual(sql);
  });

  it("no apareció ninguna regla nueva en la RPC sin revisar el espejo en TS", () => {
    const codigos = [...rol.matchAll(/raise exception '(\w+)'/g)].map((x) => x[1]);
    expect([...new Set(codigos)].sort()).toEqual(
      [
        "ADMIN_NO_REVENDEDOR",
        "NO_AUTORIZADO",
        "ROL_INVALIDO",
        "TRANSICION_INVALIDA",
        "ULTIMO_ADMIN",
        "VENDEDOR_INVALIDO",
      ].sort(),
    );
  });

  it("validarAsignacionInicial acepta exactamente lo que la RPC acepta desde pendiente", () => {
    const sql = transicionesDelSql(rol).pendiente ?? [];
    for (const destino of ["admin", "revendedor", "coordinador"] as const) {
      const ts = validarAsignacionInicial({
        vendedor: { id: "v", rol: "pendiente", activo: true },
        rolDestino: destino,
        encargado: null,
      });
      expect(ts === null).toBe(sql.includes(destino));
      expect(transicionRolPermitida("pendiente", destino)).toBe(sql.includes(destino));
    }
    expect(transicionRolPermitida("pendiente", "pendiente")).toBe(false);
    expect(transicionRolPermitida("admin", "revendedor")).toBe(false);
  });
});

describe("asignar_encargado_revendedor (SQL vigente) vs puedeSerEncargado (TS)", () => {
  it("el encargado es admin o coordinador activo, distinto de la propia persona", () => {
    const cuerpo = definicionVigente("asignar_encargado_revendedor");
    const m = /id = p_encargado_id and rol in \(([^)]*)\) and activo/.exec(cuerpo);
    expect(m).not.toBeNull();
    const roles = [...m![1].matchAll(/'(\w+)'/g)].map((x) => x[1]).sort();
    expect(roles).toEqual([...ROLES_ENCARGADO].sort());
    expect(cuerpo).toContain("p_encargado_id = p_vendedor_id");
  });
});
