-- Ananja: dólar por lote — el aceite se carga en USD (precio del litro en
-- USD) y el dólar (ARS por USD) se carga por lote, no por línea de costo.
-- Decisiones del dueño (ver reporte de esta migración): ejemplo ilustrativo,
-- dólar 1.000 y aceite USD 5,00/L -> $5.000/L -> 250 ml $1.250, 500 ml $2.500.
--
-- Alcance:
--  1. `lotes_produccion.dolar_centavos` (ARS por USD, en centavos) y
--     `precio_litro_aceite_usd_centavos` (USD por litro, en centavos de
--     USD) — nuevas columnas, mismo patrón que `iva_pct`/
--     `precios_incluyen_iva`/`transporte_pct` de 0029: se resuelven en
--     `p_costos`, se PERSISTEN en `lotes_produccion` (para poder heredarlas
--     en el próximo lote / conservarlas si `fijar_costos_lote` no las
--     manda), y `aplicar_costos_lote` las lee de la tabla, no de `p_costos`
--     directamente.
--  2. `p_costos` gana dos campos: `dolar_centavos` y
--     `precio_litro_aceite_usd_centavos` (mismo criterio "ausente = heredar
--     en crear_lote / conservar en fijar_costos_lote" que `iva_pct` etc).
--     El campo ARS explícito que ya existía, `precio_litro_aceite_centavos`,
--     NO cambia de comportamiento (sigue siendo un override puntual de esta
--     llamada, nunca se persiste).
--  3. Precedencia del precio por litro de aceite en `aplicar_costos_lote`
--     (por presentación): ARS explícito de `p_costos`
--     (`precio_litro_aceite_centavos`) > USD × dólar (cuando las dos
--     columnas de `lotes_produccion` están cargadas) > promedio ponderado
--     de `v_tanque_aceite` (0029, sin cambios) > sin línea de aceite (no
--     falla). Fórmula USD × dólar, en centavos ARS por litro:
--     `round(precio_litro_aceite_usd_centavos * dolar_centavos / 100.0)`
--     (ejemplo: USD 5,00/L = 500; dólar $1.000 = 100000 centavos;
--     round(500 * 100000 / 100.0) = 500000 = $5.000,00/L).
--  4. `lote_costos` de concepto 'aceite' generadas por la rama USD × dólar
--     llevan una `descripcion` legible ("USD 5.00/L × $1000.00") — el
--     detalle NUMÉRICO para que la UI arme "0,25 L × USD 5,00 × $1.000 =
--     $1.250" no depende de parsear ese texto: `cantidad` (litros) y
--     `total_centavos` ya estaban en `lote_costos`, y el dólar/USD del
--     lote quedan expuestos en `v_costo_lote_desglose` (punto 5).
--  5. `v_costo_lote_desglose` recreada solo para exponer
--     `dolar_centavos`/`precio_litro_aceite_usd_centavos` (de
--     `lotes_produccion`, mismas para todas las presentaciones de un
--     mismo lote) — mismas columnas de 0029 más estas dos, mismo orden.
--  6. `v_tanque_aceite`: SIN CAMBIOS. Los ingresos que arman el promedio
--     ponderado (`registrar_compra_insumo` -> `gastos.monto_centavos`) son
--     siempre ARS — no hay un `dolar_centavos` guardado por compra desde el
--     que reconstruir un "costo USD por litro" confiable (el dólar del día
--     de cada compra puede haber sido distinto). Sin ese dato, cualquier
--     "USD por litro" derivado del tanque sería una aproximación inventada;
--     se prefiere dejarlo afuera antes que mostrar un número que parece
--     preciso y no lo es. Si en el futuro se quiere esa columna, hace falta
--     guardar el dólar del día en cada compra de aceite primero.
--
-- Migración templada (__SCHEMA__, sin __BUCKET__). Ver supabase/README.md.

-- ============================================================
-- 1) lotes_produccion — dólar y precio USD del litro de aceite, por lote.
-- ============================================================

