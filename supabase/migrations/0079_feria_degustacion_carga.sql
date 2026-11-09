-- Ananja: FERIA DE REVENDEDORAS — degustación cargada de antemano por el admin.
--
-- Qué es: cuando el admin le carga las botellas a una participante de la
-- feria (0078), además de las botellas para vender puede indicar por producto
-- cuántas van PARA DEGUSTACIÓN. Esas botellas salen del stock del pedido (lote)
-- como degustación a cargo de Ananja desde el primer momento: NO son una
-- entrega a la revendedora (no entran en `entregadas`, no generan deuda, no
-- están en su stock). La revendedora las ve aparte ("3 para degustación") y el
-- admin las ve en el detalle. Al cerrar, la revendedora sigue pudiendo sumar
-- degustación extra (la del cierre, que ya existía y sí viaja dentro de la
-- devolución).
--
-- Contenido:
--   1) `feria_degustaciones.origen` ('carga' | 'cierre') y la PK pasa a
--      (feria_id, vendedor_id, producto_id, origen): por producto puede haber
--      una fila de cada origen.
--   2) `feria_cargar_degustacion` (nueva, solo admin).
--   3) `feria_quitar_degustacion` (nueva, solo admin).
--   4) `feria_cerrar_participacion`: misma firma, `create or replace`. Cuerpo
--      idéntico al de 0078 (verificado por md5 contra prod) salvo que el insert
--      en `feria_degustaciones` pasa `origen = 'cierre'`.
--   5) `feria_reabrir_participacion`: misma firma. Solo deshace las filas
--      `origen = 'cierre'` (sus movimientos y la fila); las de 'carga' quedan.
--   6) `feria_quitar_participante`: además rechaza
--      `PARTICIPANTE_CON_MOVIMIENTOS` si tiene degustación cargada.
--   7) Vistas `v_feria_participante_productos` y `v_feria_participantes`
--      (columnas nuevas en el medio => drop + create; nada más depende de ellas).
--
-- Decisiones:
--   * `origen` queda SIN default después de migrar las filas existentes (todas
--     'cierre'): cada insert tiene que decir de dónde viene.
--   * La degustación de carga NO está en `entregadas` ni en la devolución, así
--     que `devueltas = devolucion_total - degustadas_cierre` y
--     `faltan = entregadas - devueltas - degustadas_cierre - vendidas`
--     (la de carga no entra en esa cuenta). `degustadas` = carga + cierre.
--   * `feria_cargar_degustacion` acumula: cargar dos veces el mismo producto
--     suma a la misma fila (`on conflict ... do update`) y agrega los ids de
--     movimiento. Sin `lote_id` elige lotes con stock del más viejo al más
--     nuevo (`lotes_produccion.fecha, created_at, id`, igual que
--     `tomar_del_deposito`) pero SIN exigir costos completos: una degustación
--     no se cobra. Con `lote_id` valida ese lote.
--   * `p_fecha` solo se valida (no futura, hora Argentina): `movimientos_stock`
--     no tiene columna de fecha propia, igual que el egreso de degustación del
--     cierre.
--   * Orden de locks: vendedores -> feria -> participante -> depósito
--     (`pg_advisory_xact_lock(hashtext('ananja:deposito'))`), como 0078.
--   * Los egresos llevan `entrega_id`, `comprobante_id` en null y
--     `motivo = 'degustacion'`: igual que los del cierre, `eliminar_movimiento_
--     stock` los ve como "manuales"; se identifican por la nota "Feria ...".
--
-- `set search_path = public` va SIN comillas a propósito (ver 0078 y
-- supabase/README.md). Hardcodea `public.` igual que 0049-0078.
-- `lib/types.ts` se editó a mano; regenerarlo después de aplicar.
--
-- ============================================================
-- Cómo verificar (SQL Editor, como admin; los pasos c y d en una
-- transacción que se revierte)
-- ============================================================
--
--   -- a) estructura
--   select column_name, column_default from information_schema.columns
--   where table_name = 'feria_degustaciones' and column_name = 'origen';  -- sin default
--   select pg_get_constraintdef(oid) from pg_constraint
--   where conname = 'feria_degustaciones_pkey';   -- ... producto_id, origen
--   select proname, pg_get_function_identity_arguments(oid) from pg_proc
--   where pronamespace = 'public'::regnamespace
--     and proname in ('feria_cargar_degustacion', 'feria_quitar_degustacion');
--
--   -- b) permisos
--   select routine_name, grantee from information_schema.routine_privileges
--   where routine_schema = 'public' and routine_name like 'feria\_%degustacion'
--     and grantee in ('anon', 'public');            -- 0 filas
--
--   -- c) flujo: feria con una participante, entregar 10, cargar 2 de degustación,
--   --    cerrar devolviendo 2 y degustando 1 (extra) => vendidas 7:
--   select public.feria_cargar_degustacion('<feria>', '<revendedora>',
--     '[{"producto_id":"<producto>","cantidad":2}]'::jsonb, current_date, null);
--   select producto_nombre, entregadas, devueltas, degustadas, degustadas_carga,
--          degustadas_cierre, vendidas
--   from public.v_feria_participante_productos;
--   -- esperado: entregadas 10, degustadas_carga 2; tras el cierre devueltas 2,
--   -- degustadas 3 (2 + 1), vendidas 7, y en v_feria_participantes faltan = 0.
--
--   -- d) reabrir el cierre deja la de carga; quitarla la archiva:
--   select public.feria_reabrir_participacion('<feria>', '<revendedora>');
--   select public.feria_quitar_degustacion('<feria>', '<revendedora>', '<producto>');
--   -- esperado: {"ok":true,"cantidad":2} y los egresos en movimientos_stock_borrados.
--
-- ============================================================
-- Rollback
-- ============================================================
--
--   drop view public.v_feria_participantes;
--   drop view public.v_feria_participante_productos;
--   --   ...y recrear las dos vistas desde 0078 §7.
--   drop function public.feria_cargar_degustacion(uuid, uuid, jsonb, date, text);
--   drop function public.feria_quitar_degustacion(uuid, uuid, uuid);
--   --   feria_cerrar_participacion / feria_reabrir_participacion /
--   --   feria_quitar_participante: volver a los cuerpos de 0078 (§6, §3).
--   --   Antes: borrar las filas 'carga' (y archivar sus movimientos) o dejarlas.
--   delete from public.feria_degustaciones where origen = 'carga';
--   alter table public.feria_degustaciones drop constraint feria_degustaciones_pkey;
--   alter table public.feria_degustaciones drop column origen;
--   alter table public.feria_degustaciones add primary key (feria_id, vendedor_id, producto_id);

