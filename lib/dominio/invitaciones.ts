/**
 * Invitaciones por email y acceso por link (invitación, recuperar
 * contraseña, confirmar email) — helpers PUROS, sin Supabase ni Next, para
 * poder testearlos (`tests/invitaciones.test.ts`) y usarlos tanto del lado
 * del servidor (server actions, `app/auth/confirm/`, proxy) como
 * del cliente (formularios).
 *
 * Flujo completo documentado en `supabase/templates/README.md`.
 */

/** Largo mínimo de contraseña — mismo valor que ya usaba `/cambiar-password`. */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Flag de un usuario invitado que todavía no eligió su contraseña. Se fija
 * al invitar y se baja al guardar la contraseña (`/bienvenida`). Mientras
 * esté en `true`, el proxy manda cualquier ruta a `/bienvenida` (mismo
 * mecanismo que `FLAG_MUST_CHANGE_PASSWORD` → `/cambiar-password`, ver
 * `lib/supabase/middleware.ts`).
 *
 * Fuente de verdad: `app_metadata` (solo la service role la escribe —
 * fix de seguridad 2026-09-21, antes vivía en `user_metadata`, que
 * cualquier usuario logueado puede reescribir con
 * `supabase.auth.updateUser({ data: {...} })` desde el navegador y así
 * saltearse el paso obligatorio). `user_metadata` se sigue LEYENDO como
 * fallback (ver {@link flagCuentaActivo}) para las cuentas invitadas antes
 * de ese fix, hasta que corra `supabase/migrations/0066_flags_password_app_metadata.sql`
 * y pase un tiempo prudencial.
 */
export const FLAG_BIENVENIDA = "bienvenida_pendiente";

/**
 * Flag de una cuenta con contraseña temporal (alta a mano o "crear cuenta
 * con contraseña temporal" en `/revendedores/invitar`) que todavía no la
 * cambió por una propia. Mismas reglas de fuente de verdad que
 * {@link FLAG_BIENVENIDA} — ver ese comentario.
 */
export const FLAG_MUST_CHANGE_PASSWORD = "must_change_password";

/**
 * `true` si el flag `clave` está activo para este usuario: en
 * `app_metadata` (fuente de verdad, solo editable con la service role) O
 * en `user_metadata` (compatibilidad con cuentas invitadas antes del fix
 * de seguridad 2026-09-21 — ver {@link FLAG_BIENVENIDA}). Punto ÚNICO de
 * esta lectura "o" en todo el código: úsalo en vez de leer cualquiera de
 * los dos metadatas por separado.
 *
 * TODO(0066): una vez aplicada `supabase/migrations/0066_flags_password_app_metadata.sql`
 * en prod y pasado un tiempo prudencial (cubre cualquier invitación vieja
 * que siga sin terminar), sacar la lectura de `userMetadata` acá y dejar
 * `app_metadata` como única fuente.
 */
export function flagCuentaActivo(
  appMetadata: Record<string, unknown> | null | undefined,
  userMetadata: Record<string, unknown> | null | undefined,
  clave: string,
): boolean {
  return appMetadata?.[clave] === true || userMetadata?.[clave] === true;
}

export const RUTA_CONFIRMAR = "/auth/confirm";
export const RUTA_BIENVENIDA = "/bienvenida";
export const RUTA_CAMBIAR_PASSWORD = "/cambiar-password";

export type RolInvitacion = "revendedor" | "admin" | "coordinador";

export const ETIQUETA_ROL: Record<RolInvitacion, string> = {
  revendedor: "Revendedora",
  admin: "Admin",
  coordinador: "Coordinador",
};

// ============================================================
// next= (redirect después de verificar un link)
// ============================================================

const BASE_FICTICIA = "http://ananja.invalid";

/**
 * Devuelve `next` solo si es una ruta RELATIVA de este mismo sitio; si no,
 * `fallback`. Se valida el string crudo (una sola `/` inicial, sin `\` ni
 * caracteres de control) y, sobre todo, el resultado YA NORMALIZADO por
 * `new URL()` (sin `//` inicial tras resolver `.`/`..`, sin barras
 * codificadas, mismo origen al volver a parsearlo). Evita open redirects
 * como `//evil.com`, `/..//evil.com`, `/%2e%2e//evil.com` o `/\evil.com`.
 * El valor devuelto es seguro para `redirect()`.
 */
