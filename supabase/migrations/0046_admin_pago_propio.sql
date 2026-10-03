-- Ananja: un admin SÍ puede registrar y confirmar (o rechazar) SUS PROPIOS
-- pagos de revendedor.
--
-- Por qué (decisión de Fran, 2026-09-15): 0042/0040 bloqueaban que un admin
-- con espacio de revendedor se registrara o confirmara un pago a sí mismo,
-- porque el mismo que debía la plata terminaba dándola por recibida. Fran
-- decidió que el bloqueo no vale: un admin tiene que poder registrar y
-- confirmar (o rechazar) sus propios pagos sin depender de otro admin. Los
-- revendedores que NO son admin siguen sin poder confirmar/rechazar nada
-- (ese chequeo es `es_admin()`, al principio de cada función, y no cambia).
--
-- Las cuatro funciones se recrean desde su definición ACTUAL de prod (misma
-- firma en las cuatro, mismos `security definer`/`search_path`/grants/demás
-- chequeos de rol, monto y estado):
--
--  - registrar_rendicion (0042): se saca el bloque
--      `if p_vendedor_id = v_admin_id then raise exception 'PAGO_PROPIO'`
--    que iba justo después de `v_admin_id := mi_vendedor_id();`. El resto
--    (REVENDEDOR_INVALIDO, MONTO_INVALIDO, via/tenedor) no cambia.
--
--  - registrar_carga_revendedor (0043): se saca el mismo bloqueo, que acá
--    vivía como chequeo propio antes de la sección de pago:
--      `if p_pago is not null and p_vendedor_id = v_admin_id then
--         raise exception 'pago:PAGO_PROPIO' ...`
--    (esta función NO llama a registrar_rendicion para el chequeo de
--    PAGO_PROPIO — lo repetía a mano porque necesita el prefijo
--    'pago:'/detail propios del error por sección; con el bloqueo sacado de
--    registrar_rendicion, si no se sacaba también acá el "Cargar todo
--    junto" seguiría rechazando el pago propio con el mismo código).
--
--  - confirmar_pago_revendedor (0040): se saca
--      `if v_pago.vendedor_id = v_admin_id then raise exception 'NO_AUTORIZADO'`.
--    El chequeo de destinatario que sigue (~L1005-1011: si el pago tiene un
--    destinatario admin activo, solo ese destinatario puede confirmarlo)
--    ahora se salta cuando el que llama es el propio dueño del pago: un
--    admin puede confirmar SU PROPIO pago aunque el destinatario informado
--    sea otro admin (ej. un encargado tipo Laura). El resto de las reglas
--    de destinatario, para pagos ajenos, no cambia.
--
--  - rechazar_pago_revendedor (0040): mismo cambio que confirmar_pago_revendedor
--    (mismo bloqueo de "propio" y mismo chequeo de destinatario, en espejo).
--
-- Ninguna firma cambia → las cuatro van con `create or replace function`
-- (no hace falta `drop function`).
--
-- SIN APLICAR: se aplica en prod `public` solo con el OK de Fran.

-- ============================================================
-- registrar_rendicion
-- ============================================================
create or replace function registrar_rendicion(
  p_vendedor_id uuid,
  p_monto_centavos bigint,
  p_medio_pago medio_pago,
  p_fecha date,
  p_nota text default null,
  p_via text default null
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_admin_id uuid;
  v_rendicion_id uuid;
  v_encargado_id uuid;
  v_tenedor_id uuid;
  v_via text;
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;
  v_admin_id := __SCHEMA__.mi_vendedor_id();

  if not exists (
    select 1 from vendedores
    where id = p_vendedor_id and activo and (rol = 'revendedor' or (rol = 'admin' and revende))
  ) then
    raise exception 'REVENDEDOR_INVALIDO';
  end if;

  if p_monto_centavos is null or p_monto_centavos <= 0 then
    raise exception 'MONTO_INVALIDO';
  end if;

  -- Sin via explícito: se deriva del medio_pago, igual que se comportaba
  -- la base ANTES de 0037 (toda rendición acreditaba su medio_pago tal
  -- cual, sin distinción de via).
  v_via := coalesce(p_via, case when p_medio_pago = 'efectivo' then 'encargado' else 'directo_cuenta' end);

  if v_via not in ('encargado', 'directo_cuenta', 'cliente_directo') then
    raise exception 'VIA_INVALIDA';
  end if;

  if v_via <> 'encargado' and p_medio_pago = 'efectivo' then
    raise exception 'MEDIO_INVALIDO';
  end if;

  if v_via = 'encargado' then
    select enc.id into v_encargado_id
    from vendedores yo
    join vendedores enc on enc.id = yo.encargado_id
    where yo.id = p_vendedor_id and enc.rol = 'admin' and enc.activo;
    v_tenedor_id := coalesce(v_encargado_id, v_admin_id);
  else
    v_tenedor_id := null;
  end if;

  insert into rendiciones (vendedor_id, monto_centavos, medio_pago, fecha, nota, admin_id, via, tenedor_id)
  values (p_vendedor_id, p_monto_centavos, p_medio_pago, coalesce(p_fecha, current_date), p_nota, v_admin_id, v_via, v_tenedor_id)
  returning id into v_rendicion_id;

  return json_build_object('id', v_rendicion_id, 'via', v_via, 'tenedor_id', v_tenedor_id);
end;
$$;

revoke execute on function registrar_rendicion(uuid, bigint, medio_pago, date, text, text) from anon, public;
grant execute on function registrar_rendicion(uuid, bigint, medio_pago, date, text, text) to authenticated;

-- ============================================================
-- registrar_carga_revendedor
-- ============================================================
create or replace function registrar_carga_revendedor(
  p_vendedor_id uuid,
  p_entrega jsonb,
  p_ventas jsonb,
  p_pago jsonb,
  p_clave uuid
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_admin_id uuid;
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_pedido jsonb;
  v_previa cargas_revendedor%rowtype;
  v_seccion text;
  v_fila int;
  v_producto_id uuid;
  v_msg text;
  v_det text;
  v_estado text;
  v_items jsonb;
  v_item jsonb;
  v_i int;
  v_res json;
  v_fecha date;
  v_medio medio_pago;
  v_entrega_id uuid;
  v_grupo_ids uuid[] := '{}';
  v_rendicion_id uuid;
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;
  v_admin_id := __SCHEMA__.mi_vendedor_id();

  if p_clave is null then
    raise exception 'CLAVE_INVALIDA';
  end if;

  if p_vendedor_id is null then
    raise exception 'REVENDEDOR_INVALIDO';
  end if;

  -- JSON null == sección no incluida
  if jsonb_typeof(p_entrega) = 'null' then p_entrega := null; end if;
  if jsonb_typeof(p_ventas) = 'null' then p_ventas := null; end if;
  if jsonb_typeof(p_pago) = 'null' then p_pago := null; end if;

  if p_entrega is null and p_ventas is null and p_pago is null then
    raise exception 'CARGA_VACIA';
  end if;

  -- `permitir_negativo` no es parte del pedido: es la respuesta a "Guardar
  -- igual", y un reintento idéntico con o sin esa marca es la misma carga.
  v_pedido := jsonb_build_object(
    'vendedor_id', p_vendedor_id,
    'entrega', p_entrega - 'permitir_negativo',
    'ventas', p_ventas,
    'pago', p_pago
  );

  -- Idempotencia (ver encabezado)
  insert into cargas_revendedor (clave, vendedor_id, admin_id, pedido)
  values (p_clave, p_vendedor_id, v_admin_id, v_pedido)
  on conflict (clave) do nothing;

  if not found then
    select * into v_previa from cargas_revendedor where clave = p_clave;
    if v_previa.pedido is distinct from v_pedido then
      raise exception 'CARGA_YA_GUARDADA'
        using detail = json_build_object(
          'vendedor_id', v_previa.vendedor_id,
          'created_at', v_previa.created_at
        )::text;
    end if;
    return json_build_object(
      'clave', v_previa.clave,
      'vendedor_id', v_previa.vendedor_id,
      'entrega_id', v_previa.entrega_id,
      'grupo_ids', v_previa.grupo_ids,
      'rendicion_id', v_previa.rendicion_id,
      'ya_existia', true
    );
  end if;

  if not exists (
    select 1 from vendedores
    where id = p_vendedor_id and activo and (rol = 'revendedor' or (rol = 'admin' and revende))
  ) then
    raise exception 'REVENDEDOR_INVALIDO';
  end if;

  -- 1) Entrega
  if p_entrega is not null then
    v_seccion := 'entrega';
    v_fila := null;
    v_producto_id := null;
    begin
      v_fecha := nullif(p_entrega->>'fecha', '')::date;
      if v_fecha is null then
        raise exception 'FECHA_INVALIDA';
      end if;
      if v_fecha > v_hoy then
        raise exception 'FECHA_FUTURA';
      end if;

      v_items := p_entrega->'items';
      if v_items is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
        raise exception 'SIN_ITEMS';
      end if;

      for v_i in 0 .. jsonb_array_length(v_items) - 1 loop
        v_item := v_items->v_i;
        v_fila := v_i;
        v_producto_id := nullif(v_item->>'producto_id', '')::uuid;
        if nullif(v_item->>'costo_ananja_unitario_centavos', '') is null then
          raise exception 'COSTO_FALTANTE';
        end if;
      end loop;
      v_fila := null;
      v_producto_id := null;

      v_res := __SCHEMA__.registrar_entrega_revendedor(
        p_vendedor_id,
        'entrega',
        v_fecha,
        nullif(btrim(p_entrega->>'nota'), ''),
        v_items,
        coalesce((p_entrega->>'permitir_negativo')::boolean, false)
      );
      v_entrega_id := (v_res->>'entrega_id')::uuid;
    exception when others then
      get stacked diagnostics
        v_msg = message_text, v_det = pg_exception_detail, v_estado = returned_sqlstate;
      -- mismo SQLSTATE que el error original (deadlock, constraint, etc.)
      raise exception using
        message = v_seccion || ':' || v_msg,
        detail = json_build_object(
          'seccion', v_seccion, 'fila', v_fila, 'producto_id', v_producto_id,
          'codigo', v_msg, 'detalle', nullif(v_det, '')
        )::text,
        errcode = v_estado;
    end;
  end if;

  -- 2) Ventas (ven la entrega recién insertada: misma transacción)
  if p_ventas is not null then
    v_seccion := 'ventas';
    v_fila := null;
    v_producto_id := null;
    begin
      v_fecha := nullif(p_ventas->>'fecha', '')::date;
      if v_fecha is null then
        raise exception 'FECHA_INVALIDA';
      end if;
      v_medio := nullif(p_ventas->>'medio_pago', '')::medio_pago;

      v_items := p_ventas->'items';
      if v_items is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
        raise exception 'SIN_ITEMS';
      end if;

      for v_i in 0 .. jsonb_array_length(v_items) - 1 loop
        v_item := v_items->v_i;
        v_fila := v_i;
        v_producto_id := nullif(v_item->>'producto_id', '')::uuid;
        if v_producto_id is null then
          raise exception 'PRODUCTO_INVALIDO';
        end if;

        v_res := __SCHEMA__.registrar_venta_revendedor_admin(
          p_vendedor_id,
          v_producto_id,
          (v_item->>'cantidad')::int,
          v_fecha,
          nullif(v_item->>'precio_venta_centavos', '')::bigint,
          v_medio,
          nullif(btrim(p_ventas->>'nota'), ''),
          null
        );
        v_grupo_ids := array_append(v_grupo_ids, (v_res->>'grupo_id')::uuid);
      end loop;
    exception when others then
      get stacked diagnostics
        v_msg = message_text, v_det = pg_exception_detail, v_estado = returned_sqlstate;
      -- mismo SQLSTATE que el error original (deadlock, constraint, etc.)
      raise exception using
        message = v_seccion || ':' || v_msg,
        detail = json_build_object(
          'seccion', v_seccion, 'fila', v_fila, 'producto_id', v_producto_id,
          'codigo', v_msg, 'detalle', nullif(v_det, '')
        )::text,
        errcode = v_estado;
    end;
  end if;

  -- 3) Pago
  if p_pago is not null then
    v_seccion := 'pago';
    v_fila := null;
    v_producto_id := null;
    begin
      v_fecha := nullif(p_pago->>'fecha', '')::date;
      if v_fecha is null then
        raise exception 'FECHA_INVALIDA';
      end if;
      if v_fecha > v_hoy then
        raise exception 'FECHA_FUTURA';
      end if;
      v_medio := nullif(p_pago->>'medio_pago', '')::medio_pago;
      if v_medio is null then
        raise exception 'MEDIO_FALTANTE';
      end if;

      v_res := __SCHEMA__.registrar_rendicion(
        p_vendedor_id,
        nullif(p_pago->>'monto_centavos', '')::bigint,
        v_medio,
        v_fecha,
        nullif(btrim(p_pago->>'nota'), ''),
        nullif(p_pago->>'via', '')
      );
      v_rendicion_id := (v_res->>'id')::uuid;
    exception when others then
      get stacked diagnostics
        v_msg = message_text, v_det = pg_exception_detail, v_estado = returned_sqlstate;
      -- mismo SQLSTATE que el error original (deadlock, constraint, etc.)
      raise exception using
        message = v_seccion || ':' || v_msg,
        detail = json_build_object(
          'seccion', v_seccion, 'fila', v_fila, 'producto_id', v_producto_id,
          'codigo', v_msg, 'detalle', nullif(v_det, '')
        )::text,
        errcode = v_estado;
    end;
  end if;

  update cargas_revendedor
  set entrega_id = v_entrega_id, grupo_ids = v_grupo_ids, rendicion_id = v_rendicion_id
  where clave = p_clave;

  return json_build_object(
    'clave', p_clave,
    'vendedor_id', p_vendedor_id,
    'entrega_id', v_entrega_id,
    'grupo_ids', v_grupo_ids,
    'rendicion_id', v_rendicion_id,
    'ya_existia', false
  );