-- ============================================================
-- 1) feria_degustaciones.origen
-- ============================================================

alter table public.feria_degustaciones
  add column origen text not null default 'cierre'
  check (origen in ('carga', 'cierre'));

-- Las filas que ya existían son todas del cierre (el default las marcó).
alter table public.feria_degustaciones alter column origen drop default;

alter table public.feria_degustaciones drop constraint feria_degustaciones_pkey;
alter table public.feria_degustaciones
  add constraint feria_degustaciones_pkey
  primary key (feria_id, vendedor_id, producto_id, origen);

-- ============================================================
-- 2) feria_cargar_degustacion
-- ============================================================

create function public.feria_cargar_degustacion(
  p_feria_id uuid,
  p_vendedor_id uuid,
  p_items jsonb,
  p_fecha date,
  p_nota text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid;
  v_feria_nombre text;
  v_feria_estado text;
  v_part_estado text;
  v_vendedor_nombre text;
  v_item jsonb;
  v_producto_id uuid;
  v_cantidad int;
  v_lote_id uuid;
  v_quedan int;
  v_disponible int;
  v_resto int;
  v_tomar int;
  v_lote record;
  v_nombre text;
  v_stock bigint;
  v_nota text;
  v_mov_id uuid;
  v_mov_ids uuid[];
  v_todos uuid[] := '{}';
  v_vistos text[] := '{}';
  v_total int := 0;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;
  v_yo := public.mi_vendedor_id();

  if p_fecha is null then
    raise exception 'FECHA_INVALIDA';
  end if;
  if p_fecha > (now() at time zone 'America/Argentina/Buenos_Aires')::date then
    raise exception 'FECHA_FUTURA';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'SIN_ITEMS';
  end if;

  if not exists (
    select 1 from vendedores
    where id = p_vendedor_id and activo and (rol = 'revendedor' or (rol = 'admin' and revende))
  ) then
    raise exception 'REVENDEDOR_INVALIDO';
  end if;

  -- Orden de locks: vendedores -> feria -> participante -> depósito.
  perform 1 from vendedores where id = p_vendedor_id for no key update;

  select nombre, estado into v_feria_nombre, v_feria_estado
  from feria_revendedoras where id = p_feria_id for share;
  if v_feria_estado is null then
    raise exception 'FERIA_NO_ENCONTRADA';
  end if;
  if v_feria_estado <> 'abierta' then
    raise exception 'FERIA_CERRADA';
  end if;

  -- Si no era participante, se la agrega (igual que la entrega de feria).
  insert into feria_participantes (feria_id, vendedor_id)
  values (p_feria_id, p_vendedor_id)
  on conflict (feria_id, vendedor_id) do nothing;

  select estado into v_part_estado
  from feria_participantes
  where feria_id = p_feria_id and vendedor_id = p_vendedor_id
  for update;
  if v_part_estado <> 'pendiente' then
    raise exception 'PARTICIPACION_CERRADA';
  end if;

  select nombre into v_vendedor_nombre from vendedores where id = p_vendedor_id;
  v_nota := 'Feria ' || v_feria_nombre || ' · ' || v_vendedor_nombre || ' · degustación';

  perform pg_advisory_xact_lock(hashtext('ananja:deposito'));

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_producto_id := nullif(v_item->>'producto_id', '')::uuid;
    v_cantidad := nullif(v_item->>'cantidad', '')::int;
    v_lote_id := nullif(v_item->>'lote_id', '')::uuid;

    if v_producto_id is null then
      raise exception 'SIN_ITEMS';
    end if;
    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'CANTIDAD_INVALIDA';
    end if;

    if (v_producto_id::text || ':' || coalesce(v_lote_id::text, '')) = any(v_vistos) then
      raise exception 'ITEM_DUPLICADO';
    end if;
    v_vistos := array_append(v_vistos, v_producto_id::text || ':' || coalesce(v_lote_id::text, ''));

    select nombre into v_nombre from productos where id = v_producto_id;
    if v_nombre is null then
      raise exception 'PRODUCTO_INVALIDO';
    end if;

    v_mov_ids := '{}';

    if v_lote_id is not null then
      -- Lote elegido: tiene que ser un lote de ese producto y alcanzar solo.
      if not exists (
        select 1 from lote_items where lote_id = v_lote_id and producto_id = v_producto_id
      ) then
        raise exception 'LOTE_INVALIDO';
      end if;

      select quedan into v_quedan from v_stock_por_lote
      where lote_id = v_lote_id and producto_id = v_producto_id;

      if coalesce(v_quedan, 0) < v_cantidad then
        raise exception 'STOCK_LOTE_INSUFICIENTE'
          using detail = json_build_object(
            'lote_id', v_lote_id,
            'producto_id', v_producto_id,
            'disponible', coalesce(v_quedan, 0)
          )::text;
      end if;

      insert into movimientos_stock (producto_id, tipo, cantidad, vendedor_id, lote_id, nota, motivo)
      values (v_producto_id, 'egreso', v_cantidad, v_yo, v_lote_id, v_nota, 'degustacion')
      returning id into v_mov_id;
      v_mov_ids := v_mov_ids || v_mov_id;
    else
      -- Sin lote: lotes con stock del más viejo al más nuevo (mismo orden que
      -- `tomar_del_deposito`, sin exigir costos: una degustación no se cobra).
      select coalesce(sum(s.quedan), 0)::int into v_disponible
      from v_stock_por_lote s
      where s.producto_id = v_producto_id and s.quedan > 0;

      if v_disponible < v_cantidad then
        raise exception 'STOCK_INSUFICIENTE'
          using detail = json_build_object(
            'producto', v_nombre,
            'producto_id', v_producto_id,
            'disponible', v_disponible
          )::text;
      end if;

      v_resto := v_cantidad;
      for v_lote in
        select s.lote_id, s.quedan::int as quedan
        from v_stock_por_lote s
        join lotes_produccion l on l.id = s.lote_id
        where s.producto_id = v_producto_id and s.quedan > 0
        order by l.fecha, l.created_at, l.id
      loop
        exit when v_resto <= 0;
        v_tomar := least(v_lote.quedan, v_resto);

        insert into movimientos_stock (producto_id, tipo, cantidad, vendedor_id, lote_id, nota, motivo)
        values (v_producto_id, 'egreso', v_tomar, v_yo, v_lote.lote_id, v_nota, 'degustacion')
        returning id into v_mov_id;
        v_mov_ids := v_mov_ids || v_mov_id;

        v_resto := v_resto - v_tomar;
      end loop;

      if v_resto > 0 then
        raise exception 'STOCK_INSUFICIENTE'
          using detail = json_build_object(
            'producto', v_nombre,
            'producto_id', v_producto_id,
            'disponible', v_cantidad - v_resto
          )::text;
      end if;
    end if;

    insert into feria_degustaciones (feria_id, vendedor_id, producto_id, cantidad, movimiento_ids, origen)
    values (p_feria_id, p_vendedor_id, v_producto_id, v_cantidad, v_mov_ids, 'carga')
    on conflict (feria_id, vendedor_id, producto_id, origen) do update
      set cantidad = feria_degustaciones.cantidad + excluded.cantidad,
          movimiento_ids = feria_degustaciones.movimiento_ids || excluded.movimiento_ids;

    -- El stock global del producto no puede quedar negativo.
    select s.stock into v_stock from v_stock_actual s where s.producto_id = v_producto_id;
    if coalesce(v_stock, 0) < 0 then
      raise exception 'STOCK_INSUFICIENTE'
        using detail = json_build_object(
          'producto', v_nombre,
          'producto_id', v_producto_id,
          'disponible', greatest(coalesce(v_stock, 0) + v_cantidad, 0)
        )::text;
    end if;

    v_todos := v_todos || v_mov_ids;
    v_total := v_total + v_cantidad;
  end loop;

  return json_build_object('movimiento_ids', v_todos, 'cantidad_total', v_total);
end;
$$;

revoke execute on function public.feria_cargar_degustacion(uuid, uuid, jsonb, date, text) from anon, public;
grant execute on function public.feria_cargar_degustacion(uuid, uuid, jsonb, date, text) to authenticated;

-- ============================================================
-- 3) feria_quitar_degustacion
-- ============================================================

