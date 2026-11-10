import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ESTADO_PAGO_LABELS } from "@/lib/dominio/pagos-revendedor";

/**
 * `EstadoPago` (lib/dominio/pagos-revendedor.ts) es una unión de TS; la base
 * lo guarda como `text` con un CHECK. `pagoEstado` convierte cualquier valor
 * desconocido en "pendiente", pero las consultas filtran con
 * `eq("estado", ESTADO_PAGO_PENDIENTE)`: un estado nuevo en la base se vería
 * "pendiente" en una lista y no contaría en las tareas. Este test fija que la
 * unión y el CHECK vigente tengan exactamente los mismos valores.
 */
const DIR = join(process.cwd(), "supabase/migrations");

function sinComentarios(sql: string): string {
  return sql
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");
}

/** Valores del ÚLTIMO `check (estado in (...))` que una migración le puso a
 * `pagos_revendedor` (en su `create table` o en un `alter table`). */
function valoresVigentesDelCheck(): string[] {
  let vigente: string[] | null = null;
  for (const archivo of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) {
    const codigo = sinComentarios(readFileSync(join(DIR, archivo), "utf8"));
    for (const sentencia of codigo.split(";")) {
      if (!/(create|alter)\s+table\s+(if\s+not\s+exists\s+)?(public\.)?pagos_revendedor\b/i.test(sentencia)) continue;
      const m = sentencia.match(/check\s*\(\s*estado\s+in\s*\(([^)]*)\)\s*\)/i);
      if (m) vigente = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    }
  }
  if (!vigente) throw new Error("No se encontró el CHECK de pagos_revendedor.estado en supabase/migrations");
  return vigente;
}

describe("pagos_revendedor.estado: unión EstadoPago vs CHECK de la base", () => {
  it("tienen exactamente los mismos valores", () => {
    const enBase = valoresVigentesDelCheck().sort();
    const enCodigo = Object.keys(ESTADO_PAGO_LABELS).sort();
    expect(
      enCodigo,
      "EstadoPago (lib/dominio/pagos-revendedor.ts) y el CHECK de pagos_revendedor.estado divergen: " +
        "revisá pagoEstado, ESTADO_PAGO_LABELS/ESTADO_PAGO_VARIANTE, FILTROS_ESTADO_PAGO y las consultas " +
        "con eq(\"estado\", ...) antes de tocar la unión o la migración.",
    ).toEqual(enBase);
  });
});
