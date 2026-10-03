-- Ananja: costo real por lote — segunda vuelta, contra la planilla del
-- dueño. Corrige 4 cosas de 0028_costos_por_lote.sql que
-- no reflejaban el modelo real y agrega 3 conceptos que faltaban.
--
-- Supuestos de la planilla (dólar por lote, IVA 21%): ver el reporte de esta
-- migración para la reproducción completa botella por botella.
--
-- Alcance:
--  1. Márgenes ENCADENADOS: minorista se calcula sobre el mayorista
--     sugerido, no sobre costo Ananja. Defaults de lotes_produccion:
--     mayorista_pct 15 (antes 20), minorista_pct 40 (antes 60); backfill de
--     los lotes que quedaron con el auto-fill viejo (20/60 exactos, nunca
--     tocados a mano).
--  2. IVA: Ananja es MONOTRIBUTO — el IVA de envase/etiqueta NO es
--     recuperable, es parte del costo (el aceite no tiene factura/IVA).
--     `lotes_produccion.iva_pct` (default 21) + `precios_incluyen_iva`
--     **default TRUE** — el default SEGURO es "el precio de p_costos se usa
--     tal cual, sin tocarlo": la UI HOY DEPLOYADA nunca manda campos de IVA,
--     así que si el default fuera `false` (gross-up automático) le
--     inflaría un 21% a CADA precio que cualquier UI vieja ya está mandando
--     sin saberlo (repro: envase neto 100.000 -> 121.000 sin que nadie lo
--     haya pedido). Recién cuando la UI nueva mande explícitamente
--     `precios_incluyen_iva: false` + `iva_pct` (el usuario dice "cargo los
--     precios SIN IVA") es que `aplicar_costos_lote` suma el IVA. Tanto
--     `crear_lote` como `fijar_costos_lote` solo tocan `iva_pct`/
--     `precios_incluyen_iva` en `lotes_produccion` cuando `p_costos` los
--     trae explícitamente — si no vienen, se conserva lo que el lote ya
--     tenía (o el default `true`/`21` para un lote nuevo sin lote anterior).
--  3. Transporte: además del monto fijo repartido por volumen (como hoy),
--     se admite `transporte_pct` (lotes_produccion + p_costos), aplicado
--     sobre (aceite + envase CON IVA) de CADA presentación — línea directa,
--     no compartida. `p_costos` con los dos a la vez es error
--     (TRANSPORTE_AMBIGUO).
--  4. Etiquetas FRENTE + REVERSO por separado: `p_costos.etiquetas` es una
--     lista `[{insumo_id, precio_unitario_centavos, envio_unitario_centavos}]`
--     — una fila de `lote_costos` por (presentación, insumo de etiqueta),
--     cantidad resuelta sola desde `recetas` (cada producto tiene 2 recetas
--     de etiqueta: frente y retro). Se seguye aceptando el `precio_etiqueta_centavos`
--     viejo (escalar) como fallback: se aplica a TODOS los insumos de
--     etiqueta usados por los productos del lote, con envío 0 — ver el
--     comentario de `aplicar_costos_lote`.
--  5. Aceite desde el "tanque": si `p_costos` no trae
--     `precio_litro_aceite_centavos`, se deriva el costo por litro del
--     insumo de aceite de cada presentación (vía su receta) desde
--     `v_tanque_aceite` (promedio ponderado de TODAS sus compras); sin
--     compras, esa línea simplemente no se carga (no falla).
--  6. `movimientos_stock.motivo` — para separar salidas que NO son venta
--     (degustación/rotura/regalo/ajuste/otro) de las ventas reales.
--     `crear_comprobante`/`actualizar_comprobante`/`registrar_entrega_revendedor`
--     (tipo 'entrega') marcan sus egresos como 'venta'; el resto (ajustes
--     manuales, altas de stock fuera de lote) puede cargar cualquier otro
--     motivo desde el cliente, insert directo — RLS sin cambios.
--  7. Vistas nuevas: `v_tanque_aceite`, `v_perdidas_lote`, `v_cobranza_lote`.
--     `v_costo_lote_desglose` recreada con el margen encadenado.
--
-- Migración templada (__SCHEMA__, sin __BUCKET__). Ver supabase/README.md.

-- ============================================================
-- 1) lotes_produccion — IVA, transporte %, márgenes encadenados.
-- ============================================================

