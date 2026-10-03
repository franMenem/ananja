-- Ananja/Germá: soporte multi-negocio (templated __SCHEMA__ / __BUCKET__)
--
-- Esta migración se escribe UNA vez y se aplica en cada negocio del mismo
-- proyecto Supabase: hoy `public` (Ananja, aceite de oliva) y `miel`
-- (Germá, miel). Ver supabase/README.md para la convención completa y el
-- orden de aplicación (repetido al final de este archivo).
--
-- Nota de numeración: el archivo se llama 0013 (no 0011) porque
-- `0011_ferias.sql` / `0012_ferias_validar_feria.sql` ya existían en el
-- repo (feature de ferias, aplicada solo sobre `public`) cuando se escribió
-- esta migración. Esas dos migraciones ya están templated (__SCHEMA__,
-- misma convención que 0001-0010); esta migración endurece sus 5 policies
-- `using (true)` igual que a las demás (ver punto b).
--
-- Alcance:
--  a) productos.presentacion_ml dejar de estar acotado a (250, 500): ahora
--     es la presentación numérica en la unidad del negocio (ml para
--     aceite, g para miel), solo debe ser positiva.
--  b) RLS: reemplaza las policies `using (true)` (hoy cualquier
--     `authenticated` ve/edita todo, sin distinguir negocio) por
--     `__SCHEMA__.es_vendedor()`, que exige una fila propia y activa en
--     `vendedores`. Aplica también a `ferias`/`feria_productos` (0011) y a
--     las 2 policies de storage.objects.
--  c) Grants a nivel schema, necesarios para que PostgREST/RLS funcionen en
--     un schema nuevo (en `public` ya existen por default del proyecto).
--  d) (solo-public) Router del trigger de alta automática de vendedor:
--     `auth.users` es compartido entre negocios, así que solo puede haber
--     UNA función/trigger global; ahora lee
--     `raw_user_meta_data->>'negocio'` para decidir en qué schema insertar.

-- ============================================================
-- a) productos.presentacion_ml: presentación numérica genérica
-- ============================================================

alter table productos drop constraint if exists productos_presentacion_ml_check;
alter table productos add constraint productos_presentacion_ml_check
  check (presentacion_ml > 0);

comment on column productos.presentacion_ml is
  'Presentación numérica en la unidad propia del negocio (ml para el '
  'aceite de oliva de Ananja, g para la miel de Germá). Se conserva el '
  'nombre de columna "presentacion_ml" por compatibilidad entre negocios '
  '(evita renombrar la columna y todo lo que la referencia).';

-- ============================================================
-- b) RLS: función es_vendedor() + endurecer todas las policies
-- ============================================================

create function __SCHEMA__.es_vendedor()
returns boolean
language sql
stable
security definer
set search_path = __SCHEMA__
as $$
  select exists (
    select 1 from vendedores where user_id = auth.uid() and activo
  );
$$;

revoke execute on function __SCHEMA__.es_vendedor() from public, anon;
grant execute on function __SCHEMA__.es_vendedor() to authenticated;

-- ------------------------------------------------------------
-- vendedores: se preserva el acceso a la fila propia (user_id = auth.uid())
-- además de es_vendedor(), para que el flujo de primer login / cambio de
-- contraseña (supabase/crear-vendedor.sql, lib/supabase/middleware.ts) siga
-- funcionando incluso si, por lo que sea, es_vendedor() no diera true.
-- ------------------------------------------------------------

drop policy if exists vendedores_select on vendedores;
create policy vendedores_select on vendedores for select to authenticated
  using (user_id = auth.uid() or __SCHEMA__.es_vendedor());

drop policy if exists vendedores_update on vendedores;
create policy vendedores_update on vendedores for update to authenticated
  using (user_id = auth.uid() or __SCHEMA__.es_vendedor())
  with check (user_id = auth.uid() or __SCHEMA__.es_vendedor());

-- ------------------------------------------------------------
-- productos
-- ------------------------------------------------------------

drop policy if exists productos_select on productos;
create policy productos_select on productos for select to authenticated
  using (__SCHEMA__.es_vendedor());

drop policy if exists productos_update on productos;
create policy productos_update on productos for update to authenticated
  using (__SCHEMA__.es_vendedor()) with check (__SCHEMA__.es_vendedor());

