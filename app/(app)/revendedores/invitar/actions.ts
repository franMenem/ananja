"use server";

import type { User } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import {
  esObjetivoGestionable,
  esTemporalSinUsar,
  esUuid,
  FLAG_BIENVENIDA,
  FLAG_MUST_CHANGE_PASSWORD,
  generarPasswordTemporal,
  MARCA_ALTA,
  mensajeCuentaTemporal,
  mensajeErrorAuth,
  mensajeErrorBorrarCuenta,
  modoReenvio,
  motivoNoCancelable,
  sugiereCuentaTemporal,
  TEXTOS_CANCELAR,
  type TipoPendiente,
  validarAsignacionInicial,
  validarDatosInvitacion,
  type DatosInvitacion,
  type ModoAlta,
  type ResultadoAccion,
  type ResultadoAlta,
  type ValoresFormInvitacion,
} from "@/lib/dominio/invitaciones";
import {
  buscarUsuarioPorEmail,
  esDeEsteNegocio,
  exigirAdmin,
  urlSitioServidor,
} from "@/lib/invitaciones-server";
import { NEGOCIO } from "@/lib/negocio";
import { createAdminClient, ServiceRoleNoConfigurada } from "@/lib/supabase/admin";

/**
 * Server actions de `/revendedores/invitar` — alta de personas SIN pasar
 * por el dashboard de Supabase. Usan la service role (saltea RLS y habla
 * con la Admin API de Auth), así que CADA acción:
 *  1. verifica en el servidor que quien llama es un admin activo
 *     (`exigirAdmin`, sesión de cookies — nunca datos del navegador);
 *  2. valida todo lo que llega (se pueden llamar por POST directo);
 *  3. replica las reglas de los RPC `asignar_rol_revendedor` y
 *     `asignar_encargado_revendedor` (`validarAsignacionInicial`).
 *
 * Nunca se loguea ni se guarda una contraseña temporal: solo viaja una vez
 * en la respuesta, para mostrarla en pantalla.
 */

type AdminClient = ReturnType<typeof createAdminClient>;
type Encargado = { id: string; rol: string; activo: boolean };

const SIN_PERMISO = "No tenés permiso para dar de alta personas.";
const SIN_CLAVE =
  "Falta configurar la clave SUPABASE_SERVICE_ROLE_KEY en Vercel: sin ella la app no puede crear cuentas.";
const SUGERENCIA_TEMPORAL =
  " Mientras tanto, podés crear la cuenta con contraseña temporal (sin mail).";

function clienteAdmin(): AdminClient | null {
  try {
    return createAdminClient();
  } catch (error) {
    if (error instanceof ServiceRoleNoConfigurada) return null;
    throw error;
  }
}

function revalidar() {
  revalidatePath("/revendedores");
  revalidatePath("/revendedores/invitar");
}

function texto(valor: FormDataEntryValue | null): string {
  return typeof valor === "string" ? valor : "";
}

/** Solo código/estado — nunca el objeto entero (podría traer datos). */
function logError(donde: string, error: { code?: string | null; status?: number | null } | null) {
  console.error(donde, error?.code ?? "sin_codigo", error?.status ?? "");
}

// ============================================================
// Alta: invitación por mail o contraseña temporal
// ============================================================