alter table lotes_produccion
  add column iva_pct numeric not null default 21 check (iva_pct >= 0),
  -- default TRUE a propósito — ver el punto 2 del comentario de arriba:
  -- "usar el precio tal cual" es el comportamiento SEGURO para todo lote ya
  -- existente y para cualquier caller (UI vieja incluida) que no sepa nada
  -- de IVA todavía.
  add column precios_incluyen_iva boolean not null default true,
  add column transporte_pct numeric check (transporte_pct >= 0);

-- Márgenes encadenados (ver v_costo_lote_desglose más abajo): el default de
-- "sugerencia sin elegir nada" pasa de mayorista +20%/minorista +60% (los
-- dos sobre costo Ananja) a mayorista +15%/minorista +40% (minorista ahora
-- ENCADENADO sobre el mayorista sugerido, no sobre costo Ananja).
alter table lotes_produccion alter column mayorista_pct set default 15;
alter table lotes_produccion alter column minorista_pct set default 40;

-- Backfill: los únicos lotes que quedan en el auto-fill viejo EXACTO
-- (20/60, nunca elegido a mano — cualquier lote donde el dueño haya tocado
-- alguno de los dos ya no calza con esta condición) pasan al nuevo default.
update lotes_produccion set mayorista_pct = 15, minorista_pct = 40
where mayorista_pct = 20 and minorista_pct = 60;

-- ============================================================
-- 2) lote_costos — insumo_id (qué insumo de etiqueta/aceite generó la
--    línea, para el desglose y v_tanque_aceite), neto_centavos/envio_centavos
--    (detalle de IVA/envío por unidad, ver aplicar_costos_lote). El check de
--    (concepto, producto_id) se relaja: transporte ahora puede ser directo
--    por presentación (modo %) o compartido (modo monto fijo, como hoy) —
--    'otro' sigue siendo siempre compartido.
-- ============================================================

alter table lote_costos
  add column insumo_id uuid references insumos(id),
  add column neto_centavos bigint,
  add column envio_centavos bigint;

create index idx_lote_costos_insumo_id on lote_costos(insumo_id);

alter table lote_costos drop constraint lote_costos_check;
alter table lote_costos add constraint lote_costos_check check (
  (concepto in ('aceite', 'etiqueta', 'envase') and producto_id is not null)
  or (concepto = 'transporte')
  or (concepto = 'otro' and producto_id is null)
);

-- ============================================================
-- 3) movimientos_stock.motivo — null = legado/desconocido (no rompe nada
--    de lo que ya existe). Las RPCs de venta (crear_comprobante,
--    actualizar_comprobante, registrar_entrega_revendedor tipo 'entrega')
--    lo fijan en 'venta' explícitamente (ver más abajo); el resto de
--    egresos (insert directo del cliente, mismo camino de siempre) puede
--    elegir cualquier otro valor, o dejarlo null.
-- ============================================================

alter table movimientos_stock
  add column motivo text check (motivo in ('venta', 'degustacion', 'rotura', 'regalo', 'ajuste', 'otro'));

-- ============================================================
-- 4) v_tanque_aceite — por insumo de materia prima (aceite, en Ananja):
--    litros comprados (ingresos con gasto_id, es decir compras reales —
--    un ajuste manual sin gasto no es una "compra"), litros consumidos
--    (todos los egresos), litros restantes (stock real, igual criterio que
--    v_stock_insumos: TODOS los ingresos menos TODOS los egresos, compras o
--    no), costo promedio ponderado por litro (Σ monto / Σ cantidad, SOLO
--    sobre las compras — son las únicas con costo real) y valor restante
--    (litros restantes × costo promedio). Sin ninguna compra, costo
--    promedio y valor restante quedan en null — aplicar_costos_lote no
--    carga la línea de aceite (no falla).
--
--    (Revisión: una versión anterior tenía acá un fallback de "última
--    compra" para cuando el promedio ponderado no estuviera disponible —
--    era código muerto, porque usa el MISMO predicado que "compras"
--    (ingreso con gasto_id), así que si existe una última compra también
--    existe al menos una fila en "compras" y el promedio ponderado ya
--    sale por esa rama. Se eliminó en vez de simularlo.)
-- ============================================================

