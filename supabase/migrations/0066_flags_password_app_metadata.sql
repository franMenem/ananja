-- Ananja: copia a `app_metadata` los flags de contraseña obligatoria
-- (`must_change_password`, `bienvenida_pendiente`) que sigan pendientes
-- (en `true`) SOLO del lado viejo (`user_metadata`) — parte del fix de
-- seguridad "flags de contraseña obligatoria en app_metadata" (mismo
-- commit de código).
--
-- Problema que resuelve: esos dos flags vivían en
-- `auth.users.raw_user_meta_data`, que cualquier usuario autenticado puede
-- reescribir por su cuenta con `supabase.auth.updateUser({ data: {...} })`
-- desde el navegador (documentado en `AdminUserAttributes` de
-- `@supabase/auth-js`: la nota "Only a service role can modify" es la de
-- `app_metadata`, no la de `user_metadata`). Una persona con contraseña
-- temporal podía apagar el flag sin cambiar la contraseña. El código pasa
-- a escribir y (para apagarlos) SOLO poder tocar `raw_app_meta_data`
-- (`app/(app)/revendedores/invitar/actions.ts`,
-- `app/(auth)/cambiar-password/actions.ts`); el proxy
-- (`lib/supabase/middleware.ts` § `redireccionPorMetadata`, vía
-- `flagCuentaActivo` en `lib/dominio/invitaciones.ts`) sigue leyendo
-- también `user_metadata` en modo compatibilidad, para no saltearle el
-- cambio obligatorio a nadie que ya estuviera invitado con el flag viejo.
-- Esta migración pone a esas cuentas al día del lado nuevo también.
--
-- ============================================================
-- 1) Verificación PREVIA (2026-09-21, proyecto de producción,
--    schema public — SOLO LECTURA vía `execute_sql` del MCP de Supabase,
--    sin mails)
-- ============================================================
--
--   select
--     count(*) filter (where raw_app_meta_data->>'must_change_password' = 'true') as app_must_change,
--     count(*) filter (where raw_user_meta_data->>'must_change_password' = 'true') as user_must_change,
--     count(*) filter (where raw_app_meta_data->>'bienvenida_pendiente' = 'true') as app_bienvenida,
--     count(*) filter (where raw_user_meta_data->>'bienvenida_pendiente' = 'true') as user_bienvenida,
--     count(*) filter (
--       where raw_user_meta_data->>'must_change_password' = 'true'
--         and coalesce(raw_app_meta_data->>'must_change_password', '') <> 'true'
--     ) as pendiente_migrar_must_change,
--     count(*) filter (
--       where raw_user_meta_data->>'bienvenida_pendiente' = 'true'
--         and coalesce(raw_app_meta_data->>'bienvenida_pendiente', '') <> 'true'
--     ) as pendiente_migrar_bienvenida,
--     count(*) as total_usuarios
--   from auth.users;
--
--   Resultado real (2026-09-21): 7 usuarios en total en `auth.users`, y 0
--   con cualquiera de los dos flags en `true` en NINGÚN lado (ni
--   `user_metadata` ni `app_metadata`) — hoy no hay ninguna cuenta con el
--   cambio de contraseña pendiente. Esta migración queda escrita igual,
--   como red de seguridad para cualquier invitación que se mande con el
--   código VIEJO en la ventana entre esta migración y el deploy del código
--   nuevo (el orden de los dos no importa, ver el comentario de más abajo),
--   o para cualquier caso futuro que se nos escape. Es idempotente:
--   aplicarla de nuevo cuando ya no queda ningún pendiente no cambia nada.
--
-- ============================================================
-- 2) Copia — solo donde el flag está en `true` del lado viejo Y todavía no
--    está en `true` del lado nuevo (nunca pisa un `false` real ni togglea
--    nada que el código ya haya puesto bien)
-- ============================================================

update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('must_change_password', true)
where raw_user_meta_data->>'must_change_password' = 'true'
  and coalesce(raw_app_meta_data->>'must_change_password', '') <> 'true';

update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('bienvenida_pendiente', true)
where raw_user_meta_data->>'bienvenida_pendiente' = 'true'
  and coalesce(raw_app_meta_data->>'bienvenida_pendiente', '') <> 'true';

-- ============================================================
-- Verificación POSTERIOR
-- ============================================================
--
--   Repetir el SELECT de la sección 1: `pendiente_migrar_must_change` y
--   `pendiente_migrar_bienvenida` deben dar 0. `app_must_change`/
--   `app_bienvenida` deben quedar en al menos el mismo valor que
--   `user_must_change`/`user_bienvenida` tenían antes de correr esto (esta
--   migración solo agrega, nunca saca de `app_metadata`).
--
-- ============================================================
-- Rollback (saca de `app_metadata` solo lo que esta migración agregó ahí;
-- no toca `user_metadata`, que esta migración tampoco tocó)
-- ============================================================
--
--   update auth.users
--   set raw_app_meta_data = raw_app_meta_data - 'must_change_password'
--   where raw_user_meta_data->>'must_change_password' = 'true';
--
--   update auth.users
--   set raw_app_meta_data = raw_app_meta_data - 'bienvenida_pendiente'
--   where raw_user_meta_data->>'bienvenida_pendiente' = 'true';
--
-- Un rollback completo de la FUNCIONALIDAD (no solo de esta migración)
-- también implicaría volver el código a escribir/apagar estos flags en
-- `user_metadata`, no solo revertir este SQL.
--
-- ============================================================
-- Despliegue en cualquier orden (código y SQL son independientes)
-- ============================================================
--
-- SQL antes que el código: no cambia nada visible todavía (el código viejo
-- sigue leyendo/escribiendo `user_metadata` como si nada); simplemente dos
-- cuentas viejas ya quedan con el flag también en `app_metadata` de
-- antemano.
-- Código antes que el SQL: el código nuevo YA lee ambos lados
-- (`flagCuentaActivo`), así que una cuenta invitada antes del deploy
-- (flag solo en `user_metadata`) se sigue redirigiendo bien mientras tanto
-- — y, si esa persona termina de elegir contraseña ANTES de correr esta
-- migración, `guardarPasswordNueva` apaga el flag en los DOS lados de una,
-- así que no queda nada pendiente para que la migración copie. La
-- migración solo hace falta para cuentas que quedaron a mitad de camino
-- (invitadas, todavía sin terminar) en el momento exacto del deploy.
--
-- ============================================================
-- TODO(0066): una vez aplicada esta migración en prod y pasado un tiempo
-- prudencial (para cubrir cualquier invitación vieja que siga sin
-- terminar), se puede sacar la lectura de compatibilidad de
-- `user_metadata` — punto único: `flagCuentaActivo` en
-- `lib/dominio/invitaciones.ts` — y dejar `app_metadata` como única
-- fuente en todo el código que la usa (`lib/supabase/middleware.ts`,
-- `lib/dominio/invitaciones.ts` § `esInvitacionPendiente`/`modoReenvio`/
-- `esTemporalSinUsar`, `app/(auth)/bienvenida/page.tsx`,
-- `app/(auth)/cambiar-password/page.tsx`).
--
-- SIN APLICAR: queda para que Fran la aplique cuando decida (SQL Editor o
-- `supabase db push`, igual que 0063/0064/0065 recientes).
