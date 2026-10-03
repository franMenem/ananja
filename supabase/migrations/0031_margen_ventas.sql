-- Ananja: margen de ventas — precio por botella + costos operativos vs. de
-- producción + margen de Ananja / de cada vendedor / de cada feria.
--
-- Este chunk resuelve dos huecos del modelo de costos (0028-0030), sin
-- depender de la pregunta todavía abierta de "cómo pagan los vendedores":
--
--  1. `comprobante_items` no guardaba precio unitario — solo existe
--     `comprobantes.monto_centavos` TOTAL, así que era imposible saber
--     cuánto dejó cada botella cuando una venta mezcla productos o precios
--     (descuentos, redondeos). `comprobante_items.precio_unitario_centavos`
--     (nullable — cargarlo es opcional) + `crear_comprobante`/
--     `actualizar_comprobante` lo aceptan por ítem. `comprobantes.
--     monto_centavos` SIGUE siendo la fuente de verdad para Caja: no se
--     fuerza a que los precios unitarios sumen el total.
--  2. No había forma de separar gastos "de producción" (ya adentro del
--     costo de la botella vía `lote_costos`) de gastos operativos.
--     `categorias_gasto.es_costo_produccion` marca las categorías que ya
--     están adentro del costo (Insumos, Envases y etiquetas, Aceite —
--     todavía no existe como categoría propia, se deja el nombre por si se
--     crea a futuro, el update es un no-op mientras tanto—, Pedidos de
--     producción); el resto (Ferias, Logística, Otros, …) son operativas.
--
-- Con eso ya se puede armar la pieza central: `v_margen_ventas`, una fila
-- por unidad vendida (agregada por documento × producto × lote) con las DOS
-- ganancias que la app necesita saber calcular (ver el spec de este
-- chunk):
--   - margen de Ananja = Σ (costo Ananja − costo de producción) de las
--     botellas vendidas (`margen_ananja_centavos`).
--   - margen de cada vendedor = Σ (precio de venta − costo Ananja), null
--     cuando no se cargó el precio de venta de esa línea
--     (`margen_vendedor_centavos`).
-- Y `v_resultado_feria`, que agrega ese margen de Ananja por feria contra
-- los gastos de esa feria (sin tocar `v_feria_totales`, que sigue siendo la
-- fuente de los totales de venta que ya consume la UI).
--
-- Atribución de costo cuando la venta NO tiene lote elegido a mano
-- (`comprobante_items.lote_id is null` — SIEMPRE el caso de
-- `ventas_revendedor`, que no tiene columna `lote_id`: el revendedor vende
-- de su stock en mano sin registrar de qué entrega salió): "mismo criterio
-- FIFO que usa `v_stock_por_lote`" en el sentido del ALGORITMO (el lote más
-- viejo se consume primero), no en el sentido de compartir literalmente el
-- mismo pool — CROSS-REFERENCE con `v_stock_por_lote`
-- (0028_costos_por_lote.sql): esa vista cuenta la ENTREGA a un revendedor
-- como la salida de stock real (por eso ahí "vendida" = entregada, vía
-- `movimientos_stock`/`entrega_items`), mientras que acá el margen del
-- vendedor recién se realiza en la venta MINORISTA real
-- (`ventas_revendedor`), un evento distinto sin trazabilidad hacia qué
-- entrega/lote salió esa botella en concreto. El pool de capacidad de ESTA
-- vista solo mira `comprobante_items.lote_id` (nunca `entrega_items` ni
-- `movimientos_stock`: una entrega es una reubicación de stock, no una
-- venta) — por eso los dos pools son DELIBERADAMENTE no reconciliables 1:1
-- (Σ de uno no tiene por qué cuadrar contra el otro), cada uno responde una
-- pregunta distinta (stock físico vs. margen realizado).
--
-- Se arma un pool FIFO propio para el margen: por producto, la capacidad de
-- cada lote es lo producido MENOS lo ya asignado a mano vía
-- `comprobante_items.lote_id` (esa es la única asignación directa que
-- existe); la demanda sin lote — ítems de comprobante sin lote elegido +
-- TODAS las `ventas_revendedor` — se ordena por fecha y consume esa
-- capacidad lote por lote, del más viejo al más nuevo, partiendo una venta
-- en dos (o más) filas si cruza el límite de un lote. Implementado como
-- intersección de intervalos sobre posiciones ACUMULADAS (capacidad
-- acumulada de lotes vs. demanda acumulada, ambas por producto) — NO con
-- `generate_series` unidad por unidad (una versión anterior lo hacía así:
-- 71s para 10.000 unidades en el review, y los filtros de la UI —feria,
-- rango de fechas— no pueden empujarse antes de las funciones de ventana,
-- así que cada consulta explotaba TODO el historial). La intersección de
-- intervalos es O(lotes + documentos) por producto, sin explotar nada.
--
-- Freno de fecha (agregado en review): un lote NUNCA satisface demanda
-- fechada ANTES que su propia `fecha` — sin esto, una venta de enero podía
-- terminar "pagando" con un lote de junio simplemente porque la capacidad
-- anterior ya se había agotado (por otra demanda), mostrando un costo que
-- físicamente no pudo existir todavía en esa fecha. Se implementa acotando,
-- para cada fila de demanda, la capacidad total disponible a la suma de
-- capacidad de los lotes con `fecha <= demanda.fecha` (la "frontera" de esa
-- fecha) — como lotes y demanda están ordenados por fecha, esa frontera
-- coincide exactamente con el límite de posición acumulada del prefijo de
-- lotes elegibles, así que sigue siendo aritmética pura (sin recursión ni
-- loops): el remanente que la frontera no alcanza a cubrir queda con
-- `lote_id`/costos `null`, mismo tratamiento que "sin capacidad conocida".
--
-- Migración templada (__SCHEMA__, sin __BUCKET__). Ver supabase/README.md.

