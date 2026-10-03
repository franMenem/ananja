"use server";

import { redirect } from "next/navigation";

import { esTipoOtp, nextPorDefecto, normalizarNext } from "@/lib/dominio/invitaciones";
import { createClient } from "@/lib/supabase/server";

function texto(valor: FormDataEntryValue | null): string | null {
  return typeof valor === "string" && valor.length > 0 ? valor : null;
}

/**
 * Canjea el link de un mail de Supabase Auth — SOLO por POST (server
 * action del botón "Continuar" de `/auth/confirm`), nunca al abrir el
 * link: los antivirus de mail (p. ej. Outlook Safe Links) abren los links
 * con GET y quemarían el token de un solo uso, y un GET que inicia sesión
 * permite "login CSRF". Las server actions además exigen que el `Origin`
 * coincida con el host.
 *
 * `verifyOtp` con `token_hash` + `type` (plantillas de
 * `supabase/templates/`), o `exchangeCodeForSession` con `code` (flujo
 * PKCE de las plantillas por defecto). Redirige a `next` solo si es una
 * ruta relativa de este sitio (`normalizarNext`); link vencido, usado o
 * inválido → `/login?aviso=link`.
 */
export async function confirmarLink(formData: FormData): Promise<void> {
  const tokenHash = texto(formData.get("token_hash"));
  const tipo = texto(formData.get("type"));
  const code = texto(formData.get("code"));

  const fallback = esTipoOtp(tipo) ? nextPorDefecto(tipo) : "/";
  const next = normalizarNext(texto(formData.get("next")), fallback);

  const supabase = await createClient();
  let ok = false;

  if (tokenHash && esTipoOtp(tipo)) {
    const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash });
    ok = !error;
    if (error) console.error("auth/confirm verifyOtp", error.code ?? error.status);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
    if (error) console.error("auth/confirm exchangeCodeForSession", error.code ?? error.status);
  }

  redirect(ok ? next : "/login?aviso=link");
}