end;
$$;

revoke execute on function registrar_carga_revendedor(uuid, jsonb, jsonb, jsonb, uuid) from anon, public;
grant execute on function registrar_carga_revendedor(uuid, jsonb, jsonb, jsonb, uuid) to authenticated;

-- ============================================================
-- confirmar_pago_revendedor
-- ============================================================
create or replace function confirmar_pago_revendedor(p_pago_id uuid)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_admin_id uuid;
  v_pago pagos_revendedor%rowtype;
  v_destinatario_activo boolean;
  v_via text;
  v_tenedor_id uuid;
  v_rendicion_id uuid;
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;
  v_admin_id := __SCHEMA__.mi_vendedor_id();

  select * into v_pago from pagos_revendedor where id = p_pago_id for update;
  if not found then
    raise exception 'PAGO_NO_ENCONTRADO';
  end if;

  if v_pago.estado <> 'pendiente' then
    raise exception 'PAGO_YA_RESUELTO';
  end if;

  v_destinatario_activo := v_pago.destinatario_id is not null and exists (
    select 1 from vendedores where id = v_pago.destinatario_id and rol = 'admin' and activo
  );

  -- Un admin puede confirmar SU PROPIO pago (decisión de Fran, 2026-09-15),
  -- aunque el destinatario informado sea otro admin (ej. un encargado tipo
  -- Laura): el chequeo de destinatario de abajo solo aplica a pagos ajenos.
  if v_pago.vendedor_id <> v_admin_id then
    if v_destinatario_activo and v_pago.destinatario_id <> v_admin_id then
      raise exception 'NO_AUTORIZADO';
    end if;
  end if;

  v_via := case when v_pago.destinatario_id is null then 'directo_cuenta' else 'encargado' end;

  if v_via <> 'encargado' and v_pago.medio_pago = 'efectivo' then
    raise exception 'MEDIO_INVALIDO';
  end if;

  v_tenedor_id := case
    when v_via <> 'encargado' then null
    when v_destinatario_activo then v_pago.destinatario_id
    else v_admin_id
  end;

  insert into rendiciones (vendedor_id, monto_centavos, medio_pago, fecha, nota, admin_id, via, tenedor_id)
  values (
    v_pago.vendedor_id, v_pago.monto_centavos, v_pago.medio_pago, v_pago.fecha,
    coalesce(v_pago.nota, 'Pago informado desde la app'), v_admin_id, v_via, v_tenedor_id
  )
  returning id into v_rendicion_id;

  update pagos_revendedor set
    estado = 'confirmado',
    rendicion_id = v_rendicion_id,
    resuelto_por = v_admin_id,
    resuelto_en = now()
  where id = p_pago_id;

  return json_build_object('id', p_pago_id, 'rendicion_id', v_rendicion_id, 'via', v_via, 'tenedor_id', v_tenedor_id);