export function normalizarNext(
  next: string | null | undefined,
  fallback = "/",
): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 512) {
    return fallback;
  }
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return fallback;
  }
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;

  // La validación importante va DESPUÉS de parsear: `new URL()` resuelve
  // segmentos `.`/`..` (también `%2e%2e`), así que `/..//evil.com` o
  // `/a/..//evil.com` pasan el chequeo del string crudo pero quedan como
  // `//evil.com` — que en un header Location es una URL a otro host.
  let url: URL;
  try {
    url = new URL(next, BASE_FICTICIA);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE_FICTICIA || url.username || url.password) return fallback;

  const path = url.pathname;
  let decodificado: string;
  try {
    decodificado = decodeURIComponent(path);
  } catch {
    return fallback;
  }
  // Barras y contrabarras codificadas (`%2f`, `%5c`) se rechazan siempre:
  // ninguna ruta de la app las usa, y un proxy que las decodifique podría
  // convertir `/..%2f%2fevil.com` en `//evil.com`.
  if (
    !path.startsWith("/") ||
    /%(2f|5c)/i.test(path) ||
    /^\/[/\\]/.test(path) ||
    /^\/[/\\]/.test(decodificado) ||
    decodificado.includes("\\")
  ) {
    return fallback;
  }
  if (path === RUTA_CONFIRMAR || decodificado === RUTA_CONFIRMAR) return fallback;

  const resultado = `${path}${url.search}${url.hash}`;

  // Doble chequeo: el resultado, vuelto a parsear contra el origen, sigue
  // en el mismo origen y con la misma ruta.
  const reparseado = new URL(resultado, BASE_FICTICIA);
  if (reparseado.origin !== BASE_FICTICIA || reparseado.pathname !== path) return fallback;

  return resultado;
}

/** Textos de la pantalla intermedia de `/auth/confirm` según el tipo de link. */
export function textosConfirmacion(tipo: TipoOtp | null): { titulo: string; texto: string; boton: string } {
  switch (tipo) {
    case "invite":
      return {
        titulo: "Aceptá la invitación",
        texto: "Tocá Continuar para entrar y elegir tu contraseña.",
        boton: "Continuar",
      };
    case "recovery":
      return {
        titulo: "Elegí una contraseña nueva",
        texto: "Tocá Continuar para elegir tu contraseña nueva.",
        boton: "Continuar",
      };
    case "email_change":
      return {
        titulo: "Confirmá tu nuevo email",
        texto: "Tocá Continuar para confirmar el cambio de email.",
        boton: "Confirmar",
      };
    default:
      return {
        titulo: "Entrar a la app",
        texto: "Tocá Continuar para entrar.",
        boton: "Continuar",
      };
  }
}

// ============================================================
// Tipos de link de email (verifyOtp)
// ============================================================

export const TIPOS_OTP = [
  "invite",
  "recovery",
  "email_change",
  "magiclink",
  "signup",
  "email",
] as const;

export type TipoOtp = (typeof TIPOS_OTP)[number];

export function esTipoOtp(tipo: string | null | undefined): tipo is TipoOtp {
  return typeof tipo === "string" && (TIPOS_OTP as readonly string[]).includes(tipo);
}

/** A dónde va cada tipo de link si el mail no trae un `next` válido. */
export function nextPorDefecto(tipo: TipoOtp): string {
  if (tipo === "invite") return RUTA_BIENVENIDA;
  if (tipo === "recovery") return RUTA_CAMBIAR_PASSWORD;
  return "/";
}

// ============================================================
// URL del sitio
// ============================================================

/**
 * Origen (`https://host`) del sitio para armar los `redirectTo` de Supabase
 * Auth: primero la env var (`NEXT_PUBLIC_SITE_URL`), si no el origen de la
 * request. `null` si ninguno es una URL http(s) válida.
 */
