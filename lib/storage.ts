/**
 * Storage de comprobantes (Supabase Storage).
 *
 * Bucket privado (uno por negocio — ver `lib/negocio.ts` § NEGOCIO.bucket);
 * los archivos se suben directamente desde el cliente autenticado a
 * `AAAA/MM/<uuid>.<ext>` y se leen siempre vía signed URL (nunca URL
 * pública) — ver contracts/database.md.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { NEGOCIO } from "@/lib/negocio";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/types";

export const BUCKET = NEGOCIO.bucket;

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_MIME_TYPES = [
  "image/heic",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

const EXTENSION_BY_MIME: Record<(typeof ALLOWED_MIME_TYPES)[number], string> =
  {
    "image/heic": "heic",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
  };

export class ArchivoInvalidoError extends Error {}

const EXTENSIONES_VALIDAS = Object.values(EXTENSION_BY_MIME);

/**
 * Forma esperada de un path del bucket: uno o más segmentos de carpeta
 * (letras/números/guiones, ej. `revendedores/<uuid>`) seguidos de
 * `AAAA/MM/<uuid>.<ext>` (el shape que arma {@link subirComprobante}), con
 * una extensión de las que de verdad se suben. Sin `..` ni `/` inicial: el
 * primer segmento del regex no admite vacío ni punto, así que ninguna de
 * las dos formas de escape de directorio matchea.
 */
const PATH_STORAGE_REGEX = new RegExp(
  `^[a-zA-Z0-9_-]+(?:/[a-zA-Z0-9_-]+)*\\.(${EXTENSIONES_VALIDAS.join("|")})$`,
  "i",
);

/**
 * Validación de FORMA de un path de Storage (sin consultar nada): usada
 * donde no se puede exigir que exista una fila que lo referencie sin
 * romper un flujo legítimo (ver `app/api/ocr-monto/route.ts` § rama
 * `imagen_path` — el OCR corre ANTES de que exista la fila del
 * comprobante, mismo criterio que ya usa `components/comprobante-form.tsx`
 * con la rama multipart). No reemplaza RLS ni el chequeo de propiedad que
 * ya hacen los RPCs que sí pueden validar contra una fila (ej.
 * `informar_pago_revendedor` con el prefijo `revendedores/<vendedor_id>/`).
 */
export function esPathStorageValido(path: string): boolean {
  if (!path || path.length > 512) return false;
  if (path.includes("..")) return false;
  return PATH_STORAGE_REGEX.test(path);
}

/** `true` si el path de Storage es un PDF (se muestra con ícono, no como foto). */
export function esPathPdf(path: string): boolean {
  return path.toLowerCase().endsWith(".pdf");
}

function extensionFor(file: File): string {
  const byMime =
    EXTENSION_BY_MIME[file.type as (typeof ALLOWED_MIME_TYPES)[number]];
  if (byMime) return byMime;

  const fromName = file.name.split(".").pop();
  return fromName ? fromName.toLowerCase() : "bin";
}

/**
 * Validación de un archivo antes de subirlo (tamaño y tipo), sin tocar la
 * red: devuelve el mensaje de error en español, o `null` si está bien. La
 * usa {@link subirComprobante} y también los formularios que quieren
 * avisar el problema ANTES de iniciar el guardado.
 */
export function validarArchivoComprobante(file: File): string | null {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return "El archivo supera el tamaño máximo permitido (10 MB).";
  }

  if (
    !ALLOWED_MIME_TYPES.includes(
      file.type as (typeof ALLOWED_MIME_TYPES)[number],
    )
  ) {
    return "Formato no soportado. Usá una foto (JPG, PNG, HEIC, WebP) o un PDF.";
  }

  return null;
}

/**
 * Valida y sube un comprobante al bucket privado, devolviendo el path
 * (no la URL) para guardar en `comprobantes.imagen_path`.
 */
export async function subirComprobante(file: File, carpeta?: string): Promise<string> {
  const errorValidacion = validarArchivoComprobante(file);
  if (errorValidacion) {
    throw new ArchivoInvalidoError(errorValidacion);
  }

  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const ext = extensionFor(file);
  const path = `${carpeta ? `${carpeta}/` : ""}${year}/${month}/${crypto.randomUUID()}.${ext}`;

  const supabase = createClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    throw new Error("No se pudo subir el archivo. Probá de nuevo.");
  }

  return path;
}

/**
 * Comprobante de un pago de revendedora — va a `revendedores/<vendedorId>/`,
 * la única carpeta donde una revendedora puede subir y leer (policies
 * `storage_*_revendedor_*` de 0040_revendedores_pagos_precios.sql; el RPC
 * `informar_pago_revendedor` rechaza cualquier otro path).
 */
export function subirComprobantePagoRevendedor(file: File, vendedorId: string): Promise<string> {
  return subirComprobante(file, `revendedores/${vendedorId}`);
}

/**
 * Comprobante de un depósito que avisa una coordinadora ("avisé que la pasé
 * a la cuenta") — va a `coordinadores/<vendedorId>/`, la única carpeta donde
 * una coordinadora puede subir y leer (policies `storage_*_coordinador_*` de
 * 0071_comprobante_deposito_informado.sql; el RPC `informar_deposito_cuenta`
 * rechaza cualquier otro path con `COMPROBANTE_INVALIDO`).
 */
export function subirComprobanteDepositoCoordinador(file: File, vendedorId: string): Promise<string> {
  return subirComprobante(file, `coordinadores/${vendedorId}`);
}

/**
 * Genera una signed URL de lectura (60 min por defecto) para un path del
 * bucket `comprobantes`.
 *
 * Acepta opcionalmente un cliente ya instanciado (por ejemplo el cliente de
 * servidor de `lib/supabase/server.ts`) para poder generarlas en Server
 * Components sin duplicar lógica.
 */
export async function getSignedUrl(
  path: string,
  expiresIn = 3600,
  client?: SupabaseClient<Database>,
): Promise<string | null> {
  const supabase = client ?? createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn);

  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * Variante en lote de {@link getSignedUrl}: genera signed URLs para varios
 * paths en una sola llamada (usado en el listado de comprobantes). Devuelve
 * un mapa `path -> signedUrl | null`.
 */
export async function getSignedUrls(
  paths: string[],
  expiresIn = 3600,
  client?: SupabaseClient<Database>,
): Promise<Record<string, string | null>> {
  if (paths.length === 0) return {};

  const supabase = client ?? createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, expiresIn);

  if (error || !data) return {};

  const map: Record<string, string | null> = {};
  for (const item of data) {
    if (item.path) map[item.path] = item.signedUrl ?? null;
  }
  return map;
}