create view v_tanque_aceite as
with compras as (
  select
    m.insumo_id,
    sum(m.cantidad) as litros_comprados,
    sum(g.monto_centavos) as costo_total_centavos
  from movimientos_insumo m
  join gastos g on g.id = m.gasto_id
  where m.tipo = 'ingreso' and m.gasto_id is not null
  group by m.insumo_id
),
movimientos as (
  select
    insumo_id,
    coalesce(sum(case when tipo = 'ingreso' then cantidad else 0 end), 0) as litros_ingresados,
    coalesce(sum(case when tipo = 'egreso' then cantidad else 0 end), 0) as litros_consumidos
  from movimientos_insumo
  group by insumo_id
)
select
  i.id as insumo_id,
  i.nombre,
  coalesce(c.litros_comprados, 0) as litros_comprados,
  coalesce(mv.litros_consumidos, 0) as litros_consumidos,
  coalesce(mv.litros_ingresados, 0) - coalesce(mv.litros_consumidos, 0) as litros_restantes,
  case when coalesce(c.litros_comprados, 0) > 0
    then round(c.costo_total_centavos::numeric / c.litros_comprados)
    else null
  end as costo_promedio_centavos_por_litro,
  case when coalesce(c.litros_comprados, 0) > 0
    then round((coalesce(mv.litros_ingresados, 0) - coalesce(mv.litros_consumidos, 0)) * (c.costo_total_centavos::numeric / c.litros_comprados))
    else null
  end as valor_restante_centavos
from insumos i
left join compras c on c.insumo_id = i.id
left join movimientos mv on mv.insumo_id = i.id
where i.tipo = 'materia_prima';

alter view v_tanque_aceite set (security_invoker = true);
revoke all on v_tanque_aceite from anon, public;
grant select on v_tanque_aceite to authenticated;

