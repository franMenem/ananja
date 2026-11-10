-- 0086_rpc_escrituras.sql
--
-- MIGRACIÓN A (ADITIVA). Crea las funciones (RPC) por las que va a pasar TODA
-- escritura de cinco tablas que hoy se escriben por REST directo con el rol
-- `authenticated`: deudas, movimientos_stock, gastos, comprobantes e insumos.
-- No revoca nada, no cambia ninguna función existente y no toca datos: es
-- segura de aplicar ANTES de desplegar el código. La 0087 (migración B)
-- revoca los permisos de escritura directa y se aplica DESPUÉS de desplegar el
-- código nuevo.
--
-- ── Qué crea (todas `security definer`, `set search_path = public`) ──────
--   crear_deuda(p_descripcion, p_moneda, p_monto_centavos, p_fecha, p_nota)
--   marcar_deuda_saldada(p_deuda_id, p_fecha)
--   registrar_egreso_manual(p_producto_id, p_motivo, p_filas, p_nota)
--   editar_gasto(p_gasto_id, p_monto_centavos, p_categoria_id, p_medio_pago,
--                p_fecha, p_nota)
--   eliminar_gasto(p_gasto_id)
--   eliminar_comprobante(p_comprobante_id)
--   actualizar_umbral_insumo(p_insumo_id, p_umbral_minimo)
--
-- ── Regla de acceso (de dónde sale cada una) ─────────────────────────────
-- Hoy TODAS las policies de estas tablas son `es_vendedor()`, que en
-- producción está definida como `select public.es_admin()` (verificado con
-- pg_get_functiondef): solo un admin ACTIVO. Por eso cada función exige
-- `public.es_admin()` y levanta 'NO_AUTORIZADO' si no. Como `security definer`
-- saltea RLS, además de ese chequeo se reproduce explícito lo que RLS, los
-- grants por columna y los triggers garantizaban:
--
--   deudas_insert  with check es_vendedor()  + trigger forzar_vendedor_deuda
--     -> crear_deuda: es_admin(); vendedor_id = ficha del admin logueado
--        (igual que `crear_gasto`); solo escribe descripcion/moneda/monto/
--        fecha/nota (el grant de columnas dejaba además lote_id y saldada_en,
--        que la app nunca manda: ahora no se pueden fijar a mano). Los checks
--        de la tabla (descripcion no vacía, moneda USD/ARS, monto > 0) se
--        validan antes con código propio.
--   deudas_update  using/check es_vendedor() + grant update(saldada_en)
--     -> marcar_deuda_saldada: es_admin(); solo toca saldada_en. Toma lock de
--        la fila y exige que no esté ya saldada (DEUDA_YA_SALDADA, mismo
--        código que registrar_pago_deuda): el update directo pisaba la fecha
--        de una deuda ya saldada. La fecha llega por parámetro (tema UTC de
--        la 0036), no hay current_date.
--   movimientos_stock_insert  with check (comprobante_id is null and es_vendedor())
--     + trigger forzar_vendedor_movimiento_stock
--     -> registrar_egreso_manual: es_admin(); fija tipo = 'egreso' (el grant
--        permitía también 'ingreso'), comprobante_id/feria_id/entrega_id
--        siempre null (lo que exige la policy y lo que
--        `eliminar_movimiento_stock` entiende como "manual"), vendedor_id =
--        admin logueado. Motivo restringido a los que ofrece el formulario
--        (venta, degustacion, rotura, regalo, otro; la tabla además acepta
--        'ajuste', que tiene otro flujo). Todas las filas en una sola
--        transacción (el insert directo ya era un único statement).
--        NO valida stock suficiente: igual que hoy, la pantalla avisa y deja
--        "guardar igual".
--   gastos_update  using/check es_vendedor() + trigger gastos_proteger_pago_diferencia
--     -> editar_gasto: es_admin(); solo toca monto, categoría, medio de pago,
--        fecha y nota (lo único que edita la pantalla; el grant dejaba todas
--        las columnas). OJO: el trigger gastos_proteger_pago_diferencia
--        se saltea cuando el que escribe es el dueño de la función
--        (`current_user not in ('anon','authenticated')` => return new), y
--        dentro de una security definer `current_user` es el dueño. Por eso
--        las reglas del trigger se REPLICAN en la función: no se puede
--        cambiar la categoría de un gasto con encargado_beneficiario_id, ni
--        pasar un gasto a la categoría 'Diferencias de encargados'
--        (CATEGORIA_NO_EDITABLE). encargado_beneficiario_id no se toca.
--        Siguen corriendo los triggers de updated_at y de producto-en-lote.
--   gastos_delete  using es_vendedor()
--     -> eliminar_gasto: es_admin(); borra la fila y, por FK, sus
--        movimientos_insumo (ON DELETE CASCADE), igual que hoy. Idempotente:
--        si ya no existe devuelve eliminado = false (el delete directo no
--        daba error con 0 filas).
--   comprobantes_delete  using es_vendedor()
--     -> eliminar_comprobante: es_admin(); borra el comprobante; por FK
--        (ON DELETE CASCADE) caen comprobante_items, cobros y los
--        movimientos_stock de ese comprobante, igual que hoy. Idempotente.
--   insumos_update  using/check es_vendedor() + grant update(nombre, umbral_minimo, activo)
--     -> actualizar_umbral_insumo: es_admin(); solo umbral_minimo (>= 0,
--        como el check de la tabla). nombre y activo no los escribe ninguna
--        pantalla por REST (nombre/activo se manejan por crear_insumo).
--
-- Errores: 'CODIGO' plano (mismo patrón que crear_gasto / registrar_pago_deuda);
-- el cliente los traduce con traducirErrorRpc y conserva los mensajes de hoy.
--
-- Tablas con escritura directa que NO se tocan acá (ver 0087): categorias_gasto,
-- clientes, materiales_venta, productos(umbral_minimo), push_subscriptions.
--
-- ── Verificación posterior (solo lectura) ────────────────────────────────
--   select proname, prosecdef, proconfig, proacl::text
--     from pg_proc
--    where pronamespace = 'public'::regnamespace
--      and proname in ('crear_deuda','marcar_deuda_saldada','registrar_egreso_manual',
--                      'editar_gasto','eliminar_gasto','eliminar_comprobante',
--                      'actualizar_umbral_insumo')
--    order by 1;
--   -- esperado: 7 filas, prosecdef = true, proconfig = {search_path=public},
--   --   proacl con postgres, authenticated y service_role; sin anon ni PUBLIC.
--
-- ── Rollback ─────────────────────────────────────────────────────────────
--   drop function public.crear_deuda(text, text, bigint, date, text);
--   drop function public.marcar_deuda_saldada(uuid, date);
--   drop function public.registrar_egreso_manual(uuid, text, jsonb, text);
--   drop function public.editar_gasto(uuid, bigint, uuid, public.medio_pago, date, text);
--   drop function public.eliminar_gasto(uuid);
--   drop function public.eliminar_comprobante(uuid);
--   drop function public.actualizar_umbral_insumo(uuid, numeric);
--   (solo si la 0087 NO se aplicó; si se aplicó, revertir primero la 0087.)