export async function darDeAlta(
  _previo: ResultadoAlta | null,
  formData: FormData,
): Promise<ResultadoAlta> {
  const envio = Date.now();
  const modo: ModoAlta = formData.get("modo") === "invitar" ? "invitar" : "temporal";
  const valores: ValoresFormInvitacion = {
    nombre: texto(formData.get("nombre")),
    email: texto(formData.get("email")),
    rol:
      formData.get("rol") === "admin"
        ? "admin"
        : formData.get("rol") === "coordinador"
          ? "coordinador"
          : "revendedor",
    encargadoId: texto(formData.get("encargadoId")),
  };
  const error = (mensaje: string, extra: Partial<ResultadoAlta> = {}): ResultadoAlta => ({
    estado: "error",
    modo,
    mensaje,
    valores,
    envio,
    ...extra,
  });

  const caller = await exigirAdmin();
  if (!caller) return error(SIN_PERMISO);

  const validacion = validarDatosInvitacion({
    nombre: formData.get("nombre"),
    email: formData.get("email"),
    rol: formData.get("rol"),
    encargadoId: formData.get("encargadoId"),
  });
  if (!validacion.ok) return error(validacion.mensaje);
  const datos = validacion.datos;

  const admin = clienteAdmin();
  if (!admin) return error(SIN_CLAVE);

  let encargado: Encargado | null = null;
  if (datos.encargadoId) {
    const { data } = await admin
      .from("vendedores")
      .select("id, rol, activo")
      .eq("id", datos.encargadoId)
      .maybeSingle();
    if (!data || (data.rol !== "admin" && data.rol !== "coordinador") || !data.activo) {
      return error("Elegí como coordinador a un admin o coordinador activo.");
    }
    encargado = data;
  }

  // Primero el email: si la persona ya está dada de alta (p. ej. se la
  // vuelve a cargar con el mismo nombre), tiene que llegar a "Reenviar
  // invitación" / "Generar otra contraseña temporal", no chocar con el
  // chequeo de nombre repetido de abajo (que sería ella misma).
  let existente: User | null;
  try {
    existente = await buscarUsuarioPorEmail(admin, datos.email);
  } catch (e) {
    logError("darDeAlta listUsers", e as { code?: string });
    return error("No se pudo verificar el email. Probá de nuevo.");
  }
  if (existente) {
    return emailYaRegistrado(admin, existente, { modo, valores, envio });
  }

  const { data: mismoNombre, error: nombreError } = await admin
    .from("vendedores")
    .select("id")
    .eq("nombre", datos.nombre)
    .maybeSingle();
  if (nombreError) {
    logError("darDeAlta nombre", nombreError);
    return error("No se pudo verificar el nombre. Probá de nuevo.");
  }
  if (mismoNombre) {
    return error(`Ya hay alguien con el nombre “${datos.nombre}”. Agregale el apellido o una inicial.`);
  }

  return modo === "invitar"
    ? invitarPorMail(admin, datos, encargado, { valores, envio })
    : crearConPasswordTemporal(admin, datos, encargado, { valores, envio });
}

async function emailYaRegistrado(
  admin: AdminClient,
  user: User,
  ctx: { modo: ModoAlta; valores: ValoresFormInvitacion; envio: number },
): Promise<ResultadoAlta> {
  const base = { modo: ctx.modo, valores: ctx.valores, envio: ctx.envio };
  const email = user.email ?? ctx.valores.email;

  if (!esDeEsteNegocio(user)) {
    return { ...base, estado: "error", mensaje: "Ese email ya está registrado en la app de otro negocio. Usá otro email." };
  }

  const { data: fila } = await admin
    .from("vendedores")
    .select("rol, activo")
    .eq("user_id", user.id)
    .maybeSingle();

  if (fila && !fila.activo) {
    return { ...base, estado: "error", mensaje: "Ese email tiene una cuenta dada de baja." };
  }
  if (modoReenvio(user)) {
    return {
      ...base,
      estado: "ya_invitado",
      userId: user.id,
      reintento: "reenviar",
      mensaje: `A ${email} ya lo invitaste y todavía no terminó de entrar. Podés reenviarle el mail.`,
    };
  }
  if (esTemporalSinUsar(user)) {
    return {
      ...base,
      estado: "ya_invitado",
      userId: user.id,
      reintento: "nueva_temporal",
      mensaje: `${email} ya tiene una cuenta con contraseña temporal y todavía no entró. Si perdiste la contraseña, generá otra.`,
    };
  }
  if (fila?.rol === "pendiente") {
    return {
      ...base,
      estado: "error",
      mensaje: "Esa persona ya tiene cuenta y está esperando aprobación: aprobala desde Pendientes en Revendedores.",
    };
  }
  return { ...base, estado: "error", mensaje: "Esa persona ya tiene una cuenta activa." };
}

