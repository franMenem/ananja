-- Ananja: costo real por lote de producción (US8)
--
-- Decisión del dueño (2026-09-02): quiere saber cuánto sale DE VERDAD cada
-- botella (producto + logística + otros gastos), calculado POR LOTE DE
-- PRODUCCIÓN. Al ingresar stock se registra un lote; se le asignan los
-- gastos de ese lote (aceite, envases, etiquetas, flete...); la app divide
-- el total de gastos asignados por la cantidad del lote → costo unitario
-- real, con historial de lotes.
--
-- Alcance:
--  1. Tabla lotes_produccion (un lote = un ingreso de stock de producción).
--  2. gastos.lote_id y movimientos_stock.lote_id (FK nullable a lotes).
--  3. RPC crear_lote: crea el lote Y su movimiento_stock de ingreso en la
--     misma transacción (mismo patrón que los RPCs de 0007: resuelve el
--     vendedor desde auth.uid(), VENDEDOR_NO_REGISTRADO si no hay fila).
--  4. crear_gasto gana p_lote_id (default null) para poder asignar el gasto
--     a un lote atómicamente al crearlo, sin un segundo update.
--  5. Vistas v_costo_lote (costo total y unitario por lote) y
--     v_costo_producto (costo del último lote con gastos + promedio
--     ponderado de los últimos 3 lotes).

-- ============================================================
-- 1) lotes_produccion
-- ============================================================

create table lotes_produccion (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos(id),
  cantidad int not null check (cantidad > 0),
  fecha date not null default current_date,
  nota text,
  vendedor_id uuid not null references vendedores(id),
  created_at timestamptz not null default now()
);

alter table lotes_produccion enable row level security;
revoke all on lotes_produccion from anon, authenticated, public;
grant select on lotes_produccion to authenticated;

create policy lotes_produccion_select on lotes_produccion for select to authenticated using (true);

-- Sin insert/update/delete para el cliente: el alta la hace crear_lote
-- (security definer), igual criterio que comprobantes/gastos vía RPC.

-- ============================================================
-- 2) gastos.lote_id / movimientos_stock.lote_id
-- ============================================================

alter table gastos add column lote_id uuid references lotes_produccion(id);
alter table movimientos_stock add column lote_id uuid references lotes_produccion(id);

create index idx_gastos_lote_id on gastos(lote_id);
create index idx_movimientos_stock_lote_id on movimientos_stock(lote_id);
create index idx_lotes_produccion_producto_id on lotes_produccion(producto_id);

-- ============================================================
-- 3) crear_lote: crea el lote + su movimiento_stock de ingreso
-- ============================================================

create function crear_lote(
  p_producto_id uuid,
  p_cantidad int,
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
  v_lote_id uuid;
begin
  select id into v_vendedor_id from vendedores where user_id = auth.uid();
  if v_vendedor_id is null then
    raise exception 'VENDEDOR_NO_REGISTRADO';
  end if;

  if p_producto_id is null then
    raise exception 'PRODUCTO_INVALIDO';
  end if;

  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'CANTIDAD_INVALIDA';
  end if;

  insert into lotes_produccion (producto_id, cantidad, fecha, nota, vendedor_id)
  values (p_producto_id, p_cantidad, coalesce(p_fecha, current_date), p_nota, v_vendedor_id)
  returning id into v_lote_id;

  insert into movimientos_stock (producto_id, tipo, cantidad, vendedor_id, lote_id, nota)
  values (p_producto_id, 'ingreso', p_cantidad, v_vendedor_id, v_lote_id, p_nota);

  return json_build_object('lote_id', v_lote_id);
end;
$$;

revoke execute on function crear_lote(uuid, int, date, text) from anon, public;
grant execute on function crear_lote(uuid, int, date, text) to authenticated;

-- ============================================================
-- 4) crear_gasto: agrega p_lote_id (default null) para asignar el gasto a
--    un lote de producción de forma atómica al crearlo.
-- ============================================================

drop function if exists crear_gasto(bigint, uuid, medio_pago, date, text, text);