-- ============================================================
-- 1) comprobante_items.precio_unitario_centavos — opcional, no se fuerza a
--    sumar comprobantes.monto_centavos (descuentos/redondeos existen).
-- ============================================================

alter table comprobante_items
  add column precio_unitario_centavos bigint
    check (precio_unitario_centavos is null or precio_unitario_centavos > 0);

-- ============================================================
-- 2) categorias_gasto.es_costo_produccion — separa gastos YA dentro del
--    costo de la botella (lote_costos) de gastos operativos. Match por
--    nombre, idempotente (update, no falla si alguna no existe todavía —
--    "Aceite" no existe hoy como categoría propia, las compras de aceite
--    caen bajo "Insumos" vía registrar_compra_insumo; se deja el nombre acá
--    por si se crea a futuro).
-- ============================================================

alter table categorias_gasto
  add column es_costo_produccion boolean not null default false;

update categorias_gasto set es_costo_produccion = true
where nombre in ('Insumos', 'Envases y etiquetas', 'Aceite', 'Pedidos de producción');

-- ============================================================
-- 3) crear_comprobante / actualizar_comprobante — MISMAS firmas que 0029
--    (el precio va DENTRO de cada ítem del jsonb, `p_items[].
--    precio_unitario_centavos` opcional, no es un parámetro nuevo):
--    create or replace alcanza, sin drop. Resto del cuerpo idéntico a 0029;
--    agrega la validación PRECIO_UNITARIO_INVALIDO y lo persiste en
--    comprobante_items.
-- ============================================================