create function public.feria_quitar_degustacion(
  p_feria_id uuid,
  p_vendedor_id uuid,
  p_producto_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid;
  v_feria_estado text;
  v_part_estado text;
  v_cantidad int;
  v_mov_ids uuid[];
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;
  v_yo := public.mi_vendedor_id();

  -- Orden de locks: vendedores -> feria -> participante -> depósito.
  perform 1 from vendedores where id = p_vendedor_id for no key update;

  select estado into v_feria_estado from feria_revendedoras where id = p_feria_id for share;
  if v_feria_estado is null then
    raise exception 'FERIA_NO_ENCONTRADA';
  end if;
  if v_feria_estado <> 'abierta' then
    raise exception 'FERIA_CERRADA';
  end if;

  select estado into v_part_estado
  from feria_participantes
  where feria_id = p_feria_id and vendedor_id = p_vendedor_id
  for update;
  if v_part_estado is null then
    raise exception 'PARTICIPANTE_NO_ENCONTRADO';
  end if;
  if v_part_estado <> 'pendiente' then
    raise exception 'PARTICIPACION_CERRADA';
  end if;

  perform pg_advisory_xact_lock(hashtext('ananja:deposito'));

  select cantidad, movimiento_ids into v_cantidad, v_mov_ids
  from feria_degustaciones
  where feria_id = p_feria_id and vendedor_id = p_vendedor_id
    and producto_id = p_producto_id and origen = 'carga'
  for update;

  if v_cantidad is null then
    return json_build_object('ok', true, 'cantidad', 0);
  end if;

  -- Mismo patrón de archivo que `feria_reabrir_participacion`.
  insert into movimientos_stock_borrados (
    movimiento_id, producto_id, tipo, cantidad, vendedor_id, comprobante_id,
    nota, created_at, lote_id, feria_id, entrega_id, motivo, borrado_por
  )
  select id, producto_id, tipo, cantidad, vendedor_id, comprobante_id,
         nota, created_at, lote_id, feria_id, entrega_id, motivo, v_yo
  from movimientos_stock where id = any(v_mov_ids);

  delete from movimientos_stock where id = any(v_mov_ids);

  delete from feria_degustaciones
  where feria_id = p_feria_id and vendedor_id = p_vendedor_id
    and producto_id = p_producto_id and origen = 'carga';

  return json_build_object('ok', true, 'cantidad', v_cantidad);
end;
$$;

revoke execute on function public.feria_quitar_degustacion(uuid, uuid, uuid) from anon, public;
grant execute on function public.feria_quitar_degustacion(uuid, uuid, uuid) to authenticated;


-- ============================================================
-- 4) feria_cerrar_participacion — solo el insert lleva origen = 'cierre'
-- ============================================================

