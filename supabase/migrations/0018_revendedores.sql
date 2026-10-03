-- Ananja/Germá: Revendedores (rol, consignación, ventas, ganancia, rendiciones)
--
--
-- Agrega un rol nuevo `revendedor` a `vendedores`. Un revendedor recibe
-- botellas en consignación (siguen siendo de Ananja hasta que las vende),
-- carga sus propias ventas a un precio que Ananja le fija por producto, y
-- le rinde a Ananja de a montones (una rendición sube la Caja en el medio
-- de pago correspondiente). La clave de la RLS de esta migración:
-- `es_vendedor()` se redefine para devolver true solo para admins activos,
-- así TODAS las policies existentes que ya la llaman quedan cerradas para
-- revendedores sin tocarlas una por una (documentado en el Step 1 del
-- plan, y en la spec § Modelo de datos — Auth y roles).
--
-- Migración templated (__SCHEMA__, sin __BUCKET__ — no toca Storage). Sin
-- bloques @solo-public: esta migración no siembra datos (ni revendedores
-- ni precios), solo estructura — aplica igual en los dos negocios sin
-- nada que excluir. Ver supabase/README.md.
--
-- Alcance:
--  1. vendedores.rol + mi_vendedor_id()/es_admin()/es_revendedor() +
--     es_vendedor() redefinida (alias de es_admin()) + excepción de
--     productos_select para que un revendedor pueda leer el catálogo.
--  2. Cierre de la brecha preexistente de versiones_precio/
--     versiones_precio_items/deudas (using(true) -> es_vendedor()).
--  3. Tabla revendedor_precios.
--  4. Tablas entregas_revendedor + entrega_items.
--  5. movimientos_stock.entrega_id.
--  6. Tabla ventas_revendedor.
--  7. Tabla rendiciones.
--  8. v_saldos_caja redefinida (suma rendiciones).
--  9. Vista v_stock_revendedor.
--  10. Vista v_resumen_revendedor.
--  11. RPCs: asignar_rol_revendedor, fijar_precio_revendedor,
--      registrar_entrega_revendedor, registrar_venta_revendedor,
--      eliminar_venta_revendedor, registrar_rendicion.

-- ============================================================
-- 1) Roles: vendedores.rol + funciones de auth
-- ============================================================

alter table vendedores
  add column rol text not null default 'admin' check (rol in ('admin', 'revendedor'));

create or replace function __SCHEMA__.mi_vendedor_id()
returns uuid
language sql
stable
security definer
set search_path = __SCHEMA__
as $$
  select id from vendedores where user_id = auth.uid();
$$;

create or replace function __SCHEMA__.es_admin()
returns boolean
language sql
stable
security definer
set search_path = __SCHEMA__
as $$
  select exists (
    select 1 from vendedores where user_id = auth.uid() and activo and rol = 'admin'
  );
$$;

create or replace function __SCHEMA__.es_revendedor()
returns boolean
language sql
stable
security definer
set search_path = __SCHEMA__
as $$
  select exists (
    select 1 from vendedores where user_id = auth.uid() and activo and rol = 'revendedor'
  );
$$;

-- Redefinición clave: antes "cualquier vendedor activo", ahora "solo
-- admin activo". Preserva la firma (returns boolean) así el revoke/grant
-- ya aplicado en 0013_multi_negocio.sql sigue vigente sobre create or
-- replace; se re-declara igual por claridad.
create or replace function __SCHEMA__.es_vendedor()
returns boolean
language sql
stable
security definer
set search_path = __SCHEMA__
as $$
  select __SCHEMA__.es_admin();
$$;

revoke execute on function __SCHEMA__.mi_vendedor_id() from public, anon;
revoke execute on function __SCHEMA__.es_admin() from public, anon;
revoke execute on function __SCHEMA__.es_revendedor() from public, anon;
revoke execute on function __SCHEMA__.es_vendedor() from public, anon;
grant execute on function __SCHEMA__.mi_vendedor_id() to authenticated;
grant execute on function __SCHEMA__.es_admin() to authenticated;
grant execute on function __SCHEMA__.es_revendedor() to authenticated;
grant execute on function __SCHEMA__.es_vendedor() to authenticated;

