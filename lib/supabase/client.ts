import { createBrowserClient } from "@supabase/ssr";

import { NEGOCIO } from "@/lib/negocio";
import type { Database } from "@/lib/types";

/**
 * Cliente Supabase para Client Components (browser).
 * Usa la anon key; las políticas RLS son las que protegen los datos.
 *
 * `cookieOptions.secure`: solo en producción — hallazgo #2
 * de la auditoría de seguridad inicial.
 * En `localhost` HTTP (dev) una cookie `Secure` nunca viaja, así que se
 * condiciona por `NODE_ENV` en vez de forzarlo siempre.
 *
 * `db.schema`: dos negocios, un repo — cada uno con su propio schema
 * Postgres dentro del mismo proyecto (ver `lib/negocio.ts` § NEGOCIO).
 * `Database` (lib/types.ts) hoy solo describe el schema `public` — se
 * regenera recién cuando el schema `miel` exista en Supabase — así que
 * acá se seguimos tipando el cliente contra `"public"` (el cast es sobre
 * el tipo, no cambia el valor real que se manda: `NEGOCIO.schema` sigue
 * viajando tal cual al `createBrowserClient` de abajo). Los tipos de las
 * tablas de `miel` deberían ser un espejo 1:1 de `public`, así que esto no
 * debería producir falsos positivos en desarrollo — reemplazar por un
 * `SchemaName` genérico el día que `lib/types.ts` describa ambos schemas.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: NEGOCIO.schema as "public" },
      cookieOptions: {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      },
    },
  );
}