create or replace function public.feria_cerrar_participacion(
  p_feria_id uuid,
  p_vendedor_id uuid,
  p_fecha date,
  p_devueltas jsonb,
  p_degustadas jsonb,
  p_precios jsonb,
  p_efectivo_centavos bigint,
  p_mercado_pago_centavos bigint,
  p_banco_centavos bigint,
  p_nota text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid;
  v_vendedor uuid;
  v_vendedor_nombre text;
  v_feria_nombre text;
  v_feria_estado text;
  v_part_estado text;
  v_efectivo bigint := coalesce(p_efectivo_centavos, 0);
  v_mp bigint := coalesce(p_mercado_pago_centavos, 0);
  v_banco bigint := coalesce(p_banco_centavos, 0);
  v_medio medio_pago;
  v_registrada_por uuid;
  v_prod record;
  v_b record;
  v_dev int;
  v_deg int;
  v_pool int;
  v_pool_left int;
  v_deg_left int;
  v_take int;
  v_deg_lote int;
  v_resta int;
  v_vendidas_prod int;
  v_ya int;
  v_ya_total int := 0;
  v_disp int;
  v_fecha_ent date;
  v_mov_id uuid;
  v_mov_ids uuid[];
  v_precio bigint;
  v_en_poder int;
  v_entrega_id uuid;
  v_vendidas jsonb := '[]'::jsonb;
  v_total bigint := 0;
  v_nota_venta text;
  v_nota_deg text;
begin
  v_yo := public.mi_vendedor_id();
  if v_yo is null then
    raise exception 'NO_AUTORIZADO';
  end if;

  v_vendedor := coalesce(p_vendedor_id, v_yo);

  -- Admin; o la propia revendedora; o su coordinadora. `es_vendedor()` NO
  -- sirve acá (es alias de `es_admin()`, ver 0018).
  if not (
    public.es_admin()
    or (v_vendedor = v_yo and public.puede_revender())
    or public.es_coordinador_de(v_vendedor)
  ) then
    raise exception 'NO_AUTORIZADO';
  end if;

  if p_fecha is null then
    raise exception 'FECHA_INVALIDA';
  end if;
  if p_fecha > (now() at time zone 'America/Argentina/Buenos_Aires')::date then
    raise exception 'FECHA_FUTURA';
  end if;

  if v_efectivo < 0 or v_mp < 0 or v_banco < 0 then
    raise exception 'MONTO_INVALIDO';
  end if;

  p_devueltas := coalesce(p_devueltas, '[]'::jsonb);
  p_degustadas := coalesce(p_degustadas, '[]'::jsonb);
  p_precios := coalesce(p_precios, '[]'::jsonb);
  if jsonb_typeof(p_devueltas) <> 'array'
     or jsonb_typeof(p_degustadas) <> 'array'
     or jsonb_typeof(p_precios) <> 'array' then
    raise exception 'CANTIDAD_INVALIDA';
  end if;

  -- Orden de locks: vendedores -> feria -> participante (igual que
  -- `registrar_entrega_revendedor`).
  perform 1 from vendedores where id = v_vendedor for no key update;

  select nombre, estado into v_feria_nombre, v_feria_estado
  from feria_revendedoras where id = p_feria_id for share;
  if v_feria_estado is null then
    raise exception 'FERIA_NO_ENCONTRADA';
  end if;
  if v_feria_estado <> 'abierta' then
    raise exception 'FERIA_CERRADA';
  end if;

  -- Serializa con otro cierre (doble toque) y con una carga de la misma persona.
  select estado into v_part_estado
  from feria_participantes
  where feria_id = p_feria_id and vendedor_id = v_vendedor
  for update;
  if v_part_estado is null then
    raise exception 'PARTICIPANTE_NO_ENCONTRADO';
  end if;
  if v_part_estado <> 'pendiente' then
    raise exception 'PARTICIPACION_CERRADA';
  end if;

  select nombre into v_vendedor_nombre from vendedores where id = v_vendedor;

  -- La fecha del cierre no puede ser anterior a la entrega de la feria.
  select e.fecha into v_fecha_ent
  from entregas_revendedor e
  where e.feria_id = p_feria_id and e.vendedor_id = v_vendedor and e.tipo = 'entrega'
    and e.fecha > p_fecha
  order by e.fecha desc
  limit 1;
  if v_fecha_ent is not null then
    raise exception 'FECHA_ANTERIOR_A_ENTREGA'
      using detail = json_build_object(
        'producto', null::text,
        'entrega_fecha', v_fecha_ent
      )::text;
  end if;

  -- Cantidades negativas o sin producto, en cualquiera de las dos listas.
  if exists (
    select 1
    from (
      select x from jsonb_array_elements(p_devueltas) x
      union all
      select x from jsonb_array_elements(p_degustadas) x
    ) l
    where nullif(l.x->>'producto_id', '') is null
       or nullif(l.x->>'cantidad', '') is null
       or (l.x->>'cantidad')::int < 0
  ) then
    raise exception 'CANTIDAD_INVALIDA';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_precios) x
    where nullif(x->>'producto_id', '') is null
       or nullif(x->>'precio_centavos', '') is null
       or (x->>'precio_centavos')::bigint <= 0
  ) then
    raise exception 'PRECIO_INVALIDO';
  end if;

  -- Un producto que no se llevó a esta feria no se puede devolver ni degustar.
  if exists (
    select 1
    from (
      select x from jsonb_array_elements(p_devueltas) x
      union all
      select x from jsonb_array_elements(p_degustadas) x
    ) l
    where (l.x->>'cantidad')::int > 0
      and not exists (
        select 1
        from entregas_revendedor e
        join entrega_items ei on ei.entrega_id = e.id
        where e.feria_id = p_feria_id and e.vendedor_id = v_vendedor and e.tipo = 'entrega'
          and ei.producto_id = (l.x->>'producto_id')::uuid
      )
  ) then
    raise exception 'CANTIDAD_INVALIDA';
  end if;

  -- Medio: el de la plata si exactamente un monto es > 0; si no, null.
  if (v_efectivo > 0)::int + (v_mp > 0)::int + (v_banco > 0)::int = 1 then
    v_medio := case
      when v_efectivo > 0 then 'efectivo'::medio_pago
      when v_mp > 0 then 'mercado_pago'::medio_pago
      else 'banco'::medio_pago
    end;
  end if;

  -- Si carga otra persona (admin o coordinadora), queda anotado.
  v_registrada_por := case when v_yo <> v_vendedor then v_yo else null end;
  v_nota_venta := 'Feria ' || v_feria_nombre;
  v_nota_deg := 'Feria ' || v_feria_nombre || ' · ' || v_vendedor_nombre;

  for v_prod in
    select ei.producto_id, p.nombre, sum(ei.cantidad)::int as entregadas
    from entregas_revendedor e
    join entrega_items ei on ei.entrega_id = e.id
    join productos p on p.id = ei.producto_id
    where e.feria_id = p_feria_id and e.vendedor_id = v_vendedor and e.tipo = 'entrega'
    group by ei.producto_id, p.nombre
    order by p.nombre
  loop
    select coalesce(sum((x->>'cantidad')::int), 0) into v_dev
    from jsonb_array_elements(p_devueltas) x
    where (x->>'producto_id')::uuid = v_prod.producto_id;

    select coalesce(sum((x->>'cantidad')::int), 0) into v_deg
    from jsonb_array_elements(p_degustadas) x
    where (x->>'producto_id')::uuid = v_prod.producto_id;

    -- Ventas normales que ella ya cargó durante el día y que por FIFO
    -- quedaron atribuidas a las botellas de esta feria: no se tocan ni se
    -- venden de nuevo.
    select coalesce(sum(vr.cantidad), 0)::int into v_ya
    from ventas_revendedor vr
    join entrega_items ei on ei.id = vr.entrega_item_id
    join entregas_revendedor e on e.id = ei.entrega_id
    where vr.vendedor_id = v_vendedor and vr.producto_id = v_prod.producto_id
      and e.feria_id = p_feria_id and e.tipo = 'entrega' and vr.feria_id is null;

    v_pool := v_dev + v_deg;
    if v_pool > v_prod.entregadas - v_ya then
      raise exception 'CANTIDAD_INVALIDA'
        using detail = json_build_object(
          'producto', v_prod.nombre,
          'producto_id', v_prod.producto_id,
          'entregadas', v_prod.entregadas,
          'ya_vendidas', v_ya
        )::text;
    end if;

    v_ya_total := v_ya_total + v_ya;
    -- Solo las vendidas NUEVAS (las previas ya están cargadas).
    v_vendidas_prod := v_prod.entregadas - v_ya - v_pool;

    v_precio := null;
    if v_vendidas_prod > 0 then
      -- El precio que corrigió la revendedora manda sobre el de la feria.
      select (x->>'precio_centavos')::bigint into v_precio
      from jsonb_array_elements(p_precios) x
      where (x->>'producto_id')::uuid = v_prod.producto_id
      limit 1;

      if v_precio is null then
        select precio_centavos into v_precio
        from feria_precios where feria_id = p_feria_id and producto_id = v_prod.producto_id;
      end if;

      if v_precio is null then
        raise exception 'PRECIO_NO_ASIGNADO'
          using detail = json_build_object(
            'producto', v_prod.nombre,
            'producto_id', v_prod.producto_id
          )::text;
      end if;
    end if;

    v_pool_left := v_pool;
    v_deg_left := v_deg;
    v_mov_ids := '{}';

    -- Un tramo por lote de lo que se llevó, en orden de entrega.
    for v_b in
      select ei.lote_id, sum(ei.cantidad)::int as cantidad,
             (
               select coalesce(sum(vr.cantidad), 0)::int
               from ventas_revendedor vr
               join entrega_items ei2 on ei2.id = vr.entrega_item_id
               join entregas_revendedor e2 on e2.id = ei2.entrega_id
               where vr.vendedor_id = v_vendedor and vr.producto_id = v_prod.producto_id
                 and e2.feria_id = p_feria_id and e2.tipo = 'entrega' and vr.feria_id is null
                 and ei2.lote_id is not distinct from ei.lote_id
             ) as ya
      from entregas_revendedor e
      join entrega_items ei on ei.entrega_id = e.id
      where e.feria_id = p_feria_id and e.vendedor_id = v_vendedor and e.tipo = 'entrega'
        and ei.producto_id = v_prod.producto_id
      group by ei.lote_id
      order by min(e.created_at), ei.lote_id
    loop
      -- Lo que queda de este lote sin vender antes.
      v_disp := greatest(v_b.cantidad - v_b.ya, 0);
      v_take := least(v_disp, v_pool_left);
      v_pool_left := v_pool_left - v_take;
      v_resta := v_disp - v_take;

      if v_take > 0 then
        -- 1) Devolución (devueltas + degustadas: las degustadas vuelven
        -- primero al lote).
        if v_entrega_id is null then
          insert into entregas_revendedor (vendedor_id, tipo, fecha, nota, admin_id, feria_id)
          values (v_vendedor, 'devolucion', p_fecha, v_nota_venta, v_yo, p_feria_id)
          returning id into v_entrega_id;
        end if;

        insert into entrega_items (entrega_id, producto_id, cantidad, lote_id)
        values (v_entrega_id, v_prod.producto_id, v_take, v_b.lote_id);

        insert into movimientos_stock (producto_id, tipo, cantidad, vendedor_id, entrega_id, lote_id, nota, motivo)
        values (v_prod.producto_id, 'ingreso', v_take, v_yo, v_entrega_id, v_b.lote_id, null, null);

        -- 2) Degustación: sale otra vez del lote, con motivo 'degustacion'.
        v_deg_lote := least(v_take, v_deg_left);
        v_deg_left := v_deg_left - v_deg_lote;
        if v_deg_lote > 0 then
          insert into movimientos_stock (producto_id, tipo, cantidad, vendedor_id, lote_id, nota, motivo)
          values (v_prod.producto_id, 'egreso', v_deg_lote, v_yo, v_b.lote_id, v_nota_deg, 'degustacion')
          returning id into v_mov_id;
          v_mov_ids := v_mov_ids || v_mov_id;
        end if;
      end if;

      -- 3) Ventas: lo que sobra de este lote, con el lote explícito.
      if v_resta > 0 then
        perform public.insertar_venta_revendedor(
          v_vendedor, v_prod.producto_id, v_resta, v_precio, v_medio, p_fecha,
          v_nota_venta, v_registrada_por, gen_random_uuid(), v_b.lote_id, p_feria_id
        );
      end if;
    end loop;

    if v_pool > 0 then
      select en_poder into v_en_poder
      from v_stock_revendedor where vendedor_id = v_vendedor and producto_id = v_prod.producto_id;

      if coalesce(v_en_poder, 0) < 0 then
        raise exception 'STOCK_REVENDEDOR_INSUFICIENTE'
          using detail = json_build_object(
            'producto', v_prod.nombre,
            'producto_id', v_prod.producto_id,
            'disponible', coalesce(v_en_poder, 0) + v_pool
          )::text;
      end if;
    end if;

    if v_deg > 0 then
      insert into feria_degustaciones (feria_id, vendedor_id, producto_id, cantidad, movimiento_ids, origen)
      values (p_feria_id, v_vendedor, v_prod.producto_id, v_deg, v_mov_ids, 'cierre');
    end if;

    if v_vendidas_prod > 0 then
      v_vendidas := v_vendidas || jsonb_build_array(jsonb_build_object(
        'producto_id', v_prod.producto_id,
        'cantidad', v_vendidas_prod,
        'precio_centavos', v_precio
      ));
      v_total := v_total + v_vendidas_prod * v_precio;
    end if;
  end loop;

  -- 4) La participación queda cerrada, con la plata que juntó por medio.
  update feria_participantes
  set estado = 'cerrada',
      cerrada_at = now(),
      efectivo_centavos = v_efectivo,
      mercado_pago_centavos = v_mp,
      banco_centavos = v_banco,
      nota = nullif(btrim(p_nota), '')
  where feria_id = p_feria_id and vendedor_id = v_vendedor;

  -- `vendidas` y `total_centavos` cuentan solo las ventas NUEVAS de este
  -- cierre; `ya_vendidas` es el total de botellas de la feria que ella ya
  -- había cargado como ventas normales antes del cierre. `diferencia_centavos`
  -- (informativo) = plata juntada - total de lo vendido ahora.
  return json_build_object(
    'vendidas', v_vendidas,
    'ya_vendidas', v_ya_total,
    'total_centavos', v_total,
    'diferencia_centavos', (v_efectivo + v_mp + v_banco) - v_total,
    'devolucion_id', v_entrega_id
  );