alter table lotes_produccion
  add column dolar_centavos bigint check (dolar_centavos is null or dolar_centavos > 0),
  add column precio_litro_aceite_usd_centavos bigint
    check (precio_litro_aceite_usd_centavos is null or precio_litro_aceite_usd_centavos > 0);

-- ============================================================
-- 2) __SCHEMA__.aplicar_costos_lote — reescrita SOLO en la sección de
--    aceite (precedencia ARS explícito > USD×dólar > tanque > sin línea) y
--    en el `select` inicial (ahora también lee dolar_centavos/
--    precio_litro_aceite_usd_centavos, ya resueltos por crear_lote/
--    fijar_costos_lote). Todo lo demás (etiquetas, envases, transporte,
--    otros) es IDÉNTICO a 0029 — create or replace, misma firma.
-- ============================================================

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
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  v_transporte_pct := nullif(p_costos->>'transporte_pct', '')::numeric;
  v_transporte_fijo := nullif(p_costos->>'transporte_centavos', '')::bigint;
  if v_transporte_pct is not null and v_transporte_fijo is not null then
    raise exception 'TRANSPORTE_AMBIGUO';
  end if;

  select iva_pct, precios_incluyen_iva, dolar_centavos, precio_litro_aceite_usd_centavos
    into v_iva_pct, v_incluye_iva, v_dolar_centavos, v_usd_por_litro_centavos
  from lotes_produccion where id = p_lote_id;

  delete from lote_costos where lote_id = p_lote_id;

  -- Aceite: litros = presentacion_ml / 1000 × cantidad, automático por
  -- presentación (sin cambios, 0029). Precedencia del precio por litro
  -- (0030): ARS explícito de p_costos GANA sobre USD×dólar (ya resueltos y
  -- persistidos en lotes_produccion por crear_lote/fijar_costos_lote,
  -- mismo criterio que iva_pct/precios_incluyen_iva de arriba); si ninguno
  -- de los dos está disponible, cada presentación cae al promedio ponderado
  -- de v_tanque_aceite del insumo de materia_prima de esa presentación
  -- (0029, sin cambios). Sin ningún precio (ni cargado ni derivable), esa
  -- presentación se queda sin línea de aceite, no falla. se_paga = false
  -- (ya se pagó al comprar a granel).
  v_precio_litro_global := nullif(p_costos->>'precio_litro_aceite_centavos', '')::bigint;
  v_aceite_descripcion := null;
  if v_precio_litro_global is null and v_dolar_centavos is not null and v_usd_por_litro_centavos is not null then
    v_precio_litro_global := round(v_usd_por_litro_centavos * v_dolar_centavos / 100.0);
    -- Nota legible únicamente — el detalle numérico exacto (litros, dólar,
    -- USD/L) para que la UI arme "0,25 L × USD 5,00 × $1.000 = $1.250" sale
    -- de `cantidad`/`total_centavos` de esta misma fila más
    -- `v_costo_lote_desglose.dolar_centavos`/`.precio_litro_aceite_usd_centavos`
    -- (mismo lote) — no hace falta parsear este texto.
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
      -- Invariante asumida: un producto tiene A LO SUMO una receta de
      -- materia_prima (el aceite de esa presentación). Si alguna vez
      -- tuviera dos (dato mal cargado), `order by r.insumo_id` hace que la
      -- elección sea DETERMINÍSTICA (siempre la misma) en vez de depender
      -- del plan de ejecución — no valida la invariante, solo evita que el
      -- costo cargado cambie de una corrida a otra.
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
      insert into lote_costos (lote_id, producto_id, concepto, descripcion, cantidad, costo_unitario_centavos, total_centavos, se_paga)
      values (p_lote_id, v_item.producto_id, 'aceite', v_aceite_descripcion, v_litros, v_precio_litro_item, v_monto, false);
    end if;
  end loop;

  -- Etiquetas: una fila de lote_costos por (presentación, insumo de
  -- etiqueta) — cantidad = recetas.cantidad (de ESE insumo puntual) ×
  -- cantidad del ítem. costo_unitario_centavos = precio grossed-up por IVA
  -- (rule 2 de 0029) + envío (el envío NUNCA lleva IVA). Fallback legado: sin
  -- "etiquetas" pero con "precio_etiqueta_centavos", se sintetiza una
  -- lista con ese precio para TODOS los insumos tipo 'etiqueta' que usen
  -- los productos de este lote, envío 0 — mismo resultado total que 0028,
  -- ahora en filas separadas por insumo. Sin cambios respecto de 0029.
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
        cantidad, costo_unitario_centavos, neto_centavos, envio_centavos, total_centavos, se_paga
      ) values (
        p_lote_id, v_receta.producto_id, v_etiqueta_insumo_id, 'etiqueta',
        case when v_incluye_iva then null else 'IVA ' || v_iva_pct || '% aplicado sobre el precio neto (envío sin IVA)' end,
        v_receta.unidades_por_botella * v_receta.botellas,
        v_gross + v_etiqueta_envio, v_etiqueta_precio, v_etiqueta_envio, v_monto, false
      );
    end loop;
  end loop;

  -- Envase: a pagar, directo por presentación. Precio grossed-up por IVA
  -- (rule 2) igual que etiqueta. Sin cambios respecto de 0029.
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

      if v_incluye_iva then
        v_gross := v_envase_precio;
      else
        v_gross := round(v_envase_precio * (100 + v_iva_pct) / 100);
      end if;

      v_monto := v_gross * v_envase_cantidad;
      insert into lote_costos (
        lote_id, producto_id, concepto, descripcion,
        cantidad, costo_unitario_centavos, neto_centavos, total_centavos, se_paga
      ) values (
        p_lote_id, v_envase_producto_id, 'envase',
        case when v_incluye_iva then null else 'IVA ' || v_iva_pct || '% aplicado sobre el precio neto' end,
        v_envase_cantidad, v_gross, v_envase_precio, v_monto, true
      );
    end loop;
  end if;

  -- Transporte: DOS formas mutuamente excluyentes (ver TRANSPORTE_AMBIGUO
  -- arriba). % -> línea DIRECTA por presentación, base = aceite + envase
  -- (ya con IVA) de ESA presentación, recién insertados arriba. Fijo ->
  -- línea COMPARTIDA por volumen, igual que 0028. Sin cambios respecto de
  -- 0029.
  if v_transporte_pct is not null and v_transporte_pct > 0 then
    for v_item in
      select li.producto_id
      from lote_items li where li.lote_id = p_lote_id
    loop
      select coalesce(sum(total_centavos), 0) into v_base_transporte
      from lote_costos
      where lote_id = p_lote_id and producto_id = v_item.producto_id and concepto in ('aceite', 'envase');

      if v_base_transporte > 0 then
        v_monto := round(v_base_transporte * v_transporte_pct / 100);
        insert into lote_costos (lote_id, producto_id, concepto, descripcion, total_centavos, se_paga)
        values (p_lote_id, v_item.producto_id, 'transporte', v_transporte_pct || '% sobre aceite + envase', v_monto, true);
      end if;
    end loop;
  elsif v_transporte_fijo is not null and v_transporte_fijo > 0 then
    insert into lote_costos (lote_id, producto_id, concepto, total_centavos, se_paga)
    values (p_lote_id, null, 'transporte', v_transporte_fijo, true);
  end if;

  -- Otros: a pagar, compartido, con descripción opcional (ej. "envasado").
  -- Sin cambios respecto de 0029.
  v_otros := nullif(p_costos->>'otros_centavos', '')::bigint;
  v_otros_desc := p_costos->>'otros_descripcion';
  if v_otros is not null and v_otros > 0 then
    insert into lote_costos (lote_id, producto_id, concepto, descripcion, total_centavos, se_paga)
    values (p_lote_id, null, 'otro', nullif(btrim(v_otros_desc), ''), v_otros, true);
  end if;