-- ------------------------------------------------------------
-- categorias_gasto
-- ------------------------------------------------------------

drop policy if exists categorias_gasto_select on categorias_gasto;
create policy categorias_gasto_select on categorias_gasto for select to authenticated
  using (__SCHEMA__.es_vendedor());

drop policy if exists categorias_gasto_insert on categorias_gasto;
create policy categorias_gasto_insert on categorias_gasto for insert to authenticated
  with check (__SCHEMA__.es_vendedor());

drop policy if exists categorias_gasto_update on categorias_gasto;
create policy categorias_gasto_update on categorias_gasto for update to authenticated
  using (__SCHEMA__.es_vendedor()) with check (__SCHEMA__.es_vendedor());

-- ------------------------------------------------------------
-- cajas
-- ------------------------------------------------------------

drop policy if exists cajas_select on cajas;
create policy cajas_select on cajas for select to authenticated
  using (__SCHEMA__.es_vendedor());

drop policy if exists cajas_update on cajas;
create policy cajas_update on cajas for update to authenticated
  using (__SCHEMA__.es_vendedor()) with check (__SCHEMA__.es_vendedor());

-- ------------------------------------------------------------
-- comprobantes
-- ------------------------------------------------------------

drop policy if exists comprobantes_select on comprobantes;
create policy comprobantes_select on comprobantes for select to authenticated
  using (__SCHEMA__.es_vendedor());

drop policy if exists comprobantes_delete on comprobantes;
create policy comprobantes_delete on comprobantes for delete to authenticated
  using (__SCHEMA__.es_vendedor());

-- ------------------------------------------------------------
-- comprobante_items
-- ------------------------------------------------------------

drop policy if exists comprobante_items_select on comprobante_items;
create policy comprobante_items_select on comprobante_items for select to authenticated
  using (__SCHEMA__.es_vendedor());

drop policy if exists comprobante_items_delete on comprobante_items;
create policy comprobante_items_delete on comprobante_items for delete to authenticated
  using (__SCHEMA__.es_vendedor());

-- ------------------------------------------------------------
-- movimientos_stock (el insert conserva la condición original:
-- comprobante_id is null; se le suma es_vendedor())
-- ------------------------------------------------------------

drop policy if exists movimientos_stock_select on movimientos_stock;
create policy movimientos_stock_select on movimientos_stock for select to authenticated
  using (__SCHEMA__.es_vendedor());

drop policy if exists movimientos_stock_insert on movimientos_stock;
create policy movimientos_stock_insert on movimientos_stock for insert to authenticated
  with check (comprobante_id is null and __SCHEMA__.es_vendedor());

-- ------------------------------------------------------------
-- gastos
-- ------------------------------------------------------------

drop policy if exists gastos_select on gastos;
create policy gastos_select on gastos for select to authenticated
  using (__SCHEMA__.es_vendedor());

drop policy if exists gastos_update on gastos;
create policy gastos_update on gastos for update to authenticated
  using (__SCHEMA__.es_vendedor()) with check (__SCHEMA__.es_vendedor());

drop policy if exists gastos_delete on gastos;
create policy gastos_delete on gastos for delete to authenticated
  using (__SCHEMA__.es_vendedor());

-- ------------------------------------------------------------
-- ajustes_caja
-- ------------------------------------------------------------

drop policy if exists ajustes_caja_select on ajustes_caja;
create policy ajustes_caja_select on ajustes_caja for select to authenticated
  using (__SCHEMA__.es_vendedor());

-- ------------------------------------------------------------
-- notificaciones
-- ------------------------------------------------------------

drop policy if exists notificaciones_select on notificaciones;
create policy notificaciones_select on notificaciones for select to authenticated
  using (__SCHEMA__.es_vendedor());

-- ------------------------------------------------------------
-- push_subscriptions
-- ------------------------------------------------------------

drop policy if exists push_subscriptions_insert on push_subscriptions;
create policy push_subscriptions_insert on push_subscriptions for insert to authenticated
  with check (__SCHEMA__.es_vendedor());

drop policy if exists push_subscriptions_delete on push_subscriptions;
create policy push_subscriptions_delete on push_subscriptions for delete to authenticated
  using (__SCHEMA__.es_vendedor());

