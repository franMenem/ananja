-- Ananja/Germá: lotes de producción con varias presentaciones
--
--
-- Migración templada (__SCHEMA__, sin __BUCKET__ — no toca Storage). Ver
-- supabase/README.md para la convención de "escribir una vez, aplicar en
-- cada negocio".
--
-- Alcance:
--  1. Tabla lote_items (una fila por presentación dentro de un lote).
--  2. Migra los lotes existentes: un lote_items por lote actual (decisión 4
--     del spec), y dropea lotes_produccion.producto_id/cantidad.
--  3. gastos.producto_id (gasto directo de una presentación) + CHECK +
--     trigger validar_producto_en_lote.
--  4. crear_lote recreada: p_fecha, p_nota, p_items (array de
--     {producto_id, cantidad}) en vez de producto_id/cantidad sueltos.
--  5. crear_gasto recreada: gana p_producto_id (default null, al final).
--  6. Vistas v_costo_lote_item (nueva, por presentación), v_costo_lote
--     (ahora por lote, con items jsonb) y v_costo_producto (recalculada
--     sobre v_costo_lote_item, mismas columnas de salida que hoy).
--
-- Orden del archivo (las vistas dependen de columnas que se borran, así que
-- hay que dropearlas antes del alter table y recrearlas al final — ver
-- spec § Migración de datos):
--  a) crear lote_items (con RLS) — tiene que existir antes de poder migrar
--     datos hacia ella.
--  b) migrar los lotes existentes: 1 lote_items por lote.
--  c) dropear v_costo_producto y v_costo_lote (en ese orden: v_costo_producto
--     depende de v_costo_lote).
--  d) alter table lotes_produccion drop column producto_id, cantidad.
--  e) gastos.producto_id + CHECK + trigger validar_producto_en_lote.
--  f) crear_lote / crear_gasto recreadas.
--  g) recrear v_costo_lote_item, v_costo_lote, v_costo_producto.

-- ============================================================
-- a) lote_items
-- ============================================================

create table lote_items (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references lotes_produccion(id) on delete cascade,
  producto_id uuid not null references productos(id),
  cantidad int not null check (cantidad > 0),
  unique (lote_id, producto_id)
);

create index idx_lote_items_lote_id on lote_items(lote_id);
create index idx_lote_items_producto_id on lote_items(producto_id);

alter table lote_items enable row level security;
revoke all on lote_items from anon, authenticated, public;
grant select on lote_items to authenticated;

create policy lote_items_select on lote_items for select to authenticated
  using (__SCHEMA__.es_vendedor());

-- Sin insert/update/delete para el cliente: el alta es solo vía crear_lote
-- (security definer), mismo criterio que lotes_produccion hoy.

-- ============================================================
-- b) Migrar los lotes existentes: un lote_items por lote (decisión 4 del
--    spec — cada lote actual tiene una sola presentación). No se toca
--    gastos.lote_id acá: los gastos ya asignados a un lote quedan con
--    producto_id = null (compartidos) — ver spec § "Efecto sobre los datos
--    existentes" para por qué esto no cambia ningún número ya mostrado.
-- ============================================================

insert into lote_items (lote_id, producto_id, cantidad)
select id, producto_id, cantidad from lotes_produccion;

-- ============================================================
-- c) Dropear las vistas que dependen de las columnas que se borran
--    (v_costo_producto depende de v_costo_lote, por eso en ese orden).
-- ============================================================

drop view v_costo_producto;
drop view v_costo_lote;

-- ============================================================
-- d) lotes_produccion pierde producto_id/cantidad — ahora vive en
--    lote_items. El índice idx_lotes_produccion_producto_id se cae solo
--    junto con la columna.
-- ============================================================

alter table lotes_produccion drop column producto_id, drop column cantidad;

-- ============================================================
-- e) gastos.producto_id: gasto directo de UNA presentación del lote (null =
--    compartido entre todas). CHECK + trigger que valida que la
--    presentación exista en el lote asignado, para cualquier vía de
--    escritura (RPC o update directo — components/stock/asignar-gasto.tsx
--    hace update({lote_id}) directo, permitido por RLS).
-- ============================================================

alter table gastos add column producto_id uuid references productos(id);
create index idx_gastos_producto_id on gastos(producto_id);

alter table gastos add constraint gastos_producto_id_requiere_lote
  check (producto_id is null or lote_id is not null);

create function __SCHEMA__.validar_producto_en_lote()
returns trigger
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
begin
  if new.producto_id is null then
    return new;
  end if;

  if not exists (
    select 1 from lote_items
    where lote_id = new.lote_id and producto_id = new.producto_id
  ) then
    raise exception 'PRODUCTO_NO_EN_LOTE';
  end if;

  return new;
end;
$$;

revoke execute on function __SCHEMA__.validar_producto_en_lote() from anon, authenticated, public;

create trigger trg_gastos_validar_producto_en_lote
  before insert or update on gastos
  for each row execute function __SCHEMA__.validar_producto_en_lote();

