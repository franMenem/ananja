-- Ananja: sección Ferias
--
-- Una feria es un contenedor de ventas y gastos que ya existen en el
-- modelo: una venta de feria sigue siendo un `comprobante` (con
-- `feria_id`), un gasto de feria sigue siendo un `gasto` (con `feria_id`).
-- La Caja general los ve igual que a cualquier otro. El aceite para
-- degustación descuenta stock real al crear la feria (egreso con
-- `feria_id`, sin `comprobante_id`); el stock "llevado" a la feria es solo
-- informativo (no mueve stock real).
--
-- Alcance:
--  1. Tablas `ferias` y `feria_productos`.
--  2. Columnas `feria_id` en `comprobantes`, `gastos`, `movimientos_stock`.
--  3. `comprobantes.imagen_path` pasa a NULL (foto opcional en ventas de
--     feria) con un CHECK que la sigue exigiendo fuera de una feria.
--  4. Categoría de gasto "Ferias".
--  5. Vistas `v_feria_totales` y `v_feria_stock`.
--  6. Triggers: `trg_ferias_vendedor` (fuerza vendedor_id),
--     `proteger_estado_feria` (estado solo vía RPC),
--     `proteger_degustacion_feria` (cantidad_degustacion inmutable).
--  7. RLS de `ferias` y `feria_productos`.
--  8. RPCs `crear_feria`, `cerrar_feria`, `reabrir_feria`.
--  9. `crear_comprobante`, `actualizar_comprobante`, `crear_gasto`
--     recreadas con `p_feria_id uuid default null`, conservando el
--     comportamiento actual cuando es null.

-- ============================================================
-- 1) Tablas ferias / feria_productos
-- ============================================================

create table ferias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (btrim(nombre) <> ''),
  lugar text,
  fecha_inicio date not null default current_date,
  fecha_fin date,
  estado text not null default 'abierta' check (estado in ('abierta', 'cerrada')),
  nota text,
  vendedor_id uuid not null references vendedores(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_ferias_updated_at
  before update on ferias
  for each row execute function set_updated_at();

create index idx_ferias_vendedor_id on ferias(vendedor_id);

create table feria_productos (
  id uuid primary key default gen_random_uuid(),
  feria_id uuid not null references ferias(id) on delete cascade,
  producto_id uuid not null references productos(id),
  precio_centavos bigint not null check (precio_centavos >= 0),
  cantidad_llevada int not null default 0 check (cantidad_llevada >= 0),
  cantidad_degustacion int not null default 0 check (cantidad_degustacion >= 0),
  unique (feria_id, producto_id)
);

create index idx_feria_productos_feria_id on feria_productos(feria_id);
create index idx_feria_productos_producto_id on feria_productos(producto_id);

-- ============================================================
-- 2) feria_id en tablas existentes
-- ============================================================

alter table comprobantes add column feria_id uuid references ferias(id) on delete restrict;
create index idx_comprobantes_feria_id on comprobantes(feria_id);

alter table gastos add column feria_id uuid references ferias(id) on delete restrict;
create index idx_gastos_feria_id on gastos(feria_id);

alter table movimientos_stock add column feria_id uuid references ferias(id) on delete restrict;
create index idx_movimientos_stock_feria_id on movimientos_stock(feria_id);

-- ============================================================
-- 3) comprobantes.imagen_path: opcional cuando pertenece a una feria
-- ============================================================

alter table comprobantes alter column imagen_path drop not null;

alter table comprobantes
  add constraint comprobantes_imagen_path_check
  check (imagen_path is not null or feria_id is not null);

-- ============================================================
-- 4) Categoría de gasto "Ferias"
-- ============================================================

insert into categorias_gasto (nombre) values ('Ferias') on conflict (nombre) do nothing;

-- ============================================================
-- 5) Vistas v_feria_totales / v_feria_stock (security_invoker = true)
-- ============================================================

