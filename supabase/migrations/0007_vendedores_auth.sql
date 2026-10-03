-- Ananja: vendedores = usuarios individuales de Supabase Auth
--
-- Decisión revisada del dueño (2026-09-02): se abandona la cuenta compartida
-- "equipo@example.com" + selector manual de vendedor. Cada vendedor entra
-- con su propio usuario de Supabase Auth (dado de alta por el dueño desde el
-- dashboard) y toda operación se atribuye automáticamente al usuario
-- logueado (auth.uid()), sin selector en el cliente.
--
-- Alcance:
--  1. vendedores.user_id -> auth.users, único.
--  2. Trigger en auth.users (AFTER INSERT) que crea la fila en vendedores
--     automáticamente: el dueño solo crea el usuario en el dashboard.
--  3. Backfill de los auth.users existentes sin vendedor vinculado.
--  4. RPCs (crear_comprobante, actualizar_comprobante, crear_gasto,
--     crear_ajuste_caja) recreados SIN el parámetro p_vendedor_id: resuelven
--     el vendedor desde auth.uid(); error VENDEDOR_NO_REGISTRADO si el
--     usuario logueado no tiene fila en vendedores.
--  5. Trigger BEFORE INSERT en movimientos_stock que fuerza vendedor_id al
--     del usuario logueado, ignorando lo que mande el cliente.
--  6. RLS de vendedores: el alta ya no es responsabilidad del cliente (la
--     hace el trigger, que corre con privilegios de owner y bypassea RLS),
--     así que se revoca insert y se acota el update a nombre/activo.

-- ============================================================
-- 1) vendedores.user_id
-- ============================================================

alter table vendedores
  add column user_id uuid unique references auth.users(id);

-- ============================================================
-- 2) Alta automática de vendedor al crear un auth.user
-- ============================================================

-- @solo-public:inicio
create function __SCHEMA__.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_nombre text;
begin
  v_nombre := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'display_name'), ''),
    split_part(new.email, '@', 1)
  );

  insert into __SCHEMA__.vendedores (nombre, user_id, activo)
  values (v_nombre, new.id, true)
  on conflict (user_id) do nothing;

  return new;
exception
  when unique_violation then
    -- El nombre ya lo usa otro vendedor (ej. alta manual previa con el
    -- mismo nombre): se agrega un sufijo corto del id para no bloquear el
    -- alta del usuario en auth.users.
    insert into __SCHEMA__.vendedores (nombre, user_id, activo)
    values (v_nombre || ' (' || substr(new.id::text, 1, 4) || ')', new.id, true)
    on conflict (user_id) do nothing;
    return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function __SCHEMA__.handle_new_auth_user();

-- ============================================================
-- 3) Backfill: auth.users existentes sin vendedor vinculado
-- ============================================================

do $$
declare
  u record;
  v_nombre text;
  v_existing_id uuid;
begin
  for u in
    select au.id, au.email, au.raw_user_meta_data
    from auth.users au
    left join __SCHEMA__.vendedores v on v.user_id = au.id
    where v.id is null
  loop
    if u.email = 'equipo@example.com' then
      -- Cuenta compartida legada: queda como vendedor "Equipo" (no se borra).
      v_nombre := 'Equipo';
    else
      v_nombre := coalesce(
        nullif(btrim(u.raw_user_meta_data->>'display_name'), ''),
        split_part(u.email, '@', 1)
      );
    end if;

    -- Si ya existe un vendedor sin usuario con ese nombre (alta manual
    -- previa desde el selector viejo), se vincula en vez de duplicar.
    select id into v_existing_id
    from __SCHEMA__.vendedores
    where lower(nombre) = lower(v_nombre) and user_id is null
    limit 1;

    if v_existing_id is not null then
      update __SCHEMA__.vendedores set user_id = u.id where id = v_existing_id;
    else
      insert into __SCHEMA__.vendedores (nombre, user_id, activo)
      values (v_nombre, u.id, true)
      on conflict (user_id) do nothing;
    end if;
  end loop;
end $$;
-- @solo-public:fin

-- ============================================================
-- 4) RPCs: resolver vendedor_id desde auth.uid(), sin p_vendedor_id
-- ============================================================

drop function if exists crear_comprobante(uuid, bigint, medio_pago, text, date, text, estado_ocr, bigint, jsonb, boolean);
drop function if exists actualizar_comprobante(uuid, uuid, bigint, medio_pago, text, date, text, estado_ocr, bigint, jsonb, boolean);
drop function if exists crear_gasto(uuid, bigint, uuid, medio_pago, date, text, text);
drop function if exists crear_ajuste_caja(medio_pago, bigint, text, uuid);

