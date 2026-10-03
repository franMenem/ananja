import "server-only";

import { createClient } from "@supabase/supabase-js";

import { NEGOCIO } from "@/lib/negocio";
import type { Database } from "@/lib/types";

/** Falta `SUPABASE_SERVICE_ROLE_KEY` (o la URL) en el entorno. */
export class ServiceRoleNoConfigurada extends Error {
  constructor() {
    super("SUPABASE_SERVICE_ROLE_KEY no configurada");
    this.name = "ServiceRoleNoConfigurada";
  }
}

/**
 * Cliente Supabase con la SERVICE ROLE KEY — SOLO servidor (`server-only`
 * rompe el build si un Client Component lo importa). Saltea RLS y habla
 * con la Admin API de Auth (invitar, borrar usuarios): quien lo use tiene
 * que haber verificado ANTES que el que llama es un admin activo
 * (`exigirAdmin`, `lib/invitaciones-server.ts`) y replicar las reglas de
 * negocio que en el cliente normal hacen los RPC.
 *
 * Sin sesión persistida ni refresh: cada llamada crea un cliente nuevo,
 * sin estado compartido entre requests.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new ServiceRoleNoConfigurada();
  }

  return createClient<Database>(url, serviceRoleKey, {
    db: { schema: NEGOCIO.schema as "public" },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