end;
$$;

revoke execute on function __SCHEMA__.aplicar_costos_lote(uuid, jsonb) from anon, authenticated, public;

-- ============================================================
-- 3) crear_lote — misma firma exacta que 0028/0029: create or replace
--    alcanza, sin drop. Único cambio: dolar_centavos/
--    precio_litro_aceite_usd_centavos se resuelven con el MISMO criterio
--    que ganancia_pct/mayorista_pct/minorista_pct/iva_pct/
--    precios_incluyen_iva/transporte_pct — si p_costos los trae, se usan;
--    si no, se heredan del lote más reciente que los tenga; sin ningún
--    lote todavía (o ninguno con estos campos cargados), quedan en null —
--    a diferencia de ganancia_pct etc, NO hay default "de columna" para
--    dólar/USD (un lote puede no tener dólar cargado todavía, y seguir
--    usando ARS explícito o el tanque para el aceite).
-- ============================================================

create or replace function crear_lote(
  p_fecha date,
  p_nota text default null,
  p_items jsonb default null,
  p_permitir_negativo boolean default false,
  p_costos jsonb default null
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
  v_ganancia_pct numeric;
  v_mayorista_pct numeric;
  v_minorista_pct numeric;
  v_iva_pct numeric;
  v_incluye_iva boolean;
  v_transporte_pct numeric;
  v_dolar_centavos bigint;
  v_usd_por_litro_centavos bigint;
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

  -- ganancia_pct/mayorista_pct/minorista_pct/iva_pct/precios_incluyen_iva/
  -- transporte_pct/dolar_centavos/precio_litro_aceite_usd_centavos: si
  -- p_costos los trae, se usan tal cual; si no, se heredan del lote MÁS
  -- RECIENTE que ya exista; si todavía no hay ningún lote, los primeros
  -- seis quedan en los defaults de la columna (30/15/40/21/true/null) y los
  -- dos últimos quedan en null (sin default de columna, ver comentario de
  -- arriba).
  if p_costos is not null then
    v_ganancia_pct := nullif(p_costos->>'ganancia_pct', '')::numeric;
    v_mayorista_pct := nullif(p_costos->>'mayorista_pct', '')::numeric;
    v_minorista_pct := nullif(p_costos->>'minorista_pct', '')::numeric;
    v_iva_pct := nullif(p_costos->>'iva_pct', '')::numeric;
    v_incluye_iva := nullif(p_costos->>'precios_incluyen_iva', '')::boolean;
    v_transporte_pct := nullif(p_costos->>'transporte_pct', '')::numeric;
    v_dolar_centavos := nullif(p_costos->>'dolar_centavos', '')::bigint;
    v_usd_por_litro_centavos := nullif(p_costos->>'precio_litro_aceite_usd_centavos', '')::bigint;
  end if;

  if v_ganancia_pct is null or v_mayorista_pct is null or v_minorista_pct is null
     or v_iva_pct is null or v_incluye_iva is null or v_transporte_pct is null
     or v_dolar_centavos is null or v_usd_por_litro_centavos is null then
    select
      coalesce(v_ganancia_pct, l.ganancia_pct),
      coalesce(v_mayorista_pct, l.mayorista_pct),
      coalesce(v_minorista_pct, l.minorista_pct),
      coalesce(v_iva_pct, l.iva_pct),
      coalesce(v_incluye_iva, l.precios_incluyen_iva),
      coalesce(v_transporte_pct, l.transporte_pct),
      coalesce(v_dolar_centavos, l.dolar_centavos),
      coalesce(v_usd_por_litro_centavos, l.precio_litro_aceite_usd_centavos)
      into v_ganancia_pct, v_mayorista_pct, v_minorista_pct, v_iva_pct, v_incluye_iva, v_transporte_pct,
        v_dolar_centavos, v_usd_por_litro_centavos
    from lotes_produccion l
    order by l.fecha desc, l.created_at desc
    limit 1;
  end if;

  insert into lotes_produccion (
    fecha, nota, vendedor_id, ganancia_pct, mayorista_pct, minorista_pct,
    iva_pct, precios_incluyen_iva, transporte_pct, dolar_centavos, precio_litro_aceite_usd_centavos
  )
  values (
    coalesce(p_fecha, current_date), p_nota, v_vendedor_id,
    coalesce(v_ganancia_pct, 30), coalesce(v_mayorista_pct, 15), coalesce(v_minorista_pct, 40),
    coalesce(v_iva_pct, 21), coalesce(v_incluye_iva, true), v_transporte_pct,
    v_dolar_centavos, v_usd_por_litro_centavos
  )
  returning id into v_lote_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::int;

    insert into lote_items (lote_id, producto_id, cantidad)
    values (v_lote_id, v_producto_id, v_cantidad);

    insert into movimientos_stock (producto_id, tipo, cantidad, vendedor_id, lote_id, nota)
    values (v_producto_id, 'ingreso', v_cantidad, v_vendedor_id, v_lote_id, p_nota);

    -- Consumo de insumos según receta del producto: sin receta para este
    -- producto, el for no itera y no descuenta nada. Ya no incluye envases
    -- (recetas borradas en 0028).
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

  if p_costos is not null then
    perform __SCHEMA__.aplicar_costos_lote(v_lote_id, p_costos);
  end if;

  return json_build_object('lote_id', v_lote_id);
end;
$$;

revoke execute on function crear_lote(date, text, jsonb, boolean, jsonb) from anon, public;
grant execute on function crear_lote(date, text, jsonb, boolean, jsonb) to authenticated;

-- ============================================================
-- 4) fijar_costos_lote — misma firma que 0028/0029. Gana la misma
--    resolución de dolar_centavos/precio_litro_aceite_usd_centavos que
--    iva_pct/transporte_pct: a diferencia de crear_lote, "ausente" significa
--    "dejar el valor que el lote ya tiene", no heredar de otro lote. Sin
--    cambios en el chequeo prospectivo de COSTOS_MENORES_A_PAGADO: el
--    aceite nunca es `se_paga`, no entra en ese cálculo con dólar o sin él.
-- ============================================================