-- ------------------------------------------------------------
-- clientes
-- ------------------------------------------------------------

drop policy if exists clientes_select on clientes;
create policy clientes_select on clientes for select to authenticated
  using (__SCHEMA__.es_vendedor());

drop policy if exists clientes_insert on clientes;
create policy clientes_insert on clientes for insert to authenticated
  with check (__SCHEMA__.es_vendedor());

drop policy if exists clientes_update on clientes;
create policy clientes_update on clientes for update to authenticated
  using (__SCHEMA__.es_vendedor()) with check (__SCHEMA__.es_vendedor());

-- ------------------------------------------------------------
-- lotes_produccion
-- ------------------------------------------------------------

drop policy if exists lotes_produccion_select on lotes_produccion;
create policy lotes_produccion_select on lotes_produccion for select to authenticated
  using (__SCHEMA__.es_vendedor());

-- ------------------------------------------------------------
-- ferias / feria_productos (0011_ferias.sql). Grants por tabla/columna ya
-- son explícitos ahí (no dependen de defaults), no hay nada que agregar acá
-- salvo endurecer las 5 policies `using (true)`.
-- ------------------------------------------------------------

drop policy if exists ferias_select on ferias;
create policy ferias_select on ferias for select to authenticated
  using (__SCHEMA__.es_vendedor());

drop policy if exists ferias_update on ferias;
create policy ferias_update on ferias for update to authenticated
  using (__SCHEMA__.es_vendedor()) with check (__SCHEMA__.es_vendedor());

drop policy if exists ferias_delete on ferias;
create policy ferias_delete on ferias for delete to authenticated
  using (__SCHEMA__.es_vendedor());

drop policy if exists feria_productos_select on feria_productos;
create policy feria_productos_select on feria_productos for select to authenticated
  using (__SCHEMA__.es_vendedor());

drop policy if exists feria_productos_update on feria_productos;
create policy feria_productos_update on feria_productos for update to authenticated
  using (__SCHEMA__.es_vendedor()) with check (__SCHEMA__.es_vendedor());

-- ------------------------------------------------------------
-- storage.objects: bucket propio del negocio (__BUCKET__) + es_vendedor().
-- La creación del bucket queda en 0003_rls_seeds.sql (templated con
-- __BUCKET__); no se repite acá.
--
-- storage.objects es una tabla GLOBAL (una sola, compartida por todos los
-- negocios de este proyecto) y los nombres de policy son únicos POR TABLA,
-- no por schema. Por eso ya no se reutilizan los nombres
-- comprobantes_storage_insert/select (0003 los crea, @solo-public, SOLO
-- para public): si esta migración los recreara con el mismo nombre para
-- cada negocio, el segundo negocio renderizado pisaría/rompería la policy
-- del primero (drop policy + create policy con el mismo nombre pero otro
-- bucket_id). Las nuevas policies llevan __SCHEMA__ en el nombre
-- (storage_insert_<schema> / storage_select_<schema>) para que cada
-- negocio tenga las suyas, coexistiendo en la misma tabla.
-- ------------------------------------------------------------

-- Limpieza de los nombres viejos: solo existieron en public (creados por
-- 0003 dentro de @solo-public), así que el drop también va @solo-public;
-- para cualquier otro negocio es un no-op (if exists).
-- @solo-public:inicio
drop policy if exists comprobantes_storage_insert on storage.objects;
drop policy if exists comprobantes_storage_select on storage.objects;
-- @solo-public:fin

drop policy if exists storage_insert___SCHEMA__ on storage.objects;
create policy storage_insert___SCHEMA__ on storage.objects
  for insert to authenticated
  with check (bucket_id = '__BUCKET__' and __SCHEMA__.es_vendedor());

drop policy if exists storage_select___SCHEMA__ on storage.objects;
create policy storage_select___SCHEMA__ on storage.objects
  for select to authenticated
  using (bucket_id = '__BUCKET__' and __SCHEMA__.es_vendedor());

-- ============================================================
-- c) Grants a nivel schema (PostgREST necesita usage además de los grants
--    por tabla que ya hacen 0001-0010 templated)
-- ============================================================

grant usage on schema __SCHEMA__ to authenticated, anon;