create view v_feria_totales as
select
  f.id as feria_id,
  coalesce(sum(case when c.medio_pago = 'efectivo' then c.monto_centavos else 0 end), 0) as ventas_efectivo_centavos,
  coalesce(sum(case when c.medio_pago = 'mercado_pago' then c.monto_centavos else 0 end), 0) as ventas_mercado_pago_centavos,
  coalesce(sum(case when c.medio_pago = 'banco' then c.monto_centavos else 0 end), 0) as ventas_banco_centavos,
  coalesce(sum(c.monto_centavos), 0) as ventas_total_centavos,
  count(c.id) as cantidad_ventas,
  coalesce(g.gastos_total_centavos, 0) as gastos_total_centavos,
  coalesce(sum(c.monto_centavos), 0) - coalesce(g.gastos_total_centavos, 0) as neto_centavos
from ferias f
left join comprobantes c on c.feria_id = f.id
left join (
  select feria_id, sum(monto_centavos) as gastos_total_centavos
  from gastos
  where feria_id is not null
  group by feria_id
) g on g.feria_id = f.id
group by f.id, g.gastos_total_centavos;

alter view v_feria_totales set (security_invoker = true);
revoke all on v_feria_totales from anon, public;
grant select on v_feria_totales to authenticated;

create view v_feria_stock as
select
  fp.feria_id,
  fp.producto_id,
  fp.cantidad_llevada,
  fp.cantidad_degustacion,
  coalesce(v.cantidad_vendida, 0) as cantidad_vendida,
  fp.cantidad_llevada - coalesce(v.cantidad_vendida, 0) as cantidad_restante
from feria_productos fp
left join (
  select c.feria_id, ci.producto_id, sum(ci.cantidad) as cantidad_vendida
  from comprobante_items ci
  join comprobantes c on c.id = ci.comprobante_id
  where c.feria_id is not null
  group by c.feria_id, ci.producto_id
) v on v.feria_id = fp.feria_id and v.producto_id = fp.producto_id;

alter view v_feria_stock set (security_invoker = true);
revoke all on v_feria_stock from anon, public;
grant select on v_feria_stock to authenticated;

-- ============================================================
-- 6) Triggers
-- ============================================================

-- 6a) vendedor_id forzado al usuario logueado (mismo patrón que
--     `forzar_vendedor_movimiento_stock` de 0007_vendedores_auth.sql) —
--     red de seguridad: en la práctica el único alta es `crear_feria`.
create function public.forzar_vendedor_feria()
returns trigger
language plpgsql
security definer
set search_path = public
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

create trigger trg_ferias_vendedor
  before insert on ferias
  for each row execute function public.forzar_vendedor_feria();

revoke execute on function public.forzar_vendedor_feria() from anon, authenticated, public;

-- 6b) estado de ferias: solo vía cerrar_feria/reabrir_feria. Los dos RPC
--     hacen `perform set_config('ananja.cambio_estado', 'on', true)` antes
--     del update (el tercer argumento `true` = solo para esta transacción).
create function public.proteger_estado_feria()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.estado is distinct from old.estado
     and current_setting('ananja.cambio_estado', true) is distinct from 'on' then
    raise exception 'ESTADO_SOLO_VIA_RPC';
  end if;
  return new;
end;
$$;

create trigger trg_proteger_estado_feria
  before update on ferias
  for each row execute function public.proteger_estado_feria();

revoke execute on function public.proteger_estado_feria() from anon, authenticated, public;

-- 6c) cantidad_degustacion: inmutable después de creada la feria (ya movió
--     stock real). Si hace falta más degustación, se registra como egreso
--     manual desde Stock (fuera de alcance de este RPC).
create function public.proteger_degustacion_feria()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.cantidad_degustacion is distinct from old.cantidad_degustacion then
    raise exception 'DEGUSTACION_NO_MODIFICABLE';
  end if;
  return new;
end;
$$;

