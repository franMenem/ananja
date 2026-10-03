-- Ananja/Germá: rol `pendiente` + espacio de revendedor para admins.
--
-- Decisiones de negocio (ya tomadas por Fran):
--  1. Un usuario nuevo (alta por Supabase Auth, `handle_new_auth_user`) ya
--     no arranca en `admin`: queda `pendiente` (sin acceso, `/sin-acceso`)
--     hasta que un admin lo aprueba desde `/revendedores` ("Hacer
--     revendedor" / "Hacer admin" / "Rechazar").
--  2. Un admin NUNCA puede pasar a revendedor (perdería su propio acceso
--     de admin). En cambio, un admin puede tener su PROPIO espacio de
--     revendedor (`revende = true`, habilitado por otro admin — o por sí
--     mismo): opera como revendedor de sus propios datos (mismo
--     `vendedores.id`) entrando a `/mi` con "Ver como revendedor", y
--     vuelve a `/` con "Ver como admin".
--
-- Esta migración NO toca `es_revendedor()` (sigue siendo `rol =
-- 'revendedor'` estricto — la RLS y las garantías de 0022 sobre "solo
-- admin" quedan intactas) ni `es_admin()` (sigue siendo `rol = 'admin'`
-- estricto). Agrega `puede_revender()` como el criterio ancho ("puede
-- operar el shell de revendedor con sus propios datos": revendedor, o
-- admin con `revende`) para los RPCs de escritura del propio revendedor.
--
-- Migración templated (__SCHEMA__, sin __BUCKET__). El router de alta
-- automática (`handle_new_auth_user`) vive únicamente en `public`
-- (`auth.users` es compartido entre negocios, ver 0013_multi_negocio.sql
-- § d) — su redefinición va en un bloque `@solo-public`, igual que 0013.
--
-- Alcance:
--  1. vendedores: rol admite 'pendiente' (nuevo default), + revende
--     boolean, + email/creado_en (backfill desde auth.users).
--  2. handle_new_auth_user() (@solo-public): inserta también email y
--     creado_en; ya no fija rol explícito (default de columna =
--     'pendiente').
--  3. Nuevo helper puede_revender().
--  4. asignar_rol_revendedor: transiciones acotadas (pendiente→revendedor,
--     pendiente→admin, revendedor→admin) + ADMIN_NO_REVENDEDOR.
--  5. Nuevo RPC rechazar_pendiente.
--  6. Nuevo RPC fijar_espacio_revendedor.
--  7. registrar_venta_revendedor: puede_revender() en vez de
--     es_revendedor().
--  8. registrar_entrega_revendedor, registrar_rendicion,
--     fijar_precio_revendedor: el chequeo de "es un revendedor válido"
--     ahora también acepta admin con revende.
--  9. v_resumen_revendedor: incluye admins con revende.

-- ============================================================
-- 1) vendedores: rol + revende + email + creado_en
-- ============================================================

-- El check de `rol` se agregó inline en 0018_revendedores.sql (`alter
-- table vendedores add column rol text not null default 'admin' check
-- (rol in ('admin', 'revendedor'))`), así que Postgres le puso el nombre
-- default `vendedores_rol_check` — se busca dinámicamente en vez de
-- asumirlo, por si alguna aplicación manual lo hubiera dejado con otro
-- nombre.
do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'vendedores'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%rol%';

  if v_constraint_name is not null then
    execute format('alter table vendedores drop constraint %I', v_constraint_name);
  end if;
end $$;

-- Filas existentes (los 4 admins actuales de cada negocio) ya tienen
-- `rol = 'admin'` explícito — el nuevo default solo afecta altas futuras.
alter table vendedores alter column rol set default 'pendiente';

alter table vendedores
  add constraint vendedores_rol_check check (rol in ('admin', 'revendedor', 'pendiente'));

-- Espacio de revendedor propio de un admin (decisión 2 de arriba). Solo
-- tiene efecto cuando rol = 'admin' — para un revendedor no se lee ni se
-- setea (permanece false).
alter table vendedores
  add column revende boolean not null default false;

