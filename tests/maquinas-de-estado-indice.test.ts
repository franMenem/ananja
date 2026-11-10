import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `docs/maquinas-de-estado.md` es un índice: si una ruta o un símbolo que cita
 * ya no existe, este test falla para que se corrija el índice en el mismo
 * cambio. Solo mira hechos baratos: que cada archivo exista y que cada
 * símbolo en camelCase/PascalCase/MAYÚSCULAS citado en una sección aparezca
 * en alguno de los archivos .ts/.tsx citados en esa misma sección.
 */
const RAIZ = process.cwd();
const doc = readFileSync(join(RAIZ, "docs/maquinas-de-estado.md"), "utf8");
const secciones = doc.split(/^## /m).slice(1);

function rutaDe(token: string): string | null {
  if (/^\d{4}_[a-z0-9_]+\.sql$/.test(token)) return join("supabase/migrations", token);
  if (/\.(ts|tsx|md|sql)$/.test(token) && !token.includes(" ")) return token;
  return null;
}

describe("docs/maquinas-de-estado.md", () => {
  it("tiene secciones", () => {
    expect(secciones.length).toBeGreaterThan(5);
  });

  for (const seccion of secciones) {
    const titulo = seccion.split("\n")[0];
    it(`${titulo}: las rutas existen y los símbolos aparecen`, () => {
      const tokens = [...seccion.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
      const rutas = tokens.map(rutaDe).filter((r): r is string => r !== null);
      for (const ruta of rutas) {
        expect(existsSync(join(RAIZ, ruta)), `no existe ${ruta}`).toBe(true);
      }
      const fuentes = rutas
        .filter((r) => /\.tsx?$/.test(r))
        .map((r) => readFileSync(join(RAIZ, r), "utf8"));
      const simbolos = tokens.filter(
        (t) => /^[A-Za-z][A-Za-z0-9_]*$/.test(t) && /[A-Z]/.test(t) && rutaDe(t) === null,
      );
      for (const simbolo of simbolos) {
        const aparece = fuentes.some((f) => f.includes(simbolo));
        expect(aparece, `el símbolo ${simbolo} no aparece en los archivos citados de "${titulo}"`).toBe(true);
      }
    });
  }
});