-- Excepción: un revendedor necesita leer el catálogo de productos (nombre,
-- presentación) para /mi y /mi/ventas, aunque no vea costos ni Precios.
-- vendedores_select/update NO se tocan: ya admiten `user_id = auth.uid()`
-- desde 0013_multi_negocio.sql, así que un revendedor ya puede leer/tocar
-- su propia fila sin ser es_vendedor().
drop policy if exists productos_select on productos;
create policy productos_select on productos for select to authenticated
  using (__SCHEMA__.es_vendedor() or __SCHEMA__.es_revendedor());

-- ============================================================
-- 2) Cierre de la brecha preexistente: versiones_precio/
--    versiones_precio_items/deudas usaban using(true), no es_vendedor()
--    (ver spec § Modelo de datos — "Hallazgo importante").
-- ============================================================

drop policy if exists versiones_precio_select on versiones_precio;
create policy versiones_precio_select on versiones_precio for select to authenticated
  using (__SCHEMA__.es_vendedor());

drop policy if exists versiones_precio_items_select on versiones_precio_items;
create policy versiones_precio_items_select on versiones_precio_items for select to authenticated
  using (__SCHEMA__.es_vendedor());

drop policy if exists deudas_select on deudas;
create policy deudas_select on deudas for select to authenticated
  using (__SCHEMA__.es_vendedor());

drop policy if exists deudas_insert on deudas;
create policy deudas_insert on deudas for insert to authenticated
  with check (__SCHEMA__.es_vendedor());

drop policy if exists deudas_update on deudas;
create policy deudas_update on deudas for update to authenticated
  using (__SCHEMA__.es_vendedor()) with check (__SCHEMA__.es_vendedor());

-- ============================================================
-- 3) revendedor_precios
-- ============================================================

create table revendedor_precios (
  id uuid primary key default gen_random_uuid(),
  vendedor_id uuid not null references vendedores(id),
  producto_id uuid not null references productos(id),
  precio_centavos bigint not null check (precio_centavos > 0),
  updated_at timestamptz not null default now(),
  unique (vendedor_id, producto_id)
);

create index idx_revendedor_precios_vendedor_id on revendedor_precios(vendedor_id);

create trigger trg_revendedor_precios_updated_at
  before update on revendedor_precios
  for each row execute function set_updated_at();

alter table revendedor_precios enable row level security;
revoke all on revendedor_precios from anon, authenticated, public;
grant select on revendedor_precios to authenticated;

create policy revendedor_precios_select on revendedor_precios for select to authenticated
  using (__SCHEMA__.es_admin() or vendedor_id = __SCHEMA__.mi_vendedor_id());
-- Sin insert/update/delete directo: solo vía RPC fijar_precio_revendedor.

-- ============================================================
-- 4) entregas_revendedor + entrega_items
-- ============================================================

create table entregas_revendedor (
  id uuid primary key default gen_random_uuid(),
  vendedor_id uuid not null references vendedores(id),
  tipo text not null check (tipo in ('entrega', 'devolucion')),
  fecha date not null default current_date,
  nota text,
  admin_id uuid not null references vendedores(id),
  created_at timestamptz not null default now()
);

create index idx_entregas_revendedor_vendedor_id on entregas_revendedor(vendedor_id);

create table entrega_items (
  id uuid primary key default gen_random_uuid(),
  entrega_id uuid not null references entregas_revendedor(id) on delete cascade,
  producto_id uuid not null references productos(id),
  cantidad int not null check (cantidad > 0),
  unique (entrega_id, producto_id)
);

create index idx_entrega_items_entrega_id on entrega_items(entrega_id);

alter table entregas_revendedor enable row level security;
revoke all on entregas_revendedor from anon, authenticated, public;
grant select on entregas_revendedor to authenticated;

create policy entregas_revendedor_select on entregas_revendedor for select to authenticated
  using (__SCHEMA__.es_admin() or vendedor_id = __SCHEMA__.mi_vendedor_id());
-- Sin insert/update/delete directo: solo vía RPC registrar_entrega_revendedor.