-- ============================================================
-- f.1) crear_lote: firma nueva (p_fecha, p_nota, p_items jsonb) — un lote
--      puede tener varias presentaciones. Se dropea la firma vieja porque
--      los tipos de parámetros no coinciden (sin el drop explícito
--      Postgres las trataría como dos funciones distintas por overload).
-- ============================================================

drop function if exists crear_lote(uuid, int, date, text);

create function crear_lote(
  p_fecha date,
  p_nota text default null,
  p_items jsonb default null
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_vendedor_id uuid;
  v_lote_id uuid;
  v_item jsonb;
  v_producto_id uuid;
  v_cantidad int;
  v_vistos uuid[] := '{}';
begin
  select id into v_vendedor_id from vendedores where user_id = auth.uid();
  if v_vendedor_id is null then
    raise exception 'VENDEDOR_NO_REGISTRADO';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'SIN_ITEMS';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::int;

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'CANTIDAD_INVALIDA';
    end if;

    if v_producto_id is null or not exists (select 1 from productos where id = v_producto_id) then
      raise exception 'PRODUCTO_INVALIDO';
    end if;

    if v_producto_id = any(v_vistos) then
      raise exception 'PRODUCTO_INVALIDO';
    end if;
    v_vistos := array_append(v_vistos, v_producto_id);
  end loop;

  insert into lotes_produccion (fecha, nota, vendedor_id)
  values (coalesce(p_fecha, current_date), p_nota, v_vendedor_id)
  returning id into v_lote_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::int;

    insert into lote_items (lote_id, producto_id, cantidad)
    values (v_lote_id, v_producto_id, v_cantidad);

    insert into movimientos_stock (producto_id, tipo, cantidad, vendedor_id, lote_id, nota)
    values (v_producto_id, 'ingreso', v_cantidad, v_vendedor_id, v_lote_id, p_nota);
  end loop;

  return json_build_object('lote_id', v_lote_id);
end;
$$;

revoke execute on function crear_lote(date, text, jsonb) from anon, public;
grant execute on function crear_lote(date, text, jsonb) to authenticated;

-- ============================================================
-- f.2) crear_gasto: gana p_producto_id (default null, al final de la
--      lista, para no romper llamadas posicionales existentes) — gasto
--      directo de una presentación del lote asignado (null = compartido).
--      Cuerpo copiado de supabase/migrations/0011_ferias.sql (líneas
--      653-705), con la validación nueva agregada antes del insert y
--      set search_path = __SCHEMA__ en vez de public (0011 es una
--      migración "suelta" que hardcodea public — ver supabase/README.md).
-- ============================================================

drop function if exists crear_gasto(bigint, uuid, medio_pago, date, text, text, uuid, uuid);

create function crear_gasto(
  p_monto_centavos bigint,
  p_categoria_id uuid,
  p_medio_pago medio_pago,
  p_fecha date,
  p_nota text default null,
  p_imagen_path text default null,
  p_lote_id uuid default null,
  p_feria_id uuid default null,
  p_producto_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_vendedor_id uuid;
  v_gasto_id uuid;
  v_feria_estado text;
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

  if p_producto_id is not null then
    if p_lote_id is null then
      raise exception 'PRODUCTO_NO_EN_LOTE';
    end if;
    if not exists (
      select 1 from lote_items
      where lote_id = p_lote_id and producto_id = p_producto_id
    ) then
      raise exception 'PRODUCTO_NO_EN_LOTE';
    end if;
  end if;

  if p_feria_id is not null then
    select estado into v_feria_estado from ferias where id = p_feria_id;
    if v_feria_estado is null then
      raise exception 'FERIA_NO_ENCONTRADA';
    end if;
    if v_feria_estado <> 'abierta' then
      raise exception 'FERIA_CERRADA';
    end if;
  end if;

  insert into gastos (vendedor_id, monto_centavos, categoria_id, medio_pago, fecha, nota, imagen_path, lote_id, feria_id, producto_id)
  values (v_vendedor_id, p_monto_centavos, p_categoria_id, p_medio_pago, coalesce(p_fecha, current_date), p_nota, p_imagen_path, p_lote_id, p_feria_id, p_producto_id)
  returning id into v_gasto_id;

  insert into notificaciones (tipo, titulo, detalle, referencia_id)
  values ('gasto_nuevo', 'Nuevo gasto registrado', p_nota, v_gasto_id);

  return json_build_object('gasto_id', v_gasto_id);
end;
$$;

revoke execute on function crear_gasto(bigint, uuid, medio_pago, date, text, text, uuid, uuid, uuid) from anon, public;
grant execute on function crear_gasto(bigint, uuid, medio_pago, date, text, text, uuid, uuid, uuid) to authenticated;

-- ============================================================
-- g.1) v_costo_lote_item: una fila por (lote_id, producto_id). El CTE
--      peso_item es la ÚNICA expresión SQL que conoce la regla de reparto
--      de compartidos (decisión 3 del spec): volumen = presentación ×
--      cantidad. Cambiar a reparto por cantidad de unidades es tocar solo
--      esta línea acá y pesoItem() en lib/calculos.ts.
--
--      El cast ::numeric sobre cl.total es obligatorio: sin él,
--      cl.total * pi.peso / sum(pi.peso) es división entera (bigint/int),
--      Postgres trunca el cociente ANTES de que round() lo reciba.
-- ============================================================

