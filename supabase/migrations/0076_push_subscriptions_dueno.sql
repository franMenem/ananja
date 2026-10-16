-- Ananja: las suscripciones de push pasan a tener dueño, y solo reciben
-- avisos los admins activos.
--
-- El problema (hallazgo de seguridad F7, CWE-862): `/api/push/send` lee
-- TODAS las filas de `push_subscriptions` con la service role y manda el
-- aviso a cada una, sin comprobar que quien se suscribió siga siendo admin
-- activo. La tabla no guarda de quién es cada suscripción (solo `endpoint` y
-- `keys`), así que no hay forma de preguntarlo. Resultado: un admin al que se
-- le quitó el rol (o se dio de baja) sigue recibiendo en su teléfono los
-- avisos internos (gastos nuevos, stock bajo) mientras no desinstale la app.
--
-- Qué toca:
--
--  1) `push_subscriptions.vendedor_id uuid` (nullable, FK a `vendedores(id)`
--     con `on delete cascade`: si se borra a la persona, se van sus
--     dispositivos) más su índice, como hizo 0049 con otras FKs.
--
--  2) La policy de INSERT de `push_subscriptions` (la vigente es la de 0013,
--     `es_vendedor()`, que desde 0018 es un alias de `es_admin()`): conserva
--     esa condición y agrega que el `vendedor_id` que entra sea `null` o el
--     de quien inserta (`mi_vendedor_id()`). Nadie puede insertar una fila
--     atada a otra persona. El `null` se admite para que el código viejo
--     (desplegado antes de esta migración, que inserta sin dueño) siga
--     andando.
--
--  3) `public.guardar_suscripcion_push(p_endpoint, p_keys)`: función nueva,
--     security definer, solo para admins. Inserta la suscripción atada a
--     `mi_vendedor_id()` o, si el endpoint ya existe, le actualiza las claves
--     y el dueño (el mismo dispositivo ahora lo usa otra persona, o el
--     navegador rotó las claves). El dueño NUNCA es un parámetro: sale de la
--     sesión. Es la única forma de "reenlazar" un endpoint ya guardado:
--     `authenticated` tiene INSERT y DELETE sobre la tabla pero NO SELECT, y
--     un `delete ... where endpoint = ...` necesita SELECT sobre la columna
--     del WHERE, así que desde el cliente no se puede borrar y reinsertar
--     una fila existente (y tampoco hay grant de UPDATE).
--
--  4) `/api/push/send` (código) manda solo a las filas cuyo `vendedor_id`
--     pertenece a un vendedor con `rol = 'admin'` y `activo = true`.
--
-- Qué NO cambia: no se borra ninguna fila. Las suscripciones que ya existen
-- quedan con `vendedor_id = null`. Los grants de la tabla (insert y delete a
-- `authenticated`, sin select ni update) y la policy de DELETE no cambian.
-- Liberar el dispositivo al cerrar sesión (que una persona que cierra sesión
-- deje de recibir avisos en ese dispositivo) queda FUERA de este cambio.
--
-- Qué pasa con las filas existentes (leer antes de aplicar): como todas
-- quedan sin dueño, `/api/push/send` deja de mandarles avisos. Cada admin
-- vuelve a recibirlos en cada dispositivo apenas abra la app UNA vez ahí:
-- el shell de admin reenvía en silencio la suscripción del navegador a
-- `/api/push/subscribe` (con `reenlazar: true`) y la función de arriba la
-- ata a esa persona. No hay que volver a "Activar avisos". Un dispositivo
-- que nadie vuelva a abrir queda sin avisos (es lo buscado: no sabemos de
-- quién es). Opcional, MÁS ADELANTE (por ejemplo a las dos semanas), para
-- limpiar las filas que sigan sin dueño (consulta manual, no la corre esta
-- migración):
--
--   delete from public.push_subscriptions where vendedor_id is null;
--
-- Orden de despliegue: PRIMERO el código, DESPUÉS esta migración (el orden
-- habitual acá, con las migraciones aplicadas a mano). El código que la
-- acompaña anda igual contra la base todavía sin migrar: si la función no
-- existe (`PGRST202`/`42883`), `/api/push/subscribe` inserta como hasta hoy
-- (sin dueño), el reenlace silencioso responde 200 sin tocar la tabla, y
-- `/api/push/send` (que ve filas sin la clave `vendedor_id`) manda a todas
-- como hasta hoy. Al revés NO conviene: con la migración aplicada y el
-- código viejo, las suscripciones nuevas entran sin dueño y no reciben
-- avisos hasta que se despliegue el código.
--
-- Cambios de comportamiento observables:
--   a) Tras aplicar, hasta que cada admin abra la app una vez en cada
--      dispositivo, ese dispositivo no recibe avisos (ver arriba).
--   b) Un admin dado de baja o con otro rol deja de recibir avisos.
--   c) Llamar a `guardar_suscripcion_push` sin ser admin da `NO_AUTORIZADO`.
--
-- `set search_path = public` va SIN comillas a propósito: `supabase/render.mjs`
-- solo reescribe la palabra `public` pelada después de `search_path =`, no
-- `'public'` entrecomillado (ver supabase/README.md). Hardcodea `public.` en
-- vez de `__SCHEMA__.` igual que 0049–0075: esta migración es solo de Ananja.
--
-- `lib/types.ts` cambia a mano (la columna, su FK y la función); regenerarlo
-- con el generador de Supabase debería dar lo mismo.
--
-- APLICADA y verificada en producción (schema `public`) el 2026-10-16, con el
-- nombre `0076_push_subscriptions_dueno_public` (versión `20261016123315`),
-- con el código (commit cc8fbff) ya desplegado antes. Antes de aplicar se
-- comprobó que la policy de INSERT vigente era la de 0013 (`es_vendedor()`),
-- que `endpoint` tiene la restricción única `push_subscriptions_endpoint_key`,
-- que la tabla tenía 2 filas y que la función no existía. Verificada después,
-- de solo lectura, por catálogo (no por la tabla de tracking de migraciones):
-- columna `vendedor_id uuid` nullable; índice `idx_push_subscriptions_vendedor_id`;
-- FK `push_subscriptions_vendedor_id_fkey` con `on delete cascade`; policy
-- `push_subscriptions_insert` para `authenticated` con `es_vendedor() AND
-- (vendedor_id IS NULL OR vendedor_id = mi_vendedor_id())`; función
-- `guardar_suscripcion_push(text,jsonb)` security definer, `search_path =
-- public`, dueño `postgres` y sin execute para anon/public; grants de la tabla
-- sin cambios (solo INSERT y DELETE a `authenticated`). Las 2 filas existentes
-- quedaron sin dueño (0 con dueño), como estaba previsto: cada admin vuelve a
-- recibir avisos al abrir la app una vez en cada dispositivo. El schema `miel`
-- no se tocó.