create function crear_gasto(
  p_monto_centavos bigint,
  p_categoria_id uuid,
  p_medio_pago medio_pago,
  p_fecha date,
  p_nota text default null,
  p_imagen_path text default null,
  p_lote_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_vendedor_id uuid;
  v_gasto_id uuid;
begin
  select id into v_vendedor_id from vendedores where user_id = auth.uid();
  if v_vendedor_id is null then
    raise exception 'VENDEDOR_NO_REGISTRADO';
  end if;

  if p_monto_centavos is null or p_monto_centavos <= 0 then
    raise exception 'MONTO_INVALIDO';
  end if;

  if p_lote_id is not null and not exists (select 1 from lotes_produccion where id = p_lote_id) then
    raise exception 'LOTE_NO_ENCONTRADO';
  end if;

  insert into gastos (vendedor_id, monto_centavos, categoria_id, medio_pago, fecha, nota, imagen_path, lote_id)
  values (v_vendedor_id, p_monto_centavos, p_categoria_id, p_medio_pago, coalesce(p_fecha, current_date), p_nota, p_imagen_path, p_lote_id)
  returning id into v_gasto_id;

  insert into notificaciones (tipo, titulo, detalle, referencia_id)
  values ('gasto_nuevo', 'Nuevo gasto registrado', p_nota, v_gasto_id);

  return json_build_object('gasto_id', v_gasto_id);
end;
$$;

revoke execute on function crear_gasto(bigint, uuid, medio_pago, date, text, text, uuid) from anon, public;
grant execute on function crear_gasto(bigint, uuid, medio_pago, date, text, text, uuid) to authenticated;

-- ============================================================
-- 5) v_costo_lote: costo total y unitario por lote
-- ============================================================

create view v_costo_lote as
select
  l.id as lote_id,
  l.producto_id,
  p.nombre as producto_nombre,
  p.presentacion_ml,
  l.cantidad,
  l.fecha,
  l.nota,
  l.vendedor_id,
  l.created_at,
  coalesce(g.total_gastos_centavos, 0) as total_gastos_centavos,
  coalesce(g.gastos_asignados, 0) as gastos_asignados,
  case
    when coalesce(g.total_gastos_centavos, 0) = 0 then 0
    else round(coalesce(g.total_gastos_centavos, 0)::numeric / l.cantidad)::bigint
  end as costo_unitario_centavos
from lotes_produccion l
join productos p on p.id = l.producto_id
left join (
  select lote_id, sum(monto_centavos) as total_gastos_centavos, count(*) as gastos_asignados
  from gastos
  where lote_id is not null
  group by lote_id
) g on g.lote_id = l.id;

alter view v_costo_lote set (security_invoker = true);
revoke all on v_costo_lote from anon, public;
grant select on v_costo_lote to authenticated;

-- ============================================================
-- 6) v_costo_producto: costo unitario real del ÚLTIMO lote con gastos +
--    promedio ponderado de los últimos 3 lotes (redondeo entero).
-- ============================================================

create view v_costo_producto as
with lotes_rank as (
  select
    producto_id,
    cantidad,
    total_gastos_centavos,
    fecha,
    created_at,
    row_number() over (
      partition by producto_id order by fecha desc, created_at desc
    ) as rn
  from v_costo_lote
),
ultimo_con_gastos as (
  select distinct on (producto_id)
    producto_id,
    lote_id,
    fecha,
    costo_unitario_centavos
  from v_costo_lote
  where total_gastos_centavos > 0
  order by producto_id, fecha desc, created_at desc
),
promedio_3_lotes as (
  select
    producto_id,
    case
      when sum(cantidad) = 0 then 0
      else round(sum(total_gastos_centavos)::numeric / sum(cantidad))::bigint
    end as costo_unitario_promedio_3_lotes_centavos,
    count(*) as lotes_considerados
  from lotes_rank
  where rn <= 3
  group by producto_id
)
select
  p.id as producto_id,
  p.nombre,
  p.presentacion_ml,
  u.lote_id as ultimo_lote_id,
  u.fecha as ultimo_lote_fecha,
  coalesce(u.costo_unitario_centavos, 0) as costo_unitario_ultimo_lote_centavos,
  coalesce(pr.costo_unitario_promedio_3_lotes_centavos, 0) as costo_unitario_promedio_3_lotes_centavos,
  coalesce(pr.lotes_considerados, 0) as lotes_considerados
from productos p
left join ultimo_con_gastos u on u.producto_id = p.id
left join promedio_3_lotes pr on pr.producto_id = p.id;

alter view v_costo_producto set (security_invoker = true);
revoke all on v_costo_producto from anon, public;
grant select on v_costo_producto to authenticated;