create view v_costo_lote_item as
with peso_item as (
  select li.lote_id, li.producto_id, p.presentacion_ml * li.cantidad as peso
  from lote_items li
  join productos p on p.id = li.producto_id
),
compartidos_lote as (
  select lote_id, sum(monto_centavos) as total
  from gastos
  where lote_id is not null and producto_id is null
  group by lote_id
),
compartidos_item as (
  select
    pi.lote_id,
    pi.producto_id,
    coalesce(round(
      cl.total::numeric * pi.peso / sum(pi.peso) over (partition by pi.lote_id)
    ), 0)::bigint as gastos_compartidos_centavos
  from peso_item pi
  left join compartidos_lote cl on cl.lote_id = pi.lote_id
),
directos_item as (
  select lote_id, producto_id, sum(monto_centavos) as gastos_directos_centavos
  from gastos
  where lote_id is not null and producto_id is not null
  group by lote_id, producto_id
)
select
  li.lote_id,
  li.producto_id,
  p.nombre as producto_nombre,
  p.presentacion_ml,
  li.cantidad,
  l.fecha,
  l.created_at,
  coalesce(di.gastos_directos_centavos, 0) as gastos_directos_centavos,
  coalesce(ci.gastos_compartidos_centavos, 0) as gastos_compartidos_centavos,
  coalesce(di.gastos_directos_centavos, 0) + coalesce(ci.gastos_compartidos_centavos, 0)
    as total_gastos_centavos,
  case
    when coalesce(di.gastos_directos_centavos, 0) + coalesce(ci.gastos_compartidos_centavos, 0) = 0
      then 0
    else round(
      (coalesce(di.gastos_directos_centavos, 0) + coalesce(ci.gastos_compartidos_centavos, 0))::numeric
      / li.cantidad
    )::bigint
  end as costo_unitario_centavos
from lote_items li
join productos p on p.id = li.producto_id
join lotes_produccion l on l.id = li.lote_id
left join compartidos_item ci on ci.lote_id = li.lote_id and ci.producto_id = li.producto_id
left join directos_item di on di.lote_id = li.lote_id and di.producto_id = li.producto_id;

alter view v_costo_lote_item set (security_invoker = true);
revoke all on v_costo_lote_item from anon, public;
grant select on v_costo_lote_item to authenticated;

-- ============================================================
-- g.2) v_costo_lote: una fila por LOTE (ya no por producto). total_gastos_
--      centavos se calcula DIRECTO de gastos (no sumando v_costo_lote_item)
--      — es la fuente de verdad contra la que el invariante 7 compara el
--      prorrateo, ver spec § Vista v_costo_lote. items es jsonb ordenado
--      por presentacion_ml desc para que /stock/lotes y LoteSelect arme
--      "100 × 500 ml · 50 × 250 ml" sin una segunda consulta.
-- ============================================================

create view v_costo_lote as
select
  l.id as lote_id,
  l.fecha,
  l.nota,
  l.vendedor_id,
  l.created_at,
  coalesce(ti.cantidad_total, 0) as cantidad_total,
  coalesce(g.total_gastos_centavos, 0) as total_gastos_centavos,
  coalesce(g.gastos_asignados, 0) as gastos_asignados,
  coalesce(it.items, '[]'::jsonb) as items
from lotes_produccion l
left join (
  select lote_id, sum(cantidad) as cantidad_total
  from lote_items
  group by lote_id
) ti on ti.lote_id = l.id
left join (
  select lote_id, sum(monto_centavos) as total_gastos_centavos, count(*) as gastos_asignados
  from gastos
  where lote_id is not null
  group by lote_id
) g on g.lote_id = l.id
left join (
  select
    li.lote_id,
    jsonb_agg(
      jsonb_build_object(
        'producto_id', li.producto_id,
        'producto_nombre', p.nombre,
        'presentacion_ml', p.presentacion_ml,
        'cantidad', li.cantidad
      )
      order by p.presentacion_ml desc
    ) as items
  from lote_items li
  join productos p on p.id = li.producto_id
  group by li.lote_id
) it on it.lote_id = l.id;

alter view v_costo_lote set (security_invoker = true);
revoke all on v_costo_lote from anon, public;
grant select on v_costo_lote to authenticated;

-- ============================================================
-- g.3) v_costo_producto: MISMAS columnas de salida que hoy en
--      0010_lotes_produccion.sql (no cambia el contrato hacia
--      components/stock/stock-card.tsx). Recalculada sobre
--      v_costo_lote_item en vez de v_costo_lote: "último lote" pasa a ser
--      "último ítem de ese producto con total_gastos_centavos > 0".
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
  from v_costo_lote_item
),
ultimo_con_gastos as (
  select distinct on (producto_id)
    producto_id,
    lote_id,
    fecha,
    costo_unitario_centavos
  from v_costo_lote_item
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