end;
$$;

revoke execute on function confirmar_pago_revendedor(uuid) from anon, public;
grant execute on function confirmar_pago_revendedor(uuid) to authenticated;

-- ============================================================
-- rechazar_pago_revendedor
-- ============================================================
create or replace function rechazar_pago_revendedor(p_pago_id uuid, p_motivo text)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_admin_id uuid;
  v_pago pagos_revendedor%rowtype;
  v_motivo text;
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;
  v_admin_id := __SCHEMA__.mi_vendedor_id();

  v_motivo := nullif(btrim(p_motivo), '');
  if v_motivo is null then
    raise exception 'MOTIVO_REQUERIDO';
  end if;

  select * into v_pago from pagos_revendedor where id = p_pago_id for update;
  if not found then
    raise exception 'PAGO_NO_ENCONTRADO';
  end if;

  if v_pago.estado <> 'pendiente' then
    raise exception 'PAGO_YA_RESUELTO';
  end if;

  -- Mismo criterio que confirmar_pago_revendedor: un admin puede rechazar
  -- SU PROPIO pago aunque el destinatario informado sea otro admin.
  if v_pago.vendedor_id <> v_admin_id then
    if v_pago.destinatario_id is not null
      and v_pago.destinatario_id <> v_admin_id
      and exists (
        select 1 from vendedores where id = v_pago.destinatario_id and rol = 'admin' and activo
      )
    then
      raise exception 'NO_AUTORIZADO';
    end if;
  end if;

  update pagos_revendedor set
    estado = 'rechazado',
    motivo_rechazo = v_motivo,
    resuelto_por = v_admin_id,
    resuelto_en = now()
  where id = p_pago_id;

  return json_build_object('id', p_pago_id);
end;
$$;

revoke execute on function rechazar_pago_revendedor(uuid, text) from anon, public;
grant execute on function rechazar_pago_revendedor(uuid, text) to authenticated;