-- ============================================================
-- d) Router del trigger de alta automática de vendedor (auth.users es
--    compartido entre negocios: solo puede existir UNA función/trigger
--    global, por eso este bloque es @solo-public y reemplaza el cuerpo de
--    la función creada en 0007_vendedores_auth.sql).
--
--    Usa `execute format(...)` con el nombre de schema como dato dinámico
--    (nunca `miel.` a secas en el cuerpo de la función) para tolerar que el
--    schema del negocio todavía no exista al momento de crear/actualizar
--    esta función (p. ej. al aplicar esta migración en `public` ANTES de
--    crear el schema `miel`): si la tabla destino no existe, se guarda un
--    warning y no falla el alta del usuario en auth.users.
-- ============================================================

-- @solo-public:inicio
create or replace function __SCHEMA__.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_nombre text;
  v_negocio text;
  v_schema text;
begin
  v_negocio := coalesce(nullif(btrim(new.raw_user_meta_data->>'negocio'), ''), 'ananja');
  v_nombre := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'display_name'), ''),
    split_part(new.email, '@', 1)
  );

  v_schema := case v_negocio
    when 'germa' then 'miel'
    else 'public'
  end;

  if to_regclass(format('%I.vendedores', v_schema)) is null then
    raise warning
      'handle_new_auth_user: schema % (negocio %) sin tabla vendedores todavia; no se crea vendedor para user %',
      v_schema, v_negocio, new.id;
    return new;
  end if;

  begin
    execute format(
      'insert into %I.vendedores (nombre, user_id, activo) values ($1, $2, true) on conflict (user_id) do nothing',
      v_schema
    ) using v_nombre, new.id;
  exception
    when unique_violation then
      -- El nombre ya lo usa otro vendedor de ese negocio (ej. alta manual
      -- previa con el mismo nombre): se agrega un sufijo corto del id para
      -- no bloquear el alta del usuario en auth.users.
      execute format(
        'insert into %I.vendedores (nombre, user_id, activo) values ($1, $2, true) on conflict (user_id) do nothing',
        v_schema
      ) using v_nombre || ' (' || substr(new.id::text, 1, 4) || ')', new.id;
  end;

  return new;
end;
$$;
-- @solo-public:fin

-- ============================================================
-- e) Orden de aplicación en producción
-- ============================================================
--
-- 1. Aplicar este archivo (0013_multi_negocio.sql) renderizado con
--    --schema public --bucket comprobantes sobre el proyecto actual
--    (Ananja ya en public, migraciones 0001-0012 -incluye ferias- ya
--    aplicadas).
-- 2. Renderizar 0001-0013 completo (sin lista explícita de archivos: el
--    render por default toma TODAS las .sql de supabase/migrations/ en
--    orden) con --schema miel --bucket comprobantes-miel y aplicarlo (crea
--    el schema miel desde cero con todas las tablas/vistas/RPCs/RLS,
--    Ferias incluida).
-- 3. Aplicar el seed de miel: supabase/negocios/miel.seed.sql (schema
--    miel ya con search_path correcto, o anteponer `set search_path to
--    miel;`).
-- 4. Pasos manuales (una vez por negocio nuevo; ver supabase/README.md,
--    sección "Cómo aplicar en cada schema", para el detalle y la
--    advertencia sobre administrar esto por SQL en vez del dashboard):
--    a. Exposed schemas: agregar `miel` (además de `public`) para que
--       PostgREST lo sirva. En producción se hizo por SQL
--       (`alter role authenticator set pgrst.db_schemas = 'public,
--       graphql_public, miel'; notify pgrst, 'reload config';`) en vez de
--       Project Settings → API → Exposed schemas del dashboard.
--    b. Database → Replication (Realtime): confirmar que
--       `miel.notificaciones` quedó agregada a la publicación
--       supabase_realtime (0005_realtime.sql, vía search_path) y que el
--       toggle de Realtime está activo para esa tabla igual que para
--       public.notificaciones.
--    c. Crear el bucket... ya lo hace 0003 templated (paso 2); verificar
--       en Storage que "comprobantes-miel" quedó creado y privado.
--    d. Dar de alta el primer vendedor de Germá con
--       supabase/crear-vendedor.sql (negocio = 'germa') y confirmar que
--       aparece en miel.vendedores (vía el trigger router de este
--       archivo).
