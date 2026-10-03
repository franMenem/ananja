#!/usr/bin/env node
// Ananja/Germá: renderiza las migraciones templated de supabase/migrations
// (placeholders __SCHEMA__ / __BUCKET__, bloques @solo-public) para un
// schema y bucket de Storage concretos.
//
// Uso:
//   node supabase/render.mjs --schema public --bucket comprobantes
//   node supabase/render.mjs --schema miel --bucket comprobantes-miel
//   node supabase/render.mjs --schema miel --bucket comprobantes-miel --out /tmp/miel.sql
//   node supabase/render.mjs --schema miel --bucket comprobantes-miel supabase/migrations/0011_multi_negocio.sql
//
// Sin archivos explícitos, concatena TODAS las migraciones de
// supabase/migrations/ en orden alfabético (== orden numérico por el
// prefijo de 4 dígitos).
//
// Convención (ver supabase/README.md):
//  - __SCHEMA__ reemplaza toda referencia al schema de la app (search_path,
//    calificaciones `esquema.tabla` / `esquema.funcion`). NO reemplaza la
//    palabra `public` cuando se usa como ROL de Postgres (`grant ... to
//    public`, `revoke ... from ... public`) ni como nombre de columna
//    (storage.buckets.public).
//  - __BUCKET__ reemplaza el id/nombre del bucket de Storage `comprobantes`
//    únicamente donde referencia al bucket (storage.buckets, bucket_id =
//    '...'), nunca la tabla `comprobantes`.
//  - Un bloque entre un comentario de línea completa `-- @solo-public:inicio`
//    y otro `-- @solo-public:fin` sólo se incluye cuando --schema=public;
//    para cualquier otro schema, el bloque completo (markers incluidos) se
//    omite. En AMBOS casos las líneas de marker se eliminan del output, así
//    que renderizar con --schema public da bytes idénticos al SQL original
//    (antes de introducir los markers/placeholders).
//
// Invariante: `node supabase/render.mjs --schema public --bucket
// comprobantes <archivo>` debe producir exactamente el contenido original
// de <archivo> anterior al templating.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "migrations");

const SOLO_PUBLIC_INICIO = "-- @solo-public:inicio";
const SOLO_PUBLIC_FIN = "-- @solo-public:fin";

function parseArgs(argv) {
  const args = { schema: null, bucket: null, out: null, files: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--schema") {
      args.schema = argv[++i];
    } else if (a === "--bucket") {
      args.bucket = argv[++i];
    } else if (a === "--out") {
      args.out = argv[++i];
    } else if (a.startsWith("--")) {
      throw new Error(`Opción desconocida: ${a}`);
    } else {
      args.files.push(a);
    }
  }
  return args;
}

function stripSoloPublicBlocks(content, schema) {
  const lines = content.split("\n");
  const out = [];
  let inBlock = false;
  let sawMarkerPair = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === SOLO_PUBLIC_INICIO) {
      if (inBlock) {
        throw new Error("Bloque @solo-public anidado: no soportado");
      }
      inBlock = true;
      sawMarkerPair = true;
      continue; // el marker nunca queda en el output
    }
    if (trimmed === SOLO_PUBLIC_FIN) {
      if (!inBlock) {
        throw new Error("@solo-public:fin sin @solo-public:inicio previo");
      }
      inBlock = false;
      continue; // el marker nunca queda en el output
    }
    if (inBlock && schema !== "public") {
      continue; // se omite el contenido del bloque para otros schemas
    }
    out.push(line);
  }

  if (inBlock) {
    throw new Error("Bloque @solo-public sin cerrar (falta @solo-public:fin)");
  }
  void sawMarkerPair;
  return out.join("\n");
}

function replacePlaceholders(content, schema, bucket) {
  return content
    .split("__SCHEMA__").join(schema)
    .split("__BUCKET__").join(bucket);
}