export function resolverUrlSitio(
  env: string | null | undefined,
  origen: string | null | undefined,
): string | null {
  for (const candidato of [env, origen]) {
    if (!candidato || !candidato.trim()) continue;
    try {
      const url = new URL(candidato.trim());
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
    } catch {
      // probar el siguiente
    }
  }
  return null;
}

// ============================================================
// Errores de Supabase Auth → español
// ============================================================

export type ErrorAuthLike = {
  code?: string | null;
  status?: number | null;
  message?: string | null;
};

export const MENSAJE_EMAIL_REGISTRADO = "Ese email ya tiene una cuenta.";

/**
 * Traduce errores de Supabase Auth (invitar, reenviar, recuperar) a un
 * mensaje claro para Fran. Nunca devuelve el mensaje crudo en inglés.
 */
export function mensajeErrorAuth(error: ErrorAuthLike | null | undefined): string {
  const code = error?.code ?? "";
  const status = error?.status ?? 0;
  const message = error?.message ?? "";

  if (code === "over_email_send_rate_limit" || /email rate limit/i.test(message)) {
    return "Se mandaron demasiados mails en poco tiempo. Esperá unos minutos y probá de nuevo.";
  }
  if (code === "over_request_rate_limit" || status === 429) {
    return "Demasiados intentos seguidos. Esperá unos minutos y probá de nuevo.";
  }
  if (code === "email_exists" || code === "user_already_exists" || /already been registered/i.test(message)) {
    return MENSAJE_EMAIL_REGISTRADO;
  }
  if (code === "email_address_invalid" || /invalid.*email|email.*invalid/i.test(message)) {
    return "Ese email no es válido. Revisalo.";
  }
  if (code === "email_address_not_authorized") {
    return "Todavía no está configurado el envío de mails (SMTP en Supabase). Hasta entonces Supabase solo manda mails al equipo del proyecto.";
  }
  if (/sending.*(email|mail)|smtp|mail.*send/i.test(message)) {
    return "No se pudo mandar el mail. Revisá la configuración de envío de mails (SMTP) en Supabase.";
  }
  if (code === "otp_expired") {
    return "El link venció o ya se usó.";
  }
  if (code === "weak_password") {
    return "La contraseña no cumple los requisitos configurados en Supabase (Authentication → Providers → Email).";
  }
  return "No se pudo completar. Probá de nuevo en un rato.";
}

/**
 * `true` si el error de mandar un mail es de configuración o de límite de
 * envíos (SMTP sin configurar, dirección no autorizada por el SMTP de
 * prueba de Supabase, rate limit): en esos casos conviene sugerir la
 * cuenta con contraseña temporal, que no manda ningún mail.
 */
export function sugiereCuentaTemporal(error: ErrorAuthLike | null | undefined): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const message = error.message ?? "";
  return (
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit" ||
    code === "email_address_not_authorized" ||
    error.status === 429 ||
    /sending.*(email|mail)|smtp|mail.*send|email rate limit/i.test(message)
  );
}

// ============================================================
// Contraseña temporal (alta sin mail)
// ============================================================

/**
 * Alfabeto sin caracteres que se confunden al dictarlos o copiarlos a mano
 * por WhatsApp: sin 0/O/o, 1/l/I/i, ni mayúsculas (evita dudas de
 * mayúscula/minúscula al tipearla en el celular).
 */
export const ALFABETO_PASSWORD_TEMPORAL = "abcdefghjkmnpqrstuvwxyz23456789";

const GRUPOS_PASSWORD = 3;
const LARGO_GRUPO = 4;

/** Llena el arreglo con bytes aleatorios (por defecto
 * `crypto.getRandomValues`). Inyectable para tests. */
export type FuenteAleatoria = (bytes: Uint8Array) => Uint8Array;

const fuenteCrypto: FuenteAleatoria = (bytes) => globalThis.crypto.getRandomValues(bytes);

