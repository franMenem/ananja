-- Ananja: alta de un vendedor con contraseña temporal
--
-- Reemplaza el alta manual desde el dashboard de Supabase (Authentication →
-- Users → Add user) cuando se necesita fijar de entrada una contraseña
-- TEMPORAL que el vendedor tiene que cambiar en su primer login.
--
-- Convención: todo usuario creado con contraseña temporal lleva
-- `raw_app_meta_data.must_change_password = true` (fuente de verdad desde
-- el fix de seguridad 2026-09-21 — antes vivía en `raw_user_meta_data`,
-- que el propio usuario puede reescribir con
-- `supabase.auth.updateUser({ data: {...} })` desde el navegador, lo que
-- le permitía apagar el flag sin cambiar la contraseña). El proxy de la
-- app (`lib/supabase/middleware.ts`) revisa ese flag en cada request:
-- mientras esté en `true` (en `app_metadata` o, por compatibilidad con
-- cuentas viejas, en `user_metadata` — ver `flagCuentaActivo` en
-- `lib/dominio/invitaciones.ts`), cualquier ruta (salvo /cambiar-password y
-- los assets estáticos) redirige a /cambiar-password. Al guardar la nueva
-- contraseña ahí, la server action `guardarPasswordNueva`
-- (`app/(auth)/cambiar-password/actions.ts`) cambia la contraseña con la
-- sesión de la persona y, solo si eso sale bien, apaga el flag con la
-- service role — nunca el propio navegador.
--
-- El trigger `on_auth_user_created` (supabase/migrations/0007_vendedores_auth.sql)
-- crea la fila en `vendedores` automáticamente a partir de
-- `raw_user_meta_data.display_name` — no hace falta insertarla a mano acá.
--
-- ============================================================
-- CÓMO USAR
-- ============================================================
-- 1. Completá las cuatro variables en el bloque `do $$ ... $$` de abajo:
--      v_email            email de login del vendedor
--      v_password_temporal contraseña temporal (se la pasás al vendedor
--                          por un canal aparte, ej. WhatsApp; que la
--                          cambie en el primer login)
--      v_display_name      nombre que va a ver como vendedor
--      v_negocio           'ananja' (aceite de oliva, default, alta en
--                          public.vendedores) o 'germa' (miel, alta en
--                          miel.vendedores). Lo lee el router del trigger
--                          on_auth_user_created
--                          (supabase/migrations/0013_multi_negocio.sql) vía
--                          raw_user_meta_data->>'negocio'.
-- 2. Corré el script completo contra la base de producción (Supabase
--    SQL Editor, o `execute_sql` del MCP de Supabase, o
--    `supabase db execute` apuntando al proyecto).
-- 3. Repetí el bloque (o corré el script varias veces con distintos
--    valores) para dar de alta a varios vendedores en una sola pasada.
--
-- Requiere la extensión `pgcrypto` (ya habilitada en este proyecto) para
-- `crypt()`/`gen_salt()`, igual que usa Supabase Auth internamente.
--
-- NOTA: este script no reemplaza la Admin API de Supabase — es un atajo
-- SQL reproducible para altas en lote sin pasar por el dashboard uno por
-- uno. Si en algún momento se prefiere, `supabase.auth.admin.createUser()`
-- (server-side, con la service role key) hace lo mismo sin tocar
-- `auth.users` a mano.

do $$
declare
  -- ------------------------------------------------------------
  -- Completá estos cuatro valores antes de correr el script.
  --
  -- Ejemplo Ananja (aceite):
  --   v_negocio := 'ananja';  -- alta en public.vendedores
  -- Ejemplo Germá (miel):
  --   v_negocio := 'germa';   -- alta en miel.vendedores
  -- ------------------------------------------------------------
  v_email             text := 'vendedor@example.com';
  v_password_temporal text := 'CambiaEsto-2026!';
  v_display_name      text := 'Nombre del Vendedor';
  -- 'ananja' (default) o 'germa' — ver comentario más arriba.
  v_negocio           text := 'ananja';
  -- ------------------------------------------------------------

  v_user_id uuid := gen_random_uuid();
  v_now     timestamptz := now();
begin
  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'Ya existe un usuario con el email %', v_email;
  end if;

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    v_email,
    crypt(v_password_temporal, gen_salt('bf')),
    v_now,
    jsonb_build_object(
      'provider', 'email',
      'providers', jsonb_build_array('email'),
      'must_change_password', true
    ),
    jsonb_build_object(
      'display_name', v_display_name,
      'negocio', v_negocio
    ),
    v_now,
    v_now,
    '',
    '',
    '',
    ''
  );

  insert into auth.identities (
    id,
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    gen_random_uuid(),
    v_user_id::text,
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email),
    'email',
    v_now,
    v_now,
    v_now
  );

  raise notice 'Usuario % creado (id %, negocio %). El trigger on_auth_user_created ya generó su fila en vendedores con nombre "%".',
    v_email, v_user_id, v_negocio, v_display_name;
end $$;
