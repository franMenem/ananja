-- Ananja: el transporte % del pedido al proveedor se calcula sobre aceite +
-- envasado + ETIQUETAS de cada presentación (aclarado por Fran,
-- 2026-09-14). Hasta 0038 la base era solo aceite + envase.
--
-- Único cambio: `aplicar_costos_lote` (MISMA firma, idéntica a 0038 salvo
-- la base del transporte % y el texto de su descripción). No toca datos:
-- los lotes existentes recién cambian cuando se re-guardan sus costos (el
-- único lote real hoy tiene transporte FIJO, no le afecta). Espejo en TS:
-- `calcularPedido` (lib/costos-lote.ts).
--
-- Migración templada (public, sin comprobantes). Ver supabase/README.md.

create or replace function __SCHEMA__.aplicar_costos_lote(
  p_lote_id uuid,
  p_costos jsonb
)
returns void
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_iva_pct numeric;
  v_incluye_iva boolean;
  v_dolar_centavos bigint;
  v_usd_por_litro_centavos bigint;
  v_envase_sin_iva_guardado boolean;
  v_envase_sin_iva_param boolean;
  v_envase_modo_nuevo boolean;
  v_envase_sin_iva boolean;
  v_precio_litro_global bigint;
  v_precio_litro_item bigint;
  v_aceite_descripcion text;
  v_transporte_pct numeric;
  v_transporte_fijo bigint;
  v_otros bigint;
  v_otros_desc text;
  v_item record;
  v_litros numeric;
  v_monto bigint;
  v_gross bigint;
  v_envase jsonb;
  v_envase_producto_id uuid;
  v_envase_precio bigint;
  v_envase_cantidad int;
  v_envase_calculado bigint;
  v_envase_redondeo bigint;
  v_envase_cobrado bigint;
  v_envase_total bigint;
  v_envase_unitario bigint;
  v_envases_vistos uuid[] := '{}';
  v_etiquetas jsonb;
  v_etiqueta jsonb;
  v_etiqueta_insumo_id uuid;
  v_etiqueta_precio bigint;
  v_etiqueta_envio bigint;
  v_etiquetas_vistas uuid[] := '{}';
  v_precio_etiqueta_legacy bigint;
  v_receta record;
  v_base_transporte bigint;
  v_redondeos jsonb;
  v_redondeo jsonb;
  v_redondeo_concepto text;
  v_redondeo_monto bigint;
  v_redondeo_producto_id uuid;
  v_redondeo_envase jsonb := '{}'::jsonb;
  v_redondeo_transporte bigint;
  v_transporte_suma bigint;
  v_transporte_mayor_id uuid;
  v_transporte_reescalado bigint;
  v_clave text;
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  v_transporte_pct := nullif(p_costos->>'transporte_pct', '')::numeric;
  v_transporte_fijo := nullif(p_costos->>'transporte_centavos', '')::bigint;
  if v_transporte_pct is not null and v_transporte_fijo is not null then
    raise exception 'TRANSPORTE_AMBIGUO';
  end if;

  select iva_pct, precios_incluyen_iva, dolar_centavos, precio_litro_aceite_usd_centavos, envase_cobrado_sin_iva
    into v_iva_pct, v_incluye_iva, v_dolar_centavos, v_usd_por_litro_centavos, v_envase_sin_iva_guardado
  from lotes_produccion where id = p_lote_id;

  -- Envase (0038): clave presente -> modo nuevo con ese valor, y se persiste.
  -- Ausente -> lo guardado: `false` = comportamiento exacto de 0030, `true`
  -- = modo nuevo (ver cabecera, punto 3). Un `null` explícito cuenta como
  -- ausente.
  v_envase_sin_iva_param := nullif(p_costos->>'envase_cobrado_sin_iva', '')::boolean;
  if v_envase_sin_iva_param is not null then
    v_envase_modo_nuevo := true;
    v_envase_sin_iva := v_envase_sin_iva_param;
    update lotes_produccion set envase_cobrado_sin_iva = v_envase_sin_iva_param where id = p_lote_id;
  else
    v_envase_sin_iva := coalesce(v_envase_sin_iva_guardado, false);
    v_envase_modo_nuevo := v_envase_sin_iva;
  end if;

  -- Redondeos (0038): se validan TODOS antes de escribir nada.
  v_redondeos := coalesce(p_costos->'redondeos', '[]'::jsonb);
  if jsonb_typeof(v_redondeos) <> 'array' then
    raise exception 'REDONDEO_INVALIDO';
  end if;

  for v_redondeo in select * from jsonb_array_elements(v_redondeos)
  loop
    v_redondeo_concepto := v_redondeo->>'concepto';
    v_redondeo_monto := nullif(v_redondeo->>'monto_centavos', '')::bigint;

    if v_redondeo_monto is null or v_redondeo_monto <= 0 then
      raise exception 'REDONDEO_INVALIDO'
        using detail = json_build_object('concepto', v_redondeo_concepto)::text;
    end if;

    if v_redondeo_concepto = 'envase' then
      v_redondeo_producto_id := nullif(v_redondeo->>'producto_id', '')::uuid;
      if v_redondeo_producto_id is null or v_redondeo_envase ? v_redondeo_producto_id::text then
        raise exception 'REDONDEO_INVALIDO'
          using detail = json_build_object('concepto', 'envase')::text;
      end if;
      v_redondeo_envase := v_redondeo_envase || jsonb_build_object(v_redondeo_producto_id::text, v_redondeo_monto);
    elsif v_redondeo_concepto = 'transporte' then
      -- Transporte fijo (o sin transporte): el monto cargado ya es el real.
      if v_redondeo_transporte is not null or v_transporte_pct is null or v_transporte_pct <= 0 then
        raise exception 'REDONDEO_INVALIDO'
          using detail = json_build_object('concepto', 'transporte')::text;
      end if;
      v_redondeo_transporte := v_redondeo_monto;
    else
      raise exception 'REDONDEO_INVALIDO'
        using detail = json_build_object('concepto', v_redondeo_concepto)::text;
    end if;
  end loop;

  delete from lote_costos where lote_id = p_lote_id;

  -- Aceite: sin cambios respecto de 0030 (a pagar null — ya se pagó al
  -- comprar a granel).
  v_precio_litro_global := nullif(p_costos->>'precio_litro_aceite_centavos', '')::bigint;
  v_aceite_descripcion := null;
  if v_precio_litro_global is null and v_dolar_centavos is not null and v_usd_por_litro_centavos is not null then
    v_precio_litro_global := round(v_usd_por_litro_centavos * v_dolar_centavos / 100.0);
    v_aceite_descripcion := 'USD ' || round(v_usd_por_litro_centavos::numeric / 100, 2)
      || '/L × $' || round(v_dolar_centavos::numeric / 100, 2);
  end if;

  for v_item in
    select li.producto_id, li.cantidad, p.presentacion_ml
    from lote_items li join productos p on p.id = li.producto_id
    where li.lote_id = p_lote_id
  loop
    v_precio_litro_item := v_precio_litro_global;
    if v_precio_litro_item is null then
      select t.costo_promedio_centavos_por_litro into v_precio_litro_item
      from recetas r
      join insumos i on i.id = r.insumo_id and i.tipo = 'materia_prima'
      join v_tanque_aceite t on t.insumo_id = i.id
      where r.producto_id = v_item.producto_id
      order by r.insumo_id
      limit 1;
    end if;

    if v_precio_litro_item is not null then
      v_litros := (v_item.presentacion_ml / 1000.0) * v_item.cantidad;
      v_monto := round(v_litros * v_precio_litro_item);
      insert into lote_costos (lote_id, producto_id, concepto, descripcion, cantidad, costo_unitario_centavos, total_centavos, se_paga, a_pagar_centavos)
      values (p_lote_id, v_item.producto_id, 'aceite', v_aceite_descripcion, v_litros, v_precio_litro_item, v_monto, false, null);
    end if;
  end loop;

  -- Etiquetas: sin cambios respecto de 0030 (a pagar null — se compran
  -- antes, como insumo).
  v_etiquetas := coalesce(p_costos->'etiquetas', '[]'::jsonb);
  v_precio_etiqueta_legacy := nullif(p_costos->>'precio_etiqueta_centavos', '')::bigint;

  if jsonb_array_length(v_etiquetas) = 0 and v_precio_etiqueta_legacy is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'insumo_id', sub.insumo_id,
      'precio_unitario_centavos', v_precio_etiqueta_legacy,
      'envio_unitario_centavos', 0
    )), '[]'::jsonb)
    into v_etiquetas
    from (
      select distinct r.insumo_id
      from recetas r
      join insumos i on i.id = r.insumo_id and i.tipo = 'etiqueta'
      join lote_items li on li.producto_id = r.producto_id and li.lote_id = p_lote_id
    ) sub;
  end if;

  for v_etiqueta in select * from jsonb_array_elements(v_etiquetas)
  loop
    v_etiqueta_insumo_id := (v_etiqueta->>'insumo_id')::uuid;
    v_etiqueta_precio := (v_etiqueta->>'precio_unitario_centavos')::bigint;
    v_etiqueta_envio := coalesce(nullif(v_etiqueta->>'envio_unitario_centavos', '')::bigint, 0);

    if v_etiqueta_insumo_id is null or v_etiqueta_precio is null or v_etiqueta_precio < 0 or v_etiqueta_envio < 0 then
      raise exception 'COSTO_ETIQUETA_INVALIDO';
    end if;

    if v_etiqueta_insumo_id = any(v_etiquetas_vistas) then
      raise exception 'COSTO_ETIQUETA_DUPLICADO';
    end if;
    v_etiquetas_vistas := array_append(v_etiquetas_vistas, v_etiqueta_insumo_id);

    if v_incluye_iva then
      v_gross := v_etiqueta_precio;
    else
      v_gross := round(v_etiqueta_precio * (100 + v_iva_pct) / 100);
    end if;

    for v_receta in
      select r.producto_id, r.cantidad as unidades_por_botella, li.cantidad as botellas
      from recetas r
      join lote_items li on li.producto_id = r.producto_id and li.lote_id = p_lote_id
      where r.insumo_id = v_etiqueta_insumo_id
    loop
      v_monto := round((v_gross + v_etiqueta_envio) * (v_receta.unidades_por_botella * v_receta.botellas));
      insert into lote_costos (
        lote_id, producto_id, insumo_id, concepto, descripcion,
        cantidad, costo_unitario_centavos, neto_centavos, envio_centavos, total_centavos, se_paga, a_pagar_centavos
      ) values (
        p_lote_id, v_receta.producto_id, v_etiqueta_insumo_id, 'etiqueta',
        case when v_incluye_iva then null else 'IVA ' || v_iva_pct || '% aplicado sobre el precio neto (envío sin IVA)' end,
        v_receta.unidades_por_botella * v_receta.botellas,
        v_gross + v_etiqueta_envio, v_etiqueta_precio, v_etiqueta_envio, v_monto, false, null
      );
    end loop;
  end loop;

  -- Envase (0038). Espejo: `calcularEnvasePedido` (lib/costos-lote.ts).
  --  - calculado: modo nuevo = precio × cantidad (lo que cobra el proveedor);
  --    modo viejo = precio (con IVA sumado si `precios_incluyen_iva` es
  --    false) × cantidad, igual que 0030.
  --  - cobrado (a pagar) = redondeo si vino, si no el calculado.
  --  - costo total = cobrado + IVA (redondeado sobre el total) solo en modo
  --    nuevo con `envase_cobrado_sin_iva`; si no, = cobrado.
  --  - costo unitario: modo viejo sin redondeo = el unitario de 0030 (exacto
  --    como antes); en cualquier otro caso round(total / cantidad).
  if jsonb_array_length(coalesce(p_costos->'envases', '[]'::jsonb)) > 0 then
    for v_envase in select * from jsonb_array_elements(p_costos->'envases')
    loop
      v_envase_producto_id := (v_envase->>'producto_id')::uuid;
      v_envase_precio := (v_envase->>'precio_unitario_centavos')::bigint;

      if v_envase_producto_id is null or v_envase_precio is null or v_envase_precio < 0 then
        raise exception 'COSTO_ENVASE_INVALIDO';
      end if;

      if v_envase_producto_id = any(v_envases_vistos) then
        raise exception 'COSTO_ENVASE_DUPLICADO';
      end if;
      v_envases_vistos := array_append(v_envases_vistos, v_envase_producto_id);

      select cantidad into v_envase_cantidad
      from lote_items where lote_id = p_lote_id and producto_id = v_envase_producto_id;
      if not found then
        raise exception 'PRODUCTO_NO_EN_LOTE';
      end if;

      if v_envase_modo_nuevo then
        v_gross := v_envase_precio;
      elsif v_incluye_iva then
        v_gross := v_envase_precio;
      else
        v_gross := round(v_envase_precio * (100 + v_iva_pct) / 100);
      end if;

      v_envase_calculado := v_gross * v_envase_cantidad;
      v_envase_redondeo := nullif(v_redondeo_envase->>v_envase_producto_id::text, '')::bigint;
      v_envase_cobrado := coalesce(v_envase_redondeo, v_envase_calculado);

      if v_envase_modo_nuevo and v_envase_sin_iva then
        v_envase_total := round(v_envase_cobrado * (100 + v_iva_pct) / 100);
      else
        v_envase_total := v_envase_cobrado;
      end if;

      if not v_envase_modo_nuevo and v_envase_redondeo is null then
        v_envase_unitario := v_gross;
      else
        v_envase_unitario := round(v_envase_total::numeric / v_envase_cantidad);
      end if;

      insert into lote_costos (
        lote_id, producto_id, concepto, descripcion,
        cantidad, costo_unitario_centavos, neto_centavos, total_centavos, se_paga, a_pagar_centavos
      ) values (
        p_lote_id, v_envase_producto_id, 'envase',
        nullif(concat_ws(' · ',
          case
            when v_envase_modo_nuevo and v_envase_sin_iva
              then 'Cobrado sin IVA, IVA ' || v_iva_pct || '% sumado al costo'
            when not v_envase_modo_nuevo and not v_incluye_iva
              then 'IVA ' || v_iva_pct || '% aplicado sobre el precio neto'
          end,
          case when v_envase_redondeo is not null
            then 'Redondeo: calculado $' || round(v_envase_calculado::numeric / 100, 2)
          end
        ), ''),
        v_envase_cantidad, v_envase_unitario, v_envase_precio, v_envase_total, true, v_envase_cobrado
      );
    end loop;
  end if;

  -- Un redondeo de envase para una presentación sin precio de envase
  -- cargado no tiene sobre qué aplicarse.
  for v_clave in select jsonb_object_keys(v_redondeo_envase)
  loop
    if not (v_clave::uuid = any(v_envases_vistos)) then
      raise exception 'REDONDEO_INVALIDO'
        using detail = json_build_object('concepto', 'envase', 'producto_id', v_clave)::text;
    end if;
  end loop;

  -- Transporte: % -> línea directa por presentación sobre (aceite + envase + etiquetas,
  -- costo) de ESA presentación; fijo -> línea compartida. Igual que 0030,
  -- más el re-escalado por redondeo (0038, espejo `reescalarTransporte`).
  if v_transporte_pct is not null and v_transporte_pct > 0 then
    for v_item in
      select li.producto_id
      from lote_items li where li.lote_id = p_lote_id
    loop
      select coalesce(sum(total_centavos), 0) into v_base_transporte
      from lote_costos
      where lote_id = p_lote_id and producto_id = v_item.producto_id and concepto in ('aceite', 'envase', 'etiqueta');

      if v_base_transporte > 0 then
        v_monto := round(v_base_transporte * v_transporte_pct / 100);
        insert into lote_costos (lote_id, producto_id, concepto, descripcion, total_centavos, se_paga, a_pagar_centavos)
        values (p_lote_id, v_item.producto_id, 'transporte', v_transporte_pct || '% sobre aceite + envasado + etiquetas', v_monto, true, v_monto);
      end if;
    end loop;

    if v_redondeo_transporte is not null then
      select coalesce(sum(total_centavos), 0) into v_transporte_suma
      from lote_costos where lote_id = p_lote_id and concepto = 'transporte';

      if v_transporte_suma <= 0 then
        raise exception 'REDONDEO_INVALIDO'
          using detail = json_build_object('concepto', 'transporte')::text;
      end if;

      -- La línea más grande se elige con los montos ORIGINALES (antes del
      -- floor) — el floor puede empatar dos líneas que no estaban empatadas.
      select id into v_transporte_mayor_id
      from lote_costos
      where lote_id = p_lote_id and concepto = 'transporte'
      order by total_centavos desc, producto_id
      limit 1;

      update lote_costos
      set total_centavos = floor(total_centavos::numeric * v_redondeo_transporte / v_transporte_suma)::bigint
      where lote_id = p_lote_id and concepto = 'transporte';

      select coalesce(sum(total_centavos), 0) into v_transporte_reescalado
      from lote_costos where lote_id = p_lote_id and concepto = 'transporte';

      update lote_costos
      set total_centavos = total_centavos + (v_redondeo_transporte - v_transporte_reescalado)
      where id = v_transporte_mayor_id;

      update lote_costos
      set a_pagar_centavos = total_centavos,
          descripcion = v_transporte_pct || '% sobre aceite + envasado + etiquetas · Redondeo: calculado $'
            || round(v_transporte_suma::numeric / 100, 2)
      where lote_id = p_lote_id and concepto = 'transporte';
    end if;
  elsif v_transporte_fijo is not null and v_transporte_fijo > 0 then
    insert into lote_costos (lote_id, producto_id, concepto, total_centavos, se_paga, a_pagar_centavos)
    values (p_lote_id, null, 'transporte', v_transporte_fijo, true, v_transporte_fijo);
  end if;

  -- Otros: a pagar = total, sin cambios respecto de 0030.
  v_otros := nullif(p_costos->>'otros_centavos', '')::bigint;
  v_otros_desc := p_costos->>'otros_descripcion';
  if v_otros is not null and v_otros > 0 then
    insert into lote_costos (lote_id, producto_id, concepto, descripcion, total_centavos, se_paga, a_pagar_centavos)
    values (p_lote_id, null, 'otro', nullif(btrim(v_otros_desc), ''), v_otros, true, v_otros);
  end if;
end;
$$;