create function crear_comprobante(
  p_monto_centavos bigint,
  p_medio_pago medio_pago,
  p_imagen_path text,
  p_fecha date,
  p_nota text default null,
  p_estado_ocr estado_ocr default 'no_intentado',
  p_ocr_monto_centavos bigint default null,
  p_items jsonb default '[]'::jsonb,
  p_permitir_negativo boolean default false
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

  insert into comprobantes (
    vendedor_id, monto_centavos, medio_pago, imagen_path, fecha,
    estado_ocr, ocr_monto_centavos, nota
  ) values (
    v_vendedor_id, p_monto_centavos, p_medio_pago, p_imagen_path,
    coalesce(p_fecha, current_date), coalesce(p_estado_ocr, 'no_intentado'),
    p_ocr_monto_centavos, p_nota
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
  p_permitir_negativo boolean default false
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
    nota = p_nota
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
  p_imagen_path text default null
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

  insert into gastos (vendedor_id, monto_centavos, categoria_id, medio_pago, fecha, nota, imagen_path)
  values (v_vendedor_id, p_monto_centavos, p_categoria_id, p_medio_pago, coalesce(p_fecha, current_date), p_nota, p_imagen_path)
  returning id into v_gasto_id;

  insert into notificaciones (tipo, titulo, detalle, referencia_id)
  values ('gasto_nuevo', 'Nuevo gasto registrado', p_nota, v_gasto_id);

  return json_build_object('gasto_id', v_gasto_id);
end;
$$;

create function crear_ajuste_caja(
  p_medio_pago medio_pago,
  p_monto_centavos bigint,
  p_nota text
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_vendedor_id uuid;
  v_ajuste_id uuid;
begin
  select id into v_vendedor_id from vendedores where user_id = auth.uid();
  if v_vendedor_id is null then
    raise exception 'VENDEDOR_NO_REGISTRADO';
  end if;

  if p_nota is null or btrim(p_nota) = '' then
    raise exception 'NOTA_REQUERIDA';
  end if;

  if p_monto_centavos is null or p_monto_centavos = 0 then
    raise exception 'MONTO_INVALIDO';
  end if;

  insert into ajustes_caja (medio_pago, monto_centavos, nota, vendedor_id)
  values (p_medio_pago, p_monto_centavos, p_nota, v_vendedor_id)
  returning id into v_ajuste_id;

  return json_build_object('ajuste_id', v_ajuste_id);
end;
$$;

revoke execute on function crear_comprobante(bigint, medio_pago, text, date, text, estado_ocr, bigint, jsonb, boolean) from public, anon;
revoke execute on function actualizar_comprobante(uuid, bigint, medio_pago, text, date, text, estado_ocr, bigint, jsonb, boolean) from public, anon;
revoke execute on function crear_gasto(bigint, uuid, medio_pago, date, text, text) from public, anon;
revoke execute on function crear_ajuste_caja(medio_pago, bigint, text) from public, anon;

grant execute on function crear_comprobante(bigint, medio_pago, text, date, text, estado_ocr, bigint, jsonb, boolean) to authenticated;
grant execute on function actualizar_comprobante(uuid, bigint, medio_pago, text, date, text, estado_ocr, bigint, jsonb, boolean) to authenticated;
grant execute on function crear_gasto(bigint, uuid, medio_pago, date, text, text) to authenticated;
grant execute on function crear_ajuste_caja(medio_pago, bigint, text) to authenticated;

-- ============================================================
-- 5) movimientos_stock: fuerza vendedor_id al del usuario logueado
--    (ignora lo que mande el cliente en el insert directo)
-- ============================================================

create function __SCHEMA__.forzar_vendedor_movimiento_stock()
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

create trigger trg_movimientos_stock_vendedor
  before insert on movimientos_stock
  for each row execute function __SCHEMA__.forzar_vendedor_movimiento_stock();

-- ============================================================
-- 6) vendedores RLS: el alta la hace el trigger de auth.users (corre con
--    privilegios de owner, no le afecta el revoke); el cliente ya no
--    necesita insertar vendedores directamente.
-- ============================================================

drop policy if exists vendedores_insert on vendedores;
revoke insert on vendedores from authenticated;

revoke update on vendedores from authenticated;
grant update (nombre, activo) on vendedores to authenticated;
-- La policy vendedores_update (using(true) with check(true)) sigue vigente:
-- el grant de columna es lo que impide tocar user_id desde el cliente.
