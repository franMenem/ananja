-- Ananja: "Cargar todo junto" — entrega + ventas + pago de una revendedora
-- en UNA sola operación (pantalla /revendedores/[id]/carga, solo admins).
--
-- Problema: para cargar un lote viejo ("en agosto se llevó 30 del lote X,
-- vendió 25, de 10 no sabemos el precio y le dio $200.000 en efectivo a
-- su encargada") un admin tenía que hacer tres pasos sueltos (Entregar, Cargar
-- ventas, Registrar pago); si uno fallaba a mitad de camino quedaba la
-- carga a medias.
--
-- registrar_carga_revendedor(p_vendedor_id, p_entrega, p_ventas, p_pago,
-- p_clave): en UNA transacción llama a los MISMOS RPCs de siempre, sin
-- tocarlos:
--   1. entrega → registrar_entrega_revendedor (tipo 'entrega')
--   2. ventas  → registrar_venta_revendedor_admin (una por presentación;
--                adentro insertar_venta_revendedor con registrada_por = el
--                admin y el mismo reparto FIFO por entrega)
--   3. pago    → registrar_rendicion (PAGO_PROPIO, VIA/MEDIO, tenedor =
--                encargado si es admin activo, si no el admin que carga)
-- Si cualquier parte falla, no se guarda NADA. El error sale como
-- '<seccion>:<CODIGO>' (seccion = entrega | ventas | pago), con detail JSON
-- {seccion, fila, producto_id, codigo, detalle} — `detalle` es el detail
-- original del RPC interno (texto JSON o null). Errores generales (antes de
-- tocar ninguna sección) salen sin prefijo: NO_AUTORIZADO, CLAVE_INVALIDA,
-- CARGA_VACIA, REVENDEDOR_INVALIDO, CARGA_YA_GUARDADA. El error de una
-- sección conserva el SQLSTATE original.
--
-- Formas de los parámetros (null = sección no incluida):
--   p_entrega {fecha, nota?, permitir_negativo?, items: [{producto_id,
--              lote_id?, cantidad, costo_ananja_unitario_centavos,
--              precio_sugerido_centavos?}]}
--   p_ventas  {fecha, medio_pago?, nota?, items: [{producto_id, cantidad,
--              precio_venta_centavos (null = no se sabe)}]}
--   p_pago    {fecha, monto_centavos, medio_pago, via, nota?}
--
-- Idempotencia: p_clave es un uuid que el cliente genera UNA vez por
-- formulario. Se guarda en cargas_revendedor junto con el pedido completo.
-- Si llega de nuevo la misma clave (respuesta perdida, doble toque):
--   - mismo pedido → devuelve el resultado anterior (ya_existia = true) sin
--     insertar nada. `entrega.permitir_negativo` no cuenta para comparar (un
--     reintento después de "Guardar igual" puede venir con o sin la marca);
--   - pedido distinto → CARGA_YA_GUARDADA (se guardó una versión anterior y
--     después se editó el formulario: no se guarda encima ni se duplica).
-- El insert de la clave va ANTES de las secciones: dos llamadas simultáneas
-- con la misma clave se serializan en la primary key (la segunda espera a
-- que la primera termine y cae en el replay o, si la primera falló, sigue).
--
-- Validaciones propias de esta pantalla (los tres flujos sueltos no
-- cambian): fecha obligatoria y no futura en cada sección (entrega y pago
-- usaban current_date UTC si venía null), "le debe a Ananja por botella"
-- obligatorio en cada ítem de la entrega, y PAGO_PROPIO chequeado antes de
-- guardar nada. En ventas puede haber varias filas de la MISMA presentación
-- (ej. 15 a $X y 10 sin precio): se guardan en el orden recibido, cada una
-- con su propio grupo_id, y cada una ve el stock que dejaron las anteriores.
--
-- No cambia ninguna firma ni función existente.
--
-- SIN APLICAR: se aplica en prod `public` solo con el OK de Fran.

create table cargas_revendedor (
  clave uuid primary key,
  vendedor_id uuid not null references vendedores(id),
  admin_id uuid not null references vendedores(id),
  -- {vendedor_id, entrega, ventas, pago} tal cual llegó: un reintento con
  -- la misma clave tiene que traer exactamente lo mismo.
  pedido jsonb not null,
  entrega_id uuid references entregas_revendedor(id) on delete set null,
  -- grupo_id de cada venta (una por presentación)
  grupo_ids uuid[] not null default '{}',
  rendicion_id uuid references rendiciones(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_cargas_revendedor_vendedor_id on cargas_revendedor(vendedor_id);
create index idx_cargas_revendedor_admin_id on cargas_revendedor(admin_id);
create index idx_cargas_revendedor_entrega_id on cargas_revendedor(entrega_id);
create index idx_cargas_revendedor_rendicion_id on cargas_revendedor(rendicion_id);

alter table cargas_revendedor enable row level security;
revoke all on cargas_revendedor from anon, authenticated, public;
grant select on cargas_revendedor to authenticated;

-- Solo lectura para admins (auditoría); se escribe únicamente desde el RPC.
create policy cargas_revendedor_select on cargas_revendedor for select to authenticated
  using (__SCHEMA__.es_admin());

create function registrar_carga_revendedor(
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
