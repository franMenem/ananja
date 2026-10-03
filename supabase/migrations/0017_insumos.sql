-- Ananja/Germá: sección "Insumos"
--
--
-- Insumos registra el stock de materia prima, envases y etiquetas que se
-- consumen para producir un lote — en paralelo a productos/v_stock_actual
-- (que registra el producto TERMINADO). Compras (registrar_compra_insumo)
-- también generan un costo en gastos, igual que cualquier otro gasto;
-- ajustes (ajustar_insumo) no. crear_lote (0015_lotes_multi.sql) se
-- recrea para descontar insumos según la receta de cada producto al crear
-- el lote, en la misma transacción.
--
-- Migración templated (__SCHEMA__, sin __BUCKET__ — no toca Storage). Ver
-- supabase/README.md para la convención de "escribir una vez, aplicar en
-- cada negocio".
--
-- Alcance:
--  1. Tabla insumos.
--  2. Tabla recetas.
--  3. Tabla movimientos_insumo + trigger forzar_vendedor_movimiento_insumo.
--  4. Vista v_stock_insumos (security_invoker).
--  5. RPC registrar_compra_insumo.
--  6. RPC ajustar_insumo.
--  7. RPC crear_insumo.
--  8. crear_lote recreada: descuenta insumos según receta, gana
--     p_permitir_negativo.
--  9. RLS de las tres tablas nuevas.
--  10. Seed de insumos/recetas de Ananja (@solo-public — ver
--      supabase/negocios/miel.seed.sql para el seed de Germá, que se
--      corre aparte, a mano, después de aplicar esta migración sobre el
--      schema miel).

-- ============================================================
-- 1) insumos
-- ============================================================

create table insumos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (btrim(nombre) <> ''),
  tipo text not null check (tipo in ('materia_prima', 'envase', 'etiqueta')),
  unidad text not null check (unidad in ('litro', 'kilo', 'unidad')),
  umbral_minimo numeric(12,3) not null default 0 check (umbral_minimo >= 0),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 2) recetas
-- ============================================================

create table recetas (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos(id),
  insumo_id uuid not null references insumos(id),
  cantidad numeric(12,3) not null check (cantidad > 0),
  unique (producto_id, insumo_id)
);

create index idx_recetas_producto_id on recetas(producto_id);
create index idx_recetas_insumo_id on recetas(insumo_id);

-- ============================================================
-- 3) movimientos_insumo
-- ============================================================

create table movimientos_insumo (
  id uuid primary key default gen_random_uuid(),
  insumo_id uuid not null references insumos(id),
  tipo tipo_movimiento not null,
  cantidad numeric(12,3) not null check (cantidad > 0),
  vendedor_id uuid not null references vendedores(id),
  gasto_id uuid references gastos(id) on delete cascade,
  lote_id uuid references lotes_produccion(id),
  nota text,
  created_at timestamptz not null default now()
);

create index idx_movimientos_insumo_insumo_id on movimientos_insumo(insumo_id);
create index idx_movimientos_insumo_gasto_id on movimientos_insumo(gasto_id);
create index idx_movimientos_insumo_lote_id on movimientos_insumo(lote_id);

create function __SCHEMA__.forzar_vendedor_movimiento_insumo()
returns trigger
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_vendedor_id uuid;
begin
  select id into v_vendedor_id from vendedores where user_id = auth.uid();
  if v_vendedor_id is null then
    raise exception 'VENDEDOR_NO_REGISTRADO';
  end if;

  new.vendedor_id := v_vendedor_id;
  return new;
end;
$$;

revoke execute on function __SCHEMA__.forzar_vendedor_movimiento_insumo() from anon, authenticated, public;

create trigger trg_movimientos_insumo_vendedor
  before insert on movimientos_insumo
  for each row execute function __SCHEMA__.forzar_vendedor_movimiento_insumo();

-- ============================================================
-- 4) v_stock_insumos — espejo de v_stock_actual, pero solo insumos
--    activos y con stock/umbral_minimo en numeric (no int).
-- ============================================================

create view v_stock_insumos as
select
  i.id as insumo_id,
  i.nombre,
  i.tipo,
  i.unidad,
  i.umbral_minimo,
  (
    coalesce(sum(case when m.tipo = 'ingreso' then m.cantidad else 0 end), 0)
    - coalesce(sum(case when m.tipo = 'egreso' then m.cantidad else 0 end), 0)
  ) as stock,
  (
    coalesce(sum(case when m.tipo = 'ingreso' then m.cantidad else 0 end), 0)
    - coalesce(sum(case when m.tipo = 'egreso' then m.cantidad else 0 end), 0)
  ) < i.umbral_minimo as bajo_umbral
from insumos i
left join movimientos_insumo m on m.insumo_id = i.id
where i.activo
group by i.id, i.nombre, i.tipo, i.unidad, i.umbral_minimo;

alter view v_stock_insumos set (security_invoker = true);
revoke all on v_stock_insumos from anon, public;
grant select on v_stock_insumos to authenticated;

