-- Ananja: compra de insumos por FACTURA (varias líneas en un mismo
-- comprobante, ej. la factura de etiquetas de la imprenta con frente de
-- 250 ml y de 500 ml, más un envío pagado aparte).
--
-- Agrega (no cambia nada existente, no toca datos):
--  1. `repartir_resto_mayor(total, pesos[])` — helper interno: reparte
--     centavos proporcional a pesos con el método del resto mayor. Sin
--     permisos para anon/authenticated (solo lo llama el RPC).
--  2. RPC `registrar_compra_insumos_factura` — por cada línea crea UN gasto
--     (categoría "Insumos", vía `crear_gasto`, igual que
--     `registrar_compra_insumo`) + UN ingreso en `movimientos_insumo` con
--     ese `gasto_id`. Todo en una transacción: si una línea falla, no se
--     guarda nada. Como cada línea queda con la misma forma que una compra
--     suelta, todo lo de abajo sigue igual: stock (`v_stock_insumos`),
--     precio de la última compra para Costos del pedido
--     (`obtenerUltimasComprasInsumos`, que ahora da el costo CON IVA y
--     envío) y el título del gasto por nombre de insumo en Gastos.
--
-- Cálculo (espejo exacto en `lib/factura-insumos.ts`, con tests de dos
-- facturas reales en `tests/factura-insumos.test.ts`):
--  - importe de línea = round(cantidad × precio unitario impreso);
--  - IVA = round(subtotal × IVA%) sobre el subtotal de la factura (como lo
--    imprime la factura), repartido entre líneas por importe con resto
--    mayor — así el IVA total coincide siempre con el impreso. Ananja es
--    monotributo: el IVA es costo. Con `p_precios_sin_iva = false`, IVA 0;
--  - envío (sin IVA) repartido por CANTIDAD de unidades con resto mayor;
--  - total de línea = importe + IVA + envío; la suma de las líneas da
--    exacto subtotal + IVA + envío.
--  - `p_total_esperado_centavos` (opcional): el total que mostró la
--    pantalla; si no coincide con el calculado acá, no guarda nada
--    (`TOTAL_NO_COINCIDE`), así lo guardado es siempre lo que se revisó.
--
-- Migración templada, sin bloques @solo-public: nada es específico de un
-- negocio. Ver supabase/README.md.

-- ============================================================
-- 1) repartir_resto_mayor
-- ============================================================

create or replace function __SCHEMA__.repartir_resto_mayor(
  p_total bigint,
  p_pesos numeric[]
)
returns bigint[]
language sql
immutable
set search_path = __SCHEMA__
as $$
  -- Cada parte recibe el piso de total × peso / suma; los centavos que
  -- faltan van de a uno a las de mayor resto (a igual resto, a la que está
  -- antes en el arreglo). Con suma de pesos 0, todo 0.
  with suma as (
    select coalesce(sum(w), 0) as s from unnest(p_pesos) as w
  ),
  base as (
    select
      u.i,
      case when suma.s = 0 then 0 else floor(p_total::numeric * u.w / suma.s) end as piso,
      case when suma.s = 0 then 0 else p_total::numeric * u.w - floor(p_total::numeric * u.w / suma.s) * suma.s end as resto
    from unnest(p_pesos) with ordinality as u(w, i), suma
  ),
  faltan as (
    select case when (select s from suma) = 0 then 0 else p_total - coalesce(sum(piso), 0) end as k
    from base
  ),
  orden as (
    select i, piso, row_number() over (order by resto desc, i asc) as rn from base
  )
  select coalesce(
    array_agg((piso + case when rn <= (select k from faltan) then 1 else 0 end)::bigint order by i),
    '{}'::bigint[]
  )
  from orden;
$$;

revoke execute on function __SCHEMA__.repartir_resto_mayor(bigint, numeric[]) from anon, authenticated, public;

-- ============================================================
-- 2) registrar_compra_insumos_factura
-- ============================================================

