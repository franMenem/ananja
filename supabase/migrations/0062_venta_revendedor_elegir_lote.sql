-- Elegir lote al cargar una venta de revendedora — pedido de Fran
-- (2026-09-18): hoy `insertar_venta_revendedor` siempre reparte FIFO entre
-- TODAS las entregas de esa revendedora (`stock_revendedor_por_entrega`,
-- 0040), sin importar de qué lote de producción vino cada una
-- (`entrega_items.lote_id`). Un admin no puede decir "esta venta salió del
-- lote viejo" si ella tiene stock de dos lotes distintos: siempre sale del
-- más viejo primero.
--
-- Se agrega `p_lote_id uuid default null` a la cadena de registro de una
-- venta:
--   - `null` (default) → EXACTAMENTE el mismo comportamiento de hoy: FIFO
--     entre todas las entregas, sin filtrar por lote.
--   - un lote puntual → la venta sale SOLO de los tramos de entrega de ESE
--     lote (`stock_revendedor_por_entrega.lote_id = p_lote_id`), FIFO
--     dentro de ese lote únicamente — aunque otro lote tenga stock de
--     sobra, no se toca. Si ese lote no le alcanza, `STOCK_INSUFICIENTE_LOTE`
--     (no cae en fallback a otro lote ni al `STOCK_REVENDEDOR_INSUFICIENTE`
--     general, que sigue siendo el error cuando NO se eligió lote).
--
-- Cambian de firma (drop + create, nunca `create or replace`: dejaría una
-- sobrecarga ambigua) — `p_lote_id` va al final en los tres, así los
-- callers existentes que no lo mandan siguen funcionando igual:
--   1. `insertar_venta_revendedor` (interna, sin grants: solo la llaman las
--      dos de abajo).
--   2. `registrar_venta_revendedor` (la propia revendedora) — la pantalla
--      de `/mi` no manda `p_lote_id` todavía: sigue siendo FIFO puro, como
--      documenta `lib/revendedor-stock.ts` ("la revendedora nunca elige
--      lote").
--   3. `registrar_venta_revendedor_admin` (un admin en su nombre).
--
-- `registrar_carga_revendedor` (0043) no cambia de firma (sigue recibiendo
-- `p_ventas` jsonb): cada ítem de `p_ventas.items` admite ahora un
-- `lote_id` opcional, que se pasa tal cual a `registrar_venta_revendedor_admin`
-- — `create or replace function` alcanza (mismos tipos de parámetros).
--
-- SIN APLICAR: se aplica en prod `public` solo con el OK de Fran.

-- ============================================================
-- 1) insertar_venta_revendedor
-- ============================================================

drop function insertar_venta_revendedor(uuid, uuid, int, bigint, medio_pago, date, text, uuid, uuid);