async function invitarPorMail(
  admin: AdminClient,
  datos: DatosInvitacion,
  encargado: Encargado | null,
  ctx: { valores: ValoresFormInvitacion; envio: number },
): Promise<ResultadoAlta> {
  const sitio = await urlSitioServidor();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(datos.email, {
    data: { display_name: datos.nombre, negocio: NEGOCIO.id },
    redirectTo: `${sitio}/auth/confirm?next=/bienvenida`,
  });

  if (error || !data.user) {
    logError("darDeAlta invite", error);
    const sugerir = sugiereCuentaTemporal(error);
    return {
      estado: "error",
      modo: "invitar",
      mensaje: mensajeErrorAuth(error) + (sugerir ? SUGERENCIA_TEMPORAL : ""),
      sugerirTemporal: sugerir,
      valores: ctx.valores,
      envio: ctx.envio,
    };
  }

  // `inviteUserByEmail` solo acepta `data` (→ `user_metadata`, editable por
  // la propia persona): el flag de bienvenida — que fuerza elegir
  // contraseña antes de usar la app — va en `app_metadata`, que solo la
  // service role puede escribir (fix de seguridad 2026-09-21). Sin este
  // paso el flag quedaría sin poner en ningún lado (0 seguridad, ni
  // siquiera la vieja), así que un fallo acá se trata como un fallo de
  // TODA la invitación: se deshace lo que ya se creó (mismo orden que
  // `cancelarCuenta` más abajo — la fila de `vendedores` primero, recién
  // creada por el trigger y sin movimientos, así que el borrado no puede
  // chocar con la FK 23503 — y después el usuario de Auth) en vez de dejar
  // una cuenta invitada sin el paso de seguridad.
  const { error: metaError } = await admin.auth.admin.updateUserById(data.user.id, {
    app_metadata: { [FLAG_BIENVENIDA]: true },
  });
  if (metaError) {
    logError("darDeAlta invite app_metadata", metaError);
    await revertirAltaFallida(admin, data.user.id);
    return {
      estado: "error",
      modo: "invitar",
      mensaje: "No se pudo terminar de invitar (falló un paso de seguridad). Probá de nuevo.",
      valores: ctx.valores,
      envio: ctx.envio,
    };
  }

  const problemaRol = await asignarRolInicial(admin, data.user.id, datos, encargado);
  revalidar();

  if (problemaRol) {
    return {
      estado: "aviso",
      modo: "invitar",
      mensaje: `Le mandamos la invitación a ${datos.email}, pero ${problemaRol}`,
      envio: ctx.envio,
    };
  }
  return {
    estado: "ok",
    modo: "invitar",
    mensaje: `Listo: le mandamos la invitación a ${datos.email}. Cuando toque el link del mail va a elegir su contraseña.`,
    envio: ctx.envio,
  };
}

/**
 * Deshace un alta por invitación que falló a mitad de camino (el usuario
 * de Auth ya existe, pero no se pudo terminar de asegurar): borra la fila
 * `pendiente` que dejó el trigger `on_auth_user_created` y el usuario de
 * Auth — mismo orden que `cancelarCuenta` (vendedores primero: si por lo
 * que sea ya tuviera algún movimiento, la FK 23503 frena el borrado ACÁ,
 * antes de tocar Auth). Best effort: solo loguea si algún paso falla, no
 * hay nada más que intentar desde una server action.
 */
async function revertirAltaFallida(admin: AdminClient, userId: string): Promise<void> {
  const { error: filaError } = await admin.from("vendedores").delete().eq("user_id", userId);
  if (filaError) logError("revertirAltaFallida vendedores", filaError);
  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) logError("revertirAltaFallida deleteUser", authError);
}

async function crearConPasswordTemporal(
  admin: AdminClient,
  datos: DatosInvitacion,
  encargado: Encargado | null,
  ctx: { valores: ValoresFormInvitacion; envio: number },
): Promise<ResultadoAlta> {
  const password = generarPasswordTemporal();
  // `createUser` (a diferencia de `inviteUserByEmail`) acepta `app_metadata`
  // en el mismo llamado: el flag de contraseña obligatoria va directo ahí
  // (fuente de verdad, solo la service role la escribe — fix de seguridad
  // 2026-09-21), junto a la marca `MARCA_ALTA` que ya vivía en
  // `app_metadata`. Sin paso extra ni rollback: es un solo request atómico.
  const { data, error } = await admin.auth.admin.createUser({
    email: datos.email,
    password,
    email_confirm: true,
    user_metadata: { display_name: datos.nombre, negocio: NEGOCIO.id },
    app_metadata: { [MARCA_ALTA.clave]: MARCA_ALTA.valor, [FLAG_MUST_CHANGE_PASSWORD]: true },
  });

  if (error || !data.user) {
    logError("darDeAlta createUser", error);
    return {
      estado: "error",
      modo: "temporal",
      mensaje: mensajeErrorAuth(error),
      valores: ctx.valores,
      envio: ctx.envio,
    };
  }

  const problemaRol = await asignarRolInicial(admin, data.user.id, datos, encargado);
  revalidar();

  const sitio = await urlSitioServidor();
  return {
    estado: problemaRol ? "aviso" : "ok",
    modo: "temporal",
    mensaje: problemaRol
      ? `Creamos la cuenta de ${datos.nombre}, pero ${problemaRol}`
      : `Creamos la cuenta de ${datos.nombre}.`,
    credenciales: {
      email: datos.email,
      password,
      mensaje: mensajeCuentaTemporal({ nombre: datos.nombre, email: datos.email, password, sitio }),
    },
    envio: ctx.envio,
  };
}