-- ============================================================
-- 5) registrar_compra_insumo — crea un gasto (categoría "Insumos") y un
--    ingreso de insumo en una sola transacción. Reutiliza crear_gasto
--    (0015_lotes_multi.sql) para el alta del gasto en vez de duplicar el
--    insert + la notificación gasto_nuevo.
-- ============================================================

create function registrar_compra_insumo(
  p_insumo_id uuid,
  p_cantidad numeric,
  p_monto_centavos bigint,
  p_medio_pago medio_pago,
  p_fecha date,
  p_nota text default null,
  p_imagen_path text default null
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_vendedor_id uuid;
  v_insumo_nombre text;
  v_insumo_unidad text;
  v_categoria_id uuid;
  v_gasto_resultado json;
  v_gasto_id uuid;
  v_movimiento_id uuid;
  v_nota text;
begin
  select id into v_vendedor_id from vendedores where user_id = auth.uid();
  if v_vendedor_id is null then
    raise exception 'VENDEDOR_NO_REGISTRADO';
  end if;

  select nombre, unidad into v_insumo_nombre, v_insumo_unidad
  from insumos where id = p_insumo_id and activo;
  if not found then
    raise exception 'INSUMO_INVALIDO';
  end if;

  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'CANTIDAD_INVALIDA';
  end if;

  if p_monto_centavos is null or p_monto_centavos <= 0 then
    raise exception 'MONTO_INVALIDO';
  end if;

  select id into v_categoria_id from categorias_gasto where nombre = 'Insumos';
  if v_categoria_id is null then
    raise exception 'CATEGORIA_INSUMOS_FALTANTE';
  end if;

  v_nota := coalesce(
    nullif(btrim(p_nota), ''),
    'Compra: ' || v_insumo_nombre || ' × ' || p_cantidad || ' ' || v_insumo_unidad
  );

  v_gasto_resultado := crear_gasto(
    p_monto_centavos := p_monto_centavos,
    p_categoria_id := v_categoria_id,
    p_medio_pago := p_medio_pago,
    p_fecha := p_fecha,
    p_nota := v_nota,
    p_imagen_path := p_imagen_path
  );
  v_gasto_id := (v_gasto_resultado->>'gasto_id')::uuid;

  insert into movimientos_insumo (insumo_id, tipo, cantidad, vendedor_id, gasto_id, nota)
  values (p_insumo_id, 'ingreso', p_cantidad, v_vendedor_id, v_gasto_id, v_nota)
  returning id into v_movimiento_id;

  return json_build_object('gasto_id', v_gasto_id, 'movimiento_id', v_movimiento_id);
end;
$$;

revoke execute on function registrar_compra_insumo(uuid, numeric, bigint, medio_pago, date, text, text) from anon, public;
grant execute on function registrar_compra_insumo(uuid, numeric, bigint, medio_pago, date, text, text) to authenticated;

-- ============================================================
-- 6) ajustar_insumo — carga positiva o negativa sin costo asociado, nota
--    obligatoria.
-- ============================================================

create function ajustar_insumo(
  p_insumo_id uuid,
  p_cantidad numeric,
  p_nota text
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_vendedor_id uuid;
  v_tipo tipo_movimiento;
  v_movimiento_id uuid;
begin
  select id into v_vendedor_id from vendedores where user_id = auth.uid();
  if v_vendedor_id is null then
    raise exception 'VENDEDOR_NO_REGISTRADO';
  end if;

  if not exists (select 1 from insumos where id = p_insumo_id and activo) then
    raise exception 'INSUMO_INVALIDO';
  end if;

  if p_nota is null or btrim(p_nota) = '' then
    raise exception 'NOTA_REQUERIDA';
  end if;

  if p_cantidad is null or p_cantidad = 0 then
    raise exception 'CANTIDAD_INVALIDA';
  end if;

  v_tipo := case when p_cantidad > 0 then 'ingreso' else 'egreso' end;

  insert into movimientos_insumo (insumo_id, tipo, cantidad, vendedor_id, nota)
  values (p_insumo_id, v_tipo, abs(p_cantidad), v_vendedor_id, p_nota)
  returning id into v_movimiento_id;

  return json_build_object('movimiento_id', v_movimiento_id);
end;
$$;

revoke execute on function ajustar_insumo(uuid, numeric, text) from anon, public;
grant execute on function ajustar_insumo(uuid, numeric, text) to authenticated;

-- ============================================================
-- 7) crear_insumo — alta de un insumo nuevo desde la app.
-- ============================================================

create function crear_insumo(
  p_nombre text,
  p_tipo text,
  p_unidad text,
  p_umbral_minimo numeric default 0
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_vendedor_id uuid;
  v_insumo_id uuid;
begin
  select id into v_vendedor_id from vendedores where user_id = auth.uid();
  if v_vendedor_id is null then
    raise exception 'VENDEDOR_NO_REGISTRADO';
  end if;

  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'NOMBRE_INVALIDO';
  end if;

  insert into insumos (nombre, tipo, unidad, umbral_minimo)
  values (btrim(p_nombre), p_tipo, p_unidad, coalesce(p_umbral_minimo, 0))
  returning id into v_insumo_id;

  return json_build_object('id', v_insumo_id);
end;
$$;

revoke execute on function crear_insumo(text, text, text, numeric) from anon, public;
grant execute on function crear_insumo(text, text, text, numeric) to authenticated;

-- ============================================================
-- 8) crear_lote: recreada — descuenta insumos según receta, gana
--    p_permitir_negativo boolean default false al final. Firma vieja
--    exacta para el drop: crear_lote(date, text, jsonb) (0015_lotes_multi.sql).
-- ============================================================