-- ============================================================
-- 5) __SCHEMA__.aplicar_costos_lote — reescrita. Mismo rol (helper privado
--    compartido por crear_lote/fijar_costos_lote, delete+insert completo de
--    lote_costos), contrato de p_costos ampliado:
--
--      {
--        "precio_litro_aceite_centavos": int|null,
--        "etiquetas": [{ "insumo_id": uuid, "precio_unitario_centavos": int, "envio_unitario_centavos": int|null }],
--        "precio_etiqueta_centavos": int|null,   -- FALLBACK viejo (0028): si
--          "etiquetas" viene vacía/ausente y este campo tiene valor, se
--          aplica ese precio a TODOS los insumos tipo 'etiqueta' usados por
--          los productos del lote (envío 0) — mismo criterio "1 por
--          botella" de antes, ahora una fila por insumo en vez de una sola
--          fila agregada.
--        "envases": [{ "producto_id": uuid, "precio_unitario_centavos": int }],
--        "transporte_pct": numeric|null,    -- % sobre (aceite + envase CON
--          IVA) de CADA presentación — línea DIRECTA (no compartida).
--        "transporte_centavos": int|null,   -- monto fijo, compartido por
--          volumen, como en 0028. Los dos a la vez: TRANSPORTE_AMBIGUO.
--        "otros_centavos": int|null,
--        "otros_descripcion": text|null,
--        "ganancia_pct": numeric|null,
--        "mayorista_pct": numeric|null,
--        "minorista_pct": numeric|null,
--        "iva_pct": numeric|null,
--        "precios_incluyen_iva": boolean|null,
--        "transporte_pct_lote": -- no existe: transporte_pct de arriba SE
--          PERSISTE en lotes_produccion.transporte_pct cuando viene en
--          p_costos (mismo criterio que ganancia_pct) — no hace falta un
--          campo separado.
--      }
--
--    IVA (rule 2): con precios_incluyen_iva = false (default), los precios
--    de ENVASE y ETIQUETA (no el envío, no el aceite) llegan en NETO y acá
--    se guardan grossed-up por iva_pct; con precios_incluyen_iva = true se
--    guardan tal cual. `neto_centavos`/`envio_centavos` quedan en la fila
--    para que la UI arme el desglose ("sin IVA $X + IVA 21%") sin tener que
--    volver a des-gross-earlo.
--
--    Todos los campos de costos son opcionales, mismo criterio que 0028:
--    solo se cargan/reemplazan los conceptos presentes.
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
  v_precio_litro_global bigint;
  v_precio_litro_item bigint;
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

  select iva_pct, precios_incluyen_iva into v_iva_pct, v_incluye_iva
  from lotes_produccion where id = p_lote_id;

  delete from lote_costos where lote_id = p_lote_id;

  -- Aceite: litros = presentacion_ml / 1000 × cantidad, automático por
  -- presentación. Precio: el de p_costos si vino (aplica a TODAS las
  -- presentaciones, como en 0028); si no, se deriva de v_tanque_aceite del
  -- insumo de materia_prima de CADA presentación (por su receta) —
  -- promedio ponderado de sus compras (v_tanque_aceite). Sin precio (ni
  -- cargado ni derivable, sin compras), esa presentación se queda sin
  -- línea de aceite, no falla. se_paga = false (ya se pagó al comprar a
  -- granel).
  v_precio_litro_global := nullif(p_costos->>'precio_litro_aceite_centavos', '')::bigint;
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
      insert into lote_costos (lote_id, producto_id, concepto, cantidad, costo_unitario_centavos, total_centavos, se_paga)
      values (p_lote_id, v_item.producto_id, 'aceite', v_litros, v_precio_litro_item, v_monto, false);
    end if;
  end loop;

  -- Etiquetas: una fila de lote_costos por (presentación, insumo de
  -- etiqueta) — cantidad = recetas.cantidad (de ESE insumo puntual) ×
  -- cantidad del ítem. costo_unitario_centavos = precio grossed-up por IVA
  -- (rule 2) + envío (el envío NUNCA lleva IVA). Fallback legado: sin
  -- "etiquetas" pero con "precio_etiqueta_centavos", se sintetiza una
  -- lista con ese precio para TODOS los insumos tipo 'etiqueta' que usen
  -- los productos de este lote, envío 0 — mismo resultado total que 0028,
  -- ahora en filas separadas por insumo.
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
  -- (rule 2) igual que etiqueta.
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
  -- línea COMPARTIDA por volumen, igual que 0028.
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
-- 6.1) crear_lote — misma firma exacta que 0028
--      (date, text, jsonb, boolean, jsonb): create or replace alcanza, sin
--      drop. Gana la resolución de iva_pct/precios_incluyen_iva/
--      transporte_pct con el MISMO criterio que ganancia_pct/mayorista_pct/
--      minorista_pct: si p_costos los trae, se usan; si no, se heredan del
--      lote más reciente; sin ningún lote todavía, default de columna.
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
  -- transporte_pct: si p_costos los trae, se usan tal cual; si no, se
  -- heredan del lote MÁS RECIENTE que ya exista; si todavía no hay ningún
  -- lote, quedan en los defaults de la columna (30/15/40/21/true/null —
  -- `precios_incluyen_iva = true` es el default SEGURO, ver el comentario
  -- del punto 2 al inicio del archivo).
  if p_costos is not null then
    v_ganancia_pct := nullif(p_costos->>'ganancia_pct', '')::numeric;
    v_mayorista_pct := nullif(p_costos->>'mayorista_pct', '')::numeric;
    v_minorista_pct := nullif(p_costos->>'minorista_pct', '')::numeric;
    v_iva_pct := nullif(p_costos->>'iva_pct', '')::numeric;
    v_incluye_iva := nullif(p_costos->>'precios_incluyen_iva', '')::boolean;
    v_transporte_pct := nullif(p_costos->>'transporte_pct', '')::numeric;
  end if;

  if v_ganancia_pct is null or v_mayorista_pct is null or v_minorista_pct is null
     or v_iva_pct is null or v_incluye_iva is null or v_transporte_pct is null then
    select
      coalesce(v_ganancia_pct, l.ganancia_pct),
      coalesce(v_mayorista_pct, l.mayorista_pct),
      coalesce(v_minorista_pct, l.minorista_pct),
      coalesce(v_iva_pct, l.iva_pct),
      coalesce(v_incluye_iva, l.precios_incluyen_iva),
      coalesce(v_transporte_pct, l.transporte_pct)
      into v_ganancia_pct, v_mayorista_pct, v_minorista_pct, v_iva_pct, v_incluye_iva, v_transporte_pct
    from lotes_produccion l
    order by l.fecha desc, l.created_at desc
    limit 1;
  end if;

  insert into lotes_produccion (
    fecha, nota, vendedor_id, ganancia_pct, mayorista_pct, minorista_pct,
    iva_pct, precios_incluyen_iva, transporte_pct
  )
  values (
    coalesce(p_fecha, current_date), p_nota, v_vendedor_id,
    coalesce(v_ganancia_pct, 30), coalesce(v_mayorista_pct, 15), coalesce(v_minorista_pct, 40),
    coalesce(v_iva_pct, 21), coalesce(v_incluye_iva, true), v_transporte_pct
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
-- 6.2) fijar_costos_lote — misma firma que 0028. Gana la misma resolución
--      de iva_pct/precios_incluyen_iva/transporte_pct que ganancia_pct: a
--      diferencia de crear_lote, acá "ausente" significa "dejar el valor
--      que el lote ya tiene", no heredar de otro lote. El chequeo
--      prospectivo de COSTOS_MENORES_A_PAGADO se actualiza para incluir el
--      transporte % (recién se puede calcular después de aplicar, así que
--      se aproxima con la MISMA fórmula que aplicar_costos_lote usaría,
--      sobre los envases nuevos + costos de aceite YA vigentes del lote —
--      ver comentario en el cuerpo).
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
  -- pagado supera el neto sin IVA (BLOCKER corregido en review). "Efectivo"
  -- = lo que p_costos trae, o si no lo trae, lo que el lote YA tiene (mismo
  -- criterio de "solo cambiar si viene" que se aplica al UPDATE de abajo).
  v_iva_pct_efectivo := coalesce(nullif(p_costos->>'iva_pct', '')::numeric, v_iva_pct_actual);
  v_incluye_iva_efectivo :=
    coalesce(nullif(p_costos->>'precios_incluyen_iva', '')::boolean, v_incluye_iva_actual);
  v_transporte_pct_efectivo := coalesce(v_transporte_pct, v_transporte_pct_actual);

  select coalesce(sum(monto_centavos), 0) into v_pagado_centavos
  from gastos where lote_id = p_lote_id and concepto_lote = 'pago';

  -- Envases nuevos, grossed-up igual que aplicar_costos_lote (rule 2).
  -- Transporte: fijo tal cual, o % sobre (aceite YA vigente del lote +
  -- envase nuevo, ambos con IVA) — aproxima con el aceite ACTUAL porque
  -- recién se conoce el definitivo dentro de aplicar_costos_lote (podría
  -- cambiar si p_costos trae un precio de aceite nuevo, o si se deriva del
  -- tanque y el tanque cambió desde la última vez — caso raro, documentado
  -- acá a propósito).
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

  if v_ganancia_pct is not null or v_mayorista_pct is not null or v_minorista_pct is not null
     or v_iva_pct is not null or v_incluye_iva is not null or v_transporte_pct is not null then
    update lotes_produccion set
      ganancia_pct = coalesce(v_ganancia_pct, ganancia_pct),
      mayorista_pct = coalesce(v_mayorista_pct, mayorista_pct),
      minorista_pct = coalesce(v_minorista_pct, minorista_pct),
      iva_pct = coalesce(v_iva_pct, iva_pct),
      precios_incluyen_iva = coalesce(v_incluye_iva, precios_incluyen_iva),
      transporte_pct = coalesce(v_transporte_pct, transporte_pct)
    where id = p_lote_id;
  end if;

  perform __SCHEMA__.aplicar_costos_lote(p_lote_id, p_costos);

  return json_build_object('lote_id', p_lote_id);