// Migraciones sin placeholders (p.ej. 0011/0012, que llegaron ya escritas
// por otra rama sin pasar por el templating de __SCHEMA__) siguen fijando
// `set search_path = public` / `set search_path to public` (con o sin
// esquemas adicionales separados por coma, p.ej. `set search_path = public,
// extensions`) a mano en sus funciones `security definer`. Esta sustitución
// genérica cubre esas variantes para CUALQUIER archivo, sin depender de que
// tenga el placeholder __SCHEMA__: sólo reemplaza la palabra `public`
// cuando aparece justo después de `search_path =` / `search_path to`. Para
// --schema public el reemplazo es un no-op (public -> public), así que
// preserva el byte a byte idéntico de 0001-0013 contra sus fuentes.
const SEARCH_PATH_PUBLIC_RE = /(search_path\s*(?:=|to)\s*)public\b/gi;

function replaceSearchPathPublic(content, schema) {
  return content.replace(SEARCH_PATH_PUBLIC_RE, `$1${schema}`);
}

// Las mismas migraciones sueltas (0011/0012) también hardcodean el schema
// como prefijo explícito en vez de dejarlo resolver por `search_path`:
// `create function public.foo()`, `execute function public.foo()`,
// `revoke execute on function public.foo() from ...`. Sin este segundo
// reemplazo esas funciones (y sus triggers) quedarían siempre en el schema
// `public` sin importar --schema. Se aplica línea por línea, saltando
// líneas que son comentario completo (empiezan con `--` tras trim) para no
// tocar prosa como `-- ... igual que para public.notificaciones.` en
// 0013_multi_negocio.sql, que describe la tabla real de Ananja a propósito.
// Sólo matchea `public` seguido de `.` (prefijo de schema): no toca el rol
// `public` de Postgres (`grant ... to public`, `from anon, authenticated,
// public`) ni columnas como `storage.buckets.public`, que no llevan el
// punto inmediatamente después de la palabra.
const HARDCODED_PUBLIC_SCHEMA_RE = /\bpublic\./g;

function replaceHardcodedPublicSchema(content, schema) {
  return content
    .split("\n")
    .map((line) =>
      line.trim().startsWith("--")
        ? line
        : line.replace(HARDCODED_PUBLIC_SCHEMA_RE, `${schema}.`)
    )
    .join("\n");
}

function renderFile(path, schema, bucket) {
  const raw = readFileSync(path, "utf8");
  const withoutSoloPublic = stripSoloPublicBlocks(raw, schema);
  const withPlaceholders = replacePlaceholders(withoutSoloPublic, schema, bucket);
  const withSearchPath = replaceSearchPathPublic(withPlaceholders, schema);
  return replaceHardcodedPublicSchema(withSearchPath, schema);
}

function defaultFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => join(MIGRATIONS_DIR, f));
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.schema) throw new Error("Falta --schema <nombre>");
  if (!args.bucket) throw new Error("Falta --bucket <nombre>");

  const files = args.files.length > 0
    ? args.files.map((f) => resolve(f))
    : defaultFiles();

  const parts = [];

  // Encabezado: crea el schema (si no es public) y fija el search_path para
  // que las referencias sin calificar (tablas, funciones, `notificaciones`
  // en el ALTER PUBLICATION de 0005, etc.) resuelvan en el schema del
  // negocio. Para `public` NO se antepone nada, para que el render de
  // 0001-0010 sea byte a byte idéntico a los archivos originales.
  if (args.schema !== "public") {
    parts.push(
      `create schema if not exists ${args.schema};`,
      `set search_path to ${args.schema}, public;`,
      "",
    );
  }

  for (const file of files) {
    parts.push(renderFile(file, args.schema, args.bucket));
  }

  const rendered = parts.join("\n");

  if (args.out) {
    writeFileSync(args.out, rendered);
  } else {
    process.stdout.write(rendered);
  }
}

main();
