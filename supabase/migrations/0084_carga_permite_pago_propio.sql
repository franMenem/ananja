-- 0084_carga_permite_pago_propio.sql
--
-- QUÉ: `registrar_carga_revendedor` vuelve a permitir que un admin con
-- espacio de revendedor (rol = 'admin' y revende = true) se cargue un pago
-- a sí mismo desde la carga unificada (/revendedores/[id]/carga). Se quita
-- ÚNICAMENTE el bloque que levantaba 'pago:PAGO_PROPIO'. Misma firma, mismo
-- cuerpo en todo lo demás.
--
-- POR QUÉ (regresión de 0062 sobre 0046): la decisión de producto del dueño
-- (0046, 2026-09-15) fue que "un admin puede registrar y confirmar sus
-- propios pagos"; 0046 sacó este bloque de `registrar_carga_revendedor` y de
-- `registrar_rendicion`. Pero 0062 (elegir lote al vender) recreó
-- `registrar_carga_revendedor` copiando el cuerpo de una base vieja (0043) y
-- reintrodujo el bloqueo. Hoy el log de postgres muestra 'pago:PAGO_PROPIO' y
-- la pantalla muestra el genérico "Pago: No se pudo guardar esta parte…".
-- `registrar_rendicion` (camino del pago suelto) NO tiene el bloqueo.
--
-- Verificado con `pg_get_functiondef` en producción: el cuerpo vigente
-- (md5 de prosrc e345516d344f7cc4fa5aae875c1d97a9, 8198 caracteres) es
-- idéntico byte a byte al de 0062; esta migración parte de ESE cuerpo.
--
-- COHERENCIA DEL PAGO PROPIO: tras el bloque, la sección de pago llama a
-- `registrar_rendicion(p_vendedor_id, monto, medio, fecha, nota, via)`, que
-- deriva `via` del medio si no viene (efectivo => 'encargado', otro =>
-- 'directo_cuenta') y rechaza efectivo con via distinta de 'encargado'
-- (MEDIO_INVALIDO) o una via desconocida (VIA_INVALIDA). Con via =
-- 'encargado' el tenedor es el encargado activo (admin/coordinador) del
-- vendedor o, si no tiene, el admin que registra (aquí, el propio admin);
-- con otra via el tenedor es null. Ambos casos cumplen
-- `rendiciones_via_tenedor_coherente` (0081). No hay chequeo de pago propio
-- en `registrar_rendicion`.
--
-- NO SE TOCA `registrar_pago_diferencia_encargado` (0044): su PAGO_PROPIO es
-- otro flujo (un admin no se paga a sí mismo la diferencia de encargado).
--
-- APLICACIÓN: en una transacción (es un solo `create or replace` + revoke +
-- grant). `security definer`, `set search_path = public` (sin comillas, es
-- equivalente a lo que hay en producción y es la convención del repo) y los
-- privilegios (postgres, authenticated, service_role; sin anon ni public) se
-- conservan.
--
-- VERIFICACIÓN (solo lectura, después de aplicar):
--   select position('PAGO_PROPIO' in prosrc) = 0 as sin_bloqueo,
--          prosecdef, proconfig, proacl::text
--     from pg_proc
--    where oid = 'public.registrar_carga_revendedor(uuid, jsonb, jsonb, jsonb, uuid)'::regprocedure;
--   -- esperado: true, true, {search_path=public},
--   --   {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--   select count(*) from pg_proc
--    where pronamespace = 'public'::regnamespace
--      and proname = 'registrar_carga_revendedor';   -- esperado: 1
--
-- ROLLBACK: volver a aplicar `create or replace` con el cuerpo de 0062
-- (con el bloque de PAGO_PROPIO), que reabre el bloqueo.

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
set search_path = public
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