/**
 * Contraseña temporal legible, p. ej. `k7mq-x3tp-9dwa`: 3 grupos de 4
 * caracteres de {@link ALFABETO_PASSWORD_TEMPORAL} separados por guiones
 * (14 caracteres; 31^12 ≈ 2^59, ~59 bits de entropía; los bytes se
 * eligen por rechazo, sin sesgo de módulo). Se muestra UNA vez en pantalla y
 * nunca se guarda ni se loguea; la persona la cambia en su primer ingreso
 * (`must_change_password`).
 */
export function generarPasswordTemporal(fuente: FuenteAleatoria = fuenteCrypto): string {
  // Siempre con al menos una letra y un dígito: si el proyecto de Supabase
  // exige "letras y números" en las contraseñas, `createUser` no falla.
  for (;;) {
    const candidata = generarCandidata(fuente);
    if (/[a-z]/.test(candidata) && /[2-9]/.test(candidata)) return candidata;
  }
}

function generarCandidata(fuente: FuenteAleatoria): string {
  const n = ALFABETO_PASSWORD_TEMPORAL.length;
  const limite = 256 - (256 % n); // bytes >= limite se descartan (sin sesgo)
  const total = GRUPOS_PASSWORD * LARGO_GRUPO;
  const chars: string[] = [];

  while (chars.length < total) {
    const bytes = fuente(new Uint8Array(total * 2));
    for (const b of bytes) {
      if (b >= limite) continue;
      chars.push(ALFABETO_PASSWORD_TEMPORAL[b % n]);
      if (chars.length === total) break;
    }
  }

  const grupos: string[] = [];
  for (let i = 0; i < total; i += LARGO_GRUPO) {
    grupos.push(chars.slice(i, i + LARGO_GRUPO).join(""));
  }
  return grupos.join("-");
}

/** Mensaje listo para mandar por WhatsApp con los datos de ingreso. */
export function mensajeCuentaTemporal(args: {
  nombre: string;
  email: string;
  password: string;
  sitio: string;
}): string {
  const primerNombre = args.nombre.trim().split(" ")[0] || args.nombre.trim();
  return (
    `Hola ${primerNombre}, entrá a ${args.sitio} con tu mail ${args.email} ` +
    `y esta contraseña temporal: ${args.password} ` +
    "Te va a pedir que elijas una nueva."
  );
}

/** Traduce los errores de `updateUser({ password })` más comunes. */
export function mensajeErrorPassword(mensaje: string, code?: string | null): string {
  if (code === "weak_password" || (/password/i.test(mensaje) && /(weak|short|least|characters)/i.test(mensaje))) {
    return "La contraseña es demasiado débil. Probá con una más larga o menos común.";
  }
  if (code === "same_password" || /same.*password|different from the old/i.test(mensaje)) {
    return "La nueva contraseña tiene que ser distinta de la actual.";
  }
  if (code === "session_not_found" || code === "session_expired" || /session/i.test(mensaje)) {
    return "Tu sesión venció. Pedí un link nuevo desde la pantalla de ingreso.";
  }
  return "No se pudo guardar la contraseña. Probá de nuevo.";
}