end;
$$;

revoke execute on function fijar_costos_lote(uuid, jsonb) from anon, public;
grant execute on function fijar_costos_lote(uuid, jsonb) to authenticated;

-- ============================================================
-- 7) crear_comprobante / actualizar_comprobante / registrar_entrega_revendedor
--    — MISMAS firmas que 0028: create or replace alcanza. Único cambio:
--    los egresos de venta (comprobante, y entrega tipo 'entrega') se
--    graban con motivo = 'venta' — así v_cobranza_lote/v_perdidas_lote
--    pueden distinguirlos de degustación/rotura/regalo/ajuste (que se
--    cargan aparte, insert directo del cliente sobre movimientos_stock, sin
--    pasar por estas RPCs). Devoluciones (ingreso) no llevan motivo: no son
--    una salida.
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

    if v_producto_id is null or v_cantidad is null or v_cantidad <= 0 then
      raise exception 'SIN_ITEMS';
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

    insert into comprobante_items (comprobante_id, producto_id, cantidad, lote_id)
    values (v_comprobante_id, v_producto_id, v_cantidad, v_lote_id);

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

    if v_producto_id is null or v_cantidad is null or v_cantidad <= 0 then
      raise exception 'SIN_ITEMS';
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

    insert into comprobante_items (comprobante_id, producto_id, cantidad, lote_id)
    values (p_comprobante_id, v_producto_id, v_cantidad, v_lote_id);

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