create trigger trg_proteger_degustacion_feria
  before update on feria_productos
  for each row execute function public.proteger_degustacion_feria();

revoke execute on function public.proteger_degustacion_feria() from anon, authenticated, public;

-- ============================================================
-- 7) RLS
-- ============================================================

alter table ferias enable row level security;
revoke all on ferias from anon, authenticated, public;
grant select, delete on ferias to authenticated;
grant update (nombre, lugar, fecha_inicio, fecha_fin, nota) on ferias to authenticated;

create policy ferias_select on ferias for select to authenticated using (true);
create policy ferias_update on ferias for update to authenticated using (true) with check (true);
create policy ferias_delete on ferias for delete to authenticated using (true);
-- Sin policy de insert: el alta es solo vía RPC crear_feria (security
-- definer, bypasea RLS). El FK `on delete restrict` de comprobantes/gastos/
-- movimientos_stock bloquea el delete directo si la feria tiene datos.

alter table feria_productos enable row level security;
revoke all on feria_productos from anon, authenticated, public;
grant select on feria_productos to authenticated;
grant update (precio_centavos, cantidad_llevada) on feria_productos to authenticated;

create policy feria_productos_select on feria_productos for select to authenticated using (true);
create policy feria_productos_update on feria_productos for update to authenticated using (true) with check (true);
-- Sin insert (solo vía crear_feria) ni delete (no permitido).

-- ============================================================
-- 8) RPCs de ferias
-- ============================================================