/** `null` si la contraseña es aceptable; si no, el mensaje de error. */
export function validarPassword(password: string, confirmacion: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `La contraseña tiene que tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (password !== confirmacion) {
    return "Las contraseñas no coinciden.";
  }
  return null;
}

// ============================================================
// Datos del formulario "Invitar"
// ============================================================

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function esUuid(valor: unknown): valor is string {
  return typeof valor === "string" && UUID_RE.test(valor);
}

export function normalizarEmail(valor: unknown): string {
  return typeof valor === "string" ? valor.trim().toLowerCase() : "";
}

export function esEmailValido(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email);
}

export type DatosInvitacion = {
  nombre: string;
  email: string;
  rol: RolInvitacion;
  encargadoId: string | null;
};

export type ValoresFormInvitacion = {
  nombre: string;
  email: string;
  rol: RolInvitacion;
  encargadoId: string;
};

export type ResultadoValidacion =
  | { ok: true; datos: DatosInvitacion }
  | { ok: false; mensaje: string };

export const NOMBRE_MAX = 80;

/**
 * Valida y normaliza lo que llega del formulario (datos NO confiables: la
 * server action se puede llamar por POST directo). El encargado solo
 * aplica a una revendedora; para un admin se descarta.
 */
export function validarDatosInvitacion(entrada: {
  nombre: unknown;
  email: unknown;
  rol: unknown;
  encargadoId: unknown;
}): ResultadoValidacion {
  const nombre = typeof entrada.nombre === "string" ? entrada.nombre.trim().replace(/\s+/g, " ") : "";
  if (!nombre) return { ok: false, mensaje: "Escribí el nombre de la persona." };
  if (nombre.length > NOMBRE_MAX) {
    return { ok: false, mensaje: `El nombre puede tener hasta ${NOMBRE_MAX} caracteres.` };
  }

  const email = normalizarEmail(entrada.email);
  if (!email) return { ok: false, mensaje: "Escribí el email de la persona." };
  if (!esEmailValido(email)) return { ok: false, mensaje: "Ese email no es válido. Revisalo." };

  if (entrada.rol !== "revendedor" && entrada.rol !== "admin" && entrada.rol !== "coordinador") {
    return { ok: false, mensaje: "Elegí si va a ser revendedora, admin o coordinador." };
  }
  const rol: RolInvitacion = entrada.rol;

  let encargadoId: string | null = null;
  if (rol === "revendedor" && typeof entrada.encargadoId === "string" && entrada.encargadoId !== "") {
    if (!esUuid(entrada.encargadoId)) return { ok: false, mensaje: "Elegí un encargado de la lista." };
    encargadoId = entrada.encargadoId;
  }

  return { ok: true, datos: { nombre, email, rol, encargadoId } };
}

// ============================================================
// Reglas de rol (réplica server-side de asignar_rol_revendedor +
// asignar_encargado_revendedor para el alta por invitación)
// ============================================================

type VendedorMin = { id: string; rol: string; activo: boolean };

/**
 * Reglas para fijar rol/encargado sobre la fila recién creada por el
 * trigger `on_auth_user_created` (rol `pendiente`). Mismas reglas que los
 * RPC `asignar_rol_revendedor` (0026: solo pendiente→admin/revendedor
 * desde un alta; un admin nunca pasa a revendedor; 0055 agrega
 * pendiente→coordinador) y `asignar_encargado_revendedor` (0037: encargado
 * = admin o coordinador activo distinto de la propia persona, solo para
 * revendedoras — 0055 amplía de admin a admin/coordinador). `null` si se
 * puede.
 */
export function validarAsignacionInicial(args: {
  vendedor: VendedorMin;
  rolDestino: RolInvitacion;
  encargado: VendedorMin | null;
}): string | null {
  const { vendedor, rolDestino, encargado } = args;

  if (!vendedor.activo) return "Esa cuenta está dada de baja.";
  if (vendedor.rol !== "pendiente") {
    return "Esa persona ya tenía un rol asignado. Cambialo desde Revendedores.";
  }
  if (rolDestino !== "admin" && rolDestino !== "revendedor" && rolDestino !== "coordinador") {
    return "Rol inválido.";
  }

  if (encargado) {
    if (rolDestino !== "revendedor") return "Solo una revendedora lleva coordinador.";
    if (encargado.id === vendedor.id || (encargado.rol !== "admin" && encargado.rol !== "coordinador") || !encargado.activo) {
      return "Elegí como coordinador a un admin o coordinador activo.";
    }
  }
  return null;
}

// ============================================================
// Estado de una invitación (a partir del usuario de Supabase Auth)
// ============================================================

export type UsuarioAuthResumen = {
  invited_at?: string | null;
  email_confirmed_at?: string | null;
  last_sign_in_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
};

/** Negocio de un usuario de `auth.users` — mismo criterio que el router
 * `handle_new_auth_user` (0013/0026): 'germa' va a `miel`, cualquier otro
 * valor (o ninguno) a `public` (Ananja). */
export function negocioDeUsuario(metadata: Record<string, unknown> | null | undefined): "ananja" | "germa" {
  const negocio = metadata?.negocio;
  return typeof negocio === "string" && negocio.trim() === "germa" ? "germa" : "ananja";
}

/** Invitado que todavía no terminó de entrar: nunca usó el link, o lo usó
 * pero no eligió contraseña (flag de bienvenida todavía en `true`). */
export function esInvitacionPendiente(u: UsuarioAuthResumen): boolean {
  if (!u.invited_at) return false;
  return !u.email_confirmed_at || flagCuentaActivo(u.app_metadata, u.user_metadata, FLAG_BIENVENIDA);
}

/** Solo se puede cancelar si nunca usó el link (sin email confirmado ni
 * ingreso): después de eso ya es una cuenta real. */
export function puedeCancelarInvitacion(u: UsuarioAuthResumen): boolean {
  return Boolean(u.invited_at) && !u.email_confirmed_at && !u.last_sign_in_at;
}

/**
 * Cómo reenviar: `invitar` (mismo mail de invitación, si nunca usó el
 * link), `recuperar` (usó el link pero no eligió contraseña: el mail de
 * invitación ya no sirve para un email confirmado, así que se manda el de
 * "elegí una contraseña nueva"), o `null` (ya entró normalmente).
 */
export function modoReenvio(u: UsuarioAuthResumen): "invitar" | "recuperar" | null {
  if (!u.invited_at) return null;
  if (!u.email_confirmed_at) return "invitar";
  if (flagCuentaActivo(u.app_metadata, u.user_metadata, FLAG_BIENVENIDA)) return "recuperar";
  return null;
}

/** Shell al que va una persona después de elegir su contraseña. */
export function destinoPorRol(vendedor: { rol: string; activo: boolean } | null): string {
  if (!vendedor || !vendedor.activo) return "/sin-acceso";
  if (vendedor.rol === "revendedor" || vendedor.rol === "coordinador") return "/mi";
  if (vendedor.rol === "admin") return "/";
  return "/sin-acceso";
}

// ============================================================
// Resultados de las server actions (serializables)
// ============================================================

/** Cómo se da de alta: invitación por mail, o cuenta con contraseña
 * temporal (sin mail, funciona sin SMTP configurado). */
export type ModoAlta = "invitar" | "temporal";

export type ResultadoAlta = {
  estado: "ok" | "aviso" | "error" | "ya_invitado";
  modo: ModoAlta;
  mensaje: string;
  /** Usuario ya dado de alta y sin terminar de entrar — para ofrecer
   * "Reenviar invitación" o "Generar otra contraseña temporal". */
  userId?: string;
  reintento?: "reenviar" | "nueva_temporal";
  /** Lo que se había cargado, para no perderlo si hubo error. */
  valores?: ValoresFormInvitacion;
  /** El mail falló por configuración/límite: ofrecer contraseña temporal. */
  sugerirTemporal?: boolean;
  /** Solo modo `temporal` exitoso: se muestra UNA vez, nunca se guarda. */
  credenciales?: Credenciales;
  /** Distinto en cada respuesta: remonta el formulario. */
  envio: number;
};

export type Credenciales = { email: string; password: string; mensaje: string };

export type ResultadoAccion = {
  ok: boolean;
  mensaje: string;
  /** Solo "generar otra contraseña temporal": se muestra UNA vez. */
  credenciales?: Credenciales;
};

/** `true` si es una cuenta con contraseña temporal que todavía no entró
 * nunca (se le puede generar otra contraseña temporal). */
export function esTemporalSinUsar(u: UsuarioAuthResumen): boolean {
  return (
    u.app_metadata?.[MARCA_ALTA.clave] === MARCA_ALTA.valor &&
    flagCuentaActivo(u.app_metadata, u.user_metadata, FLAG_MUST_CHANGE_PASSWORD) &&
    !u.last_sign_in_at
  );
}

/**
 * Marca en `app_metadata` (solo la puede escribir la service role, a
 * diferencia de `user_metadata`) de las cuentas creadas con contraseña
 * temporal desde "Sumar persona". "Generar otra contraseña temporal" solo
 * aplica a esas: nunca a cuentas creadas a mano (p. ej. un admin con
 * `supabase/crear-vendedor.sql`).
 */
export const MARCA_ALTA = { clave: "alta_desde", valor: "sumar_persona_temporal" } as const;

/**
 * Qué mostrar si falla "¿Olvidaste tu contraseña?", sin revelar si el
 * email tiene cuenta: `over_email_send_rate_limit` (el límite por persona
 * solo salta para emails que existen) se trata como éxito (`null`); solo
 * un 429 genérico o un error del servidor muestra un mensaje, también
 * neutro.
 */
export function mensajeErrorRecuperacion(error: ErrorAuthLike | null | undefined): string | null {
  if (!error) return null;
  if (error.code === "over_email_send_rate_limit") return null;
  const status = error.status ?? 0;
  if (error.code === "over_request_rate_limit" || status === 429) {
    return "Demasiados intentos seguidos. Esperá unos minutos y probá de nuevo.";
  }
  if (status >= 500) {
    return "No pudimos procesar el pedido. Probá de nuevo en un rato.";
  }
  return null;
}

/** Fila de la lista "Pendientes de entrar" (serializable). */
export type InvitacionPendiente = {
  userId: string;
  /** `mail`: invitación por mail sin terminar; `temporal`: cuenta con
   * contraseña temporal que nunca entró. */
  tipo: TipoPendiente;
  nombre: string;
  email: string;
  rol: string;
  /** Fecha de la invitación (mail) o de creación de la cuenta (temporal). */
  invitadaEn: string;
  /** `false` si ya no se puede cancelar (p. ej. ya usó el link del mail). */
  puedeCancelar: boolean;
};

// ============================================================
// Pendientes de entrar: clasificación y guard de cancelación
// ============================================================

export type TipoPendiente = "mail" | "temporal";

/**
 * Si un usuario de Auth va en la lista "Pendientes de entrar", y como:
 * invitación por mail sin terminar, cuenta con contraseña temporal
 * (creada desde "Sumar persona") que nunca entró, o `null` (no va).
 */
export function tipoPendiente(u: UsuarioAuthResumen): TipoPendiente | null {
  if (esInvitacionPendiente(u)) return "mail";
  if (esTemporalSinUsar(u)) return "temporal";
  return null;
}

/**
 * Guard de "Cancelar": `null` si la cuenta todavía se puede borrar; si no,
 * el mensaje. Una invitación, solo si nunca usó el link; una cuenta
 * temporal, solo si sigue marcada como de "Sumar persona" y nunca entró
 * (`esTemporalSinUsar`) — nunca una cuenta creada a mano ni una que ya se
 * usó.
 */
export function motivoNoCancelable(tipo: TipoPendiente, u: UsuarioAuthResumen): string | null {
  if (tipo === "mail") {
    return puedeCancelarInvitacion(u)
      ? null
      : "Esa persona ya usó el link, así que la invitación ya no se puede cancelar.";
  }
  return esTemporalSinUsar(u)
    ? null
    : "Esa cuenta ya se usó para entrar (o no se creó desde Sumar persona), así que no se puede cancelar.";
}

/**
 * La persona a cancelar es gestionable por quien llama: de este negocio
 * (`auth.users` es compartido con Germá), con fila activa en `vendedores`
 * y distinta del propio admin.
 */
export function esObjetivoGestionable(args: {
  deEsteNegocio: boolean;
  fila: { id: string; activo: boolean } | null;
  callerVendedorId: string;
}): boolean {
  return args.deEsteNegocio && args.fila !== null && args.fila.activo && args.fila.id !== args.callerVendedorId;
}

export const TEXTOS_CANCELAR: Record<TipoPendiente, { ok: string; error: string }> = {
  mail: { ok: "Invitación cancelada.", error: "No se pudo cancelar la invitación. Probá de nuevo." },
  temporal: { ok: "Cuenta cancelada.", error: "No se pudo cancelar la cuenta. Probá de nuevo." },
};

/** Error al borrar la fila de `vendedores`: 23503 (FK) = ya tiene
 * movimientos o es encargado de alguien. */
export function mensajeErrorBorrarCuenta(code: string | null | undefined, tipo: TipoPendiente): string {
  return code === "23503"
    ? "Ya tiene movimientos cargados o es encargado de alguien, así que no se puede borrar."
    : TEXTOS_CANCELAR[tipo].error;
}
