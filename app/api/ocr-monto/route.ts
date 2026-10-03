import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";

import { NEGOCIO } from "@/lib/negocio";
import { esAdminAutenticado } from "@/lib/rol-vendedor";
import { ALLOWED_MIME_TYPES, BUCKET, MAX_FILE_SIZE_BYTES, esPathStorageValido } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

/**
 * OCR del monto de un comprobante de pago (US6).
 *
 * Regla de oro: esta ruta NUNCA bloquea al usuario. Cualquier fallo (falta
 * de API key, timeout, error del modelo, archivo no soportado, etc.) se
 * traduce en una respuesta 200 con `monto_centavos: null` — el formulario
 * sigue funcionando con carga manual. Ver contracts/api-routes.md § POST
 * /api/ocr-monto.
 */
export const runtime = "nodejs";

const OCR_TIMEOUT_MS = 10_000;

const NULL_RESULT = { monto_centavos: null, confianza: null } as const;

const ocrSchema = z.object({
  monto_centavos: z
    .number()
    .int()
    .nullable()
    .describe("Monto total en centavos, o null si no hay un monto claro."),
  confianza: z
    .enum(["alta", "baja"])
    .nullable()
    .describe("Confianza de la lectura, o null si no se pudo leer."),
});

const PROMPT =
  "Extraé el monto total de dinero de este comprobante de pago " +
  "argentino (transferencia, Mercado Pago, recibo). Devolvé el monto en " +
  "centavos como entero, o null si no hay un monto claro.";

/**
 * Convierte un `File` (multipart/form-data) a los bytes que espera el AI
 * SDK. Los PDFs se pasan también como file part: si el modelo no puede
 * leerlos, el propio modelo devuelve `monto_centavos: null` — no hace falta
 * un camino especial para ese caso, ver nota más abajo.
 */
async function fileToBase64(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return buffer.toString("base64");
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  // OCR es funcionalidad de admin (carga de comprobantes) — lista BLANCA:
  // antes bloqueaba solo a `revendedor` (lista negra), lo que dejaba pasar
  // a `coordinador` (0055_coordinador.sql) aunque no tenga esa pantalla
  // (auditoría de seguridad 2026-09-20, ver `lib/rol-vendedor.ts` §
  // `esAdminAutenticado`).
  if (!(await esAdminAutenticado(supabase, user.id))) {
    return NextResponse.json({ error: "NO_AUTORIZADO" }, { status: 403 });
  }

  // Feature apagada si no hay API key del AI Gateway configurada.
  if (!process.env.AI_GATEWAY_API_KEY) {
    return NextResponse.json(NULL_RESULT, { status: 200 });
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";
    let mediaType: string;
    let base64: string;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json(NULL_RESULT, { status: 200 });
      }
      // Tamaño y tipo se validan ANTES de leer el archivo a memoria
      // (`fileToBase64` carga todo el `arrayBuffer`) — mismos límites que
      // `lib/storage.ts` § `subirComprobante`, para no aceptar acá lo que
      // el flujo normal de subida ya rechazaría (auditoría de seguridad
      // 2026-09-20).
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
          { error: "El archivo supera el tamaño máximo permitido (10 MB)." },
          { status: 413 },
        );
      }
      if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
        return NextResponse.json(
          { error: "Formato no soportado. Usá una foto (JPG, PNG, HEIC, WebP) o un PDF." },
          { status: 400 },
        );
      }
      mediaType = file.type || "application/octet-stream";
      base64 = await fileToBase64(file);
    } else {
      // `{ imagen_path: "..." }`: el server la lee de Storage con la
      // service role key. Nadie llama esta rama hoy (grep verificado: la
      // única fuente real, `components/comprobante-form.tsx`, siempre
      // manda multipart) pero la ruta la sigue aceptando, así que se
      // valida igual. No se verifica que exista una fila de `comprobantes`
      // con ese `imagen_path` (RLS de sesión) porque el OCR real corre
      // ANTES de que esa fila exista (mismo orden que la rama multipart:
      // se lee el archivo recién subido, se autocompleta el monto, y
      // RECIÉN AHÍ se guarda el comprobante) — exigir la fila rompería ese
      // flujo si algún día se usa esta rama. En su lugar se valida solo la
      // FORMA del path (sin `..`, sin `/` inicial, `carpeta/AAAA/MM/uuid.ext`
      // — `lib/storage.ts` § `esPathStorageValido`), así la service role
      // nunca lee del bucket con un path fuera de esa forma.
      const body = (await request.json().catch(() => null)) as {
        imagen_path?: string;
      } | null;
      const imagenPath = body?.imagen_path;
      if (!imagenPath) {
        return NextResponse.json(NULL_RESULT, { status: 200 });
      }
      if (!esPathStorageValido(imagenPath)) {
        return NextResponse.json(
          { error: "Path de imagen inválido." },
          { status: 400 },
        );
      }

      const { createClient: createServiceClient } = await import(
        "@supabase/supabase-js"
      );
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!serviceRoleKey) {
        return NextResponse.json(NULL_RESULT, { status: 200 });
      }
      const serviceClient = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceRoleKey,
        { db: { schema: NEGOCIO.schema } },
      );
      const { data, error } = await serviceClient.storage
        .from(BUCKET)
        .download(imagenPath);
      if (error || !data) {
        return NextResponse.json(NULL_RESULT, { status: 200 });
      }
      mediaType = data.type || "application/octet-stream";
      base64 = Buffer.from(await data.arrayBuffer()).toString("base64");
    }

    const { object } = await generateObject({
      model: "anthropic/claude-haiku-4-5",
      schema: ocrSchema,
      abortSignal: AbortSignal.timeout(OCR_TIMEOUT_MS),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "file", data: base64, mediaType },
          ],
        },
      ],
    });

    return NextResponse.json(
      {
        monto_centavos: object.monto_centavos,
        confianza: object.confianza,
      },
      { status: 200 },
    );
  } catch (err) {
    // El OCR propone, nunca bloquea: cualquier excepción (timeout, modelo
    // sin soporte para PDF, error de red, etc.) se traduce en `null` y se
    // loguea para diagnóstico, sin propagarse al cliente.
    console.error("[api/ocr-monto] fallo al leer el comprobante:", err);
    return NextResponse.json(NULL_RESULT, { status: 200 });
  }
}
