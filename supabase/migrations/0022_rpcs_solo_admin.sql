-- Ananja/Germá: RPCs de admin exigen es_admin(); productos sin costo para
-- revendedores (hallazgos Critical/Important de la revisión final de
-- feature/revendedores).
--
-- Hallazgo Critical: crear_comprobante, actualizar_comprobante, crear_gasto,
-- crear_lote, crear_version_precio, crear_ajuste_caja, crear_insumo,
-- ajustar_insumo, registrar_compra_insumo, crear_feria, cerrar_feria y
-- reabrir_feria son `security definer` y resuelven el llamador con
-- `select id from vendedores where user_id = auth.uid()` — sin exigir
-- rol admin ni `activo` (cerrar_feria/reabrir_feria ni siquiera resuelven
-- vendedor). Desde que 0018_revendedores.sql agregó el rol `revendedor`,
-- un revendedor activo TAMBIÉN tiene fila en `vendedores`, así que puede
-- invocar cualquiera de estas 12 RPCs por REST (cargar comprobantes/gastos,
-- crear versiones de precio, ajustar caja, cerrar/reabrir ferias, etc.)
-- pese a que la UI nunca se lo ofrece. Se corrige agregando como primera
-- línea del `begin` de cada una: `if not __SCHEMA__.es_admin() then raise
-- exception 'NO_AUTORIZADO'; end if;` — mismo criterio que ya usan
-- registrar_entrega_revendedor/registrar_rendicion (0020) para el admin
-- que las invoca. El resto del cuerpo, firma, `security definer` y
-- `set search_path` quedan EXACTAMENTE iguales a la última definición
-- vigente de cada una (comprobantes/ferias: 0011_ferias.sql; crear_gasto:
-- 0015_lotes_multi.sql; crear_lote/insumos: 0017_insumos.sql;
-- crear_version_precio: 0016_precios_deudas.sql; crear_ajuste_caja:
-- 0007_vendedores_auth.sql, nunca redefinida después) — confirmado además
-- contra `pg_get_functiondef` en la base real antes de escribir esta
-- migración.
--
-- Hallazgo Important: la policy `productos_select` (0018_revendedores.sql)
-- es `es_vendedor() or es_revendedor()`, así que un revendedor puede leer
-- `productos` completa por REST — incluidos `costo_centavos` (costo real
-- de Ananja) y `umbral_minimo` (umbral de stock bajo), que no son de su
-- incumbencia. Se agrega la vista `v_productos_publicos` (solo
-- `id, nombre, presentacion_ml` — `productos` no tiene columna `activo`)
-- SIN `security_invoker`: corre con los privilegios del dueño a propósito,
-- así un revendedor puede leerla aunque `productos_select` deje de
-- incluirlo. `productos_select` queda en solo `es_vendedor()` (alias de
-- `es_admin()` desde 0018, así que esto es "solo admin").
--
-- Vistas/RPCs de revendedor revisadas por si hacían join contra
-- `productos` (se habrían roto al perder acceso vía RLS): `v_stock_revendedor`
-- y `v_resumen_revendedor` (0018) NO referencian `productos` en absoluto
-- (solo entregas/ventas/vendedores) — no requieren cambios.
-- `registrar_entrega_revendedor` y `registrar_venta_revendedor` (0020) sí
-- leen `productos.nombre` para el detalle de sus excepciones de stock, pero
-- son `security definer`: corren con los privilegios del dueño de la
-- función, que no tiene RLS forzada sobre `productos`
-- (`relforcerowsecurity = false`, confirmado en la base real) — no les
-- afecta el cambio de policy, no requieren cambios.
--
-- Migración templated (__SCHEMA__, sin __BUCKET__).

-- ============================================================
-- 1) RPCs de admin: agregan el chequeo es_admin() como primera línea.
--    Firma y cuerpo idénticos a la última definición vigente.
-- ============================================================