-- Copia de `auth.users.email`/`created_at` (denormalizada) para que la
-- tabla "Pendientes de aprobación" de `/revendedores` pueda mostrar
-- Email/Registrado sin que un admin necesite acceso a `auth.users` desde
-- el cliente (PostgREST no expone `auth`). `handle_new_auth_user` las
-- completa en el alta; backfill acá para las filas existentes.
alter table vendedores
  add column email text;

alter table vendedores
  add column creado_en timestamptz;

update vendedores v
set email = u.email,
    creado_en = u.created_at
from auth.users u
where v.user_id = u.id
  and v.email is null;

-- ============================================================
-- 2) handle_new_auth_user() — inserta también email y creado_en; ya no
--    fija rol (default de columna = 'pendiente', ver punto 1). SOLO
--    public: mismo criterio que 0013_multi_negocio.sql § d (auth.users es
--    compartido, un único router global).
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
      'insert into %I.vendedores (nombre, user_id, activo, email, creado_en) values ($1, $2, true, $3, $4) on conflict (user_id) do nothing',
      v_schema
    ) using v_nombre, new.id, new.email, new.created_at;
  exception
    when unique_violation then
      -- El nombre ya lo usa otro vendedor de ese negocio (ej. alta manual
      -- previa con el mismo nombre): se agrega un sufijo corto del id para
      -- no bloquear el alta del usuario en auth.users.
      execute format(
        'insert into %I.vendedores (nombre, user_id, activo, email, creado_en) values ($1, $2, true, $3, $4) on conflict (user_id) do nothing',
        v_schema
      ) using v_nombre || ' (' || substr(new.id::text, 1, 4) || ')', new.id, new.email, new.created_at;
  end;

  return new;
end;
$$;
-- @solo-public:fin

-- ============================================================
-- 3) puede_revender(): caller activo y (revendedor, o admin con espacio
--    propio habilitado) — criterio ancho para los RPC de escritura que
--    antes exigían es_revendedor() a secas. es_revendedor() NO se toca:
--    sigue estricta (solo rol = 'revendedor'), así que la RLS que ya la
--    usa (0018/0022) queda sin cambios de comportamiento.
-- ============================================================

create or replace function __SCHEMA__.puede_revender()
returns boolean
language sql
stable
security definer
set search_path = __SCHEMA__
as $$
  select exists (
    select 1 from vendedores
    where user_id = auth.uid()
      and activo
      and (rol = 'revendedor' or (rol = 'admin' and revende))
  );
$$;

revoke execute on function __SCHEMA__.puede_revender() from public, anon;
grant execute on function __SCHEMA__.puede_revender() to authenticated;

-- ============================================================
-- 4) asignar_rol_revendedor: transiciones acotadas.
--    pendiente→revendedor, pendiente→admin, revendedor→admin. Un admin
--    NUNCA pasa a revendedor (ADMIN_NO_REVENDEDOR) — para eso existe
--    fijar_espacio_revendedor (punto 6).
-- ============================================================

create or replace function asignar_rol_revendedor(
  p_vendedor_id uuid,
  p_rol text
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_rol_actual text;
  v_admins_restantes int;
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if p_rol not in ('admin', 'revendedor') then
    raise exception 'ROL_INVALIDO';
  end if;

  select rol into v_rol_actual from vendedores where id = p_vendedor_id;
  if v_rol_actual is null then
    raise exception 'VENDEDOR_INVALIDO';
  end if;

  if v_rol_actual = 'admin' and p_rol = 'revendedor' then
    raise exception 'ADMIN_NO_REVENDEDOR';
  end if;

  if not (
    (v_rol_actual = 'pendiente' and p_rol in ('admin', 'revendedor'))
    or (v_rol_actual = 'revendedor' and p_rol = 'admin')
  ) then
    raise exception 'TRANSICION_INVALIDA';
  end if;

  if p_rol = 'revendedor' then
    select count(*) into v_admins_restantes
    from vendedores
    where rol = 'admin' and activo and id <> p_vendedor_id;

    if v_admins_restantes < 1 then
      raise exception 'ULTIMO_ADMIN';
    end if;
  end if;

  update vendedores set rol = p_rol where id = p_vendedor_id;

  return json_build_object('id', p_vendedor_id, 'rol', p_rol);
end;
$$;

revoke execute on function asignar_rol_revendedor(uuid, text) from anon, public;
grant execute on function asignar_rol_revendedor(uuid, text) to authenticated;

-- ============================================================
-- 5) rechazar_pendiente: un admin da de baja (activo = false) a un
--    pendiente que no quiere sumar — mismo criterio que cualquier baja de
--    vendedor (sin autoservicio, ver supabase/crear-vendedor.sql).
-- ============================================================

