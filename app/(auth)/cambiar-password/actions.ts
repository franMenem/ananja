"use server";

import {
  FLAG_BIENVENIDA,
  FLAG_MUST_CHANGE_PASSWORD,
  mensajeErrorPassword,
  validarPassword,
} from "@/lib/dominio/invitaciones";
import { createAdminClient, ServiceRoleNoConfigurada } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ResultadoCambioPassword = { ok: boolean; mensaje?: string };

const SESION_VENCIDA = "Tu sesión venció. Pedí un link nuevo desde la pantalla de ingreso.";

/** Solo código/estado — nunca el objeto entero (podría traer datos), mismo
 * criterio que `app/(app)/revendedores/invitar/actions.ts`. */
function logError(donde: string, error: { code?: string | null; status?: number | null } | null) {
  console.error(donde, error?.code ?? "sin_codigo", error?.status ?? "");
}

/**
 * Guarda la contraseña nueva de la persona LOGUEADA y, solo si eso salió
 * bien, apaga los flags que fuerzan esta pantalla. Usada por `PasswordForm`
 * en sus dos usos: `/cambiar-password` (contraseña temporal o cambio
 * voluntario) y `/bienvenida` (primer acceso desde una invitación).
 *
 * Reemplaza el `supabase.auth.updateUser({ password, data: {...} })` que
 * hacía esto antes DESDE EL NAVEGADOR: como `data` mapea a `user_metadata`,
 * y `user_metadata` lo puede reescribir el propio usuario autenticado
 * (documentado en `AdminUserAttributes` de `@supabase/auth-js` — "Only a
 * service role can modify" es la nota que SÍ tiene `app_metadata`, no
 * `user_metadata`), una persona con contraseña temporal podía llamar
 * `supabase.auth.updateUser({ data: { must_change_password: false } })` a
 * mano (consola del navegador) y saltarse el cambio obligatorio sin tocar
 * la contraseña. Acá:
 *  1. La sesión sale de la cookie (`getUser()`, revalida contra el
 *     servidor) — NUNCA de un id que mande el cliente.
 *  2. Se valida la contraseña con las mismas reglas que ya usaba el
 *     formulario (`validarPassword`).
 *  3. Se cambia la contraseña con la sesión de la propia persona
 *     (`supabase.auth.updateUser({ password })` del cliente de servidor:
 *     mismo endpoint `PUT /user` que usaba el cliente de navegador, pero
 *     con la cookie de esta request). `updateUser` en el SDK vuelve a
 *     guardar la sesión (`_saveSession`) con el `user` actualizado; el
 *     cliente de servidor (`lib/supabase/server.ts`) persiste eso
 *     reescribiendo las cookies (`cookieStore.set`) — a diferencia de un
 *     Server Component, en una Server Action esa escritura SÍ se aplica
 *     (no cae en el catch que la ignora), y Next.js agrega esos
 *     `Set-Cookie` a la respuesta de esta acción sola. No hace falta nada
 *     manual para "propagar" la sesión: ya viaja en la respuesta.
 *  4. SOLO si (3) salió bien, con la service role (`createAdminClient`,
 *     nunca expuesta al navegador) se apagan los dos flags en
 *     `app_metadata` (la fuente de verdad que el usuario no puede tocar) Y
 *     en `user_metadata` (por si esta cuenta es una invitada ANTES del fix
 *     de seguridad 2026-09-21 y todavía tiene el flag viejo ahí — si no se
 *     apaga ese lado también, `flagCuentaActivo` seguiría viendo el flag
 *     en `true` para siempre, porque ya no queda ningún código de cliente
 *     que apague `user_metadata`).
 *
 * `updateUserById` mergea superficialmente cada objeto de metadata que se
 * le pasa (agrega/pisa las claves que van, borra las que van en `null`,
 * deja el resto intacto) — confirmado en el código del propio servidor de
 * Auth (`supabase/auth`, `internal/models/user.go`, métodos
 * `UpdateAppMetaData`/`UpdateUserMetaData`, y replicado en
 * `internal/api/admin.go`): no hace falta leer el usuario y mandar el
 * objeto completo para no pisar `provider`/`providers` ni `alta_desde`
 * (`MARCA_ALTA`) — quedan intactos con o sin ese fetch extra.
 */
export async function guardarPasswordNueva(
  password: string,
  confirmacion: string,
): Promise<ResultadoCambioPassword> {
  const invalida = validarPassword(password, confirmacion);
  if (invalida) return { ok: false, mensaje: invalida };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, mensaje: SESION_VENCIDA };

  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    logError("guardarPasswordNueva updateUser", updateError);
    return { ok: false, mensaje: mensajeErrorPassword(updateError.message, updateError.code) };
  }

  // La contraseña YA se guardó en este punto: de acá para abajo, cualquier
  // error se informa pero no se revierte el cambio (dejar a la persona sin
  // poder entrar sería peor que dejarla, en el peor caso, con un flag que
  // sigue forzando esta pantalla — puede volver a guardar la misma
  // contraseña para reintentar apagarlo).
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e) {
    if (!(e instanceof ServiceRoleNoConfigurada)) throw e;
    logError("guardarPasswordNueva admin", { code: "sin_service_role" });
    return {
      ok: false,
      mensaje: "Guardamos tu contraseña, pero no pudimos terminar el proceso. Avisale a un admin.",
    };
  }

  const flagsApagados = { [FLAG_MUST_CHANGE_PASSWORD]: false, [FLAG_BIENVENIDA]: false };
  const { error: metaError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: flagsApagados,
    user_metadata: flagsApagados,
  });
  if (metaError) {
    logError("guardarPasswordNueva updateUserById", metaError);
    return {
      ok: false,
      mensaje: "Guardamos tu contraseña, pero no pudimos terminar el proceso. Avisale a un admin.",
    };
  }

  return { ok: true };
}
