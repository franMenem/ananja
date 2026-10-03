# Mails de la app (Supabase Auth) — guía paso a paso

Esta carpeta tiene los mails con la marca de Ananja que manda Supabase:
invitación, recuperar contraseña, link mágico, cambio de email y confirmar
registro. Todo se configura **una sola vez** en el dashboard de Supabase,
en tu proyecto de Supabase.

> **¿Todavía no configuraste los mails?** No hace falta para empezar. En
> la app, **Revendedores → + Sumar persona → "Contraseña temporal (sin
> mail)"** crea la cuenta al instante y te muestra un mensaje listo para
> mandar por WhatsApp. La invitación por mail y "¿Olvidaste tu
> contraseña?" necesitan los pasos de abajo.

Orden recomendado: **1 → 2 → 3 → 4 → 5 → 6**, y recién ahí invitar a
alguien por mail. Si invitás antes del paso 4, el link del mail no va a
funcionar con la app.

---

## 1. Envío de mails (SMTP) con Brevo

Supabase trae un envío de prueba que solo manda mails al equipo del
proyecto y muy pocos por hora. Para mandarle mails a cualquier persona hay
que conectar un servicio de mails. Usamos **Brevo**, la misma cuenta que
ya usás en el proyecto RegistroAPP.

### 1.1 Datos que necesitás de Brevo

1. Entrá a Brevo → menú de tu cuenta → **SMTP & API** → pestaña **SMTP**.
2. Anotá:
   - **SMTP server**: `smtp-relay.brevo.com`
   - **Port**: `587`
   - **Login**: tu usuario SMTP (algo como `xxxxxx@smtp-brevo.com`).
   - **SMTP key**: si no tenés una a mano, **Generate a new SMTP key**
     (se muestra una sola vez; copiala).
   - Podés usar exactamente los mismos valores que cargaste en
     RegistroAPP (Supabase → proyecto RegistroAPP → Authentication → SMTP
     Settings). La clave no se ve ahí: si no la guardaste, generá una
     nueva en Brevo.
3. Remitente: en Brevo → **Senders, Domains & Dedicated IPs** →
   **Senders**, tiene que figurar como verificado el email que va a mandar
   (puede ser el mismo Gmail que usás en RegistroAPP).

### 1.2 Cargarlo en Supabase

1. Supabase → tu proyecto → **Authentication** → **Emails** →
   pestaña **SMTP Settings** (en algunas versiones del dashboard está en
   *Project Settings → Authentication → SMTP Settings*).
2. Activá **Enable custom SMTP**.
3. Completá:

   | Campo | Valor |
   |---|---|
   | Sender email address | el remitente verificado en Brevo (ej. tu Gmail) |
   | Sender name | `Ananja` |
   | Host | `smtp-relay.brevo.com` |
   | Port number | `587` |
   | Username | tu **Login** SMTP de Brevo |
   | Password | tu **SMTP key** de Brevo (la pegás vos, no la compartas) |
   | Minimum interval between emails | dejá el valor que trae (60 segundos) |

4. **Save**.

### 1.3 Cosas a tener en cuenta

- **Límite de Brevo gratis**: unos **300 mails por día** (entre todos tus
  proyectos que usen esa cuenta). Para Ananja alcanza de sobra.
- **Spam**: como el remitente es un Gmail y no un dominio propio, algunos
  mails pueden caer en spam. Cuando invites a alguien, avisale: *"te llegó
  un mail de Ananja, fijate en spam y marcalo como 'no es spam'"*.
- **Mejor a futuro**: verificar un dominio propio (ej. `ananja.co`) en
  Brevo (Senders, Domains → Domains → Add a domain, y cargar los registros
  DNS que te da) y cambiar el remitente a algo como `hola@ananja.co`. Eso
  mejora mucho la llegada a la bandeja de entrada.

### Alternativa: Resend (con dominio propio)

Si algún día preferís Resend: verificá el dominio en Resend (Domains → Add
domain + registros DNS), creá una API key y en Supabase usá Host
`smtp.resend.com`, Port `465`, Username `resend`, Password = la API key,
Sender `Ananja <hola@ananja.co>`.

---

## 2. Subir el límite de mails de Supabase

Aunque Brevo permita más, Supabase tiene su propio tope de mails por hora.

1. Supabase → **Authentication** → **Rate Limits**.
2. **Rate limit for sending emails**: subilo a **100 por hora** (con el
   SMTP propio activado ya se puede editar).
3. **Save changes**.

Si en la app aparece *"Se mandaron demasiados mails en poco tiempo"*, es
este límite (o el de 60 segundos por persona): esperá unos minutos.

---

## 3. Direcciones del sitio (URL Configuration)

1. Supabase → **Authentication** → **URL Configuration**.
2. **Site URL**: `https://ananja.example.com` → Save.
3. **Redirect URLs** → **Add URL**, agregá:
   - `https://ananja.example.com/**` (la app de verdad).
   - `http://localhost:3000/**` — **solo para desarrollo** (probar la app
     en una compu). No hace falta para usar la app; si nadie programa en
     local, podés no agregarla.
4. Save.

Los links de los mails usan la **Site URL**: aunque pruebes la app en tu
compu, el link del mail abre la app de producción.

Al tocar el botón del mail se abre una pantalla de Ananja con un botón
**Continuar**: recién al tocarlo se usa el link. Es a propósito — algunos
antivirus de mail (por ejemplo el de Outlook) abren los links solos, y sin
ese paso "gastarían" la invitación antes de que la persona la vea.

---

## 4. Plantillas de los mails