create function rechazar_pendiente(
  p_vendedor_id uuid
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_rol_actual text;
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select rol into v_rol_actual from vendedores where id = p_vendedor_id;
  if v_rol_actual is null then
    raise exception 'VENDEDOR_INVALIDO';
  end if;

  if v_rol_actual <> 'pendiente' then
    raise exception 'NO_PENDIENTE';
  end if;

  update vendedores set activo = false where id = p_vendedor_id;

  return json_build_object('id', p_vendedor_id);
end;
$$;

revoke execute on function rechazar_pendiente(uuid) from anon, public;
grant execute on function rechazar_pendiente(uuid) to authenticated;

-- ============================================================
-- 6) fijar_espacio_revendedor: habilita/deshabilita el espacio de
--    revendedor propio de un admin. El target tiene que ser un admin
--    activo (un admin puede habilitárselo a sí mismo: `es_admin()` ya lo
--    exige arriba, y `p_vendedor_id` puede ser el propio).
-- ============================================================

create function fijar_espacio_revendedor(
  p_vendedor_id uuid,
  p_habilitar boolean
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_revende boolean;
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if not exists (
    select 1 from vendedores where id = p_vendedor_id and rol = 'admin' and activo
  ) then
    raise exception 'ADMIN_INVALIDO';
  end if;

  v_revende := coalesce(p_habilitar, false);

  update vendedores set revende = v_revende where id = p_vendedor_id;

  return json_build_object('id', p_vendedor_id, 'revende', v_revende);
end;
$$;

revoke execute on function fijar_espacio_revendedor(uuid, boolean) from anon, public;
grant execute on function fijar_espacio_revendedor(uuid, boolean) to authenticated;

-- ============================================================
-- 7) registrar_venta_revendedor: puede_revender() en vez de
--    es_revendedor() — un admin con espacio propio también puede cargar
--    sus ventas. Resto del cuerpo idéntico a 0020_revendedores_rpc_helpers.sql.
-- ============================================================

create or replace function registrar_venta_revendedor(
  p_producto_id uuid,
  p_cantidad int,
  p_precio_venta_centavos bigint,
  p_medio_pago medio_pago,
  p_fecha date,
  p_nota text default null
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_vendedor_id uuid;
  v_precio_costo_centavos bigint;
  v_en_poder int;
  v_nombre text;
  v_venta_id uuid;
begin
  if not __SCHEMA__.puede_revender() then
    raise exception 'NO_AUTORIZADO';
  end if;

  v_vendedor_id := __SCHEMA__.mi_vendedor_id();

  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'CANTIDAD_INVALIDA';
  end if;

  if p_precio_venta_centavos is null or p_precio_venta_centavos <= 0 then
    raise exception 'PRECIO_INVALIDO';
  end if;

  select precio_centavos into v_precio_costo_centavos
  from revendedor_precios where vendedor_id = v_vendedor_id and producto_id = p_producto_id;

  if v_precio_costo_centavos is null then
    raise exception 'PRECIO_NO_ASIGNADO';
  end if;

  select en_poder into v_en_poder
  from v_stock_revendedor where vendedor_id = v_vendedor_id and producto_id = p_producto_id;

  if coalesce(v_en_poder, 0) < p_cantidad then
    select nombre into v_nombre from productos where id = p_producto_id;
    raise exception 'STOCK_REVENDEDOR_INSUFICIENTE'
      using detail = json_build_object(
        'producto', v_nombre,
        'producto_id', p_producto_id,
        'disponible', coalesce(v_en_poder, 0)
      )::text;
  end if;

  insert into ventas_revendedor (
    vendedor_id, producto_id, cantidad, precio_venta_centavos, precio_costo_centavos,
    medio_pago, fecha, nota
  ) values (
    v_vendedor_id, p_producto_id, p_cantidad, p_precio_venta_centavos, v_precio_costo_centavos,
    p_medio_pago, coalesce(p_fecha, current_date), p_nota
  ) returning id into v_venta_id;

  return json_build_object('id', v_venta_id);
end;
$$;

revoke execute on function registrar_venta_revendedor(uuid, int, bigint, medio_pago, date, text) from anon, public;
grant execute on function registrar_venta_revendedor(uuid, int, bigint, medio_pago, date, text) to authenticated;

-- ============================================================
-- 8) registrar_entrega_revendedor, registrar_rendicion,
--    fijar_precio_revendedor: el chequeo de "target es un revendedor
--    válido" ahora también acepta admin con revende. Mismo código de
--    error (REVENDEDOR_INVALIDO) en los tres — resto del cuerpo idéntico
--    a 0020_revendedores_rpc_helpers.sql / 0018_revendedores.sql.
-- ============================================================