create function public.insertar_venta_revendedor(
  p_vendedor_id uuid,
  p_producto_id uuid,
  p_cantidad int,
  p_precio_venta_centavos bigint,
  p_medio_pago medio_pago,
  p_fecha date,
  p_nota text,
  p_registrada_por uuid,
  p_grupo_id uuid,
  p_lote_id uuid default null
)
returns json
language plpgsql
set search_path = 'public'
as $$
declare
  v_dueño_grupo uuid;
  v_vendedor_id uuid := p_vendedor_id;
  v_precio_manual_centavos bigint;
  v_costo_centavos bigint;
  v_en_poder int;
  v_en_lote int;
  v_nombre text;
  v_grupo_id uuid := gen_random_uuid();
  v_venta_id uuid;
  v_ids uuid[] := '{}';
  v_resto int;
  v_tomar int;
  v_tramo record;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'CANTIDAD_INVALIDA';
  end if;

  -- Opcional acá (una venta cargada por un admin puede no tenerlo); si
  -- viene, tiene que ser > 0. registrar_venta_revendedor lo exige antes.
  if p_precio_venta_centavos is not null and p_precio_venta_centavos <= 0 then
    raise exception 'PRECIO_INVALIDO';
  end if;

  if p_fecha is null then
    raise exception 'FECHA_INVALIDA';
  end if;

  if p_fecha > (now() at time zone 'America/Argentina/Buenos_Aires')::date then
    raise exception 'FECHA_FUTURA';
  end if;

  perform 1 from vendedores where id = v_vendedor_id for no key update;

  if p_grupo_id is not null then
    select vendedor_id into v_dueño_grupo from ventas_revendedor where grupo_id = p_grupo_id limit 1;
    if v_dueño_grupo is not null then
      if v_dueño_grupo <> v_vendedor_id then
        raise exception 'GRUPO_INVALIDO';
      end if;
      select array_agg(id order by created_at, id) into v_ids
      from ventas_revendedor where grupo_id = p_grupo_id;
      return json_build_object('id', v_ids[1], 'grupo_id', p_grupo_id, 'ids', v_ids, 'ya_existia', true);
    end if;
    v_grupo_id := p_grupo_id;
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

  -- Si se eligió lote, ese lote puntual tiene que alcanzar por sí solo —
  -- no cae a los demás lotes aunque el total de arriba sobre. Chequeo
  -- aparte (antes de repartir) para no dejar filas parciales insertadas: el
  -- loop de abajo, filtrado al mismo lote, es la garantía real (misma fila
  -- bloqueada con `for no key update`, no hay carrera en el medio).
  if p_lote_id is not null then
    select coalesce(sum(s.quedan), 0) into v_en_lote
    from public.stock_revendedor_por_entrega(v_vendedor_id, p_producto_id) s
    where s.lote_id = p_lote_id;

    if v_en_lote < p_cantidad then
      select nombre into v_nombre from productos where id = p_producto_id;
      raise exception 'STOCK_INSUFICIENTE_LOTE'
        using detail = json_build_object(
          'producto', v_nombre,
          'producto_id', p_producto_id,
          'lote_id', p_lote_id,
          'disponible', v_en_lote
        )::text;
    end if;
  end if;

  select precio_centavos into v_precio_manual_centavos
  from revendedor_precios where vendedor_id = v_vendedor_id and producto_id = p_producto_id;

  v_resto := p_cantidad;

  for v_tramo in
    select s.entrega_item_id, s.lote_id, s.quedan, s.costo_ananja_unitario_centavos, s.fecha
    from public.stock_revendedor_por_entrega(v_vendedor_id, p_producto_id) s
    where s.quedan > 0
      and (p_lote_id is null or s.lote_id = p_lote_id)
    order by s.orden
  loop
    exit when v_resto <= 0;

    if v_tramo.fecha > p_fecha then
      select nombre into v_nombre from productos where id = p_producto_id;
      raise exception 'FECHA_ANTERIOR_A_ENTREGA'
        using detail = json_build_object(
          'producto', v_nombre,
          'producto_id', p_producto_id,
          'entrega_fecha', v_tramo.fecha
        )::text;
    end if;

    v_tomar := least(v_tramo.quedan, v_resto);
    v_costo_centavos := coalesce(v_tramo.costo_ananja_unitario_centavos, v_precio_manual_centavos);

    if v_costo_centavos is null then
      raise exception 'PRECIO_NO_ASIGNADO';
    end if;

    insert into ventas_revendedor (
      vendedor_id, producto_id, cantidad, precio_venta_centavos, precio_costo_centavos,
      medio_pago, fecha, nota, entrega_item_id, lote_id, grupo_id, registrada_por
    ) values (
      v_vendedor_id, p_producto_id, v_tomar, p_precio_venta_centavos, v_costo_centavos,
      p_medio_pago, p_fecha, p_nota, v_tramo.entrega_item_id,
      v_tramo.lote_id, v_grupo_id, p_registrada_por
    ) returning id into v_venta_id;

    v_ids := array_append(v_ids, v_venta_id);
    v_resto := v_resto - v_tomar;
  end loop;

  -- No debería pasar: ya se validó arriba (total y, si corresponde, el
  -- lote elegido). Red de seguridad por si los datos quedaron
  -- inconsistentes (ej. una devolución forzada con "Guardar igual").
  if v_resto > 0 then
    select nombre into v_nombre from productos where id = p_producto_id;
    if p_lote_id is not null then
      raise exception 'STOCK_INSUFICIENTE_LOTE'
        using detail = json_build_object(
          'producto', v_nombre,
          'producto_id', p_producto_id,
          'lote_id', p_lote_id,
          'disponible', p_cantidad - v_resto
        )::text;
    else
      raise exception 'STOCK_REVENDEDOR_INSUFICIENTE'
        using detail = json_build_object(
          'producto', v_nombre,
          'producto_id', p_producto_id,
          'disponible', p_cantidad - v_resto
        )::text;
    end if;
  end if;

  return json_build_object('id', v_ids[1], 'grupo_id', v_grupo_id, 'ids', v_ids);
end;
$$;

revoke execute on function public.insertar_venta_revendedor(uuid, uuid, int, bigint, medio_pago, date, text, uuid, uuid, uuid) from anon, authenticated, public;

-- ============================================================
-- 2) registrar_venta_revendedor — la propia revendedora. `p_lote_id` no lo
--    manda la pantalla todavía (sigue siendo FIFO puro para ella), pero la
--    firma queda lista.
-- ============================================================

drop function registrar_venta_revendedor(uuid, int, bigint, medio_pago, date, text);