-- ============================================================
-- 1) Columna del dueño + índice de la FK
-- ============================================================

alter table public.push_subscriptions
  add column if not exists vendedor_id uuid
    references public.vendedores(id) on delete cascade;

create index if not exists idx_push_subscriptions_vendedor_id
  on public.push_subscriptions (vendedor_id);

-- ============================================================
-- 2) Policy de INSERT: misma condición que 0013 + dueño nulo o propio
-- ============================================================

drop policy if exists push_subscriptions_insert on public.push_subscriptions;
create policy push_subscriptions_insert on public.push_subscriptions
  for insert to authenticated
  with check (
    public.es_vendedor()
    and (vendedor_id is null or vendedor_id = public.mi_vendedor_id())
  );

-- ============================================================
-- 3) guardar_suscripcion_push — alta o reenlace atado a quien llama
-- ============================================================

create or replace function public.guardar_suscripcion_push(
  p_endpoint text,
  p_keys jsonb
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if p_endpoint is null or p_keys is null then
    raise exception 'SUSCRIPCION_INVALIDA';
  end if;

  insert into push_subscriptions (endpoint, keys, vendedor_id)
  values (p_endpoint, p_keys, public.mi_vendedor_id())
  on conflict (endpoint) do update
    set keys = excluded.keys,
        vendedor_id = excluded.vendedor_id
  returning id into v_id;

  return json_build_object('id', v_id);
end;
$$;

revoke execute on function public.guardar_suscripcion_push(text, jsonb) from anon, public;
grant execute on function public.guardar_suscripcion_push(text, jsonb) to authenticated;

-- ============================================================
-- Verificación (solo lectura; correr DESPUÉS de aplicar)
-- ============================================================
--
--   -- a) la columna, su índice y su FK
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'push_subscriptions'
--     and column_name = 'vendedor_id';
--   -- esperado: 1 fila, uuid, YES
--
--   select indexname from pg_indexes
--   where schemaname = 'public' and tablename = 'push_subscriptions';
--   -- esperado: incluye idx_push_subscriptions_vendedor_id
--
--   select conname, confdeltype from pg_constraint
--   where conrelid = 'public.push_subscriptions'::regclass and contype = 'f';
--   -- esperado: push_subscriptions_vendedor_id_fkey, confdeltype = 'c'
--
--   -- b) la policy de insert
--   select polname, pg_get_expr(polwithcheck, polrelid)
--   from pg_policy
--   where polrelid = 'public.push_subscriptions'::regclass
--     and polname = 'push_subscriptions_insert';
--   -- esperado: es_vendedor() AND (vendedor_id IS NULL OR vendedor_id = mi_vendedor_id())
--
--   -- c) la función: una sola firma, security definer, search_path fijo
--   select p.oid::regprocedure as firma, p.prosecdef, p.proconfig, p.proacl
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'guardar_suscripcion_push';
--   -- esperado: 1 fila, prosecdef = true, proconfig = {search_path=public},
--   --   proacl con "authenticated=X/..." y sin "=X/..." ni "anon=X/..."
--
--   -- d) los grants de la tabla no cambiaron (insert y delete, sin select)
--   select grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_schema = 'public' and table_name = 'push_subscriptions'
--     and grantee = 'authenticated'
--   order by privilege_type;
--   -- esperado: DELETE e INSERT (sin SELECT ni UPDATE)
--
--   -- e) las filas existentes quedaron sin dueño (no se borró nada)
--   select count(*) as total, count(vendedor_id) as con_dueno
--   from public.push_subscriptions;
--   -- esperado justo después de aplicar: con_dueno = 0; sube a medida que
--   --   cada admin abre la app en cada dispositivo
--
--   -- f) con "Impersonate" de una revendedora o una coordinadora
--   select public.guardar_suscripcion_push('https://fcm.googleapis.com/x', '{}'::jsonb);
--   -- esperado: ERROR NO_AUTORIZADO
--
-- ============================================================
-- Rollback
-- ============================================================
--
--   drop function public.guardar_suscripcion_push(text, jsonb);
--
--   drop policy if exists push_subscriptions_insert on public.push_subscriptions;
--   create policy push_subscriptions_insert on public.push_subscriptions
--     for insert to authenticated
--     with check (public.es_vendedor());
--
--   drop index if exists public.idx_push_subscriptions_vendedor_id;
--   alter table public.push_subscriptions drop column if exists vendedor_id;
--   -- (al quitar la columna se pierde el dueño de cada fila; el código de
--   --  esta versión sigue andando: ve filas sin `vendedor_id` y manda a todas)
