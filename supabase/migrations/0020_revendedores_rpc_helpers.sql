-- Revendedores: RPCs reusan los helpers de rol en vez de repetir el
-- criterio inline (revisión de Task 1).
--
-- 0018_revendedores.sql agregó `__SCHEMA__.es_admin()`, `es_revendedor()`
-- y `mi_vendedor_id()`, pero cuatro RPCs siguieron resolviendo el rol con
-- el criterio inline preexistente (`select id from vendedores where
-- user_id = auth.uid() and rol = '...' and activo`) en vez de llamar a
-- esos helpers — mismo comportamiento, duplicado. Esta migración los
-- redefine para que usen los helpers: `registrar_entrega_revendedor` y
-- `registrar_rendicion` usan `es_admin()` + `mi_vendedor_id()`,
-- `registrar_venta_revendedor` usa `es_revendedor()` + `mi_vendedor_id()`,
-- `eliminar_venta_revendedor` usa `mi_vendedor_id()` (ya no filtraba por
-- rol: cualquier vendedor, admin o revendedor, puede borrar una venta
-- propia — `mi_vendedor_id()` conserva ese comportamiento). De paso quita
-- `v_umbral`, variable muerta de `registrar_entrega_revendedor` (se
-- asignaba desde `v_stock_actual.umbral_minimo` pero nunca se leía).
--
-- Firma y comportamiento idénticos a 0018_revendedores.sql en los cuatro
-- casos — mismos códigos de error, mismas validaciones, mismo orden de
-- inserts. `create or replace function` preserva `security definer`,
-- `set search_path = __SCHEMA__` y los `revoke`/`grant` ya aplicados en
-- 0018 (no hace falta repetirlos, pero se repiten igual por claridad y
-- para que este archivo quede autocontenido).
--
-- Migración templated (__SCHEMA__, sin __BUCKET__).

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
  if not __SCHEMA__.es_revendedor() then
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

create or replace function eliminar_venta_revendedor(
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
  v_vendedor_id := __SCHEMA__.mi_vendedor_id();
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
