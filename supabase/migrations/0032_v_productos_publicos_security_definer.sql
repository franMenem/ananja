-- Apaga el advisor de seguridad `security_definer_view` (ERROR) sobre
-- `v_productos_publicos` sin romper el catálogo mínimo que ven los
-- revendedores.
--
-- Contexto: 0022_rpcs_solo_admin.sql creó esta vista SIN
-- `security_invoker` a propósito: `productos_select` en `productos` es
-- `using (es_vendedor())` (solo admin), y un revendedor necesita ver
-- `id/nombre/presentacion_ml` del catálogo sin que `productos_select` lo
-- alcance ni exponerle `costo_centavos`/`umbral_minimo`. El lint 0010 del
-- linter de Supabase marca esto como ERROR porque una vista sin
-- `security_invoker` corre con los privilegios del dueño (bypasea RLS) para
-- CUALQUIER columna que se le agregue a futuro, no solo las tres actuales.
--
-- Ponerle `security_invoker = true` a secas rompe la app: el revendedor
-- volvería a chocar contra `productos_select` y vería 0 filas.
--
-- Solución: mover el bypass de RLS a una función `security definer` bien
-- acotada (devuelve únicamente esas tres columnas) y dejar la vista en
-- `security_invoker = true` — es un simple `select *` de esa función, así
-- que ya no bypasea nada por sí misma; el lint 0010 solo mira el reloption
-- de la vista, no la cadena de llamadas.
--
-- `create or replace view` (NO `drop view`) para conservar el OID de la
-- vista. El `with (security_invoker = true)` va explícito en el propio
-- `create or replace view`: como ya documentó 0019_vistas_security_invoker
-- .sql, un `create or replace view` que no repite las reloptions previas
-- las pierde (no las conserva del `create` original).
--
-- De paso, deja prolijos los grants de la vista: 0022 hizo
-- `revoke all from anon, public` pero nunca tocó `authenticated`, que
-- quedó con INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER residuales
-- (inofensivos sobre una vista de solo lectura, pero sin motivo para
-- existir).
--
-- Migración templated (__SCHEMA__), solo se aplica a `public` (Germá/miel
-- sigue en pausa).

create or replace function __SCHEMA__.productos_publicos()
returns table (id uuid, nombre text, presentacion_ml integer)
language sql stable security definer set search_path = __SCHEMA__
as $$ select id, nombre, presentacion_ml from __SCHEMA__.productos $$;

revoke all on function __SCHEMA__.productos_publicos() from anon, public;
grant execute on function __SCHEMA__.productos_publicos() to authenticated;

create or replace view __SCHEMA__.v_productos_publicos
with (security_invoker = true) as
select id, nombre, presentacion_ml from __SCHEMA__.productos_publicos();

revoke all on __SCHEMA__.v_productos_publicos from anon, public, authenticated;
grant select on __SCHEMA__.v_productos_publicos to authenticated;