create function public.registrar_venta_revendedor(
  p_producto_id uuid,
  p_cantidad int,
  p_precio_venta_centavos bigint,
  p_medio_pago medio_pago,
  p_fecha date,
  p_nota text default null,
  p_lote_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if not public.puede_revender() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'CANTIDAD_INVALIDA';
  end if;

  if p_precio_venta_centavos is null or p_precio_venta_centavos <= 0 then
    raise exception 'PRECIO_INVALIDO';
  end if;

  if p_medio_pago is null then
    raise exception 'MEDIO_INVALIDO';
  end if;

  return public.insertar_venta_revendedor(
    public.mi_vendedor_id(), p_producto_id, p_cantidad, p_precio_venta_centavos,
    p_medio_pago, p_fecha, p_nota, null, null, p_lote_id
  );
end;
$$;

revoke execute on function public.registrar_venta_revendedor(uuid, int, bigint, medio_pago, date, text, uuid) from anon, public;
grant execute on function public.registrar_venta_revendedor(uuid, int, bigint, medio_pago, date, text, uuid) to authenticated;

-- ============================================================
-- 3) registrar_venta_revendedor_admin — un admin en nombre de la
--    revendedora. `p_lote_id` opcional, al final.
-- ============================================================

drop function registrar_venta_revendedor_admin(uuid, uuid, int, date, bigint, medio_pago, text, uuid);

create function public.registrar_venta_revendedor_admin(
  p_vendedor_id uuid,
  p_producto_id uuid,
  p_cantidad int,
  p_fecha date,
  p_precio_venta_centavos bigint default null,
  p_medio_pago medio_pago default null,
  p_nota text default null,
  p_grupo_id uuid default null,
  p_lote_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if not exists (
    select 1 from vendedores
    where id = p_vendedor_id and activo and (rol = 'revendedor' or (rol = 'admin' and revende))
  ) then
    raise exception 'REVENDEDOR_INVALIDO';
  end if;

  return public.insertar_venta_revendedor(
    p_vendedor_id, p_producto_id, p_cantidad, p_precio_venta_centavos,
    p_medio_pago, p_fecha, p_nota, public.mi_vendedor_id(), p_grupo_id, p_lote_id
  );
end;
$$;

revoke execute on function public.registrar_venta_revendedor_admin(uuid, uuid, int, date, bigint, medio_pago, text, uuid, uuid) from anon, public;
grant execute on function public.registrar_venta_revendedor_admin(uuid, uuid, int, date, bigint, medio_pago, text, uuid, uuid) to authenticated;

-- ============================================================
-- 4) registrar_carga_revendedor (0043) — misma firma (`p_ventas` sigue
--    siendo jsonb): cada ítem admite ahora `lote_id` opcional, que viaja
--    tal cual a `registrar_venta_revendedor_admin`. Sin `lote_id` en el
--    ítem (o `null`) → FIFO como siempre. Único cambio real del cuerpo:
--    una línea más en la llamada del loop de ventas.
-- ============================================================

create or replace function public.registrar_carga_revendedor(
  p_vendedor_id uuid,
  p_entrega jsonb,
  p_ventas jsonb,
  p_pago jsonb,
  p_clave uuid
)
returns json
language plpgsql
security definer
set search_path = 'public'
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
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;
  v_admin_id := public.mi_vendedor_id();

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

  -- Idempotencia (ver encabezado de 0043)
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

  -- Nadie se registra un pago a sí mismo (misma regla que registrar_rendicion
  -- desde 0042) — se corta antes de guardar la entrega y las ventas.
  if p_pago is not null and p_vendedor_id = v_admin_id then
    raise exception 'pago:PAGO_PROPIO'
      using detail = json_build_object('seccion', 'pago', 'codigo', 'PAGO_PROPIO')::text;
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

      v_res := public.registrar_entrega_revendedor(
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

  -- 2) Ventas (ven la entrega recién insertada: misma transacción). Cada
  -- ítem admite `lote_id` opcional (nuevo, 0062): null = FIFO entre todas
  -- las entregas, como siempre.
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

        v_res := public.registrar_venta_revendedor_admin(
          p_vendedor_id,
          v_producto_id,
          (v_item->>'cantidad')::int,
          v_fecha,
          nullif(v_item->>'precio_venta_centavos', '')::bigint,
          v_medio,
          nullif(btrim(p_ventas->>'nota'), ''),
          null,
          nullif(v_item->>'lote_id', '')::uuid
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

      v_res := public.registrar_rendicion(
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

revoke execute on function public.registrar_carga_revendedor(uuid, jsonb, jsonb, jsonb, uuid) from anon, public;
grant execute on function public.registrar_carga_revendedor(uuid, jsonb, jsonb, jsonb, uuid) to authenticated;