create or replace function fijar_costos_lote(
  p_lote_id uuid,
  p_costos jsonb
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_pagado_centavos bigint;
  v_nuevo_a_pagar_centavos bigint;
  v_ganancia_pct numeric;
  v_mayorista_pct numeric;
  v_minorista_pct numeric;
  v_iva_pct numeric;
  v_incluye_iva boolean;
  v_transporte_pct numeric;
  v_transporte_fijo bigint;
  v_dolar_centavos bigint;
  v_usd_por_litro_centavos bigint;
  v_iva_pct_actual numeric;
  v_incluye_iva_actual boolean;
  v_transporte_pct_actual numeric;
  v_iva_pct_efectivo numeric;
  v_incluye_iva_efectivo boolean;
  v_transporte_pct_efectivo numeric;
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select iva_pct, precios_incluyen_iva, transporte_pct
    into v_iva_pct_actual, v_incluye_iva_actual, v_transporte_pct_actual
  from lotes_produccion where id = p_lote_id;

  if v_iva_pct_actual is null then
    raise exception 'LOTE_NO_ENCONTRADO';
  end if;

  if p_costos is null then
    raise exception 'COSTOS_INVALIDOS';
  end if;

  v_transporte_pct := nullif(p_costos->>'transporte_pct', '')::numeric;
  v_transporte_fijo := nullif(p_costos->>'transporte_centavos', '')::bigint;
  if v_transporte_pct is not null and v_transporte_fijo is not null then
    raise exception 'TRANSPORTE_AMBIGUO';
  end if;

  -- Chequeo prospectivo de "no bajar costos por debajo de lo ya pagado":
  -- tiene que usar EXACTAMENTE las mismas reglas que el camino de
  -- escritura (aplicar_costos_lote) o un total ya grossed-up por IVA que
  -- se vuelve a guardar IDÉNTICO dispara un falso positivo apenas lo
  -- pagado supera el neto sin IVA. "Efectivo" = lo que p_costos trae, o si
  -- no lo trae, lo que el lote YA tiene (mismo criterio de "solo cambiar si
  -- viene" que se aplica al UPDATE de abajo). Sin cambios respecto de 0029
  -- (el aceite, con o sin dólar, nunca es `se_paga`).
  v_iva_pct_efectivo := coalesce(nullif(p_costos->>'iva_pct', '')::numeric, v_iva_pct_actual);
  v_incluye_iva_efectivo :=
    coalesce(nullif(p_costos->>'precios_incluyen_iva', '')::boolean, v_incluye_iva_actual);
  v_transporte_pct_efectivo := coalesce(v_transporte_pct, v_transporte_pct_actual);

  select coalesce(sum(monto_centavos), 0) into v_pagado_centavos
  from gastos where lote_id = p_lote_id and concepto_lote = 'pago';

  -- Envases nuevos, grossed-up igual que aplicar_costos_lote (rule 2 de
  -- 0029). Transporte: fijo tal cual, o % sobre (aceite YA vigente del lote
  -- + envase nuevo, ambos con IVA) — aproxima con el aceite ACTUAL porque
  -- recién se conoce el definitivo dentro de aplicar_costos_lote (podría
  -- cambiar si p_costos trae un dólar/USD nuevo, un precio de aceite ARS
  -- explícito nuevo, o si se deriva del tanque y el tanque cambió desde la
  -- última vez — caso raro, documentado acá a propósito). Sin cambios
  -- respecto de 0029.
  with envases_nuevos as (
    select
      (e->>'producto_id')::uuid as producto_id,
      case when v_incluye_iva_efectivo
        then (e->>'precio_unitario_centavos')::bigint
        else round((e->>'precio_unitario_centavos')::bigint * (100 + v_iva_pct_efectivo) / 100)
      end as unitario_gross_centavos,
      li.cantidad
    from jsonb_array_elements(coalesce(p_costos->'envases', '[]'::jsonb)) e
    join lote_items li on li.lote_id = p_lote_id and li.producto_id = (e->>'producto_id')::uuid
  ),
  envase_total as (
    select coalesce(sum(unitario_gross_centavos * cantidad), 0)::bigint as total from envases_nuevos
  ),
  aceite_actual as (
    select producto_id, total_centavos
    from lote_costos where lote_id = p_lote_id and concepto = 'aceite'
  ),
  transporte_pct_total as (
    select coalesce(sum(round(
      (coalesce(ac.total_centavos, 0) + coalesce(en.unitario_gross_centavos * en.cantidad, 0))
      * v_transporte_pct_efectivo / 100
    )), 0)::bigint as total
    from lote_items li
    left join aceite_actual ac on ac.producto_id = li.producto_id
    left join envases_nuevos en on en.producto_id = li.producto_id
    where li.lote_id = p_lote_id
      and v_transporte_pct_efectivo is not null and v_transporte_pct_efectivo > 0
  )
  select
    (select total from envase_total)
    + case
        when v_transporte_fijo is not null and v_transporte_fijo > 0 then v_transporte_fijo
        else coalesce((select total from transporte_pct_total), 0)
      end
    + greatest(coalesce(nullif(p_costos->>'otros_centavos', '')::bigint, 0), 0)
  into v_nuevo_a_pagar_centavos;

  if v_nuevo_a_pagar_centavos < v_pagado_centavos then
    raise exception 'COSTOS_MENORES_A_PAGADO'
      using detail = json_build_object(
        'pagado_centavos', v_pagado_centavos,
        'nuevo_total_centavos', v_nuevo_a_pagar_centavos
      )::text;
  end if;

  v_ganancia_pct := nullif(p_costos->>'ganancia_pct', '')::numeric;
  v_mayorista_pct := nullif(p_costos->>'mayorista_pct', '')::numeric;
  v_minorista_pct := nullif(p_costos->>'minorista_pct', '')::numeric;
  v_iva_pct := nullif(p_costos->>'iva_pct', '')::numeric;
  v_incluye_iva := nullif(p_costos->>'precios_incluyen_iva', '')::boolean;
  v_dolar_centavos := nullif(p_costos->>'dolar_centavos', '')::bigint;
  v_usd_por_litro_centavos := nullif(p_costos->>'precio_litro_aceite_usd_centavos', '')::bigint;

  if v_ganancia_pct is not null or v_mayorista_pct is not null or v_minorista_pct is not null
     or v_iva_pct is not null or v_incluye_iva is not null or v_transporte_pct is not null
     or v_dolar_centavos is not null or v_usd_por_litro_centavos is not null then
    update lotes_produccion set
      ganancia_pct = coalesce(v_ganancia_pct, ganancia_pct),
      mayorista_pct = coalesce(v_mayorista_pct, mayorista_pct),
      minorista_pct = coalesce(v_minorista_pct, minorista_pct),
      iva_pct = coalesce(v_iva_pct, iva_pct),
      precios_incluyen_iva = coalesce(v_incluye_iva, precios_incluyen_iva),
      transporte_pct = coalesce(v_transporte_pct, transporte_pct),
      dolar_centavos = coalesce(v_dolar_centavos, dolar_centavos),
      precio_litro_aceite_usd_centavos = coalesce(v_usd_por_litro_centavos, precio_litro_aceite_usd_centavos)
    where id = p_lote_id;
  end if;

  perform __SCHEMA__.aplicar_costos_lote(p_lote_id, p_costos);

  return json_build_object('lote_id', p_lote_id);
end;
$$;

revoke execute on function fijar_costos_lote(uuid, jsonb) from anon, public;
grant execute on function fijar_costos_lote(uuid, jsonb) to authenticated;

-- ============================================================
-- 5) v_costo_lote_desglose — recreada SOLO para exponer
--    dolar_centavos/precio_litro_aceite_usd_centavos (de lotes_produccion,
--    mismo valor para todas las presentaciones de un lote) — mismas
--    columnas y mismo orden que 0029, con estas dos agregadas AL FINAL
--    (después de `created_at`): `create or replace view` de Postgres solo
--    admite agregar columnas al final de una vista ya publicada, insertarlas
--    en el medio (p.ej. junto a ganancia_pct/mayorista_pct/minorista_pct)
--    falla al aplicar sobre una base con 0029 ya corrida (verificado
--    localmente).
-- ============================================================

create or replace view v_costo_lote_desglose as
with peso_item as (
  select li.lote_id, li.producto_id, p.presentacion_ml * li.cantidad as peso
  from lote_items li
  join productos p on p.id = li.producto_id
),
aceite_directo as (
  select lote_id, producto_id, sum(total_centavos) as monto
  from lote_costos where concepto = 'aceite'
  group by lote_id, producto_id
),
etiqueta_directo as (
  select lote_id, producto_id, sum(total_centavos) as monto
  from lote_costos where concepto = 'etiqueta'
  group by lote_id, producto_id
),
envase_directo as (
  select lote_id, producto_id, sum(total_centavos) as monto
  from lote_costos where concepto = 'envase'
  group by lote_id, producto_id
),
transporte_directo as (
  select lote_id, producto_id, sum(total_centavos) as monto
  from lote_costos where concepto = 'transporte' and producto_id is not null
  group by lote_id, producto_id
),
transporte_lote as (
  select lote_id, sum(total_centavos) as total
  from lote_costos where concepto = 'transporte' and producto_id is null
  group by lote_id
),
otro_lote as (
  select lote_id, sum(total_centavos) as total from lote_costos where concepto = 'otro' group by lote_id
),
legacy_directo as (
  select lote_id, producto_id, sum(monto_centavos) as monto
  from gastos
  where lote_id is not null and producto_id is not null and concepto_lote is null
  group by lote_id, producto_id
),
legacy_compartido_lote as (
  select lote_id, sum(monto_centavos) as total
  from gastos
  where lote_id is not null and producto_id is null and concepto_lote is null
  group by lote_id
),
compartido_item as (
  select
    pi.lote_id,
    pi.producto_id,
    coalesce(round(coalesce(tl.total, 0)::numeric * pi.peso / sum(pi.peso) over (partition by pi.lote_id)), 0)::bigint as transporte_compartido_centavos,
    coalesce(round(coalesce(ol.total, 0)::numeric * pi.peso / sum(pi.peso) over (partition by pi.lote_id)), 0)::bigint as otro_compartido_centavos,
    coalesce(round(coalesce(lcl.total, 0)::numeric * pi.peso / sum(pi.peso) over (partition by pi.lote_id)), 0)::bigint as legacy_compartido_centavos
  from peso_item pi
  left join transporte_lote tl on tl.lote_id = pi.lote_id
  left join otro_lote ol on ol.lote_id = pi.lote_id
  left join legacy_compartido_lote lcl on lcl.lote_id = pi.lote_id
),
base as (
  select
    li.lote_id,
    li.producto_id,
    l.fecha,
    l.created_at,
    l.ganancia_pct,
    l.mayorista_pct,
    l.minorista_pct,
    l.dolar_centavos,
    l.precio_litro_aceite_usd_centavos,
    p.presentacion_ml,
    p.nombre as producto_nombre,
    li.cantidad,
    coalesce(ad.monto, 0) as aceite_centavos,
    coalesce(ed.monto, 0) as etiqueta_centavos,
    coalesce(ev.monto, 0) as envase_centavos,
    (coalesce(td.monto, 0) + coalesce(ci.transporte_compartido_centavos, 0))::bigint as transporte_centavos,
    coalesce(ld.monto, 0) + coalesce(ci.otro_compartido_centavos, 0) + coalesce(ci.legacy_compartido_centavos, 0) as otros_centavos
  from lote_items li
  join productos p on p.id = li.producto_id
  join lotes_produccion l on l.id = li.lote_id
  left join aceite_directo ad on ad.lote_id = li.lote_id and ad.producto_id = li.producto_id
  left join etiqueta_directo ed on ed.lote_id = li.lote_id and ed.producto_id = li.producto_id
  left join envase_directo ev on ev.lote_id = li.lote_id and ev.producto_id = li.producto_id
  left join transporte_directo td on td.lote_id = li.lote_id and td.producto_id = li.producto_id
  left join legacy_directo ld on ld.lote_id = li.lote_id and ld.producto_id = li.producto_id
  left join compartido_item ci on ci.lote_id = li.lote_id and ci.producto_id = li.producto_id
),
costeado as (
  select
    b.*,
    (b.aceite_centavos + b.etiqueta_centavos + b.envase_centavos + b.transporte_centavos + b.otros_centavos) as total_centavos
  from base b
),
con_costo_unitario as (
  select
    c.*,
    case when c.total_centavos = 0 then 0 else round(c.total_centavos::numeric / c.cantidad)::bigint end as costo_unitario_centavos
  from costeado c
),
con_costo_ananja as (
  select
    u.*,
    round(u.costo_unitario_centavos * (100 + u.ganancia_pct) / 100)::bigint as costo_ananja_centavos
  from con_costo_unitario u
),
con_mayorista as (
  select
    a.*,
    round(a.costo_ananja_centavos * (100 + a.mayorista_pct) / 100)::bigint as precio_mayorista_sugerido_centavos
  from con_costo_ananja a
)
select
  lote_id,
  producto_id,
  fecha,
  presentacion_ml,
  producto_nombre,
  cantidad,
  aceite_centavos,
  etiqueta_centavos,
  envase_centavos,
  transporte_centavos,
  otros_centavos,
  total_centavos,
  costo_unitario_centavos,
  total_centavos > 0 as tiene_costos,
  ganancia_pct,
  mayorista_pct,
  minorista_pct,
  costo_ananja_centavos,
  precio_mayorista_sugerido_centavos,
  round(precio_mayorista_sugerido_centavos * (100 + minorista_pct) / 100)::bigint as precio_minorista_sugerido_centavos,
  created_at,
  -- `dolar_centavos`/`precio_litro_aceite_usd_centavos` (0030) van AL FINAL
  -- a propósito: `create or replace view` de Postgres solo admite agregar
  -- columnas al final de la lista existente (cambiar el orden de una ya
  -- publicada falla con "no se puede cambiar el nombre de la columna...a
  -- ...", verificado localmente) — no reordenar esta lista en migraciones
  -- futuras sin sacar antes esta columna del medio.
  dolar_centavos,
  precio_litro_aceite_usd_centavos
from con_mayorista;

alter view v_costo_lote_desglose set (security_invoker = true);
revoke all on v_costo_lote_desglose from anon, public;
grant select on v_costo_lote_desglose to authenticated;
