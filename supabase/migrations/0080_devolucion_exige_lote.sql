-- 0080_devolucion_exige_lote.sql
--
-- Red de seguridad en la base para las DEVOLUCIONES de botellas de una
-- revendedora (`registrar_entrega_revendedor`, tipo 'devolucion').
--
-- Qué cambia: la rama de devolución hoy solo valida el total por producto
-- (`STOCK_REVENDEDOR_INSUFICIENTE`) y acepta ítems sin `lote_id`, así que
-- una devolución podía quedar anotada en un pedido del que la persona nunca
-- tuvo botellas (el depósito de ese pedido subía de más). Ahora, para
-- devoluciones NUEVAS:
--   * cada ítem tiene que traer `lote_id`        -> si no, `LOTE_REQUERIDO`.
--   * la cantidad no puede superar lo que la persona tiene en poder de ESE
--     pedido (suma de `stock_revendedor_por_entrega(...).quedan` de ese
--     lote)                                       -> si no,
--     `DEVOLUCION_EXCEDE_PEDIDO` (detail: lote_id, producto_id, disponible).
--   Ninguno de los dos chequeos se saltea con `p_permitir_negativo`.
-- Las devoluciones viejas sin lote que ya están guardadas NO se tocan: el
-- control solo corre al registrar una nueva.
--
-- Misma firma que 0078 (7 parámetros): `create or replace`, sin cambiar
-- `security definer`, `set search_path = public`, chequeos de rol ni
-- `revoke`/`grant`. El resto del cuerpo es el de 0078, sin cambios.
--
-- No afecta a la feria: `feria_cerrar_participacion` (0078/0079) NO llama a
-- esta función; inserta su devolución directo en `entregas_revendedor` /
-- `entrega_items` (ya partida por pedido y con lote). `feria_reabrir_
-- participacion` la borra directo, tampoco pasa por acá. Y
-- `p_feria_id` sigue aceptando solo tipo 'entrega'.
--
-- Migración sin templating, `public.` explícito, `set search_path = public`
-- sin comillas (render multi-schema).