end;
$$;

revoke execute on function public.feria_cerrar_participacion(uuid, uuid, date, jsonb, jsonb, jsonb, bigint, bigint, bigint, text) from anon, public;
grant execute on function public.feria_cerrar_participacion(uuid, uuid, date, jsonb, jsonb, jsonb, bigint, bigint, bigint, text) to authenticated;

-- ============================================================
-- 5) feria_reabrir_participacion — solo deshace la degustación del cierre
-- ============================================================

create or replace function public.feria_reabrir_participacion(p_feria_id uuid, p_vendedor_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid;
  v_feria_estado text;
  v_part_estado text;
  v_grupos uuid[];
  v_grupo uuid;
  v_dev record;
  v_auto record;
  v_dev_id uuid;
  v_ya int;
  v_en_lote int;
  v_devolver int;
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_prod record;
  v_en_poder int;
  v_mov_ids uuid[];
  v_ventas int := 0;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;
  v_yo := public.mi_vendedor_id();

  -- Orden de locks: vendedores -> feria -> participante.
  perform 1 from vendedores where id = p_vendedor_id for no key update;

  select estado into v_feria_estado from feria_revendedoras where id = p_feria_id for share;
  if v_feria_estado is null then
    raise exception 'FERIA_NO_ENCONTRADA';
  end if;
  -- Con la feria cerrada primero hay que reabrirla (`feria_reabrir`).
  if v_feria_estado <> 'abierta' then
    raise exception 'FERIA_CERRADA';
  end if;

  select estado into v_part_estado
  from feria_participantes
  where feria_id = p_feria_id and vendedor_id = p_vendedor_id
  for update;
  if v_part_estado is null then
    raise exception 'PARTICIPANTE_NO_ENCONTRADO';
  end if;
  if v_part_estado = 'pendiente' then
    return json_build_object('ok', true, 'ventas_borradas', 0);
  end if;

  -- Lock global del depósito (mismo orden que el resto de los caminos) antes
  -- de escribir movimientos de stock.
  perform pg_advisory_xact_lock(hashtext('ananja:deposito'));

  select coalesce(array_agg(distinct grupo_id), '{}') into v_grupos
  from ventas_revendedor
  where feria_id = p_feria_id and vendedor_id = p_vendedor_id;

  if exists (select 1 from rendiciones where venta_grupo_id = any(v_grupos)) then
    raise exception 'VENTA_CON_RENDICION';
  end if;

  -- (a) Ventas de la feria. El trigger de archivo las guarda en
  -- `ventas_revendedor_borradas` (con `feria_id`).
  delete from ventas_revendedor where feria_id = p_feria_id and vendedor_id = p_vendedor_id;
  get diagnostics v_ventas = row_count;

  -- (b) Egresos de degustación (archivados como `eliminar_movimiento_stock`).
  select coalesce(array_agg(m), '{}') into v_mov_ids
  from feria_degustaciones d, unnest(d.movimiento_ids) m
  where d.feria_id = p_feria_id and d.vendedor_id = p_vendedor_id
    and d.origen = 'cierre';

  insert into movimientos_stock_borrados (
    movimiento_id, producto_id, tipo, cantidad, vendedor_id, comprobante_id,
    nota, created_at, lote_id, feria_id, entrega_id, motivo, borrado_por
  )
  select id, producto_id, tipo, cantidad, vendedor_id, comprobante_id,
         nota, created_at, lote_id, feria_id, entrega_id, motivo, v_yo
  from movimientos_stock where id = any(v_mov_ids);

  delete from movimientos_stock where id = any(v_mov_ids);

  -- (c) Devolución de la feria: sus ingresos, sus items y la entrega.
  for v_dev in
    select id from entregas_revendedor
    where feria_id = p_feria_id and vendedor_id = p_vendedor_id and tipo = 'devolucion'
  loop
    insert into movimientos_stock_borrados (
      movimiento_id, producto_id, tipo, cantidad, vendedor_id, comprobante_id,
      nota, created_at, lote_id, feria_id, entrega_id, motivo, borrado_por
    )
    select id, producto_id, tipo, cantidad, vendedor_id, comprobante_id,
           nota, created_at, lote_id, feria_id, entrega_id, motivo, v_yo
    from movimientos_stock where entrega_id = v_dev.id;

    delete from movimientos_stock where entrega_id = v_dev.id;
    delete from entrega_items where entrega_id = v_dev.id;
    delete from entregas_revendedor where id = v_dev.id;
  end loop;

  -- Compensar las entregas automáticas de las ventas borradas (toma directa
  -- del depósito): igual que `eliminar_venta_revendedor`, una devolución
  -- automática por (producto, lote) con lo que SIGUE en poder de la persona.
  foreach v_grupo in array v_grupos
  loop
    v_dev_id := null;

    for v_auto in
      select ei.producto_id, ei.lote_id, sum(ei.cantidad)::int as total
      from entregas_revendedor e
      join entrega_items ei on ei.entrega_id = e.id
      where e.vendedor_id = p_vendedor_id
        and e.tipo = 'entrega'
        and e.automatica
        and e.venta_grupo_id = v_grupo
      group by ei.producto_id, ei.lote_id
      order by ei.producto_id, ei.lote_id
    loop
      select coalesce(sum(ei2.cantidad), 0)::int into v_ya
      from entregas_revendedor d
      join entrega_items ei2 on ei2.entrega_id = d.id
      where d.vendedor_id = p_vendedor_id
        and d.tipo = 'devolucion'
        and d.automatica
        and d.venta_grupo_id = v_grupo
        and ei2.producto_id = v_auto.producto_id
        and ei2.lote_id is not distinct from v_auto.lote_id;

      select coalesce(sum(s.quedan), 0)::int into v_en_lote
      from public.stock_revendedor_por_entrega(p_vendedor_id, v_auto.producto_id) s
      where s.lote_id is not distinct from v_auto.lote_id;

      v_devolver := least(v_auto.total - v_ya, v_en_lote);

      if v_devolver > 0 then
        if v_dev_id is null then
          insert into entregas_revendedor (vendedor_id, tipo, fecha, nota, admin_id, automatica, venta_grupo_id)
          values (p_vendedor_id, 'devolucion', v_hoy, null, v_yo, true, v_grupo)
          returning id into v_dev_id;
        end if;

        insert into entrega_items (entrega_id, producto_id, cantidad, lote_id)
        values (v_dev_id, v_auto.producto_id, v_devolver, v_auto.lote_id);

        insert into movimientos_stock (producto_id, tipo, cantidad, vendedor_id, entrega_id, lote_id, nota, motivo)
        values (v_auto.producto_id, 'ingreso', v_devolver, v_yo, v_dev_id, v_auto.lote_id, null, null);
      end if;
    end loop;
  end loop;

  -- Nada de lo que tiene en poder puede quedar negativo (ej.: ya vendió o
  -- devolvió después las botellas que el cierre había devuelto). La excepción
  -- deshace TODO lo de esta función.
  for v_prod in
    select distinct ei.producto_id, p.nombre
    from entregas_revendedor e
    join entrega_items ei on ei.entrega_id = e.id
    join productos p on p.id = ei.producto_id
    where e.feria_id = p_feria_id and e.vendedor_id = p_vendedor_id and e.tipo = 'entrega'
  loop
    select en_poder into v_en_poder
    from v_stock_revendedor
    where vendedor_id = p_vendedor_id and producto_id = v_prod.producto_id;

    if coalesce(v_en_poder, 0) < 0 then
      raise exception 'STOCK_REVENDEDOR_INSUFICIENTE'
        using detail = json_build_object(
          'producto', v_prod.nombre,
          'producto_id', v_prod.producto_id,
          'disponible', 0
        )::text;
    end if;
  end loop;

  -- (d) y (e)
  delete from feria_degustaciones
  where feria_id = p_feria_id and vendedor_id = p_vendedor_id and origen = 'cierre';

  update feria_participantes
  set estado = 'pendiente', cerrada_at = null,
      efectivo_centavos = 0, mercado_pago_centavos = 0, banco_centavos = 0, nota = null
  where feria_id = p_feria_id and vendedor_id = p_vendedor_id;

  return json_build_object('ok', true, 'ventas_borradas', v_ventas);
end;
$$;

revoke execute on function public.feria_reabrir_participacion(uuid, uuid) from anon, public;
grant execute on function public.feria_reabrir_participacion(uuid, uuid) to authenticated;

-- ============================================================
-- 6) feria_quitar_participante — rechaza si hay degustación cargada
-- ============================================================

