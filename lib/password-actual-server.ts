import "server-only";

import { createClient as createClientDescartable } from "@supabase/supabase-js";

import { exigePasswordActual, eximePasswordActualPorFlags, type ErrorAuthLike } from "@/lib/dominio/invitaciones";
import type { createClient } from "@/lib/supabase/server";

type ClienteServidor = Awaited<ReturnType<typeof createClient>>;

export type DecisionPasswordActual = "no_pedir" | "pedir" | "sin_verificar";

/**
 * Decide, del lado del servidor, si cambiar la contraseña exige la actual
 * (hallazgo F5; regla pura en `exigePasswordActual`). `appMetadata` tiene
 * que venir de `getUser()` (nunca `user_metadata`) y `userId` de ese mismo
 * usuario. Los flags de contraseña obligatoria eximen sin consultar nada;
 * si no, se lee el claim `amr` del JWT verificado con `getClaims()`. Si no
 * se puede verificar (error, sin claims, claims de otro usuario) →
 * `sin_verificar`: ni se pide ni se exime, el que llama corta.
 */
export async function decidirPasswordActual(
  supabase: ClienteServidor,
  appMetadata: Record<string, unknown> | null | undefined,
  userId: string,
): Promise<DecisionPasswordActual> {
  if (eximePasswordActualPorFlags(appMetadata)) return "no_pedir";
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data || data.claims.sub !== userId) return "sin_verificar";
    return exigePasswordActual(appMetadata, data.claims.amr) ? "pedir" : "no_pedir";
  } catch {
    return "sin_verificar";
  }
}

export type ResultadoVerificacionPassword = { ok: true } | { ok: false; error: ErrorAuthLike };

/**
 * Verifica la contraseña actual con `signInWithPassword` sobre un cliente
 * descartable: sin cookies ni storage (`persistSession: false`), así que
 * NO toca la sesión real de la persona. La sesión que crea se cierra con
 * `scope: "local"` (solo esa; `global` cerraría todas las del usuario).
 */
export async function verificarPasswordActual(
  email: string,
  password: string,
  userId: string,
): Promise<ResultadoVerificacionPassword> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { ok: false, error: { code: "sin_configuracion" } };

  const descartable = createClientDescartable(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data, error } = await descartable.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error };

  // Cierra solo la sesión recién creada; si falla, igual vence sola.
  const { error: errorSalida } = await descartable.auth.signOut({ scope: "local" });
  if (errorSalida) console.error("verificarPasswordActual signOut", errorSalida.code ?? "sin_codigo");

  if (data.user?.id !== userId) return { ok: false, error: { code: "invalid_credentials" } };
  return { ok: true };
}