create or replace function __SCHEMA__.registrar_compra_insumos_factura(
  p_fecha date,
  p_medio_pago medio_pago,
  p_lineas jsonb,
  p_precios_sin_iva boolean default true,
  p_iva_pct numeric default 21,
  p_envio_centavos bigint default 0,
  p_nota text default null,
  p_imagen_path text default null,
  p_total_esperado_centavos bigint default null
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_vendedor_id uuid;
  v_categoria_id uuid;
  v_linea jsonb;
  v_idx int;
  v_insumo_id uuid;
  v_cantidad numeric;
  v_precio bigint;
  v_importe bigint;
  v_nombre text;
  v_unidad text;
  v_insumo_ids uuid[] := '{}';
  v_cantidades numeric[] := '{}';
  v_precios bigint[] := '{}';
  v_importes bigint[] := '{}';
  v_nombres text[] := '{}';
  v_unidades text[] := '{}';
  v_subtotal bigint := 0;
  v_sin_iva boolean;
  v_iva_pct numeric;
  v_iva_total bigint;
  v_ivas bigint[];
  v_envio bigint;
  v_envios bigint[];
  v_total bigint;
  v_total_linea bigint;
  v_contexto text;
  v_nota text;
  v_gasto_resultado json;
  v_gasto_id uuid;
  v_movimiento_id uuid;
  v_resultado jsonb := '[]'::jsonb;
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select id into v_vendedor_id from vendedores where user_id = auth.uid();
  if v_vendedor_id is null then
    raise exception 'VENDEDOR_NO_REGISTRADO';
  end if;

  -- Fecha de negocio: la manda la app (fecha argentina), nunca current_date.
  if p_fecha is null then
    raise exception 'FECHA_INVALIDA';
  end if;

  if p_medio_pago is null then
    raise exception 'MEDIO_PAGO_INVALIDO';
  end if;

  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) < 1 then
    raise exception 'SIN_LINEAS';
  end if;

  v_envio := coalesce(p_envio_centavos, 0);
  if v_envio < 0 then
    raise exception 'ENVIO_INVALIDO';
  end if;

  v_sin_iva := coalesce(p_precios_sin_iva, true);
  if v_sin_iva then
    v_iva_pct := round(coalesce(p_iva_pct, 21), 2);
    if v_iva_pct < 0 or v_iva_pct > 100 then
      raise exception 'IVA_INVALIDO';
    end if;
  else
    v_iva_pct := 0;
  end if;

  select id into v_categoria_id from categorias_gasto where nombre = 'Insumos';
  if v_categoria_id is null then
    raise exception 'CATEGORIA_INSUMOS_FALTANTE';
  end if;

  -- Primera pasada: validar todas las líneas y calcular importes, antes de
  -- escribir nada.
  for v_linea, v_idx in
    select e.value, e.ordinality::int
    from jsonb_array_elements(p_lineas) with ordinality as e(value, ordinality)
  loop
    if jsonb_typeof(v_linea) <> 'object' then
      raise exception 'SIN_LINEAS';
    end if;

    v_insumo_id := nullif(v_linea->>'insumo_id', '')::uuid;
    select nombre, unidad into v_nombre, v_unidad
    from insumos where id = v_insumo_id and activo;
    if not found then
      raise exception 'INSUMO_INVALIDO';
    end if;

    if v_insumo_id = any(v_insumo_ids) then
      raise exception 'INSUMO_REPETIDO';
    end if;

    v_cantidad := nullif(v_linea->>'cantidad', '')::numeric;
    if v_cantidad is null or v_cantidad <= 0 or v_cantidad <> round(v_cantidad, 3) then
      raise exception 'CANTIDAD_INVALIDA';
    end if;

    v_precio := nullif(v_linea->>'precio_unitario_centavos', '')::bigint;
    if v_precio is null or v_precio <= 0 then
      raise exception 'PRECIO_INVALIDO';
    end if;

    v_importe := round(v_cantidad * v_precio)::bigint;
    if v_importe <= 0 then
      raise exception 'PRECIO_INVALIDO';
    end if;

    v_insumo_ids := array_append(v_insumo_ids, v_insumo_id);
    v_cantidades := array_append(v_cantidades, v_cantidad);
    v_precios := array_append(v_precios, v_precio);
    v_importes := array_append(v_importes, v_importe);
    v_nombres := array_append(v_nombres, v_nombre);
    v_unidades := array_append(v_unidades, v_unidad);
    v_subtotal := v_subtotal + v_importe;
  end loop;

  v_iva_total := round(v_subtotal * v_iva_pct / 100)::bigint;
  v_ivas := __SCHEMA__.repartir_resto_mayor(v_iva_total, v_importes::numeric[]);
  v_envios := __SCHEMA__.repartir_resto_mayor(v_envio, v_cantidades);
  v_total := v_subtotal + v_iva_total + v_envio;

  if p_total_esperado_centavos is not null and p_total_esperado_centavos <> v_total then
    raise exception 'TOTAL_NO_COINCIDE';
  end if;

  v_contexto := nullif(btrim(p_nota), '');

  -- Segunda pasada: un gasto + un ingreso de insumo por línea.
  for v_idx in 1 .. array_length(v_insumo_ids, 1)
  loop
    v_total_linea := v_importes[v_idx] + v_ivas[v_idx] + v_envios[v_idx];

    -- Ej.: "Factura Imprenta Ejemplo S.A. · ET. ANANJA x 250ml FRENTE × 960 unidad
    -- a $ 100,00 c/u + IVA 21% + envío $ 5.000,00 (línea 1 de 2)"
    v_nota := 'Factura' || coalesce(' ' || v_contexto, '')
      || ' · ' || v_nombres[v_idx] || ' × ' || trim_scale(v_cantidades[v_idx])::text
      || ' ' || v_unidades[v_idx]
      || ' a $ ' || translate(to_char(v_precios[v_idx] / 100.0, 'FM999,999,999,990.00'), ',.', '.,')
      || ' c/u'
      || case
           when v_sin_iva and v_iva_pct > 0
             then ' + IVA ' || replace(trim_scale(v_iva_pct)::text, '.', ',') || '%'
           else ''
         end
      || case
           when v_envios[v_idx] > 0
             then ' + envío $ ' || translate(to_char(v_envios[v_idx] / 100.0, 'FM999,999,999,990.00'), ',.', '.,')
           else ''
         end
      || ' (línea ' || v_idx || ' de ' || array_length(v_insumo_ids, 1) || ')';

    v_gasto_resultado := crear_gasto(
      p_monto_centavos := v_total_linea,
      p_categoria_id := v_categoria_id,
      p_medio_pago := p_medio_pago,
      p_fecha := p_fecha,
      p_nota := v_nota,
      p_imagen_path := p_imagen_path
    );
    v_gasto_id := (v_gasto_resultado->>'gasto_id')::uuid;

    insert into movimientos_insumo (insumo_id, tipo, cantidad, vendedor_id, gasto_id, nota)
    values (v_insumo_ids[v_idx], 'ingreso', v_cantidades[v_idx], v_vendedor_id, v_gasto_id, v_nota)
    returning id into v_movimiento_id;

    v_resultado := v_resultado || jsonb_build_object(
      'insumo_id', v_insumo_ids[v_idx],
      'gasto_id', v_gasto_id,
      'movimiento_id', v_movimiento_id,
      'importe_centavos', v_importes[v_idx],
      'iva_centavos', v_ivas[v_idx],
      'envio_centavos', v_envios[v_idx],
      'total_centavos', v_total_linea
    );
  end loop;

  return json_build_object(
    'subtotal_centavos', v_subtotal,
    'iva_centavos', v_iva_total,
    'envio_centavos', v_envio,
    'total_centavos', v_total,
    'lineas', v_resultado
  );
end;
$$;

revoke execute on function __SCHEMA__.registrar_compra_insumos_factura(date, medio_pago, jsonb, boolean, numeric, bigint, text, text, bigint) from anon, public;
grant execute on function __SCHEMA__.registrar_compra_insumos_factura(date, medio_pago, jsonb, boolean, numeric, bigint, text, text, bigint) to authenticated;