create function crear_feria(
  p_nombre text,
  p_lugar text,
  p_fecha_inicio date,
  p_nota text,
  p_productos jsonb,
  p_permitir_negativo boolean default false
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendedor_id uuid;
  v_feria_id uuid;
  v_producto jsonb;
  v_producto_id uuid;
  v_precio_centavos bigint;
  v_cantidad_llevada int;
  v_cantidad_degustacion int;
  v_stock int;
  v_umbral int;
  v_nombre_producto text;
  v_alertas text[] := array[]::text[];
begin
  select id into v_vendedor_id from vendedores where user_id = auth.uid();
  if v_vendedor_id is null then
    raise exception 'VENDEDOR_NO_REGISTRADO';
  end if;

  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'NOMBRE_INVALIDO';
  end if;

  if p_productos is null or jsonb_array_length(p_productos) <> 2 then
    raise exception 'PRODUCTOS_INVALIDOS';
  end if;

  insert into ferias (nombre, lugar, fecha_inicio, nota, vendedor_id)
  values (p_nombre, p_lugar, coalesce(p_fecha_inicio, current_date), p_nota, v_vendedor_id)
  returning id into v_feria_id;

  for v_producto in select * from jsonb_array_elements(p_productos)
  loop
    v_producto_id := (v_producto->>'producto_id')::uuid;
    v_precio_centavos := (v_producto->>'precio_centavos')::bigint;
    v_cantidad_llevada := coalesce((v_producto->>'cantidad_llevada')::int, 0);
    v_cantidad_degustacion := coalesce((v_producto->>'cantidad_degustacion')::int, 0);

    if v_producto_id is null or v_cantidad_llevada < 0 or v_cantidad_degustacion < 0 then
      raise exception 'PRODUCTOS_INVALIDOS';
    end if;

    if v_precio_centavos is null or v_precio_centavos < 0 then
      raise exception 'PRECIO_INVALIDO';
    end if;

    insert into feria_productos (feria_id, producto_id, precio_centavos, cantidad_llevada, cantidad_degustacion)
    values (v_feria_id, v_producto_id, v_precio_centavos, v_cantidad_llevada, v_cantidad_degustacion);

    if v_cantidad_degustacion > 0 then
      insert into movimientos_stock (producto_id, tipo, cantidad, vendedor_id, comprobante_id, feria_id, nota)
      values (v_producto_id, 'egreso', v_cantidad_degustacion, v_vendedor_id, null, v_feria_id, 'Degustación: ' || p_nombre);

      select s.stock, s.umbral_minimo, s.nombre into v_stock, v_umbral, v_nombre_producto
      from v_stock_actual s where s.producto_id = v_producto_id;

      if v_stock < 0 and not p_permitir_negativo then
        raise exception 'STOCK_INSUFICIENTE'
          using detail = json_build_object(
            'producto', v_nombre_producto,
            'producto_id', v_producto_id,
            'disponible', v_stock + v_cantidad_degustacion
          )::text;
      end if;

      if v_stock < v_umbral then
        insert into notificaciones (tipo, titulo, detalle, referencia_id)
        values (
          'stock_bajo',
          'Stock bajo: ' || v_nombre_producto,
          'Quedan ' || v_stock || ' unidades',
          v_producto_id
        );
        v_alertas := array_append(v_alertas, 'stock_bajo:' || v_nombre_producto);
      end if;
    end if;
  end loop;

  return json_build_object('id', v_feria_id, 'alertas', v_alertas);
end;
$$;

revoke execute on function crear_feria(text, text, date, text, jsonb, boolean) from anon, public;
grant execute on function crear_feria(text, text, date, text, jsonb, boolean) to authenticated;

create function cerrar_feria(p_feria_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  select estado into v_estado from ferias where id = p_feria_id;
  if v_estado is null then
    raise exception 'FERIA_NO_ENCONTRADA';
  end if;

  if v_estado = 'cerrada' then
    raise exception 'FERIA_YA_CERRADA';
  end if;

  perform set_config('ananja.cambio_estado', 'on', true);
  update ferias set estado = 'cerrada', fecha_fin = coalesce(fecha_fin, current_date)
  where id = p_feria_id;

  return json_build_object('id', p_feria_id);
end;
$$;

revoke execute on function cerrar_feria(uuid) from anon, public;
grant execute on function cerrar_feria(uuid) to authenticated;

create function reabrir_feria(p_feria_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existe boolean;
begin
  select exists(select 1 from ferias where id = p_feria_id) into v_existe;
  if not v_existe then
    raise exception 'FERIA_NO_ENCONTRADA';
  end if;

  perform set_config('ananja.cambio_estado', 'on', true);
  update ferias set estado = 'abierta' where id = p_feria_id;

  return json_build_object('id', p_feria_id);
end;
$$;

revoke execute on function reabrir_feria(uuid) from anon, public;
grant execute on function reabrir_feria(uuid) to authenticated;

-- ============================================================
-- 9) crear_comprobante / actualizar_comprobante / crear_gasto: agregan
--    p_feria_id uuid default null. Firmas viejas (0009/0010) copiadas
--    exactas para el drop.
-- ============================================================

drop function if exists crear_comprobante(bigint, medio_pago, text, date, text, estado_ocr, bigint, jsonb, boolean, uuid);
drop function if exists actualizar_comprobante(uuid, bigint, medio_pago, text, date, text, estado_ocr, bigint, jsonb, boolean, uuid);
drop function if exists crear_gasto(bigint, uuid, medio_pago, date, text, text, uuid);

create function crear_comprobante(
  p_monto_centavos bigint,
  p_medio_pago medio_pago,
  p_imagen_path text,
  p_fecha date,
  p_nota text default null,
  p_estado_ocr estado_ocr default 'no_intentado',
  p_ocr_monto_centavos bigint default null,
  p_items jsonb default '[]'::jsonb,
  p_permitir_negativo boolean default false,
  p_cliente_id uuid default null,
  p_feria_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendedor_id uuid;
  v_comprobante_id uuid;
  v_item jsonb;
  v_producto_id uuid;
  v_cantidad int;
  v_stock int;
  v_umbral int;
  v_nombre text;
  v_alertas text[] := array[]::text[];
  v_feria_estado text;
begin
  select id into v_vendedor_id from vendedores where user_id = auth.uid();
  if v_vendedor_id is null then
    raise exception 'VENDEDOR_NO_REGISTRADO';
  end if;

  if p_monto_centavos is null or p_monto_centavos <= 0 then
    raise exception 'MONTO_INVALIDO';
  end if;

  if p_items is null or jsonb_array_length(p_items) < 1 then
    raise exception 'SIN_ITEMS';
  end if;

  if p_cliente_id is not null and not exists (
    select 1 from clientes where id = p_cliente_id and activo
  ) then
    raise exception 'CLIENTE_INVALIDO';
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

  if p_feria_id is null and p_imagen_path is null then
    raise exception 'IMAGEN_REQUERIDA';
  end if;

  insert into comprobantes (
    vendedor_id, monto_centavos, medio_pago, imagen_path, fecha,
    estado_ocr, ocr_monto_centavos, nota, cliente_id, feria_id
  ) values (
    v_vendedor_id, p_monto_centavos, p_medio_pago, p_imagen_path,
    coalesce(p_fecha, current_date), coalesce(p_estado_ocr, 'no_intentado'),
    p_ocr_monto_centavos, p_nota, p_cliente_id, p_feria_id
  ) returning id into v_comprobante_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::int;

    if v_producto_id is null or v_cantidad is null or v_cantidad <= 0 then
      raise exception 'SIN_ITEMS';
    end if;

    insert into comprobante_items (comprobante_id, producto_id, cantidad)
    values (v_comprobante_id, v_producto_id, v_cantidad);

    insert into movimientos_stock (producto_id, tipo, cantidad, vendedor_id, comprobante_id, nota)
    values (v_producto_id, 'egreso', v_cantidad, v_vendedor_id, v_comprobante_id, null);

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

    if v_stock < v_umbral then
      insert into notificaciones (tipo, titulo, detalle, referencia_id)
      values (
        'stock_bajo',
        'Stock bajo: ' || v_nombre,
        'Quedan ' || v_stock || ' unidades',
        v_producto_id
      );
      v_alertas := array_append(v_alertas, 'stock_bajo:' || v_nombre);
    end if;
  end loop;

  return json_build_object('comprobante_id', v_comprobante_id, 'alertas', v_alertas);
end;
$$;

create function actualizar_comprobante(
  p_comprobante_id uuid,
  p_monto_centavos bigint,
  p_medio_pago medio_pago,
  p_imagen_path text,
  p_fecha date,
  p_nota text default null,
  p_estado_ocr estado_ocr default 'no_intentado',
  p_ocr_monto_centavos bigint default null,
  p_items jsonb default '[]'::jsonb,
  p_permitir_negativo boolean default false,
  p_cliente_id uuid default null,
  p_feria_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendedor_id uuid;
  v_item jsonb;
  v_producto_id uuid;
  v_cantidad int;
  v_stock int;
  v_umbral int;
  v_nombre text;
  v_alertas text[] := array[]::text[];
  v_feria_actual uuid;
  v_feria_estado text;
begin
  select id into v_vendedor_id from vendedores where user_id = auth.uid();
  if v_vendedor_id is null then
    raise exception 'VENDEDOR_NO_REGISTRADO';
  end if;

  if p_monto_centavos is null or p_monto_centavos <= 0 then
    raise exception 'MONTO_INVALIDO';
  end if;

  if p_items is null or jsonb_array_length(p_items) < 1 then
    raise exception 'SIN_ITEMS';
  end if;

  select feria_id into v_feria_actual from comprobantes where id = p_comprobante_id;
  if not found then
    raise exception 'COMPROBANTE_NO_ENCONTRADO';
  end if;

  if p_feria_id is distinct from v_feria_actual then
    raise exception 'FERIA_NO_MODIFICABLE';
  end if;

  if p_cliente_id is not null and not exists (
    select 1 from clientes where id = p_cliente_id and activo
  ) then
    raise exception 'CLIENTE_INVALIDO';
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

  if p_feria_id is null and p_imagen_path is null then
    raise exception 'IMAGEN_REQUERIDA';
  end if;

  delete from movimientos_stock where comprobante_id = p_comprobante_id;
  delete from comprobante_items where comprobante_id = p_comprobante_id;

  update comprobantes set
    vendedor_id = v_vendedor_id,
    monto_centavos = p_monto_centavos,
    medio_pago = p_medio_pago,
    imagen_path = p_imagen_path,
    fecha = coalesce(p_fecha, fecha),
    estado_ocr = coalesce(p_estado_ocr, estado_ocr),
    ocr_monto_centavos = p_ocr_monto_centavos,
    nota = p_nota,
    cliente_id = p_cliente_id
  where id = p_comprobante_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::int;

    if v_producto_id is null or v_cantidad is null or v_cantidad <= 0 then
      raise exception 'SIN_ITEMS';
    end if;

    insert into comprobante_items (comprobante_id, producto_id, cantidad)
    values (p_comprobante_id, v_producto_id, v_cantidad);

    insert into movimientos_stock (producto_id, tipo, cantidad, vendedor_id, comprobante_id, nota)
    values (v_producto_id, 'egreso', v_cantidad, v_vendedor_id, p_comprobante_id, null);

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

    if v_stock < v_umbral then
      insert into notificaciones (tipo, titulo, detalle, referencia_id)
      values (
        'stock_bajo',
        'Stock bajo: ' || v_nombre,
        'Quedan ' || v_stock || ' unidades',
        v_producto_id
      );
      v_alertas := array_append(v_alertas, 'stock_bajo:' || v_nombre);
    end if;
  end loop;

  return json_build_object('comprobante_id', p_comprobante_id, 'alertas', v_alertas);
end;
$$;

create function crear_gasto(
  p_monto_centavos bigint,
  p_categoria_id uuid,
  p_medio_pago medio_pago,
  p_fecha date,
  p_nota text default null,
  p_imagen_path text default null,
  p_lote_id uuid default null,
  p_feria_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
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

  if p_feria_id is not null then
    select estado into v_feria_estado from ferias where id = p_feria_id;
    if v_feria_estado is null then
      raise exception 'FERIA_NO_ENCONTRADA';
    end if;
    if v_feria_estado <> 'abierta' then
      raise exception 'FERIA_CERRADA';
    end if;
  end if;

  insert into gastos (vendedor_id, monto_centavos, categoria_id, medio_pago, fecha, nota, imagen_path, lote_id, feria_id)
  values (v_vendedor_id, p_monto_centavos, p_categoria_id, p_medio_pago, coalesce(p_fecha, current_date), p_nota, p_imagen_path, p_lote_id, p_feria_id)
  returning id into v_gasto_id;

  insert into notificaciones (tipo, titulo, detalle, referencia_id)
  values ('gasto_nuevo', 'Nuevo gasto registrado', p_nota, v_gasto_id);

  return json_build_object('gasto_id', v_gasto_id);
end;
$$;

revoke execute on function crear_comprobante(bigint, medio_pago, text, date, text, estado_ocr, bigint, jsonb, boolean, uuid, uuid) from anon, public;
revoke execute on function actualizar_comprobante(uuid, bigint, medio_pago, text, date, text, estado_ocr, bigint, jsonb, boolean, uuid, uuid) from anon, public;
revoke execute on function crear_gasto(bigint, uuid, medio_pago, date, text, text, uuid, uuid) from anon, public;

grant execute on function crear_comprobante(bigint, medio_pago, text, date, text, estado_ocr, bigint, jsonb, boolean, uuid, uuid) to authenticated;
grant execute on function actualizar_comprobante(uuid, bigint, medio_pago, text, date, text, estado_ocr, bigint, jsonb, boolean, uuid, uuid) to authenticated;
grant execute on function crear_gasto(bigint, uuid, medio_pago, date, text, text, uuid, uuid) to authenticated;