create or replace function crear_comprobante(
  p_monto_centavos bigint,
  p_medio_pago medio_pago,
  p_imagen_path text,
  p_fecha date,
  p_nota text default null,
  p_estado_ocr estado_ocr default 'no_intentado',
  p_ocr_monto_centavos bigint default null,
  p_items jsonb default '[]'::jsonb,
  p_permitir_negativo boolean default false,
  p_cliente_id uuid default null,
  p_feria_id uuid default null,
  p_cobrado_centavos bigint default null
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_vendedor_id uuid;
  v_comprobante_id uuid;
  v_item jsonb;
  v_producto_id uuid;
  v_cantidad int;
  v_lote_id uuid;
  v_precio_unitario_centavos bigint;
  v_quedan int;
  v_stock int;
  v_umbral int;
  v_nombre text;
  v_alertas text[] := array[]::text[];
  v_feria_estado text;
  v_cobrado_centavos bigint;
  v_vistos text[] := '{}';
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select id into v_vendedor_id from vendedores where user_id = auth.uid();
  if v_vendedor_id is null then
    raise exception 'VENDEDOR_NO_REGISTRADO';
  end if;

  if p_monto_centavos is null or p_monto_centavos <= 0 then
    raise exception 'MONTO_INVALIDO';
  end if;

  if p_items is null or jsonb_array_length(p_items) < 1 then
    raise exception 'SIN_ITEMS';
  end if;

  if p_cliente_id is not null and not exists (
    select 1 from clientes where id = p_cliente_id and activo
  ) then
    raise exception 'CLIENTE_INVALIDO';
  end if;

  if p_feria_id is not null then
    select estado into v_feria_estado from ferias where id = p_feria_id;
    if v_feria_estado is null then
      raise exception 'FERIA_NO_ENCONTRADA';
    end if;
    if v_feria_estado <> 'abierta' then
      raise exception 'FERIA_CERRADA';
    end if;
  end if;

  v_cobrado_centavos := coalesce(p_cobrado_centavos, p_monto_centavos);

  if v_cobrado_centavos < 0 or v_cobrado_centavos > p_monto_centavos then
    raise exception 'COBRADO_INVALIDO';
  end if;

  if v_cobrado_centavos < p_monto_centavos and p_cliente_id is null then
    raise exception 'CREDITO_REQUIERE_CLIENTE';
  end if;

  insert into comprobantes (
    vendedor_id, monto_centavos, medio_pago, imagen_path, fecha,
    estado_ocr, ocr_monto_centavos, nota, cliente_id, feria_id, cobrado_centavos
  ) values (
    v_vendedor_id, p_monto_centavos, p_medio_pago, p_imagen_path,
    coalesce(p_fecha, current_date), coalesce(p_estado_ocr, 'no_intentado'),
    p_ocr_monto_centavos, p_nota, p_cliente_id, p_feria_id, v_cobrado_centavos
  ) returning id into v_comprobante_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::int;
    v_lote_id := nullif(v_item->>'lote_id', '')::uuid;
    v_precio_unitario_centavos := nullif(v_item->>'precio_unitario_centavos', '')::bigint;

    if v_producto_id is null or v_cantidad is null or v_cantidad <= 0 then
      raise exception 'SIN_ITEMS';
    end if;

    if v_precio_unitario_centavos is not null and v_precio_unitario_centavos <= 0 then
      raise exception 'PRECIO_UNITARIO_INVALIDO';
    end if;

    if (v_producto_id::text || ':' || coalesce(v_lote_id::text, '')) = any(v_vistos) then
      raise exception 'ITEM_DUPLICADO';
    end if;
    v_vistos := array_append(v_vistos, v_producto_id::text || ':' || coalesce(v_lote_id::text, ''));

    if v_lote_id is not null then
      if not exists (select 1 from lote_items where lote_id = v_lote_id and producto_id = v_producto_id) then
        raise exception 'LOTE_INVALIDO';
      end if;

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

    insert into comprobante_items (comprobante_id, producto_id, cantidad, lote_id, precio_unitario_centavos)
    values (v_comprobante_id, v_producto_id, v_cantidad, v_lote_id, v_precio_unitario_centavos);

    insert into movimientos_stock (producto_id, tipo, cantidad, vendedor_id, comprobante_id, lote_id, nota, motivo)
    values (v_producto_id, 'egreso', v_cantidad, v_vendedor_id, v_comprobante_id, v_lote_id, null, 'venta');

    select s.stock, s.umbral_minimo, s.nombre into v_stock, v_umbral, v_nombre
    from v_stock_actual s where s.producto_id = v_producto_id;

    if v_stock < 0 and not p_permitir_negativo then
      raise exception 'STOCK_INSUFICIENTE'
        using detail = json_build_object(
          'producto', v_nombre,
          'producto_id', v_producto_id,
          'disponible', v_stock + v_cantidad
        )::text;
    end if;

    if v_stock < v_umbral then
      insert into notificaciones (tipo, titulo, detalle, referencia_id)
      values (
        'stock_bajo',
        'Stock bajo: ' || v_nombre,
        'Quedan ' || v_stock || ' unidades',
        v_producto_id
      );
      v_alertas := array_append(v_alertas, 'stock_bajo:' || v_nombre);
    end if;
  end loop;

  return json_build_object('comprobante_id', v_comprobante_id, 'alertas', v_alertas);
end;
$$;

revoke execute on function crear_comprobante(bigint, medio_pago, text, date, text, estado_ocr, bigint, jsonb, boolean, uuid, uuid, bigint) from anon, public;
grant execute on function crear_comprobante(bigint, medio_pago, text, date, text, estado_ocr, bigint, jsonb, boolean, uuid, uuid, bigint) to authenticated;

create or replace function actualizar_comprobante(
  p_comprobante_id uuid,
  p_monto_centavos bigint,
  p_medio_pago medio_pago,
  p_imagen_path text,
  p_fecha date,
  p_nota text default null,
  p_estado_ocr estado_ocr default 'no_intentado',
  p_ocr_monto_centavos bigint default null,
  p_items jsonb default '[]'::jsonb,
  p_permitir_negativo boolean default false,
  p_cliente_id uuid default null,
  p_feria_id uuid default null,
  p_cobrado_centavos bigint default null
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_vendedor_id uuid;
  v_item jsonb;
  v_producto_id uuid;
  v_cantidad int;
  v_lote_id uuid;
  v_precio_unitario_centavos bigint;
  v_quedan int;
  v_stock int;
  v_umbral int;
  v_nombre text;
  v_alertas text[] := array[]::text[];
  v_feria_actual uuid;
  v_feria_estado text;
  v_cobrado_actual bigint;
  v_cobros_total bigint;
  v_cobrado_centavos bigint;
  v_vistos text[] := '{}';
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select id into v_vendedor_id from vendedores where user_id = auth.uid();
  if v_vendedor_id is null then
    raise exception 'VENDEDOR_NO_REGISTRADO';
  end if;

  if p_monto_centavos is null or p_monto_centavos <= 0 then
    raise exception 'MONTO_INVALIDO';
  end if;

  if p_items is null or jsonb_array_length(p_items) < 1 then
    raise exception 'SIN_ITEMS';
  end if;

  select feria_id, cobrado_centavos into v_feria_actual, v_cobrado_actual
  from comprobantes where id = p_comprobante_id;
  if not found then
    raise exception 'COMPROBANTE_NO_ENCONTRADO';
  end if;

  if p_feria_id is distinct from v_feria_actual then
    raise exception 'FERIA_NO_MODIFICABLE';
  end if;

  if p_cliente_id is not null and not exists (
    select 1 from clientes where id = p_cliente_id and activo
  ) then
    raise exception 'CLIENTE_INVALIDO';
  end if;

  if p_feria_id is not null then
    select estado into v_feria_estado from ferias where id = p_feria_id;
    if v_feria_estado is null then
      raise exception 'FERIA_NO_ENCONTRADA';
    end if;
    if v_feria_estado <> 'abierta' then
      raise exception 'FERIA_CERRADA';
    end if;
  end if;

  select coalesce(sum(monto_centavos), 0) into v_cobros_total
  from cobros where comprobante_id = p_comprobante_id;

  if p_monto_centavos < (v_cobrado_actual + v_cobros_total) then
    raise exception 'MONTO_MENOR_A_COBRADO';
  end if;

  v_cobrado_centavos := coalesce(p_cobrado_centavos, v_cobrado_actual);

  if v_cobrado_centavos < 0 or v_cobrado_centavos > p_monto_centavos then
    raise exception 'COBRADO_INVALIDO';
  end if;

  if v_cobrado_centavos < p_monto_centavos and p_cliente_id is null then
    raise exception 'CREDITO_REQUIERE_CLIENTE';
  end if;

  delete from movimientos_stock where comprobante_id = p_comprobante_id;
  delete from comprobante_items where comprobante_id = p_comprobante_id;

  update comprobantes set
    vendedor_id = v_vendedor_id,
    monto_centavos = p_monto_centavos,
    medio_pago = p_medio_pago,
    imagen_path = p_imagen_path,
    fecha = coalesce(p_fecha, fecha),
    estado_ocr = coalesce(p_estado_ocr, estado_ocr),
    ocr_monto_centavos = p_ocr_monto_centavos,
    nota = p_nota,
    cliente_id = p_cliente_id,
    cobrado_centavos = v_cobrado_centavos
  where id = p_comprobante_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::int;
    v_lote_id := nullif(v_item->>'lote_id', '')::uuid;
    v_precio_unitario_centavos := nullif(v_item->>'precio_unitario_centavos', '')::bigint;

    if v_producto_id is null or v_cantidad is null or v_cantidad <= 0 then
      raise exception 'SIN_ITEMS';
    end if;

    if v_precio_unitario_centavos is not null and v_precio_unitario_centavos <= 0 then
      raise exception 'PRECIO_UNITARIO_INVALIDO';
    end if;

    if (v_producto_id::text || ':' || coalesce(v_lote_id::text, '')) = any(v_vistos) then
      raise exception 'ITEM_DUPLICADO';
    end if;
    v_vistos := array_append(v_vistos, v_producto_id::text || ':' || coalesce(v_lote_id::text, ''));

    if v_lote_id is not null then
      if not exists (select 1 from lote_items where lote_id = v_lote_id and producto_id = v_producto_id) then
        raise exception 'LOTE_INVALIDO';
      end if;

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

    insert into comprobante_items (comprobante_id, producto_id, cantidad, lote_id, precio_unitario_centavos)
    values (p_comprobante_id, v_producto_id, v_cantidad, v_lote_id, v_precio_unitario_centavos);

    insert into movimientos_stock (producto_id, tipo, cantidad, vendedor_id, comprobante_id, lote_id, nota, motivo)
    values (v_producto_id, 'egreso', v_cantidad, v_vendedor_id, p_comprobante_id, v_lote_id, null, 'venta');

    select s.stock, s.umbral_minimo, s.nombre into v_stock, v_umbral, v_nombre
    from v_stock_actual s where s.producto_id = v_producto_id;

    if v_stock < 0 and not p_permitir_negativo then
      raise exception 'STOCK_INSUFICIENTE'
        using detail = json_build_object(
          'producto', v_nombre,
          'producto_id', v_producto_id,
          'disponible', v_stock + v_cantidad
        )::text;
    end if;

    if v_stock < v_umbral then
      insert into notificaciones (tipo, titulo, detalle, referencia_id)
      values (
        'stock_bajo',
        'Stock bajo: ' || v_nombre,
        'Quedan ' || v_stock || ' unidades',
        v_producto_id
      );
      v_alertas := array_append(v_alertas, 'stock_bajo:' || v_nombre);
    end if;
  end loop;

  return json_build_object('comprobante_id', p_comprobante_id, 'alertas', v_alertas);
end;
$$;

revoke execute on function actualizar_comprobante(uuid, bigint, medio_pago, text, date, text, estado_ocr, bigint, jsonb, boolean, uuid, uuid, bigint) from anon, public;
grant execute on function actualizar_comprobante(uuid, bigint, medio_pago, text, date, text, estado_ocr, bigint, jsonb, boolean, uuid, uuid, bigint) to authenticated;

-- ============================================================
-- 4) v_margen_ventas — ver el comentario de cabecera para el algoritmo
--    completo. Columnas: origen ('comprobante' | 'revendedor'),
--    documento_id, fecha, vendedor_id, feria_id, producto_id, lote_id,
--    cantidad, costo_produccion_unitario_centavos,
--    costo_ananja_unitario_centavos, precio_unitario_venta_centavos,
--    costo_estimado, ingreso_ananja_centavos, margen_ananja_centavos,
--    margen_vendedor_centavos.
-- ============================================================

create view v_margen_ventas as
with
-- 4.1) Capacidad de cada lote disponible para el pool FIFO de "sin lote":
--      lo producido menos lo ya asignado a mano vía comprobante_items con
--      ESE lote_id (la única asignación directa que existe hoy — nunca
--      movimientos_stock/entrega_items, ver el comentario de cabecera sobre
--      por qué este pool no es el mismo que el de v_stock_por_lote).
lote_directo as (
  select lote_id, producto_id, coalesce(sum(cantidad), 0) as asignado_directo
  from comprobante_items
  where lote_id is not null
  group by lote_id, producto_id
),
lote_capacidad as (
  select
    li.lote_id,
    li.producto_id,
    l.fecha,
    l.created_at,
    greatest(li.cantidad - coalesce(ld.asignado_directo, 0), 0)::bigint as capacidad
  from lote_items li
  join lotes_produccion l on l.id = li.lote_id
  left join lote_directo ld on ld.lote_id = li.lote_id and ld.producto_id = li.producto_id
),
-- offset_previo/fin_posicion: rango de posiciones acumuladas [offset_previo,
-- fin_posicion) que ocupa este lote dentro de su producto, en orden
-- (fecha, created_at, lote_id) — el lote más viejo ocupa las posiciones más
-- bajas. Es aritmética pura (sin explotar nada): sirve para la
-- intersección de intervalos de más abajo.
lote_capacidad_off as (
  select
    lc.*,
    coalesce(sum(lc.capacidad) over (
      partition by lc.producto_id order by lc.fecha, lc.created_at, lc.lote_id
      rows between unbounded preceding and 1 preceding
    ), 0)::bigint as offset_previo
  from lote_capacidad lc
  where lc.capacidad > 0
),
lote_capacidad_rango as (
  select *, offset_previo + capacidad as fin_posicion
  from lote_capacidad_off
),
-- 4.2) Demanda "sin lote": ítems de comprobante sin lote elegido +
--      TODAS las ventas_revendedor (nunca tienen lote_id).
demanda_sin_lote as (
  select
    'comprobante'::text as origen,
    ci.comprobante_id as documento_id,
    c.fecha,
    c.created_at,
    ci.id as orden_id,
    ci.producto_id,
    ci.cantidad,
    c.vendedor_id,
    c.feria_id,
    ci.precio_unitario_centavos,
    null::bigint as precio_costo_real_centavos
  from comprobante_items ci
  join comprobantes c on c.id = ci.comprobante_id
  where ci.lote_id is null
  union all
  select
    'revendedor'::text as origen,
    vr.id as documento_id,
    vr.fecha,
    vr.created_at,
    vr.id as orden_id,
    vr.producto_id,
    vr.cantidad,
    vr.vendedor_id,
    null::uuid as feria_id,
    vr.precio_venta_centavos as precio_unitario_centavos,
    vr.precio_costo_centavos as precio_costo_real_centavos
  from ventas_revendedor vr
),
-- offset_previo: posición acumulada [offset_previo, offset_previo+cantidad)
-- que ocupa esta venta dentro de su producto, en orden (fecha, created_at,
-- orden_id) — misma idea que lote_capacidad_off, del lado de la demanda.
demanda_off as (
  select
    d.*,
    coalesce(sum(d.cantidad) over (
      partition by d.producto_id order by d.fecha, d.created_at, d.orden_id
      rows between unbounded preceding and 1 preceding
    ), 0)::bigint as offset_previo
  from demanda_sin_lote d
),
-- Freno de fecha + capacidad total conocida a la fecha de ESTA venta: como
-- lotes y demanda están ordenados por fecha, "lotes con fecha <= d.fecha"
-- es exactamente el PREFIJO de lote_capacidad_rango — su capacidad
-- acumulada (la "frontera") coincide con el límite de posición de ese
-- prefijo. Subconsulta correlacionada O(lotes por producto), NUNCA
-- O(unidades): nada de generate_series.
demanda_con_frontera as (
  select
    d.*,
    coalesce((
      select max(lcr.fin_posicion)
      from lote_capacidad_rango lcr
      where lcr.producto_id = d.producto_id and lcr.fecha <= d.fecha
    ), 0)::bigint as frontera,
    greatest(
      least(
        d.offset_previo + d.cantidad,
        coalesce((
          select max(lcr.fin_posicion)
          from lote_capacidad_rango lcr
          where lcr.producto_id = d.producto_id and lcr.fecha <= d.fecha
        ), 0)
      ) - d.offset_previo,
      0
    )::bigint as cantidad_satisfecha
  from demanda_off d
),
-- Intersección de intervalos: cuánto de la porción SATISFECHA de esta venta
-- (su rango de posición acotado por la frontera de arriba) cae dentro del
-- rango de cada lote — puede dar más de una fila si la venta cruza el
-- límite de un lote. Reemplaza la explosión unidad por unidad: mismo
-- resultado, sin iterar botella por botella.
sin_lote_resuelto as (
  select
    d.origen,
    d.documento_id,
    d.fecha,
    d.producto_id,
    lcr.lote_id,
    d.vendedor_id,
    d.feria_id,
    d.precio_unitario_centavos,
    d.precio_costo_real_centavos,
    (
      least(d.offset_previo + d.cantidad_satisfecha, lcr.fin_posicion)
      - greatest(d.offset_previo, lcr.offset_previo)
    )::int as cantidad,
    true as costo_estimado
  from demanda_con_frontera d
  join lote_capacidad_rango lcr
    on lcr.producto_id = d.producto_id
    and lcr.offset_previo < d.offset_previo + d.cantidad_satisfecha
    and lcr.fin_posicion > d.offset_previo
  where d.cantidad_satisfecha > 0
),
-- Remanente que la frontera de fecha/capacidad no alcanzó a cubrir: sin
-- lote conocido, sin costo — sigue costo_estimado = true (se intentó
-- estimar y no se pudo, mismo criterio que "sin capacidad conocida").
sin_lote_no_resuelto as (
  select
    d.origen,
    d.documento_id,
    d.fecha,
    d.producto_id,
    null::uuid as lote_id,
    d.vendedor_id,
    d.feria_id,
    d.precio_unitario_centavos,
    d.precio_costo_real_centavos,
    (d.cantidad - d.cantidad_satisfecha)::int as cantidad,
    true as costo_estimado
  from demanda_con_frontera d
  where d.cantidad - d.cantidad_satisfecha > 0
),
sin_lote_agregado as (
  select origen, documento_id, fecha, producto_id, lote_id, vendedor_id, feria_id,
    precio_unitario_centavos, precio_costo_real_centavos, cantidad, costo_estimado
  from sin_lote_resuelto
  union all
  select origen, documento_id, fecha, producto_id, lote_id, vendedor_id, feria_id,
    precio_unitario_centavos, precio_costo_real_centavos, cantidad, costo_estimado
  from sin_lote_no_resuelto
),
-- 4.3) Ventas CON lote elegido a mano — atribución directa, sin estimar.
con_lote as (
  select
    'comprobante'::text as origen,
    ci.comprobante_id as documento_id,
    c.fecha,
    ci.producto_id,
    ci.lote_id,
    c.vendedor_id,
    c.feria_id,
    ci.precio_unitario_centavos,
    null::bigint as precio_costo_real_centavos,
    ci.cantidad,
    false as costo_estimado
  from comprobante_items ci
  join comprobantes c on c.id = ci.comprobante_id
  where ci.lote_id is not null
),
todas as (
  select origen, documento_id, fecha, producto_id, lote_id, vendedor_id, feria_id,
    precio_unitario_centavos, precio_costo_real_centavos, cantidad, costo_estimado
  from con_lote
  union all
  select origen, documento_id, fecha, producto_id, lote_id, vendedor_id, feria_id,
    precio_unitario_centavos, precio_costo_real_centavos, cantidad, costo_estimado
  from sin_lote_agregado
),
-- BLOCKER corregido en review: v_costo_lote_desglose.costo_unitario_centavos/
-- .costo_ananja_centavos son 0 (NO null) cuando tiene_costos = false (un
-- lote sin lote_costos cargados) — leerlos tal cual convertía "no tengo
-- costo" en "el costo Ananja es $0", mostrando margen_ananja = 0 y
-- margen_vendedor = el precio de venta COMPLETO (como si costara $0) en vez
-- de null. Acá se los pasa por null explícitamente cuando tiene_costos es
-- false (o el lote no tiene fila, left join), así los `is not null` de más
-- abajo hacen lo correcto.
costo_seguro as (
  select
    lote_id,
    producto_id,
    case when tiene_costos then costo_unitario_centavos end as costo_produccion_unitario_centavos,
    case when tiene_costos then costo_ananja_centavos end as costo_ananja_unitario_centavos
  from v_costo_lote_desglose
)
select
  t.origen,
  t.documento_id,
  t.fecha,
  t.vendedor_id,
  t.feria_id,
  t.producto_id,
  t.lote_id,
  t.cantidad,
  d.costo_produccion_unitario_centavos,
  d.costo_ananja_unitario_centavos,
  t.precio_unitario_centavos as precio_unitario_venta_centavos,
  t.costo_estimado,
  case
    when t.origen = 'revendedor' then t.precio_costo_real_centavos * t.cantidad
    when d.costo_ananja_unitario_centavos is not null then d.costo_ananja_unitario_centavos * t.cantidad
    else null
  end as ingreso_ananja_centavos,
  case
    when d.costo_ananja_unitario_centavos is not null and d.costo_produccion_unitario_centavos is not null
      then (d.costo_ananja_unitario_centavos - d.costo_produccion_unitario_centavos) * t.cantidad
    else null
  end as margen_ananja_centavos,
  case
    when t.precio_unitario_centavos is not null and d.costo_ananja_unitario_centavos is not null
      then (t.precio_unitario_centavos - d.costo_ananja_unitario_centavos) * t.cantidad
    else null
  end as margen_vendedor_centavos