create or replace function registrar_entrega_revendedor(
  p_vendedor_id uuid,
  p_tipo text,
  p_fecha date,
  p_nota text default null,
  p_items jsonb default '[]'::jsonb,
  p_permitir_negativo boolean default false
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_admin_id uuid;
  v_entrega_id uuid;
  v_item jsonb;
  v_producto_id uuid;
  v_cantidad int;
  v_stock int;
  v_nombre text;
  v_en_poder int;
  v_tipo_movimiento tipo_movimiento;
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  v_admin_id := __SCHEMA__.mi_vendedor_id();

  if not exists (
    select 1 from vendedores
    where id = p_vendedor_id and activo and (rol = 'revendedor' or (rol = 'admin' and revende))
  ) then
    raise exception 'REVENDEDOR_INVALIDO';
  end if;

  if p_tipo not in ('entrega', 'devolucion') then
    raise exception 'TIPO_INVALIDO';
  end if;

  if p_items is null or jsonb_array_length(p_items) < 1 then
    raise exception 'SIN_ITEMS';
  end if;

  insert into entregas_revendedor (vendedor_id, tipo, fecha, nota, admin_id)
  values (p_vendedor_id, p_tipo, coalesce(p_fecha, current_date), p_nota, v_admin_id)
  returning id into v_entrega_id;

  v_tipo_movimiento := case when p_tipo = 'entrega' then 'egreso' else 'ingreso' end;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::int;

    if v_producto_id is null or v_cantidad is null or v_cantidad <= 0 then
      raise exception 'SIN_ITEMS';
    end if;

    insert into entrega_items (entrega_id, producto_id, cantidad)
    values (v_entrega_id, v_producto_id, v_cantidad);

    insert into movimientos_stock (producto_id, tipo, cantidad, vendedor_id, entrega_id, nota)
    values (v_producto_id, v_tipo_movimiento, v_cantidad, v_admin_id, v_entrega_id, null);

    if p_tipo = 'entrega' then
      select s.stock, s.nombre into v_stock, v_nombre
      from v_stock_actual s where s.producto_id = v_producto_id;

      if v_stock < 0 and not p_permitir_negativo then
        raise exception 'STOCK_INSUFICIENTE'
          using detail = json_build_object(
            'producto', v_nombre,
            'producto_id', v_producto_id,
            'disponible', v_stock + v_cantidad
          )::text;
      end if;
    else
      select en_poder into v_en_poder
      from v_stock_revendedor where vendedor_id = p_vendedor_id and producto_id = v_producto_id;

      if coalesce(v_en_poder, 0) < 0 and not p_permitir_negativo then
        select nombre into v_nombre from productos where id = v_producto_id;
        raise exception 'STOCK_REVENDEDOR_INSUFICIENTE'
          using detail = json_build_object(
            'producto', v_nombre,
            'producto_id', v_producto_id,
            'disponible', coalesce(v_en_poder, 0) + v_cantidad
          )::text;
      end if;
    end if;
  end loop;

  return json_build_object('entrega_id', v_entrega_id);
end;
$$;

revoke execute on function registrar_entrega_revendedor(uuid, text, date, text, jsonb, boolean) from anon, public;
grant execute on function registrar_entrega_revendedor(uuid, text, date, text, jsonb, boolean) to authenticated;

create or replace function registrar_rendicion(
  p_vendedor_id uuid,
  p_monto_centavos bigint,
  p_medio_pago medio_pago,
  p_fecha date,
  p_nota text default null
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_admin_id uuid;
  v_rendicion_id uuid;
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  v_admin_id := __SCHEMA__.mi_vendedor_id();

  if not exists (
    select 1 from vendedores
    where id = p_vendedor_id and activo and (rol = 'revendedor' or (rol = 'admin' and revende))
  ) then
    raise exception 'REVENDEDOR_INVALIDO';
  end if;

  if p_monto_centavos is null or p_monto_centavos <= 0 then
    raise exception 'MONTO_INVALIDO';
  end if;

  insert into rendiciones (vendedor_id, monto_centavos, medio_pago, fecha, nota, admin_id)
  values (p_vendedor_id, p_monto_centavos, p_medio_pago, coalesce(p_fecha, current_date), p_nota, v_admin_id)
  returning id into v_rendicion_id;

  return json_build_object('id', v_rendicion_id);
end;
$$;

revoke execute on function registrar_rendicion(uuid, bigint, medio_pago, date, text) from anon, public;
grant execute on function registrar_rendicion(uuid, bigint, medio_pago, date, text) to authenticated;

create or replace function fijar_precio_revendedor(
  p_vendedor_id uuid,
  p_producto_id uuid,
  p_precio_centavos bigint
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_id uuid;
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if not exists (
    select 1 from vendedores
    where id = p_vendedor_id and activo and (rol = 'revendedor' or (rol = 'admin' and revende))
  ) then
    raise exception 'REVENDEDOR_INVALIDO';
  end if;

  if not exists (select 1 from productos where id = p_producto_id) then
    raise exception 'PRODUCTO_INVALIDO';
  end if;

  if p_precio_centavos is null or p_precio_centavos <= 0 then
    raise exception 'PRECIO_INVALIDO';
  end if;

  insert into revendedor_precios (vendedor_id, producto_id, precio_centavos)
  values (p_vendedor_id, p_producto_id, p_precio_centavos)
  on conflict (vendedor_id, producto_id)
  do update set precio_centavos = excluded.precio_centavos, updated_at = now()
  returning id into v_id;

  return json_build_object('id', v_id);
end;
$$;

revoke execute on function fijar_precio_revendedor(uuid, uuid, bigint) from anon, public;
grant execute on function fijar_precio_revendedor(uuid, uuid, bigint) to authenticated;

-- ============================================================
-- 9) v_resumen_revendedor: incluye admins con espacio de revendedor
--    habilitado, además de revendedores. Columnas, opciones (security_invoker)
--    y grants idénticos a 0018_revendedores.sql.
-- ============================================================

create or replace view v_resumen_revendedor as
with base as (
  select
    v.id as vendedor_id,
    v.nombre,
    coalesce((select sum(vr.cantidad * vr.precio_venta_centavos) from ventas_revendedor vr where vr.vendedor_id = v.id), 0) as vendido_centavos,
    coalesce((select sum(vr.cantidad * vr.precio_costo_centavos) from ventas_revendedor vr where vr.vendedor_id = v.id), 0) as costo_centavos,
    coalesce((select sum(r.monto_centavos) from rendiciones r where r.vendedor_id = v.id), 0) as rendido_centavos,
    coalesce((select count(*) from ventas_revendedor vr where vr.vendedor_id = v.id), 0) as cantidad_ventas
  from vendedores v
  where v.rol = 'revendedor' or (v.rol = 'admin' and v.revende)
)
select
  vendedor_id,
  nombre,
  vendido_centavos,
  costo_centavos,
  (vendido_centavos - costo_centavos) as ganancia_centavos,
  rendido_centavos,
  (costo_centavos - rendido_centavos) as debe_centavos,
  cantidad_ventas
from base;

alter view v_resumen_revendedor set (security_invoker = true);
revoke all on v_resumen_revendedor from anon, public;
grant select on v_resumen_revendedor to authenticated;

-- v_stock_revendedor (0018_revendedores.sql) no referencia `vendedores.rol`
-- en absoluto (solo entregas_revendedor/entrega_items/ventas_revendedor
-- agrupadas por vendedor_id) — no requiere cambios: ya reporta el stock en
-- poder de cualquier vendedor_id con movimientos, sea revendedor o admin
-- con espacio propio.