create or replace function public.feria_quitar_participante(p_feria_id uuid, p_vendedor_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if exists (
    select 1 from entregas_revendedor
    where feria_id = p_feria_id and vendedor_id = p_vendedor_id
  ) or exists (
    select 1 from ventas_revendedor
    where feria_id = p_feria_id and vendedor_id = p_vendedor_id
  ) or exists (
    select 1 from feria_degustaciones
    where feria_id = p_feria_id and vendedor_id = p_vendedor_id
  ) then
    raise exception 'PARTICIPANTE_CON_MOVIMIENTOS';
  end if;

  delete from feria_participantes where feria_id = p_feria_id and vendedor_id = p_vendedor_id;

  return json_build_object('ok', true);
end;
$$;

revoke execute on function public.feria_quitar_participante(uuid, uuid) from anon, public;
grant execute on function public.feria_quitar_participante(uuid, uuid) to authenticated;

-- ============================================================
-- 7) Vistas (columnas nuevas en el medio => drop + create, primero la que
--    depende de la otra)
-- ============================================================

drop view public.v_feria_participantes;
drop view public.v_feria_participante_productos;

-- Por (feria, participante, producto): llevó / devolvió / degustó / vendió y
-- el precio de feria.
--   * `devueltas` NO incluye la degustación del cierre (la devolución la
--     mezcla; se resta con `feria_degustaciones` origen 'cierre').
--   * La degustación de CARGA no está en `entregadas` ni en la devolución.
--   * `degustadas` = carga + cierre.
create view public.v_feria_participante_productos
with (security_invoker = true) as
with ent as (
  select e.feria_id, e.vendedor_id, ei.producto_id,
         (sum(ei.cantidad) filter (where e.tipo = 'entrega'))::bigint as entregadas,
         (sum(ei.cantidad) filter (where e.tipo = 'devolucion'))::bigint as devolucion_total
  from public.entregas_revendedor e
  join public.entrega_items ei on ei.entrega_id = e.id
  where e.feria_id is not null
  group by e.feria_id, e.vendedor_id, ei.producto_id
),
-- Ventas de la feria: las del cierre (`feria_id`) MÁS las ventas normales
-- que la revendedora cargó antes (`feria_id` null) y que por FIFO quedaron
-- atribuidas a una entrega de feria suya.
ven as (
  select feria_id, vendedor_id, producto_id, sum(cantidad)::bigint as vendidas
  from (
    select feria_id, vendedor_id, producto_id, cantidad
    from public.ventas_revendedor
    where feria_id is not null
    union all
    select e.feria_id, vr.vendedor_id, vr.producto_id, vr.cantidad
    from public.ventas_revendedor vr
    join public.entrega_items ei on ei.id = vr.entrega_item_id
    join public.entregas_revendedor e on e.id = ei.entrega_id
    where vr.feria_id is null and e.feria_id is not null and e.tipo = 'entrega'
      and e.vendedor_id = vr.vendedor_id
  ) v
  group by feria_id, vendedor_id, producto_id
),
deg_carga as (
  select feria_id, vendedor_id, producto_id, sum(cantidad)::bigint as degustadas
  from public.feria_degustaciones
  where origen = 'carga'
  group by feria_id, vendedor_id, producto_id
),
deg_cierre as (
  select feria_id, vendedor_id, producto_id, sum(cantidad)::bigint as degustadas
  from public.feria_degustaciones
  where origen = 'cierre'
  group by feria_id, vendedor_id, producto_id
),
claves as (
  select feria_id, vendedor_id, producto_id from ent
  union
  select feria_id, vendedor_id, producto_id from ven
  union
  select feria_id, vendedor_id, producto_id from deg_carga
  union
  select feria_id, vendedor_id, producto_id from deg_cierre
)
select
  c.feria_id,
  c.vendedor_id,
  c.producto_id,
  p.nombre as producto_nombre,
  coalesce(ent.entregadas, 0)::bigint as entregadas,
  greatest(coalesce(ent.devolucion_total, 0) - coalesce(dc.degustadas, 0), 0)::bigint as devueltas,
  (coalesce(dk.degustadas, 0) + coalesce(dc.degustadas, 0))::bigint as degustadas,
  coalesce(dk.degustadas, 0)::bigint as degustadas_carga,
  coalesce(dc.degustadas, 0)::bigint as degustadas_cierre,
  coalesce(ven.vendidas, 0)::bigint as vendidas,
  fp.precio_centavos as precio_feria_centavos