from todas t
left join costo_seguro d on d.lote_id = t.lote_id and d.producto_id = t.producto_id;

alter view v_margen_ventas set (security_invoker = true);
revoke all on v_margen_ventas from anon, public;
grant select on v_margen_ventas to authenticated;

-- ============================================================
-- 5) v_resultado_feria — margen de Ananja de las ventas de la feria contra
--    los gastos OPERATIVOS de esa feria, sin tocar v_feria_totales (se
--    reexponen sus columnas para que la UI no tenga que combinar dos
--    vistas).
--
--    `margen_ananja_centavos` es un `sum()` que ignora los `null` de
--    `v_margen_ventas` (filas sin lote conocido, ver el comentario de
--    cabecera) — sumar así, sin más, presentaría un total PARCIAL como si
--    fuera el número final. `unidades_sin_costo` expone cuántas botellas de
--    esta feria quedaron afuera de esa suma, para que la UI pueda avisar
--    "margen incompleto: N botellas sin costo" en vez de mostrar el total
--    parcial como definitivo.
--
--    BLOCKER corregido en review (segunda vuelta): `neto_ananja_centavos`
--    restaba `vft.gastos_total_centavos` COMPLETO — pero un gasto de la
--    feria cuya categoría es `es_costo_produccion = true` (Insumos, Envases
--    y etiquetas, Pedidos de producción: en la práctica esos gastos se
--    cargan contra un LOTE, no contra una feria, pero nada lo impide) ya
--    está contado adentro de `margen_ananja_centavos` (costo Ananja − costo
--    de producción, ambos de `lote_costos`) — restarlo de nuevo acá lo
--    descuenta DOS veces. Ahora el neto resta solo los gastos OPERATIVOS
--    (`es_costo_produccion = false`); `gastos_produccion_centavos` (nueva,
--    al final) expone el total de esos gastos de producción cargados a la
--    feria por separado, para que la UI pueda listarlo como "ya contado en
--    el costo de la botella" en vez de simplemente ignorarlo.
--    `gastos_total_centavos`/`neto_centavos` (de `v_feria_totales`) NO
--    cambian de significado — siguen siendo el total crudo de siempre.
-- ============================================================