alter table entrega_items enable row level security;
revoke all on entrega_items from anon, authenticated, public;
grant select on entrega_items to authenticated;

create policy entrega_items_select on entrega_items for select to authenticated
  using (
    exists (
      select 1 from entregas_revendedor e
      where e.id = entrega_items.entrega_id
        and (__SCHEMA__.es_admin() or e.vendedor_id = __SCHEMA__.mi_vendedor_id())
    )
  );

-- ============================================================
-- 5) movimientos_stock.entrega_id
-- ============================================================

alter table movimientos_stock
  add column entrega_id uuid references entregas_revendedor(id);

create index idx_movimientos_stock_entrega_id on movimientos_stock(entrega_id);

-- ============================================================
-- 6) ventas_revendedor
-- ============================================================

create table ventas_revendedor (
  id uuid primary key default gen_random_uuid(),
  vendedor_id uuid not null references vendedores(id),
  producto_id uuid not null references productos(id),
  cantidad int not null check (cantidad > 0),
  precio_venta_centavos bigint not null check (precio_venta_centavos > 0),
  precio_costo_centavos bigint not null check (precio_costo_centavos >= 0),
  medio_pago medio_pago not null,
  fecha date not null default current_date,
  nota text,
  created_at timestamptz not null default now()
);

create index idx_ventas_revendedor_vendedor_id on ventas_revendedor(vendedor_id);
create index idx_ventas_revendedor_fecha on ventas_revendedor(fecha desc);

alter table ventas_revendedor enable row level security;
revoke all on ventas_revendedor from anon, authenticated, public;
grant select on ventas_revendedor to authenticated;

create policy ventas_revendedor_select on ventas_revendedor for select to authenticated
  using (__SCHEMA__.es_admin() or vendedor_id = __SCHEMA__.mi_vendedor_id());
-- Sin insert/update/delete directo: alta vía RPC registrar_venta_revendedor
-- (el propio revendedor), baja vía RPC eliminar_venta_revendedor (dueño).

-- ============================================================
-- 7) rendiciones
-- ============================================================

create table rendiciones (
  id uuid primary key default gen_random_uuid(),
  vendedor_id uuid not null references vendedores(id),
  monto_centavos bigint not null check (monto_centavos > 0),
  medio_pago medio_pago not null,
  fecha date not null default current_date,
  nota text,
  admin_id uuid not null references vendedores(id),
  created_at timestamptz not null default now()
);

create index idx_rendiciones_vendedor_id on rendiciones(vendedor_id);

alter table rendiciones enable row level security;
revoke all on rendiciones from anon, authenticated, public;
grant select on rendiciones to authenticated;

create policy rendiciones_select on rendiciones for select to authenticated
  using (__SCHEMA__.es_admin() or vendedor_id = __SCHEMA__.mi_vendedor_id());
-- Sin insert/update/delete directo: solo vía RPC registrar_rendicion.

-- ============================================================
-- 8) v_saldos_caja — redefinida con rendiciones
-- ============================================================

create or replace view v_saldos_caja as
with por_caja as (
  select
    c.medio_pago::text as medio_pago,
    c.saldo_inicial_centavos
      + coalesce((select sum(cp.monto_centavos) from comprobantes cp where cp.medio_pago = c.medio_pago), 0)
      - coalesce((select sum(g.monto_centavos) from gastos g where g.medio_pago = c.medio_pago), 0)
      + coalesce((select sum(a.monto_centavos) from ajustes_caja a where a.medio_pago = c.medio_pago), 0)
      + coalesce((select sum(r.monto_centavos) from rendiciones r where r.medio_pago = c.medio_pago), 0) as saldo_centavos
  from cajas c
)
select medio_pago, saldo_centavos from por_caja
union all
select 'total' as medio_pago, coalesce(sum(saldo_centavos), 0) as saldo_centavos from por_caja;

-- ============================================================
-- 9) v_stock_revendedor
-- ============================================================

create view v_stock_revendedor as
select
  t.vendedor_id,
  t.producto_id,
  coalesce(sum(case when t.tipo = 'entrega' then t.cantidad else 0 end), 0)
    - coalesce(sum(case when t.tipo = 'devolucion' then t.cantidad else 0 end), 0)
    - coalesce((
        select sum(vr.cantidad) from ventas_revendedor vr
        where vr.vendedor_id = t.vendedor_id and vr.producto_id = t.producto_id
      ), 0) as en_poder
