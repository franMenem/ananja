import { existsSync, readdirSync, readFileSync } from "node:fs";
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

/**
 * Citas de la base con el formato `nombre` (`00NN_archivo.sql`). Si el nombre
 * es una función SQL, la migración citada debe ser la última que la define
 * (`create [or replace] function`). Si es una restricción (`..._check`,
 * `..._coherente`), la última que la menciona con `constraint`. Si es una
 * tabla o columna, la migración citada debe nombrarla.
 */
const MIGRACIONES = readdirSync(join(RAIZ, "supabase/migrations"))
  .filter((f) => /^\d{4}_.+\.sql$/.test(f))
  .sort();
const SQL = new Map(
  MIGRACIONES.map((f) => [f, readFileSync(join(RAIZ, "supabase/migrations", f), "utf8")]),
);

function ultimaQue(patron: RegExp): string | undefined {
  return MIGRACIONES.filter((f) => patron.test(SQL.get(f) ?? "")).at(-1);
}

const citas = [...doc.matchAll(/`([a-z_0-9.]+)` \(`(\d{4}_[a-z0-9_]+\.sql)`\)/g)].map((m) => ({
  nombre: m[1],
  migracion: m[2],
}));

describe("docs/maquinas-de-estado.md: migraciones citadas", () => {
  it("cita al menos una función de la base", () => {
    expect(citas.length).toBeGreaterThan(20);
  });

  for (const { nombre, migracion } of citas) {
    it(`${nombre} -> ${migracion}`, () => {
      const funcion = new RegExp(`create (or replace )?function +([A-Za-z_]+\\.)?"?${nombre}"?\\s*\\(`, "i");
      const restriccion = new RegExp(`constraint +${nombre}\\b`, "i");
      const definidaComoFuncion = ultimaQue(funcion);
      if (definidaComoFuncion) {
        expect(migracion, `${nombre}: la última migración que la define es ${definidaComoFuncion}`).toBe(
          definidaComoFuncion,
        );
      } else if (/_(check|coherente)$/.test(nombre)) {
        const ultima = ultimaQue(restriccion);
        expect(migracion, `${nombre}: la última migración con esa restricción es ${ultima}`).toBe(ultima);
      } else {
        const partes = nombre.split(".");
        const texto = SQL.get(migracion) ?? "";
        for (const parte of partes) {
          expect(texto.includes(parte), `${migracion} no nombra ${parte}`).toBe(true);
        }
      }
    });
  }
});
