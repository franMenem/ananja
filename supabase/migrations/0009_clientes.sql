-- Ananja: clientes con ficha completa e historial de compras
--
-- Decisión del dueño (2026-09-02): clientes con ficha completa donde SOLO
-- nombre/empresa es obligatorio (teléfono, dirección, email y nota son
-- opcionales); el cliente es OPCIONAL en cada comprobante ("en caso de ser
-- necesario"); el historial de compras por cliente se arma consultando
-- `comprobantes.cliente_id` — no hay tabla de historial separada.
--
-- Alcance:
--  1. Tabla `clientes` (baja lógica con `activo`, igual criterio que
--     `vendedores` — nunca se borra si tiene comprobantes asociados).
--  2. `comprobantes.cliente_id` nullable -> clientes(id).
--  3. `crear_comprobante` / `actualizar_comprobante` recreadas con el
--     parámetro nuevo `p_cliente_id uuid default null` (resto idéntico a
--     supabase/migrations/0007_vendedores_auth.sql); validan que si viene
--     cliente_id, exista un cliente activo con ese id, si no
--     `CLIENTE_INVALIDO`.

-- ============================================================
-- 1) Tabla clientes
-- ============================================================

create table clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text,
  direccion text,
  email text,
  nota text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table clientes
  add constraint clientes_nombre_check check (btrim(nombre) <> '');

alter table clientes enable row level security;

create policy clientes_select on clientes
  for select to authenticated using (true);

create policy clientes_insert on clientes
  for insert to authenticated with check (true);

create policy clientes_update on clientes
  for update to authenticated using (true) with check (true);

-- Sin policy de delete: baja lógica vía `activo` (mismo criterio que
-- `vendedores`), igual que el resto del esquema no admite delete directo
-- desde el cliente para estas entidades de catálogo.

create trigger trg_clientes_updated_at
  before update on clientes
  for each row execute function set_updated_at();

-- ============================================================
-- 2) comprobantes.cliente_id (opcional)
-- ============================================================

alter table comprobantes
  add column cliente_id uuid references clientes(id);

create index idx_comprobantes_cliente_id on comprobantes(cliente_id);

-- ============================================================
-- 3) RPCs: agregar p_cliente_id (default null) a crear/actualizar
--    comprobante, manteniendo el resto idéntico a 0007_vendedores_auth.sql
-- ============================================================

drop function if exists crear_comprobante(bigint, medio_pago, text, date, text, estado_ocr, bigint, jsonb, boolean);
drop function if exists actualizar_comprobante(uuid, bigint, medio_pago, text, date, text, estado_ocr, bigint, jsonb, boolean);

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
  p_cliente_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
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

  insert into comprobantes (
    vendedor_id, monto_centavos, medio_pago, imagen_path, fecha,
    estado_ocr, ocr_monto_centavos, nota, cliente_id
  ) values (
    v_vendedor_id, p_monto_centavos, p_medio_pago, p_imagen_path,
    coalesce(p_fecha, current_date), coalesce(p_estado_ocr, 'no_intentado'),
    p_ocr_monto_centavos, p_nota, p_cliente_id
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
  p_cliente_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
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

  if not exists (select 1 from comprobantes where id = p_comprobante_id) then
    raise exception 'COMPROBANTE_NO_ENCONTRADO';
  end if;

  if p_cliente_id is not null and not exists (
    select 1 from clientes where id = p_cliente_id and activo
  ) then
    raise exception 'CLIENTE_INVALIDO';
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

revoke execute on function crear_comprobante(bigint, medio_pago, text, date, text, estado_ocr, bigint, jsonb, boolean, uuid) from public, anon;
revoke execute on function actualizar_comprobante(uuid, bigint, medio_pago, text, date, text, estado_ocr, bigint, jsonb, boolean, uuid) from public, anon;

grant execute on function crear_comprobante(bigint, medio_pago, text, date, text, estado_ocr, bigint, jsonb, boolean, uuid) to authenticated;
grant execute on function actualizar_comprobante(uuid, bigint, medio_pago, text, date, text, estado_ocr, bigint, jsonb, boolean, uuid) to authenticated;