1. Supabase → **Authentication** → **Emails** → pestaña **Templates**.
2. Para cada fila de la tabla: elegí la plantilla, pegá el **Subject**,
   y en **Message body** borrá todo y pegá el contenido completo del
   archivo (abrilo en GitHub → botón *Raw* → seleccionar todo → copiar).
   Save en cada una.

| Plantilla en Supabase | Archivo | Subject |
|---|---|---|
| **Invite user** | `invite.html` | `Te invitamos a usar la app de Ananja` |
| **Reset Password** | `recovery.html` | `Elegí una contraseña nueva para Ananja` |
| **Magic Link** | `magic-link.html` | `Tu link para entrar a Ananja` |
| **Change Email Address** | `email-change.html` | `Confirmá tu nuevo email en Ananja` |
| **Confirm signup** | `confirm-signup.html` | `Confirmá tu email para Ananja` |

No cambies lo que está entre `{{ }}` (por ejemplo `{{ .TokenHash }}`):
Supabase lo reemplaza por los datos de cada persona. Todos los botones
llevan a `https://ananja.example.com/auth/confirm?...`, que es la pantalla
de la app que valida el link.

La plantilla **Reauthentication** (código numérico) no se usa en la app;
podés dejarla como está.

---

## 5. Cuánto dura el link

Los mails dicen que el link **vence en 24 horas**. Para que sea así:

1. Supabase → **Authentication** → **Sign In / Providers** → **Email**
   (en versiones anteriores: *Providers → Email*).
2. **Email OTP Expiration**: `86400` (segundos = 24 horas, el máximo que
   permite Supabase).
3. Save.

Supabase va a mostrar un aviso de que un vencimiento de más de una hora
es menos seguro. Es esperable: para una invitación, 24 horas le da tiempo
a la persona de verla, y cada link igual sirve **una sola vez**. Si
preferís algo más corto (por ejemplo `3600` = 1 hora), está bien, pero
entonces cambiá en las cinco plantillas la frase *"el link vence en 24
horas"* por *"el link vence en 1 hora"*, para que el mail no diga algo
distinto de lo que pasa.

---

## 6. Variables en Vercel

En Vercel → proyecto **ananja** → Settings → Environment Variables:

- `SUPABASE_SERVICE_ROLE_KEY` — ya está cargada. La usa "Sumar persona"
  para crear cuentas. Nunca la compartas ni la pongas con `NEXT_PUBLIC_`.
- **Agregá** `NEXT_PUBLIC_SITE_URL` = `https://ananja.example.com`
  (entorno Production). Es la dirección que va en los links de
  recuperación de contraseña y en el mensaje de WhatsApp de la contraseña
  temporal. Sin ella la app usa la dirección desde la que se abrió (por
  ejemplo un link de preview de Vercel), que puede no ser la que querés
  mandar. Después de agregarla, volvé a deployar (Deployments → el último →
  Redeploy).

---

## 7. Probar

1. En la app: **Revendedores → + Sumar persona → Invitación por mail**,
   con un email tuyo que no tenga cuenta (por ejemplo un alias
   `tunombre+prueba@gmail.com`).
2. Revisá bandeja de entrada y spam. Tocá **Elegí tu contraseña**: abre
   una pantalla de Ananja con **Continuar**; al tocarlo tiene que llevarte
   a **/bienvenida**, saludarte por tu nombre y pedirte la contraseña.
3. Cerrá sesión y probá **¿Olvidaste tu contraseña?** en la pantalla de
   ingreso.
4. La prueba queda en **Invitaciones por mail pendientes** hasta que
   elijas la contraseña; si no la vas a usar, **Cancelar invitación**.

## Cómo funciona (para quien mantenga el código)

- Links de los mails → `app/auth/confirm/page.tsx`. El GET NO consume el
  token: muestra "Continuar", que hace POST a la server action
  `app/auth/confirm/actions.ts` (`verifyOtp` con `token_hash` + `type`, o
  `exchangeCodeForSession` con `code`) y redirige a `next` solo si, ya
  normalizado, es una ruta relativa del mismo sitio (`normalizarNext`).
  El proxy (`lib/supabase/middleware.ts`) deja pasar `/auth/confirm` sin
  redirects.
- "Generar otra contraseña temporal" solo aplica a cuentas con la marca
  `app_metadata.alta_desde = sumar_persona_temporal` (la pone
  `createUser`; un usuario no puede escribir su `app_metadata`).
- Invitación → `app_metadata.bienvenida_pendiente = true` → el proxy fuerza
  `/bienvenida` hasta que elige contraseña. Contraseña temporal →
  `app_metadata.must_change_password = true` → el proxy fuerza
  `/cambiar-password` en el primer ingreso. Fuente de verdad desde el fix
  de seguridad 2026-09-21 (antes vivían en `user_metadata`, editable por el
  propio usuario); el proxy sigue leyendo también `user_metadata` por
  compatibilidad con cuentas invitadas antes de ese fix (ver
  `flagCuentaActivo` en `lib/dominio/invitaciones.ts` y la migración
  `0066_flags_password_app_metadata.sql`). Se apagan con la server action
  `guardarPasswordNueva` (`app/(auth)/cambiar-password/actions.ts`), nunca
  desde el navegador.
- Alta, reenvío y cancelación: server actions en
  `app/(app)/revendedores/invitar/actions.ts` (service role, solo admins).
- Las plantillas se generaron con un script aparte; si las editás a mano,
  mantené el HTML con tablas y estilos inline (los clientes de mail no
  soportan CSS moderno) y probalas en Gmail web y en el celular.
