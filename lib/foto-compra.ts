/**
 * Subida de la foto/archivo de una compra de insumos (`components/stock/
 * compra-factura-form.tsx`, "Cargar compra"): mismo bucket y mismas reglas
 * que `components/gasto-form.tsx` (se guarda bajo `gastos/`, porque
 * termina como `gastos.imagen_path`). Solo para el cliente.
 */

import { BUCKET } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  "image/heic",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;
const EXTENSION_BY_MIME: Record<(typeof ALLOWED_MIME_TYPES)[number], string> = {
  "image/heic": "heic",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

function extensionFor(file: File): string {
  const byMime = EXTENSION_BY_MIME[file.type as (typeof ALLOWED_MIME_TYPES)[number]];
  if (byMime) return byMime;
  const fromName = file.name.split(".").pop();
  return fromName ? fromName.toLowerCase() : "bin";
}

/** Mensaje de error si el archivo no sirve (tamaño o formato), o `null`. */
export function validarFotoCompra(file: File): string | null {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return "El archivo supera el tamaño máximo permitido (10 MB).";
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
    return "Formato no soportado. Usá una foto (JPG, PNG, HEIC, WebP) o un PDF.";
  }
  return null;
}

/** Sube el archivo y devuelve el path para `p_imagen_path`. */
export async function subirFotoCompra(file: File): Promise<string> {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const ext = extensionFor(file);
  const path = `gastos/${year}/${month}/${crypto.randomUUID()}.${ext}`;

  const supabase = createClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    throw new Error("No se pudo subir la foto. Probá de nuevo.");
  }

  return path;
}