-- ── 1) crear_deuda ───────────────────────────────────────────────────────
create function public.crear_deuda(
  p_descripcion text,
  p_moneda text,
  p_monto_centavos bigint,
  p_fecha date,
  p_nota text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendedor_id uuid;
  v_descripcion text;
  v_deuda_id uuid;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select id into v_vendedor_id from public.vendedores where user_id = auth.uid();
  if v_vendedor_id is null then
    raise exception 'VENDEDOR_NO_REGISTRADO';
  end if;

  v_descripcion := btrim(coalesce(p_descripcion, ''));
  if v_descripcion = '' then
    raise exception 'DESCRIPCION_INVALIDA';
  end if;

  if p_moneda is null or p_moneda not in ('ARS', 'USD') then
    raise exception 'MONEDA_INVALIDA';
  end if;

  if p_monto_centavos is null or p_monto_centavos <= 0 then
    raise exception 'MONTO_INVALIDO';
  end if;

  if p_fecha is null then
    raise exception 'FECHA_INVALIDA';
  end if;

  insert into public.deudas (descripcion, moneda, monto_centavos, fecha, nota, vendedor_id)
  values (v_descripcion, p_moneda, p_monto_centavos, p_fecha, nullif(btrim(coalesce(p_nota, '')), ''), v_vendedor_id)
  returning id into v_deuda_id;

  return json_build_object('id', v_deuda_id);
end;
$$;

revoke all on function public.crear_deuda(text, text, bigint, date, text) from public, anon;
grant execute on function public.crear_deuda(text, text, bigint, date, text) to authenticated;

-- ── 2) marcar_deuda_saldada ──────────────────────────────────────────────
create function public.marcar_deuda_saldada(
  p_deuda_id uuid,
  p_fecha date
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saldada_en date;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if p_fecha is null then
    raise exception 'FECHA_INVALIDA';
  end if;

  select saldada_en into v_saldada_en
  from public.deudas
  where id = p_deuda_id
  for update;

  if not found then
    raise exception 'DEUDA_NO_ENCONTRADA';
  end if;

  if v_saldada_en is not null then
    raise exception 'DEUDA_YA_SALDADA';
  end if;

  update public.deudas set saldada_en = p_fecha where id = p_deuda_id;

  return json_build_object('id', p_deuda_id);
end;
$$;

revoke all on function public.marcar_deuda_saldada(uuid, date) from public, anon;
grant execute on function public.marcar_deuda_saldada(uuid, date) to authenticated;

-- ── 3) registrar_egreso_manual ───────────────────────────────────────────
-- p_filas: arreglo jsonb de objetos {"cantidad": <entero > 0>, "lote_id": <uuid|null>}.
create function public.registrar_egreso_manual(
  p_producto_id uuid,
  p_motivo text,
  p_filas jsonb,
  p_nota text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendedor_id uuid;
  v_nota text;
  v_fila jsonb;
  v_cantidad numeric;
  v_lote_id uuid;
  v_ids uuid[] := '{}';
  v_id uuid;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select id into v_vendedor_id from public.vendedores where user_id = auth.uid();
  if v_vendedor_id is null then
    raise exception 'VENDEDOR_NO_REGISTRADO';
  end if;

  if p_motivo is null or p_motivo not in ('venta', 'degustacion', 'rotura', 'regalo', 'otro') then
    raise exception 'MOTIVO_INVALIDO';
  end if;

  if not exists (select 1 from public.productos where id = p_producto_id) then
    raise exception 'PRODUCTO_NO_ENCONTRADO';
  end if;

  if p_filas is null
     or jsonb_typeof(p_filas) <> 'array'
     or jsonb_array_length(p_filas) = 0
     or jsonb_array_length(p_filas) > 50 then
    raise exception 'FILAS_INVALIDAS';
  end if;

  v_nota := nullif(btrim(coalesce(p_nota, '')), '');

  for v_fila in select * from jsonb_array_elements(p_filas) loop
    if jsonb_typeof(v_fila) <> 'object'
       or jsonb_typeof(v_fila -> 'cantidad') <> 'number' then
      raise exception 'FILAS_INVALIDAS';
    end if;

    v_cantidad := (v_fila ->> 'cantidad')::numeric;
    if v_cantidad <> trunc(v_cantidad) or v_cantidad <= 0 or v_cantidad > 1000000 then
      raise exception 'CANTIDAD_INVALIDA';
    end if;

    v_lote_id := null;
    if coalesce(jsonb_typeof(v_fila -> 'lote_id'), 'null') <> 'null' then
      if jsonb_typeof(v_fila -> 'lote_id') <> 'string' then
        raise exception 'FILAS_INVALIDAS';
      end if;
      begin
        v_lote_id := (v_fila ->> 'lote_id')::uuid;
      exception when invalid_text_representation then
        raise exception 'FILAS_INVALIDAS';
      end;
      if not exists (select 1 from public.lotes_produccion where id = v_lote_id) then
        raise exception 'LOTE_NO_ENCONTRADO';
      end if;
    end if;

    -- comprobante_id, feria_id y entrega_id quedan null a propósito: es lo que
    -- exigía la policy y lo que eliminar_movimiento_stock llama "manual".
    insert into public.movimientos_stock (producto_id, tipo, cantidad, vendedor_id, nota, motivo, lote_id)
    values (p_producto_id, 'egreso', v_cantidad::integer, v_vendedor_id, v_nota, p_motivo, v_lote_id)
    returning id into v_id;

    v_ids := v_ids || v_id;
  end loop;

  return json_build_object('ids', to_json(v_ids));
end;
$$;

revoke all on function public.registrar_egreso_manual(uuid, text, jsonb, text) from public, anon;
grant execute on function public.registrar_egreso_manual(uuid, text, jsonb, text) to authenticated;

-- ── 4) editar_gasto ──────────────────────────────────────────────────────
create function public.editar_gasto(
  p_gasto_id uuid,
  p_monto_centavos bigint,
  p_categoria_id uuid,
  p_medio_pago public.medio_pago,
  p_fecha date,
  p_nota text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gasto public.gastos%rowtype;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if p_monto_centavos is null or p_monto_centavos <= 0 then
    raise exception 'MONTO_INVALIDO';
  end if;

  if p_medio_pago is null then
    raise exception 'MEDIO_INVALIDO';
  end if;

  if p_fecha is null then
    raise exception 'FECHA_INVALIDA';
  end if;

  select * into v_gasto from public.gastos where id = p_gasto_id for update;
  if not found then
    raise exception 'GASTO_NO_ENCONTRADO';
  end if;

  if not exists (select 1 from public.categorias_gasto where id = p_categoria_id) then
    raise exception 'CATEGORIA_NO_ENCONTRADA';
  end if;

  -- Réplica de gastos_proteger_pago_diferencia, que no corre acá: dentro de
  -- una security definer current_user es el dueño y el trigger se saltea.
  if p_categoria_id is distinct from v_gasto.categoria_id
     and (
       v_gasto.encargado_beneficiario_id is not null
       or exists (
         select 1 from public.categorias_gasto cg
         where cg.id = p_categoria_id and cg.nombre = 'Diferencias de encargados'
       )
     ) then
    raise exception 'CATEGORIA_NO_EDITABLE';
  end if;

  update public.gastos
     set monto_centavos = p_monto_centavos,
         categoria_id = p_categoria_id,
         medio_pago = p_medio_pago,
         fecha = p_fecha,
         nota = nullif(btrim(coalesce(p_nota, '')), '')
   where id = p_gasto_id;

  return json_build_object('id', p_gasto_id);
end;
$$;

revoke all on function public.editar_gasto(uuid, bigint, uuid, public.medio_pago, date, text) from public, anon;
grant execute on function public.editar_gasto(uuid, bigint, uuid, public.medio_pago, date, text) to authenticated;

-- ── 5) eliminar_gasto ────────────────────────────────────────────────────
create function public.eliminar_gasto(p_gasto_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  delete from public.gastos where id = p_gasto_id returning id into v_id;

  return json_build_object('id', p_gasto_id, 'eliminado', v_id is not null);
end;
$$;

revoke all on function public.eliminar_gasto(uuid) from public, anon;
grant execute on function public.eliminar_gasto(uuid) to authenticated;

-- ── 6) eliminar_comprobante ──────────────────────────────────────────────
create function public.eliminar_comprobante(p_comprobante_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  delete from public.comprobantes where id = p_comprobante_id returning id into v_id;

  return json_build_object('id', p_comprobante_id, 'eliminado', v_id is not null);
end;
$$;

revoke all on function public.eliminar_comprobante(uuid) from public, anon;
grant execute on function public.eliminar_comprobante(uuid) to authenticated;

-- ── 7) actualizar_umbral_insumo ──────────────────────────────────────────
create function public.actualizar_umbral_insumo(
  p_insumo_id uuid,
  p_umbral_minimo numeric
)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if p_umbral_minimo is null or p_umbral_minimo < 0 then
    raise exception 'UMBRAL_INVALIDO';
  end if;

  update public.insumos set umbral_minimo = p_umbral_minimo where id = p_insumo_id;
  if not found then
    raise exception 'INSUMO_NO_ENCONTRADO';
  end if;

  return json_build_object('id', p_insumo_id);
end;
$$;

revoke all on function public.actualizar_umbral_insumo(uuid, numeric) from public, anon;
grant execute on function public.actualizar_umbral_insumo(uuid, numeric) to authenticated;