/**
 * Fija rol (y encargado) sobre la fila `pendiente` que acaba de crear el
 * trigger `on_auth_user_created`. `null` si salió bien; si no, el final de
 * una frase ("no se pudo asignar el rol…") para el aviso. El `.eq("rol",
 * "pendiente")` hace que el update solo aplique a una fila todavía sin rol
 * (misma transición que permite `asignar_rol_revendedor`).
 */
async function asignarRolInicial(
  admin: AdminClient,
  userId: string,
  datos: DatosInvitacion,
  encargado: Encargado | null,
): Promise<string | null> {
  const { data: fila, error } = await admin
    .from("vendedores")
    .select("id, rol, activo")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !fila) {
    logError("asignarRolInicial select", error);
    return "no encontramos su ficha para asignarle el rol. Revisá Pendientes en Revendedores.";
  }

  const regla = validarAsignacionInicial({ vendedor: fila, rolDestino: datos.rol, encargado });
  if (regla) return `no se pudo asignar el rol: ${regla}`;

  const { data: actualizada, error: updateError } = await admin
    .from("vendedores")
    .update({
      rol: datos.rol,
      encargado_id: datos.rol === "revendedor" ? (encargado?.id ?? null) : null,
    })
    .eq("id", fila.id)
    .eq("rol", "pendiente")
    .select("id")
    .maybeSingle();
  if (updateError || !actualizada) {
    logError("asignarRolInicial update", updateError);
    return "no se pudo asignar el rol. Aprobala desde Pendientes en Revendedores.";
  }
  return null;
}

// ============================================================
// Invitaciones pendientes: reenviar / cancelar / otra contraseña temporal
// ============================================================

type Contexto =
  | { ok: true; admin: AdminClient; user: User; fila: { id: string; nombre: string; activo: boolean } }
  | { ok: false; resultado: ResultadoAccion };

const NO_ENCONTRADA: ResultadoAccion = { ok: false, mensaje: "No encontramos esa cuenta." };

/** Guard + carga común: admin activo, usuario de Auth de este negocio con
 * fila activa en `vendedores`. */
async function cargarContexto(userId: unknown): Promise<Contexto> {
  if (!esUuid(userId)) return { ok: false, resultado: NO_ENCONTRADA };

  const caller = await exigirAdmin();
  if (!caller) return { ok: false, resultado: { ok: false, mensaje: SIN_PERMISO } };

  const admin = clienteAdmin();
  if (!admin) return { ok: false, resultado: { ok: false, mensaje: SIN_CLAVE } };

  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user || !esDeEsteNegocio(data.user)) {
    return { ok: false, resultado: NO_ENCONTRADA };
  }

  const { data: fila } = await admin
    .from("vendedores")
    .select("id, nombre, activo")
    .eq("user_id", userId)
    .maybeSingle();
  if (!fila || !esObjetivoGestionable({ deEsteNegocio: true, fila, callerVendedorId: caller.id })) {
    return { ok: false, resultado: NO_ENCONTRADA };
  }

  return { ok: true, admin, user: data.user, fila };
}

export async function reenviarInvitacion(userId: string): Promise<ResultadoAccion> {
  const ctx = await cargarContexto(userId);
  if (!ctx.ok) return ctx.resultado;
  const { admin, user, fila } = ctx;

  const modo = modoReenvio(user);
  if (!modo || !user.email) return { ok: false, mensaje: "Esa persona ya entró a la app." };

  const sitio = await urlSitioServidor();
  const redirectTo = `${sitio}/auth/confirm?next=/bienvenida`;
  const { error } =
    modo === "invitar"
      ? await admin.auth.admin.inviteUserByEmail(user.email, {
          data: { display_name: fila.nombre, negocio: NEGOCIO.id, [FLAG_BIENVENIDA]: true },
          redirectTo,
        })
      : // Ya usó el link pero no eligió contraseña: el mail de invitación
        // no sirve para un email confirmado; va el de recuperar (el proxy
        // la lleva a /bienvenida por el flag).
        await admin.auth.resetPasswordForEmail(user.email, { redirectTo });

  if (error) {
    logError("reenviarInvitacion", error);
    return {
      ok: false,
      mensaje: mensajeErrorAuth(error) + (sugiereCuentaTemporal(error) ? SUGERENCIA_TEMPORAL.replace(" crear la cuenta", " cancelar la invitación y crear la cuenta") : ""),
    };
  }
  return { ok: true, mensaje: `Listo, le reenviamos el mail a ${user.email}.` };
}