from claves c
join public.v_productos_publicos p on p.id = c.producto_id
left join ent on ent.feria_id = c.feria_id and ent.vendedor_id = c.vendedor_id and ent.producto_id = c.producto_id
left join ven on ven.feria_id = c.feria_id and ven.vendedor_id = c.vendedor_id and ven.producto_id = c.producto_id
left join deg_carga dk on dk.feria_id = c.feria_id and dk.vendedor_id = c.vendedor_id and dk.producto_id = c.producto_id
left join deg_cierre dc on dc.feria_id = c.feria_id and dc.vendedor_id = c.vendedor_id and dc.producto_id = c.producto_id
left join public.feria_precios fp on fp.feria_id = c.feria_id and fp.producto_id = c.producto_id;

revoke all on public.v_feria_participante_productos from anon, public;
grant select on public.v_feria_participante_productos to authenticated;

-- Totales por participante. `faltan` = lo que se llevó y todavía no se
-- explicó (ni devuelta, ni degustada en el cierre, ni vendida). La
-- degustación de carga NO entra: nunca estuvo en `entregadas`.
create view public.v_feria_participantes
with (security_invoker = true) as
select
  fp.feria_id,
  fp.vendedor_id,
  v.nombre as vendedor_nombre,
  fp.estado,
  fp.cerrada_at,
  coalesce(pp.entregadas, 0)::bigint as entregadas,
  coalesce(pp.devueltas, 0)::bigint as devueltas,
  (coalesce(pp.degustadas_carga, 0) + coalesce(pp.degustadas_cierre, 0))::bigint as degustadas,
  coalesce(pp.degustadas_carga, 0)::bigint as degustadas_carga,
  coalesce(pp.degustadas_cierre, 0)::bigint as degustadas_cierre,
  coalesce(pp.vendidas, 0)::bigint as vendidas,
  (coalesce(pp.entregadas, 0) - coalesce(pp.devueltas, 0) - coalesce(pp.degustadas_cierre, 0) - coalesce(pp.vendidas, 0))::bigint as faltan,
  coalesce(vt.total_vendido_centavos, 0)::bigint as total_vendido_centavos,
  coalesce(vt.costo_centavos, 0)::bigint as costo_centavos,
  fp.efectivo_centavos,
  fp.mercado_pago_centavos,
  fp.banco_centavos
