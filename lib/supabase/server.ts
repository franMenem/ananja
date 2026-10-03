import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { NEGOCIO } from "@/lib/negocio";
import type { Database } from "@/lib/types";

/**
 * Cliente Supabase para Server Components, Server Actions y Route Handlers.
 * Lee/escribe la sesión desde las cookies de la request actual.
 *
 * `db.schema`: dos negocios, un repo — cada uno con su propio schema
 * Postgres dentro del mismo proyecto (ver `lib/negocio.ts` § NEGOCIO).
 * `Database` (lib/types.ts) hoy solo describe el schema `public` — el cast
 * es solo de tipos (no cambia el valor real que viaja a `createServerClient`,
 * que sigue siendo `NEGOCIO.schema`); reemplazar por un `SchemaName`
 * genérico cuando `lib/types.ts` describa también `miel`.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: NEGOCIO.schema as "public" },
      // Ver security-audit-2026-09-02.md hallazgo #2 — `secure` solo en
      // producción para no romper cookies en `localhost` HTTP (dev).
      cookieOptions: {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // `setAll` fue llamado desde un Server Component: se puede
            // ignorar porque el proxy (`proxy.ts`) ya refresca la sesión.
          }
        },
      },
    },
  );
}