/** Cancela una invitación por mail que nunca se usó. */
export async function cancelarInvitacion(userId: string): Promise<ResultadoAccion> {
  return cancelarCuenta(userId, "mail");
}

/** Cancela una cuenta con contraseña temporal creada por error desde
 * "Sumar persona" que nunca se usó para entrar. */
export async function cancelarCuentaTemporal(userId: string): Promise<ResultadoAccion> {
  return cancelarCuenta(userId, "temporal");
}

/**
 * Flujo común de cancelar: guard de admin + persona de este negocio,
 * activa y distinta de quien llama (`cargarContexto`), guard del tipo
 * (`motivoNoCancelable`), borra primero la fila de `vendedores` y después
 * el usuario de Auth; si Auth falla, restaura la fila.
 */
async function cancelarCuenta(userId: string, tipo: TipoPendiente): Promise<ResultadoAccion> {
  const ctx = await cargarContexto(userId);
  if (!ctx.ok) return ctx.resultado;
  const { admin, user } = ctx;

  const motivo = motivoNoCancelable(tipo, user);
  if (motivo) return { ok: false, mensaje: motivo };

  // Fila completa, para poder restaurarla si falla el borrado en Auth.
  const { data: fila } = await admin.from("vendedores").select("*").eq("user_id", userId).maybeSingle();

  if (fila) {
    // Todas las FK hacia `vendedores` son NO ACTION: si tiene cualquier
    // movimiento (o es encargado de alguien), Postgres rechaza el borrado
    // con 23503 y no se toca nada.
    const { error: deleteError } = await admin.from("vendedores").delete().eq("id", fila.id);
    if (deleteError) {
      logError(`cancelarCuenta(${tipo}) vendedores`, deleteError);
      return { ok: false, mensaje: mensajeErrorBorrarCuenta(deleteError.code, tipo) };
    }
  }

  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) {
    logError(`cancelarCuenta(${tipo}) deleteUser`, authError);
    if (fila) {
      const { error: restoreError } = await admin.from("vendedores").insert(fila);
      if (restoreError) logError(`cancelarCuenta(${tipo}) restaurar`, restoreError);
    }
    return { ok: false, mensaje: TEXTOS_CANCELAR[tipo].error };
  }

  revalidar();
  return { ok: true, mensaje: TEXTOS_CANCELAR[tipo].ok };
}

export async function nuevaPasswordTemporal(userId: string): Promise<ResultadoAccion> {
  const ctx = await cargarContexto(userId);
  if (!ctx.ok) return ctx.resultado;
  const { admin, user, fila } = ctx;

  if (!esTemporalSinUsar(user) || !user.email) {
    return { ok: false, mensaje: "Esa persona ya entró a la app: si olvidó la contraseña, que use “¿Olvidaste tu contraseña?”." };
  }

  const password = generarPasswordTemporal();
  // `must_change_password` va en `app_metadata` (fuente de verdad, solo la
  // service role la escribe); `updateUserById` mergea superficialmente el
  // objeto que se le pasa (agrega/pisa la clave, deja el resto — incluido
  // `MARCA_ALTA` — intacto), así que no hace falta mandar el resto de
  // `user.app_metadata`.
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    password,
    app_metadata: { [FLAG_MUST_CHANGE_PASSWORD]: true },
  });
  if (error) {
    logError("nuevaPasswordTemporal", error);
    return { ok: false, mensaje: mensajeErrorAuth(error) };
  }

  const sitio = await urlSitioServidor();
  return {
    ok: true,
    mensaje: `Generamos otra contraseña temporal para ${fila.nombre}. La anterior ya no sirve.`,
    credenciales: {
      email: user.email,
      password,
      mensaje: mensajeCuentaTemporal({ nombre: fila.nombre, email: user.email, password, sitio }),
    },
  };
}