create or replace function crear_comprobante(
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
  v_feria_estado text;
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

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

revoke execute on function crear_comprobante(bigint, medio_pago, text, date, text, estado_ocr, bigint, jsonb, boolean, uuid, uuid) from anon, public;
grant execute on function crear_comprobante(bigint, medio_pago, text, date, text, estado_ocr, bigint, jsonb, boolean, uuid, uuid) to authenticated;

create or replace function actualizar_comprobante(
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
  v_feria_actual uuid;
  v_feria_estado text;
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

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

revoke execute on function actualizar_comprobante(uuid, bigint, medio_pago, text, date, text, estado_ocr, bigint, jsonb, boolean, uuid, uuid) from anon, public;
grant execute on function actualizar_comprobante(uuid, bigint, medio_pago, text, date, text, estado_ocr, bigint, jsonb, boolean, uuid, uuid) to authenticated;

create or replace function crear_gasto(
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
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

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

create or replace function crear_lote(
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
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

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

create or replace function crear_version_precio(
  p_fecha date,
  p_dolar_centavos bigint,
  p_materia_prima_usd_centavos bigint,
  p_transporte_pct numeric default 8,
  p_iva_pct numeric default 21,
  p_ganancia_pct numeric default 30,
  p_mayorista_pct numeric default 20,
  p_nota text default null,
  p_items jsonb default '[]'::jsonb
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_vendedor_id uuid;
  v_version_id uuid;
  v_item jsonb;
  v_producto_id uuid;
  v_envase_centavos bigint;
  v_etiqueta_centavos bigint;
  v_precio_minorista_centavos bigint;
  v_total_productos int;
  v_total_items int;
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select id into v_vendedor_id from vendedores where user_id = auth.uid();
  if v_vendedor_id is null then
    raise exception 'VENDEDOR_NO_REGISTRADO';
  end if;

  if p_dolar_centavos is null or p_dolar_centavos <= 0 then
    raise exception 'DOLAR_INVALIDO';
  end if;

  select count(*) into v_total_productos from productos;
  v_total_items := coalesce(jsonb_array_length(p_items), 0);

  if p_items is null or v_total_items <> v_total_productos then
    raise exception 'ITEMS_INVALIDOS';
  end if;

  insert into versiones_precio (
    fecha, dolar_centavos, materia_prima_usd_centavos,
    transporte_pct, iva_pct, ganancia_pct, mayorista_pct, nota, vendedor_id
  ) values (
    coalesce(p_fecha, current_date), p_dolar_centavos,
    coalesce(p_materia_prima_usd_centavos, 0),
    coalesce(p_transporte_pct, 8), coalesce(p_iva_pct, 21),
    coalesce(p_ganancia_pct, 30), coalesce(p_mayorista_pct, 20),
    p_nota, v_vendedor_id
  ) returning id into v_version_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_envase_centavos := (v_item->>'envase_centavos')::bigint;
    v_etiqueta_centavos := (v_item->>'etiqueta_centavos')::bigint;
    v_precio_minorista_centavos := (v_item->>'precio_minorista_centavos')::bigint;

    if v_producto_id is null
       or v_envase_centavos is null or v_envase_centavos < 0
       or v_etiqueta_centavos is null or v_etiqueta_centavos < 0
       or v_precio_minorista_centavos is null or v_precio_minorista_centavos < 0
       or not exists (select 1 from productos where id = v_producto_id) then
      raise exception 'ITEMS_INVALIDOS';
    end if;

    insert into versiones_precio_items (
      version_id, producto_id, envase_centavos, etiqueta_centavos, precio_minorista_centavos
    ) values (
      v_version_id, v_producto_id, v_envase_centavos, v_etiqueta_centavos, v_precio_minorista_centavos
    );
  end loop;

  return json_build_object('id', v_version_id);
end;
$$;

revoke execute on function crear_version_precio(date, bigint, bigint, numeric, numeric, numeric, numeric, text, jsonb) from anon, public;
grant execute on function crear_version_precio(date, bigint, bigint, numeric, numeric, numeric, numeric, text, jsonb) to authenticated;

create or replace function crear_ajuste_caja(
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
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

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

revoke execute on function crear_ajuste_caja(medio_pago, bigint, text) from anon, public;
grant execute on function crear_ajuste_caja(medio_pago, bigint, text) to authenticated;

create or replace function crear_insumo(
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
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

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

create or replace function ajustar_insumo(
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
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

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

create or replace function registrar_compra_insumo(
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
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

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

create or replace function crear_feria(
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
set search_path = __SCHEMA__
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
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

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

create or replace function cerrar_feria(p_feria_id uuid)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_estado text;
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

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

create or replace function reabrir_feria(p_feria_id uuid)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_existe boolean;
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

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
-- 2) v_productos_publicos: catálogo mínimo para revendedores (sin
--    costo_centavos/umbral_minimo). Sin security_invoker a propósito: debe
--    correr con los privilegios del dueño para poder exponer estas tres
--    columnas a un revendedor aunque `productos_select` ya no lo alcance.
--    `productos` no tiene columna `activo` en este schema.
-- ============================================================

create or replace view v_productos_publicos as
select id, nombre, presentacion_ml
from productos;

revoke all on v_productos_publicos from anon, public;
grant select on v_productos_publicos to authenticated;

-- ============================================================
-- 3) productos_select: ya no admite es_revendedor() — un revendedor lee el
--    catálogo desde v_productos_publicos en su lugar.
-- ============================================================

drop policy if exists productos_select on productos;
create policy productos_select on productos for select to authenticated
  using (__SCHEMA__.es_vendedor());