create or replace function public.registrar_entrega_revendedor(
  p_vendedor_id uuid,
  p_tipo text,
  p_fecha date,
  p_nota text default null::text,
  p_items jsonb default '[]'::jsonb,
  p_permitir_negativo boolean default false,
  p_feria_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_entrega_id uuid;
  v_item jsonb;
  v_producto_id uuid;
  v_cantidad int;
  v_lote_id uuid;
  v_costo bigint;
  v_sugerido bigint;
  v_quedan int;
  v_stock int;
  v_nombre text;
  v_en_poder int;
  v_en_poder_lote int;
  v_tipo_movimiento tipo_movimiento;
  v_motivo text;
  v_vistos text[] := '{}';
  v_es_coordinador boolean;
  v_es_admin boolean;
  v_feria_estado text;
  v_part_estado text;
begin
  v_es_admin := public.es_admin();
  v_es_coordinador := public.es_coordinador();

  if not (v_es_admin or v_es_coordinador) then
    raise exception 'NO_AUTORIZADO';
  end if;

  if v_es_coordinador and not v_es_admin then
    if p_tipo <> 'entrega' then
      raise exception 'NO_AUTORIZADO';
    end if;
    if not public.es_coordinador_de(p_vendedor_id) then
      raise exception 'NO_AUTORIZADO';
    end if;
    -- Un coordinador nunca fuerza stock negativo: esa decisión queda
    -- reservada a un admin.
    p_permitir_negativo := false;
  end if;

  v_admin_id := public.mi_vendedor_id();

  if not exists (
    select 1 from vendedores
    where id = p_vendedor_id and activo and (rol = 'revendedor' or (rol = 'admin' and revende))
  ) then
    raise exception 'REVENDEDOR_INVALIDO';
  end if;

  if p_tipo not in ('entrega', 'devolucion') then
    raise exception 'TIPO_INVALIDO';
  end if;

  if p_items is null or jsonb_array_length(p_items) < 1 then
    raise exception 'SIN_ITEMS';
  end if;

  perform 1 from vendedores where id = p_vendedor_id for no key update;

  -- ── FERIA (migración 0078) ──────────────────────────────────────────────
  -- Una entrega de feria: solo la carga un admin, solo tipo 'entrega' (la
  -- devolución de feria la genera `feria_cerrar_participacion`), la feria
  -- tiene que existir y estar abierta, y la participante no puede haber
  -- cerrado ya su parte. Si no era participante, se la agrega.
  if p_feria_id is not null then
    if not v_es_admin then
      raise exception 'NO_AUTORIZADO';
    end if;
    if p_tipo <> 'entrega' then
      raise exception 'TIPO_INVALIDO';
    end if;

    select estado into v_feria_estado from feria_revendedoras where id = p_feria_id for share;
    if v_feria_estado is null then
      raise exception 'FERIA_NO_ENCONTRADA';
    end if;
    if v_feria_estado <> 'abierta' then
      raise exception 'FERIA_CERRADA';
    end if;

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
  end if;
  -- ── fin de FERIA ────────────────────────────────────────────────────────

  insert into entregas_revendedor (vendedor_id, tipo, fecha, nota, admin_id, feria_id)
  values (p_vendedor_id, p_tipo, coalesce(p_fecha, current_date), p_nota, v_admin_id, p_feria_id)
  returning id into v_entrega_id;

  v_tipo_movimiento := case when p_tipo = 'entrega' then 'egreso' else 'ingreso' end;
  v_motivo := case when p_tipo = 'entrega' then 'venta' else null end;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::int;
    v_lote_id := nullif(v_item->>'lote_id', '')::uuid;
    v_costo := null;
    v_sugerido := null;

    if v_producto_id is null or v_cantidad is null or v_cantidad <= 0 then
      raise exception 'SIN_ITEMS';
    end if;

    if v_es_coordinador and not v_es_admin and v_lote_id is null then
      -- Un ítem de un coordinador SIEMPRE trae lote_id: el reparto entre
      -- varios lotes (FIFO, "más viejo primero") ya lo resolvió el
      -- CLIENTE con `repartirCantidadEntreLotes` (`lib/lotes-split.ts`,
      -- misma función que usa un admin) usando
      -- `lotes_disponibles_coordinador` (punto 11) — acá no hay
      -- auto-selección de lote, solo se valida como cualquier otro ítem
      -- con lote (LOTE_INVALIDO/STOCK_LOTE_INSUFICIENTE más abajo, sin
      -- diferencia entre admin y coordinador).
      raise exception 'LOTE_INVALIDO';
    end if;

    if p_tipo = 'entrega' then
      v_costo := nullif(v_item->>'costo_ananja_unitario_centavos', '')::bigint;
      v_sugerido := nullif(v_item->>'precio_sugerido_centavos', '')::bigint;

      if v_es_coordinador and not v_es_admin then
        -- Nunca confía en lo que mande el cliente: siempre el vigente.
        v_costo := null;
      end if;

      if v_costo is null and v_lote_id is not null then
        select d.costo_ananja_centavos into v_costo
        from v_costo_lote_vigente d
        where d.lote_id = v_lote_id and d.producto_id = v_producto_id and d.tiene_costos;
      end if;

      if v_es_coordinador and not v_es_admin and v_costo is null then
        raise exception 'COSTO_FALTANTE';
      end if;

      if v_costo is not null and v_costo <= 0 then
        raise exception 'COSTO_INVALIDO';
      end if;

      if v_sugerido is not null and v_sugerido <= 0 then
        raise exception 'PRECIO_SUGERIDO_INVALIDO';
      end if;
    end if;

    -- ── DEVOLUCIÓN (migración 0080) ─────────────────────────────────────────
    -- Toda devolución dice de qué pedido (lote) sale. Se chequea siempre,
    -- también con `p_permitir_negativo`.
    if p_tipo = 'devolucion' and v_lote_id is null then
      raise exception 'LOTE_REQUERIDO'
        using detail = json_build_object('producto_id', v_producto_id)::text;
    end if;

    if (v_producto_id::text || ':' || coalesce(v_lote_id::text, '')) = any(v_vistos) then
      raise exception 'ITEM_DUPLICADO';
    end if;
    v_vistos := array_append(v_vistos, v_producto_id::text || ':' || coalesce(v_lote_id::text, ''));

    if v_lote_id is not null and not exists (
      select 1 from lote_items where lote_id = v_lote_id and producto_id = v_producto_id
    ) then
      raise exception 'LOTE_INVALIDO';
    end if;

    if p_tipo = 'entrega' and v_lote_id is not null then
      select quedan into v_quedan from v_stock_por_lote
      where lote_id = v_lote_id and producto_id = v_producto_id;

      if coalesce(v_quedan, 0) < v_cantidad and not p_permitir_negativo then
        raise exception 'STOCK_LOTE_INSUFICIENTE'
          using detail = json_build_object(
            'lote_id', v_lote_id,
            'producto_id', v_producto_id,
            'disponible', coalesce(v_quedan, 0)
          )::text;
      end if;
    end if;

    -- Una devolución no puede ser de más botellas de las que la persona tiene
    -- en poder de ESE pedido. Se mide ANTES de insertar el ítem: el reparto
    -- de `stock_revendedor_por_entrega` hace que una devolución de más
    -- "desborde" a otros pedidos de la misma persona, y después de insertar
    -- ya no se vería el exceso. Los ítems anteriores de esta misma llamada
    -- ya están insertados (son de otro pedido/producto: `ITEM_DUPLICADO`),
    -- así que no interfieren. Sin bypass por `p_permitir_negativo`.
    if p_tipo = 'devolucion' then
      select coalesce(sum(s.quedan), 0) into v_en_poder_lote
      from public.stock_revendedor_por_entrega(p_vendedor_id, v_producto_id) s
      where s.lote_id = v_lote_id;

      if v_en_poder_lote < v_cantidad then
        raise exception 'DEVOLUCION_EXCEDE_PEDIDO'
          using detail = json_build_object(
            'lote_id', v_lote_id,
            'producto_id', v_producto_id,
            'disponible', v_en_poder_lote
          )::text;
      end if;
    end if;
    -- ── fin de DEVOLUCIÓN ───────────────────────────────────────────────────

    insert into entrega_items (
      entrega_id, producto_id, cantidad, lote_id,
      costo_ananja_unitario_centavos, precio_sugerido_centavos
    )
    values (v_entrega_id, v_producto_id, v_cantidad, v_lote_id, v_costo, v_sugerido);

    insert into movimientos_stock (producto_id, tipo, cantidad, vendedor_id, entrega_id, lote_id, nota, motivo)
    values (v_producto_id, v_tipo_movimiento, v_cantidad, v_admin_id, v_entrega_id, v_lote_id, null, v_motivo);

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

revoke execute on function public.registrar_entrega_revendedor(uuid, text, date, text, jsonb, boolean, uuid) from anon, public;
grant execute on function public.registrar_entrega_revendedor(uuid, text, date, text, jsonb, boolean, uuid) to authenticated;