from public.feria_participantes fp
join public.vendedores v on v.id = fp.vendedor_id
left join (
  select feria_id, vendedor_id,
         sum(entregadas) as entregadas, sum(devueltas) as devueltas,
         sum(degustadas_carga) as degustadas_carga, sum(degustadas_cierre) as degustadas_cierre,
         sum(vendidas) as vendidas
  from public.v_feria_participante_productos
  group by feria_id, vendedor_id
) pp on pp.feria_id = fp.feria_id and pp.vendedor_id = fp.vendedor_id
left join (
  select feria_id, vendedor_id,
         sum(cantidad * coalesce(precio_venta_centavos, 0)) as total_vendido_centavos,
         sum(cantidad * precio_costo_centavos) as costo_centavos
  from (
    select feria_id, vendedor_id, cantidad, precio_venta_centavos, precio_costo_centavos
    from public.ventas_revendedor
    where feria_id is not null
    union all
    select e.feria_id, vr.vendedor_id, vr.cantidad, vr.precio_venta_centavos, vr.precio_costo_centavos
    from public.ventas_revendedor vr
    join public.entrega_items ei on ei.id = vr.entrega_item_id
    join public.entregas_revendedor e on e.id = ei.entrega_id
    where vr.feria_id is null and e.feria_id is not null and e.tipo = 'entrega'
      and e.vendedor_id = vr.vendedor_id
  ) v
  group by feria_id, vendedor_id
) vt on vt.feria_id = fp.feria_id and vt.vendedor_id = fp.vendedor_id;

revoke all on public.v_feria_participantes from anon, public;
grant select on public.v_feria_participantes to authenticated;