create or replace function registrar_entrega_revendedor(
  p_vendedor_id uuid,
  p_tipo text,
  p_fecha date,
  p_nota text default null,
  p_items jsonb default '[]'::jsonb,
  p_permitir_negativo boolean default false
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_admin_id uuid;
  v_entrega_id uuid;
  v_item jsonb;
  v_producto_id uuid;
  v_cantidad int;
  v_lote_id uuid;
  v_quedan int;
  v_stock int;
  v_nombre text;
  v_en_poder int;
  v_tipo_movimiento tipo_movimiento;
  v_motivo text;
  v_vistos text[] := '{}';
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

  if p_tipo not in ('entrega', 'devolucion') then
    raise exception 'TIPO_INVALIDO';
  end if;

  if p_items is null or jsonb_array_length(p_items) < 1 then
    raise exception 'SIN_ITEMS';
  end if;

  insert into entregas_revendedor (vendedor_id, tipo, fecha, nota, admin_id)
  values (p_vendedor_id, p_tipo, coalesce(p_fecha, current_date), p_nota, v_admin_id)
  returning id into v_entrega_id;

  v_tipo_movimiento := case when p_tipo = 'entrega' then 'egreso' else 'ingreso' end;
  -- Una entrega a un revendedor cuenta como venta a efectos de v_cobranza_lote
  -- (el revendedor le debe a Ananja el costo Ananja de lo que se llevó,
  -- igual que un admin que vende directo); una devolución (ingreso) no
  -- lleva motivo, no es una salida.
  v_motivo := case when p_tipo = 'entrega' then 'venta' else null end;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::int;
    v_lote_id := nullif(v_item->>'lote_id', '')::uuid;

    if v_producto_id is null or v_cantidad is null or v_cantidad <= 0 then
      raise exception 'SIN_ITEMS';
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

    insert into entrega_items (entrega_id, producto_id, cantidad, lote_id)
    values (v_entrega_id, v_producto_id, v_cantidad, v_lote_id);

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

revoke execute on function registrar_entrega_revendedor(uuid, text, date, text, jsonb, boolean) from anon, public;
grant execute on function registrar_entrega_revendedor(uuid, text, date, text, jsonb, boolean) to authenticated;

-- ============================================================
-- 8) v_costo_lote_desglose — recreada SOLO por el margen encadenado
--    (precio_minorista_sugerido_centavos ahora sobre el mayorista sugerido,
--    no sobre costo Ananja). Mismas columnas y mismo orden que 0028 —
--    create or replace alcanza.
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
-- "Costo Ananja" = lo que cualquier vendedor le debe a la empresa por
-- botella. Márgenes ENCADENADOS: mayorista sugerido sobre costo Ananja;
-- minorista sugerido sobre el MAYORISTA sugerido (no sobre costo Ananja) —
-- refleja la cadena real costo → distribuidor (+ganancia%) → mayorista
-- (+mayorista%) → minorista (+minorista%) de la planilla del dueño.
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
  created_at
from con_mayorista;

alter view v_costo_lote_desglose set (security_invoker = true);
revoke all on v_costo_lote_desglose from anon, public;
grant select on v_costo_lote_desglose to authenticated;

-- ============================================================
-- 9) v_perdidas_lote — unidades por lote+producto con motivo distinto de
--    'venta' (degustación/rotura/regalo/ajuste/otro — NUNCA 'venta', y los
--    egresos con motivo null (legado) tampoco cuentan acá: no sabemos si
--    fueron venta o no, así que no se les puede llamar "pérdida"),
--    valuadas al costo_unitario_centavos de ESE lote/presentación
--    (v_costo_lote_desglose). Estas unidades NO deben contarse como
--    vendidas — ver v_cobranza_lote.
-- ============================================================

create view v_perdidas_lote as
select
  m.lote_id,
  m.producto_id,
  m.motivo,
  sum(m.cantidad) as unidades,
  coalesce(d.costo_unitario_centavos, 0) as costo_unitario_centavos,
  sum(m.cantidad) * coalesce(d.costo_unitario_centavos, 0) as costo_total_centavos