drop function if exists crear_lote(date, text, jsonb);

create function crear_lote(
  p_fecha date,
  p_nota text default null,
  p_items jsonb default null,
  p_permitir_negativo boolean default false
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
  v_receta record;
  v_consumo numeric;
  v_stock numeric;
  v_insumo_nombre text;
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

    -- Consumo de insumos según receta del producto (decisión 4 del spec de
    -- Insumos): sin receta para este producto, el for no itera y no
    -- descuenta nada.
    for v_receta in
      select insumo_id, cantidad from recetas where producto_id = v_producto_id
    loop
      v_consumo := v_receta.cantidad * v_cantidad;

      insert into movimientos_insumo (insumo_id, tipo, cantidad, vendedor_id, lote_id, nota)
      values (v_receta.insumo_id, 'egreso', v_consumo, v_vendedor_id, v_lote_id, p_nota);

      select stock, nombre into v_stock, v_insumo_nombre
      from v_stock_insumos where insumo_id = v_receta.insumo_id;

      if v_stock is not null and v_stock < 0 and not p_permitir_negativo then
        raise exception 'INSUMO_INSUFICIENTE'
          using detail = json_build_object(
            'insumo', v_insumo_nombre,
            'insumo_id', v_receta.insumo_id,
            'disponible', v_stock + v_consumo
          )::text;
      end if;
    end loop;
  end loop;

  return json_build_object('lote_id', v_lote_id);
end;
$$;

revoke execute on function crear_lote(date, text, jsonb, boolean) from anon, public;
grant execute on function crear_lote(date, text, jsonb, boolean) to authenticated;

-- ============================================================
-- 9) RLS
-- ============================================================

alter table insumos enable row level security;
revoke all on insumos from anon, authenticated, public;
grant select on insumos to authenticated;
grant update (nombre, umbral_minimo, activo) on insumos to authenticated;

create policy insumos_select on insumos for select to authenticated
  using (__SCHEMA__.es_vendedor());

create policy insumos_update on insumos for update to authenticated
  using (__SCHEMA__.es_vendedor()) with check (__SCHEMA__.es_vendedor());
-- Sin insert directo: el alta es solo vía crear_insumo. Sin delete: baja
-- lógica vía `activo`, igual criterio que `clientes`.

alter table recetas enable row level security;
revoke all on recetas from anon, authenticated, public;
grant select on recetas to authenticated;

create policy recetas_select on recetas for select to authenticated
  using (__SCHEMA__.es_vendedor());
-- Sin insert/update/delete: las recetas se editan por migración (decisión
-- 6 del spec), no desde la UI.

alter table movimientos_insumo enable row level security;
revoke all on movimientos_insumo from anon, authenticated, public;
grant select on movimientos_insumo to authenticated;

create policy movimientos_insumo_select on movimientos_insumo for select to authenticated
  using (__SCHEMA__.es_vendedor());
-- Sin insert/update/delete directo: todo alta es vía RPC (security
-- definer, no depende de estos grants para escribir).

-- ============================================================
-- 10) Seed de Ananja (@solo-public) — ver supabase/negocios/miel.seed.sql
--     para el seed de Germá.
-- ============================================================

-- @solo-public:inicio
insert into insumos (nombre, tipo, unidad, umbral_minimo) values
  ('Aceite a granel', 'materia_prima', 'litro', 0),
  ('Envase 250', 'envase', 'unidad', 0),
  ('Envase 500', 'envase', 'unidad', 0),
  ('Etiqueta chica frente', 'etiqueta', 'unidad', 0),
  ('Etiqueta chica retro', 'etiqueta', 'unidad', 0),
  ('Etiqueta grande frente', 'etiqueta', 'unidad', 0),
  ('Etiqueta grande retro', 'etiqueta', 'unidad', 0)
on conflict (nombre) do nothing;

insert into recetas (producto_id, insumo_id, cantidad)
select p.id, i.id, v.cantidad
from (values
  (500, 'Aceite a granel', 0.5),
  (500, 'Envase 500', 1),
  (500, 'Etiqueta grande frente', 1),
  (500, 'Etiqueta grande retro', 1),
  (250, 'Aceite a granel', 0.25),
  (250, 'Envase 250', 1),
  (250, 'Etiqueta chica frente', 1),
  (250, 'Etiqueta chica retro', 1)
) as v(presentacion_ml, insumo_nombre, cantidad)
join productos p on p.presentacion_ml = v.presentacion_ml
join insumos i on i.nombre = v.insumo_nombre
on conflict (producto_id, insumo_id) do nothing;
-- @solo-public:fin