from (
  select e.vendedor_id, ei.producto_id, e.tipo, ei.cantidad
  from entregas_revendedor e
  join entrega_items ei on ei.entrega_id = e.id
) t
group by t.vendedor_id, t.producto_id;

alter view v_stock_revendedor set (security_invoker = true);
revoke all on v_stock_revendedor from anon, public;
grant select on v_stock_revendedor to authenticated;

-- ============================================================
-- 10) v_resumen_revendedor
-- ============================================================

create view v_resumen_revendedor as
with base as (
  select
    v.id as vendedor_id,
    v.nombre,
    coalesce((select sum(vr.cantidad * vr.precio_venta_centavos) from ventas_revendedor vr where vr.vendedor_id = v.id), 0) as vendido_centavos,
    coalesce((select sum(vr.cantidad * vr.precio_costo_centavos) from ventas_revendedor vr where vr.vendedor_id = v.id), 0) as costo_centavos,
    coalesce((select sum(r.monto_centavos) from rendiciones r where r.vendedor_id = v.id), 0) as rendido_centavos,
    coalesce((select count(*) from ventas_revendedor vr where vr.vendedor_id = v.id), 0) as cantidad_ventas
  from vendedores v
  where v.rol = 'revendedor'
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

-- ============================================================
-- 11) RPCs
-- ============================================================

create function asignar_rol_revendedor(
  p_vendedor_id uuid,
  p_rol text
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_admins_restantes int;
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if p_rol not in ('admin', 'revendedor') then
    raise exception 'ROL_INVALIDO';
  end if;

  if not exists (select 1 from vendedores where id = p_vendedor_id) then
    raise exception 'VENDEDOR_INVALIDO';
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

create function fijar_precio_revendedor(
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

  if not exists (select 1 from vendedores where id = p_vendedor_id and rol = 'revendedor' and activo) then
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

create function registrar_entrega_revendedor(
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
  v_umbral int;
  v_nombre text;
  v_en_poder int;
  v_tipo_movimiento tipo_movimiento;
begin
  select id into v_admin_id from vendedores where user_id = auth.uid() and rol = 'admin' and activo;
  if v_admin_id is null then
    raise exception 'NO_AUTORIZADO';
  end if;

  if not exists (select 1 from vendedores where id = p_vendedor_id and rol = 'revendedor' and activo) then
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
      select s.stock, s.umbral_minimo, s.nombre into v_stock, v_umbral, v_nombre
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

create function registrar_venta_revendedor(
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
  select id into v_vendedor_id from vendedores where user_id = auth.uid() and rol = 'revendedor' and activo;
  if v_vendedor_id is null then
    raise exception 'NO_AUTORIZADO';
  end if;

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

create function eliminar_venta_revendedor(
  p_venta_id uuid
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_vendedor_id uuid;
  v_dueño_id uuid;
begin
  select id into v_vendedor_id from vendedores where user_id = auth.uid();
  if v_vendedor_id is null then
    raise exception 'NO_AUTORIZADO';
  end if;

  select vendedor_id into v_dueño_id from ventas_revendedor where id = p_venta_id;
  if v_dueño_id is null then
    raise exception 'VENTA_NO_ENCONTRADA';
  end if;

  if v_dueño_id <> v_vendedor_id then
    raise exception 'NO_AUTORIZADO';
  end if;

  delete from ventas_revendedor where id = p_venta_id;

  return json_build_object('id', p_venta_id);
end;
$$;

revoke execute on function eliminar_venta_revendedor(uuid) from anon, public;
grant execute on function eliminar_venta_revendedor(uuid) to authenticated;

create function registrar_rendicion(
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
  select id into v_admin_id from vendedores where user_id = auth.uid() and rol = 'admin' and activo;
  if v_admin_id is null then
    raise exception 'NO_AUTORIZADO';
  end if;

  if not exists (select 1 from vendedores where id = p_vendedor_id and rol = 'revendedor' and activo) then
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