from movimientos_stock m
left join v_costo_lote_desglose d on d.lote_id = m.lote_id and d.producto_id = m.producto_id
where m.tipo = 'egreso' and m.lote_id is not null and m.motivo is not null and m.motivo <> 'venta'
group by m.lote_id, m.producto_id, m.motivo, d.costo_unitario_centavos;

alter view v_perdidas_lote set (security_invoker = true);
revoke all on v_perdidas_lote from anon, public;
grant select on v_perdidas_lote to authenticated;

-- ============================================================
-- 10) v_cobranza_lote — por (lote, producto): producidas, vendidas
--     (egresos motivo = 'venta', que son SIEMPRE los de comprobantes/
--     entregas — ver el punto 7 — NETOS de sus devoluciones: una entrega a
--     revendedor devuelta parcialmente ya no es una venta completa, mismo
--     criterio que `v_stock_por_lote.devoluciones_lote`; BLOCKER corregido
--     en review: sin netear, producidas − vendidas − perdidas ≠
--     en_depósito), perdidas (Σ v_perdidas_lote), en_deposito (lo que queda
--     sin vender ni perder = v_stock_por_lote.quedan, mismo criterio que
--     esa vista — la invariante producidas − vendidas − perdidas =
--     en_depósito se sostiene porque las tres cuentan movimientos_stock con
--     el mismo criterio de "neto de devoluciones"). esperado_total_centavos
--     = costo Ananja × (producidas − perdidas) — lo que la empresa espera
--     cobrar en total de este lote una vez que se venda/entregue todo lo
--     que no se perdió; esperado_por_vendidas_centavos = costo Ananja ×
--     vendidas (ya neta) — lo que ya debería haberse cobrado por lo que
--     efectivamente sigue afuera como venta. Lo YA cobrado depende del
--     rediseño de Plata — no se inventa acá.
-- ============================================================

create view v_cobranza_lote as
with vendidas_brutas as (
  select lote_id, producto_id, sum(cantidad) as unidades
  from movimientos_stock
  where tipo = 'egreso' and lote_id is not null and motivo = 'venta'
  group by lote_id, producto_id
),
-- Una entrega a revendedor cuenta como venta (egreso motivo 'venta'), pero
-- una devolución posterior de ESA entrega (ingreso, entrega_id no nulo) la
-- revierte — sin netearla, "vendidas" queda inflado y la invariante
-- producidas − vendidas − perdidas = en_depósito se rompe (BLOCKER
-- corregido en review; repro: 100 producidas, entrega 30, devolución 10 ->
-- vendidas tiene que quedar en 20, no 30). Mismo criterio que
-- `devoluciones_lote` de v_stock_por_lote.
devoluciones as (
  select lote_id, producto_id, sum(cantidad) as unidades
  from movimientos_stock
  where tipo = 'ingreso' and lote_id is not null and entrega_id is not null
  group by lote_id, producto_id
),
perdidas as (
  select lote_id, producto_id, sum(unidades) as unidades
  from v_perdidas_lote
  group by lote_id, producto_id
)
select
  d.lote_id,
  d.producto_id,
  d.producto_nombre,
  d.presentacion_ml,
  d.cantidad as producidas,
  greatest(coalesce(vb.unidades, 0) - coalesce(dv.unidades, 0), 0) as vendidas,
  coalesce(p.unidades, 0) as perdidas,
  coalesce(sp.quedan, 0) as en_deposito,
  d.costo_ananja_centavos,
  d.costo_ananja_centavos * (d.cantidad - coalesce(p.unidades, 0)) as esperado_total_centavos,
  d.costo_ananja_centavos * greatest(coalesce(vb.unidades, 0) - coalesce(dv.unidades, 0), 0)
    as esperado_por_vendidas_centavos
from v_costo_lote_desglose d
left join vendidas_brutas vb on vb.lote_id = d.lote_id and vb.producto_id = d.producto_id
left join devoluciones dv on dv.lote_id = d.lote_id and dv.producto_id = d.producto_id
left join perdidas p on p.lote_id = d.lote_id and p.producto_id = d.producto_id
left join v_stock_por_lote sp on sp.lote_id = d.lote_id and sp.producto_id = d.producto_id;

alter view v_cobranza_lote set (security_invoker = true);
revoke all on v_cobranza_lote from anon, public;
grant select on v_cobranza_lote to authenticated;