create view v_resultado_feria as
select
  vft.feria_id,
  vft.ventas_efectivo_centavos,
  vft.ventas_mercado_pago_centavos,
  vft.ventas_banco_centavos,
  vft.ventas_total_centavos,
  vft.cantidad_ventas,
  vft.gastos_total_centavos,
  vft.neto_centavos,
  coalesce(mv.margen_ananja_centavos, 0) as margen_ananja_centavos,
  coalesce(mv.margen_ananja_centavos, 0) - coalesce(gf.gastos_operativos_centavos, 0) as neto_ananja_centavos,
  coalesce(mv.unidades_sin_costo, 0) as unidades_sin_costo,
  coalesce(gf.gastos_produccion_centavos, 0) as gastos_produccion_centavos
from v_feria_totales vft
left join (
  select
    feria_id,
    sum(margen_ananja_centavos) as margen_ananja_centavos,
    sum(cantidad) filter (where margen_ananja_centavos is null) as unidades_sin_costo
  from v_margen_ventas
  where feria_id is not null
  group by feria_id
) mv on mv.feria_id = vft.feria_id
left join (
  select
    g.feria_id,
    sum(g.monto_centavos) filter (where not cg.es_costo_produccion) as gastos_operativos_centavos,
    sum(g.monto_centavos) filter (where cg.es_costo_produccion) as gastos_produccion_centavos
  from gastos g
  join categorias_gasto cg on cg.id = g.categoria_id
  where g.feria_id is not null
  group by g.feria_id
) gf on gf.feria_id = vft.feria_id;

alter view v_resultado_feria set (security_invoker = true);
revoke all on v_resultado_feria from anon, public;
grant select on v_resultado_feria to authenticated;
