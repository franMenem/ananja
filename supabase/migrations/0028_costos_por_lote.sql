-- Ananja: costo real por lote (aceite/etiqueta/envase/transporte/otros) +
-- pago diferido del pedido + stock explícito por lote.
--
-- Reemplaza el modelo de "cada gasto del lote es un pago inmediato" por el
-- flujo real del dueño: el pedido al proveedor se paga DESPUÉS, a veces en
-- varias partes y con medios distintos ("parte Mercado Pago, parte
-- efectivo"). Por eso separamos dos cosas que antes vivían juntas en
-- `gastos`:
--
--  A) `lote_costos` — CUÁNTO cuesta este lote (aceite/etiqueta/envase/
--     transporte/otros), imputado en el momento de cargar el lote. No es
--     un movimiento de caja: aceite/etiqueta ya se pagaron al comprar a
--     granel (`se_paga = false`); envase/transporte/otros SÍ se deben
--     todavía (`se_paga = true`) hasta que se registre el pago real.
--  B) `gastos` (vía `registrar_pago_lote`, `concepto_lote = 'pago'`) —
--     CUÁNDO sale la plata de la caja, en el/los medios de pago reales.
--     `v_saldo_lote` compara A vs B para saber cuánto falta pagar.
--
-- Alcance:
--  1. `gastos.concepto_lote` ('pago' | null) + tabla `lote_costos`.
--  2. `comprobante_items.lote_id` / `entrega_items.lote_id` (venta/entrega
--     desde una presentación de un lote concreto, elegido a mano —
--     stock por lote es explícito, no FIFO).
--  3. Se deja de trackear stock de envases: se borran las `recetas` de
--     insumos tipo 'envase' (Ananja ya no los consume por receta).
--  4. Categoría de gasto "Pedidos de producción" (pagos de lote).
--  5. `__SCHEMA__.aplicar_costos_lote`: helper privado compartido por
--     `crear_lote` y `fijar_costos_lote`.
--  6. `crear_lote` (gana `p_costos` jsonb), `fijar_costos_lote` (nueva,
--     completa/edita costos de un lote existente), `registrar_pago_lote`
--     (nueva, registra el pago real de un lote, en una o varias partes).
--  7. `crear_comprobante` / `actualizar_comprobante` / `registrar_entrega_revendedor`:
--     cada ítem admite un `lote_id` opcional (venta/entrega desde un lote
--     concreto), con las mismas firmas de siempre (el campo va DENTRO de
--     cada ítem del jsonb, no es un parámetro nuevo).
--  8. Vistas: `v_costo_lote_item`/`v_costo_lote` (recalculadas para sumar
--     `lote_costos`), `v_costo_lote_desglose` (nueva, desglose por
--     concepto + precio sugerido a partir del costo real), `v_saldo_lote`
--     (nueva), `v_stock_por_lote` (nueva, explícito + fallback FIFO para
--     salidas sin lote asignado).
--
-- Migración templada (__SCHEMA__, sin __BUCKET__). Ver supabase/README.md.

-- ============================================================
-- 0) lotes_produccion.ganancia_pct / mayorista_pct / minorista_pct —
--    LA CALCULADORA DE PRECIOS SE RETIRA como fuente de estos porcentajes.
--    Filosofía del negocio: el costo real de producción YA incluye la
--    ganancia de la empresa en el momento en que se lo cobra a un
--    vendedor (admin o revendedor) — "costo Ananja" = costo real × (1 +
--    ganancia%). Mayorista/minorista son apenas sugerencias de reventa
--    sobre ESE costo Ananja, no sobre el costo real (ver
--    v_costo_lote_desglose más abajo, que ya no lee versiones_precio en
--    absoluto). Los tres porcentajes viven POR LOTE, no globales — cada
--    pedido puede ajustar su propio margen.
-- ============================================================

alter table lotes_produccion
  add column ganancia_pct numeric not null default 30 check (ganancia_pct >= 0),
  add column mayorista_pct numeric not null default 20 check (mayorista_pct >= 0),
  add column minorista_pct numeric not null default 60 check (minorista_pct >= 0);

-- Backfill de lotes ya existentes: si hay una versión de precios vigente
-- (la más reciente por fecha/created_at), se usan sus ganancia_pct/
-- mayorista_pct — mismo criterio que venía usando la planilla hasta
-- ahora. minorista_pct no tiene equivalente en versiones_precio (ahí el
-- precio minorista se cargaba en centavos, no como %), así que los lotes
-- existentes quedan con el default (60).
do $$
declare
  v_ganancia_pct numeric;
  v_mayorista_pct numeric;
begin
  select ganancia_pct, mayorista_pct into v_ganancia_pct, v_mayorista_pct
  from versiones_precio
  order by fecha desc, created_at desc
  limit 1;

  if v_ganancia_pct is not null then
    update lotes_produccion
    set ganancia_pct = v_ganancia_pct,
        mayorista_pct = coalesce(v_mayorista_pct, mayorista_pct);
  end if;
end $$;

-- ============================================================
-- 1) gastos.concepto_lote + lote_costos
-- ============================================================

alter table gastos add column concepto_lote text check (concepto_lote in ('pago'));

create index idx_gastos_lote_concepto on gastos(lote_id, concepto_lote) where lote_id is not null;

-- Un renglón de costo de un lote. `producto_id` null = compartido entre
-- todas las presentaciones del lote (transporte/otros), repartido por
-- volumen (presentacion_ml × cantidad) igual que hoy `v_costo_lote_item`;
-- no null = directo a esa presentación (aceite/etiqueta/envase, siempre
-- calculables por presentación). `se_paga` distingue lo ya pagado al
-- comprar a granel (aceite/etiqueta) de lo que todavía se debe por este
-- pedido (envase/transporte/otros) — ver `v_saldo_lote`.
create table lote_costos (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references lotes_produccion(id) on delete cascade,
  producto_id uuid references productos(id),
  concepto text not null check (concepto in ('aceite', 'etiqueta', 'envase', 'transporte', 'otro')),
  descripcion text,
  cantidad numeric(12,3),
  costo_unitario_centavos bigint,
  total_centavos bigint not null check (total_centavos >= 0),
  se_paga boolean not null,
  created_at timestamptz not null default now(),
  check (
    (concepto in ('aceite', 'etiqueta', 'envase') and producto_id is not null)
    or (concepto in ('transporte', 'otro') and producto_id is null)
  ),
  check (
    (concepto in ('aceite', 'etiqueta') and not se_paga)
    or (concepto in ('envase', 'transporte', 'otro') and se_paga)
  )
);

create index idx_lote_costos_lote_id on lote_costos(lote_id);
create index idx_lote_costos_producto_id on lote_costos(producto_id);

alter table lote_costos enable row level security;
revoke all on lote_costos from anon, authenticated, public;
grant select on lote_costos to authenticated;

create policy lote_costos_select on lote_costos for select to authenticated
  using (__SCHEMA__.es_vendedor());
-- Sin insert/update/delete para el cliente: el alta es solo vía
-- crear_lote/fijar_costos_lote (security definer), mismo criterio que
-- lote_items.

-- ============================================================
-- 2) comprobante_items.lote_id / entrega_items.lote_id — venta/entrega
--    desde una presentación de un lote concreto, elegida a mano (el dueño
--    sabe "a este revendedor le di 30 botellas del lote viejo y 20 del
--    nuevo"). Nullable: sin elegir lote, sigue funcionando como hoy.
-- ============================================================

alter table comprobante_items add column lote_id uuid references lotes_produccion(id);
create index idx_comprobante_items_lote_id on comprobante_items(lote_id);

alter table entrega_items add column lote_id uuid references lotes_produccion(id);
create index idx_entrega_items_lote_id on entrega_items(lote_id);

-- Caso real del dueño: una sola entrega/comprobante reparte la MISMA
-- presentación entre dos lotes ("30 botellas del lote viejo y 20 del
-- nuevo"), así que ya no alcanza con "una fila por producto" — hace falta
-- una fila por (producto, lote). `unique (…, producto_id)` (0001_schema.sql
-- / 0018_revendedores.sql) se reemplaza por `unique (…, producto_id,
-- lote_id)`; `nulls not distinct` (Postgres 15+, Supabase ya está en 15+)
-- para que "sin lote" (lote_id null) SIGA comportándose como hoy: dos
-- filas de la misma presentación sin lote elegido chocan igual que antes
-- (hay que fusionarlas en una sola fila con la cantidad sumada, el mismo
-- criterio de siempre — sin esto, `null <> null` dejaría colar filas
-- duplicadas sin lote).
alter table comprobante_items drop constraint comprobante_items_comprobante_id_producto_id_key;
alter table comprobante_items add constraint comprobante_items_comprobante_id_producto_id_lote_id_key
  unique nulls not distinct (comprobante_id, producto_id, lote_id);

alter table entrega_items drop constraint entrega_items_entrega_id_producto_id_key;
alter table entrega_items add constraint entrega_items_entrega_id_producto_id_lote_id_key
  unique nulls not distinct (entrega_id, producto_id, lote_id);

-- ============================================================
-- 3) Ananja deja de trackear stock de envases: el envase se compra por
--    pedido (precio y cantidad cambian cada vez, ver lote_costos.envase
--    más abajo), no tiene sentido llevarle stock propio ni que crear_lote
--    lo consuma por receta (quedaría siempre en 0 y dispararía
--    INSUMO_INSUFICIENTE). Se borran solo las recetas de insumos tipo
--    'envase' — las de aceite/etiqueta (materia_prima/etiqueta) se
--    mantienen intactas, siguen consumiendo stock del proveedor como hoy.
-- ============================================================

delete from recetas r
using insumos i
where r.insumo_id = i.id and i.tipo = 'envase';

-- ============================================================
-- 4) Categoría de gasto para los pagos de pedidos de producción
--    (registrar_pago_lote). "Envases y etiquetas"/"Logística"/"Otros" ya
--    existen pero describen el CONCEPTO del costo, no el pago real del
--    pedido completo (que puede mezclar envase + transporte + otros en un
--    solo pago) — se crea una categoría propia para que Gastos/Ganancia
--    puedan filtrar "cuánto le pagamos al proveedor" de un vistazo.
-- ============================================================

insert into categorias_gasto (nombre) values ('Pedidos de producción')
on conflict (nombre) do nothing;

-- ============================================================
-- 5) __SCHEMA__.aplicar_costos_lote — helper privado (no expuesto a
--    clientes) compartido por crear_lote y fijar_costos_lote. Reemplaza
--    SIEMPRE todos los lote_costos del lote (delete + insert): tanto para
--    un lote recién creado (nada que borrar) como para editar uno
--    existente. No crea ningún gasto — el pago real es
--    registrar_pago_lote, en otro momento.
--
--    Contrato de p_costos (mismo shape en crear_lote y fijar_costos_lote):
--      {
--        "precio_litro_aceite_centavos": int|null,
--        "precio_etiqueta_centavos": int|null,
--        "envases": [{ "producto_id": uuid, "precio_unitario_centavos": int }],
--        "transporte_centavos": int|null,
--        "otros_centavos": int|null,
--        "otros_descripcion": text|null,
--        "ganancia_pct": numeric|null,
--        "mayorista_pct": numeric|null,
--        "minorista_pct": numeric|null
--      }
--    Todos los campos son opcionales: solo se cargan/reemplazan los
--    conceptos presentes con valor > 0 (aceite/etiqueta con precio no
--    nulo, aunque sea 0). Litros de aceite y unidades de etiqueta por
--    presentación se derivan solos, no se cargan a mano (ver abajo).
--    Los tres porcentajes NO los toca esta función (aplicar_costos_lote
--    solo escribe lote_costos) — crear_lote/fijar_costos_lote los
--    resuelven y los guardan en lotes_produccion ANTES de llamarla, cada
--    uno con su propio criterio de "ausente" (ver el comentario de cada
--    RPC).
-- ============================================================

create function __SCHEMA__.aplicar_costos_lote(
  p_lote_id uuid,
  p_costos jsonb
)
returns void
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_precio_litro bigint;
  v_precio_etiqueta bigint;
  v_transporte bigint;
  v_otros bigint;
  v_otros_desc text;
  v_item record;
  v_litros numeric;
  v_etiquetas numeric;
  v_etiquetas_por_botella numeric;
  v_monto bigint;
  v_envase jsonb;
  v_envase_producto_id uuid;
  v_envase_precio bigint;
  v_envase_cantidad int;
  v_envases_vistos uuid[] := '{}';
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  delete from lote_costos where lote_id = p_lote_id;

  -- Aceite: litros = presentacion_ml / 1000 × cantidad, automático por
  -- presentación — no se carga a mano. se_paga = false (ya se pagó al
  -- comprar el aceite a granel).
  v_precio_litro := nullif(p_costos->>'precio_litro_aceite_centavos', '')::bigint;
  if v_precio_litro is not null then
    for v_item in
      select li.producto_id, li.cantidad, p.presentacion_ml
      from lote_items li join productos p on p.id = li.producto_id
      where li.lote_id = p_lote_id
    loop
      v_litros := (v_item.presentacion_ml / 1000.0) * v_item.cantidad;
      v_monto := round(v_litros * v_precio_litro);
      insert into lote_costos (lote_id, producto_id, concepto, cantidad, costo_unitario_centavos, total_centavos, se_paga)
      values (p_lote_id, v_item.producto_id, 'aceite', v_litros, v_precio_litro, v_monto, false);
    end loop;
  end if;

  -- Etiqueta: unidades por botella = Σ recetas.cantidad de insumos tipo
  -- 'etiqueta' de ese producto (frente + retro cuentan como 2); sin
  -- receta para ese producto, 1 por botella (fallback defensivo). se_paga
  -- = false, mismo motivo que aceite.
  v_precio_etiqueta := nullif(p_costos->>'precio_etiqueta_centavos', '')::bigint;
  if v_precio_etiqueta is not null then
    for v_item in
      select li.producto_id, li.cantidad
      from lote_items li
      where li.lote_id = p_lote_id
    loop
      select coalesce(sum(r.cantidad), 1) into v_etiquetas_por_botella
      from recetas r
      join insumos i on i.id = r.insumo_id
      where r.producto_id = v_item.producto_id and i.tipo = 'etiqueta';

      v_etiquetas := v_etiquetas_por_botella * v_item.cantidad;
      v_monto := round(v_etiquetas * v_precio_etiqueta);
      insert into lote_costos (lote_id, producto_id, concepto, cantidad, costo_unitario_centavos, total_centavos, se_paga)
      values (p_lote_id, v_item.producto_id, 'etiqueta', v_etiquetas, v_precio_etiqueta, v_monto, false);
    end loop;
  end if;

  -- Envase: a pagar, directo por presentación (precio_unitario × cantidad
  -- del ítem — el precio cambia en cada pedido, no se trackea stock).
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

      v_monto := v_envase_precio * v_envase_cantidad;
      insert into lote_costos (lote_id, producto_id, concepto, cantidad, costo_unitario_centavos, total_centavos, se_paga)
      values (p_lote_id, v_envase_producto_id, 'envase', v_envase_cantidad, v_envase_precio, v_monto, true);
    end loop;
  end if;

  -- Transporte: a pagar, compartido entre todas las presentaciones del lote.
  v_transporte := nullif(p_costos->>'transporte_centavos', '')::bigint;
  if v_transporte is not null and v_transporte > 0 then
    insert into lote_costos (lote_id, producto_id, concepto, total_centavos, se_paga)
    values (p_lote_id, null, 'transporte', v_transporte, true);
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
-- 6.1) crear_lote — gana p_costos jsonb (ver contrato arriba), al final,
--      default null (compatible: sin costos, se comporta igual que hoy).
--      Firma vieja exacta para el drop: crear_lote(date, text, jsonb,
--      boolean) (0017_insumos.sql / 0022_rpcs_solo_admin.sql). Resto del
--      cuerpo IDÉNTICO a la última definición vigente (0022).
-- ============================================================

drop function if exists crear_lote(date, text, jsonb, boolean);

create function crear_lote(
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

  -- ganancia_pct/mayorista_pct/minorista_pct: si p_costos los trae, se
  -- usan tal cual; si no, se heredan del lote MÁS RECIENTE que ya exista
  -- (el pedido anterior); si todavía no hay ningún lote, quedan en los
  -- defaults de la columna (30/20/60).
  if p_costos is not null then
    v_ganancia_pct := nullif(p_costos->>'ganancia_pct', '')::numeric;
    v_mayorista_pct := nullif(p_costos->>'mayorista_pct', '')::numeric;
    v_minorista_pct := nullif(p_costos->>'minorista_pct', '')::numeric;
  end if;

  if v_ganancia_pct is null or v_mayorista_pct is null or v_minorista_pct is null then
    select
      coalesce(v_ganancia_pct, l.ganancia_pct),
      coalesce(v_mayorista_pct, l.mayorista_pct),
      coalesce(v_minorista_pct, l.minorista_pct)
      into v_ganancia_pct, v_mayorista_pct, v_minorista_pct
    from lotes_produccion l
    order by l.fecha desc, l.created_at desc
    limit 1;
  end if;

  insert into lotes_produccion (fecha, nota, vendedor_id, ganancia_pct, mayorista_pct, minorista_pct)
  values (
    coalesce(p_fecha, current_date), p_nota, v_vendedor_id,
    coalesce(v_ganancia_pct, 30), coalesce(v_mayorista_pct, 20), coalesce(v_minorista_pct, 60)
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

    -- Consumo de insumos según receta del producto (decisión 4 del spec de
    -- Insumos): sin receta para este producto, el for no itera y no
    -- descuenta nada. Ya no incluye envases (recetas borradas en el paso
    -- 3 de esta migración).
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
-- 6.2) fijar_costos_lote — completa/edita los costos de un lote YA
--      existente (los 4 lotes viejos, anteriores a Insumos, que nunca
--      tuvieron costos cargados). Mismo contrato de p_costos que
--      crear_lote; reemplaza TODOS los lote_costos del lote (ver
--      aplicar_costos_lote). No toca stock ni movimientos_insumo (esos
--      lotes son anteriores a Insumos, no tiene sentido reabrir ese
--      consumo acá).
-- ============================================================

create function fijar_costos_lote(
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
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if not exists (select 1 from lotes_produccion where id = p_lote_id) then
    raise exception 'LOTE_NO_ENCONTRADO';
  end if;

  if p_costos is null then
    raise exception 'COSTOS_INVALIDOS';
  end if;

  -- Un fijar_costos_lote que baje el "a pagar" por debajo de lo que ya se
  -- pagó dejaría v_saldo_lote.saldo_centavos en 0 silenciosamente (está
  -- pisado con `greatest(…, 0)`) en vez de avisar que el pedido ya cobró
  -- de más contra el costo nuevo. Se recalcula el a_pagar PROSPECTIVO
  -- (mismos tres componentes que aplicar_costos_lote: envases directos +
  -- transporte + otros) antes de reemplazar nada.
  select coalesce(sum(monto_centavos), 0) into v_pagado_centavos
  from gastos where lote_id = p_lote_id and concepto_lote = 'pago';

  select coalesce(sum((e->>'precio_unitario_centavos')::bigint * li.cantidad), 0)
  into v_nuevo_a_pagar_centavos
  from jsonb_array_elements(coalesce(p_costos->'envases', '[]'::jsonb)) e
  join lote_items li
    on li.lote_id = p_lote_id and li.producto_id = (e->>'producto_id')::uuid;

  v_nuevo_a_pagar_centavos := v_nuevo_a_pagar_centavos
    + greatest(coalesce(nullif(p_costos->>'transporte_centavos', '')::bigint, 0), 0)
    + greatest(coalesce(nullif(p_costos->>'otros_centavos', '')::bigint, 0), 0);

  if v_nuevo_a_pagar_centavos < v_pagado_centavos then
    raise exception 'COSTOS_MENORES_A_PAGADO'
      using detail = json_build_object(
        'pagado_centavos', v_pagado_centavos,
        'nuevo_total_centavos', v_nuevo_a_pagar_centavos
      )::text;
  end if;

  -- ganancia_pct/mayorista_pct/minorista_pct: solo se tocan los que
  -- p_costos trae — a diferencia de crear_lote, acá "ausente" significa
  -- "dejar el valor que el lote ya tiene", no heredar de otro lote.
  v_ganancia_pct := nullif(p_costos->>'ganancia_pct', '')::numeric;
  v_mayorista_pct := nullif(p_costos->>'mayorista_pct', '')::numeric;
  v_minorista_pct := nullif(p_costos->>'minorista_pct', '')::numeric;

  if v_ganancia_pct is not null or v_mayorista_pct is not null or v_minorista_pct is not null then
    update lotes_produccion set
      ganancia_pct = coalesce(v_ganancia_pct, ganancia_pct),
      mayorista_pct = coalesce(v_mayorista_pct, mayorista_pct),
      minorista_pct = coalesce(v_minorista_pct, minorista_pct)
    where id = p_lote_id;
  end if;

  perform __SCHEMA__.aplicar_costos_lote(p_lote_id, p_costos);

  return json_build_object('lote_id', p_lote_id);
end;
$$;

revoke execute on function fijar_costos_lote(uuid, jsonb) from anon, public;
grant execute on function fijar_costos_lote(uuid, jsonb) to authenticated;

-- ============================================================
-- 6.3) registrar_pago_lote — el pago REAL del pedido (cash saliendo de
--      caja), separado en el tiempo de aplicar_costos_lote y
--      potencialmente partido en varios medios de pago
--      (p_pagos = [{ medio_pago, monto_centavos }, ...]). Crea UN gasto
--      por entrada de p_pagos, todos con concepto_lote = 'pago' — así
--      Caja/Ganancia ven la salida real en la fecha real, y v_saldo_lote
--      puede calcular cuánto falta. Rechaza pagar de más
--      (PAGO_EXCEDE_SALDO): el saldo se corrige desde Gastos (editar/
--      borrar el pago), no sobrepagando acá.
-- ============================================================

create function registrar_pago_lote(
  p_lote_id uuid,
  p_fecha date,
  p_pagos jsonb,
  p_nota text default null
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_vendedor_id uuid;
  v_categoria_id uuid;
  v_saldo bigint;
  v_pago jsonb;
  v_medio medio_pago;
  v_monto bigint;
  v_total_pagos bigint := 0;
  v_gasto_id uuid;
  v_gasto_ids uuid[] := '{}';
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select id into v_vendedor_id from vendedores where user_id = auth.uid();
  if v_vendedor_id is null then
    raise exception 'VENDEDOR_NO_REGISTRADO';
  end if;

  -- Bloquea la fila del lote hasta el commit: dos llamadas concurrentes a
  -- registrar_pago_lote sobre el MISMO lote se serializan acá — la segunda
  -- espera a que la primera termine (commit o rollback) antes de leer
  -- v_saldo_lote, así nunca ven el mismo saldo "viejo" y sobrepagan entre
  -- las dos pese al chequeo de PAGO_EXCEDE_SALDO más abajo.
  perform 1 from lotes_produccion where id = p_lote_id for update;

  if not exists (select 1 from lotes_produccion where id = p_lote_id) then
    raise exception 'LOTE_NO_ENCONTRADO';
  end if;

  if p_pagos is null or jsonb_array_length(p_pagos) = 0 then
    raise exception 'SIN_PAGOS';
  end if;

  -- Self-healing: la categoría es de nombre libre para el usuario
  -- (categorias_gasto admite update desde la UI), así que si "Pedidos de
  -- producción" se borró o se renombró se recrea acá en vez de fallar
  -- (el `on conflict` la deja intacta si sigue existiendo tal cual).
  insert into categorias_gasto (nombre) values ('Pedidos de producción')
  on conflict (nombre) do nothing;

  select id into v_categoria_id from categorias_gasto where nombre = 'Pedidos de producción';
  if v_categoria_id is null then
    raise exception 'CATEGORIA_PEDIDOS_FALTANTE';
  end if;

  select saldo_centavos into v_saldo from v_saldo_lote where lote_id = p_lote_id;

  for v_pago in select * from jsonb_array_elements(p_pagos)
  loop
    v_medio := nullif(v_pago->>'medio_pago', '')::medio_pago;
    v_monto := (v_pago->>'monto_centavos')::bigint;

    if v_medio is null or v_monto is null or v_monto <= 0 then
      raise exception 'PAGO_INVALIDO';
    end if;

    v_total_pagos := v_total_pagos + v_monto;
  end loop;

  if v_total_pagos > coalesce(v_saldo, 0) then
    raise exception 'PAGO_EXCEDE_SALDO'
      using detail = json_build_object('saldo_centavos', coalesce(v_saldo, 0))::text;
  end if;

  for v_pago in select * from jsonb_array_elements(p_pagos)
  loop
    v_medio := (v_pago->>'medio_pago')::medio_pago;
    v_monto := (v_pago->>'monto_centavos')::bigint;

    insert into gastos (vendedor_id, monto_centavos, categoria_id, medio_pago, fecha, nota, lote_id, concepto_lote)
    values (v_vendedor_id, v_monto, v_categoria_id, v_medio, coalesce(p_fecha, current_date), p_nota, p_lote_id, 'pago')
    returning id into v_gasto_id;

    insert into notificaciones (tipo, titulo, detalle, referencia_id)
    values ('gasto_nuevo', 'Nuevo gasto registrado', p_nota, v_gasto_id);

    v_gasto_ids := array_append(v_gasto_ids, v_gasto_id);
  end loop;

  return json_build_object('gasto_ids', v_gasto_ids);
end;
$$;

revoke execute on function registrar_pago_lote(uuid, date, jsonb, text) from anon, public;
grant execute on function registrar_pago_lote(uuid, date, jsonb, text) to authenticated;

-- ============================================================
-- 6.4) registrar_pago_deuda (0027_pagos_deuda.sql) — misma firma y mismo
--      cuerpo, con el mismo lock defensivo agregado arriba: sin esto tiene
--      la misma carrera que registrar_pago_lote (dos pagos concurrentes
--      sobre la misma deuda podrían pasar el chequeo de PAGO_EXCEDE_SALDO
--      los dos contra el mismo "restante" viejo). `create or replace`
--      alcanza (misma firma exacta, no hace falta drop).
-- ============================================================

create or replace function registrar_pago_deuda(
  p_deuda_id uuid,
  p_monto_centavos bigint,
  p_medio_pago medio_pago,
  p_fecha date,
  p_monto_caja_centavos bigint default null,
  p_nota text default null
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_pago_id uuid;
  v_moneda text;
  v_saldada_en date;
  v_restante_centavos bigint;
  v_monto_caja_centavos bigint;
  v_saldada boolean := false;
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if p_monto_centavos is null or p_monto_centavos <= 0 then
    raise exception 'MONTO_INVALIDO';
  end if;

  -- Mismo criterio que registrar_pago_lote: bloquea la fila de la deuda
  -- hasta el commit para serializar pagos concurrentes sobre la misma.
  perform 1 from deudas where id = p_deuda_id for update;

  select moneda, saldada_en, restante_centavos
    into v_moneda, v_saldada_en, v_restante_centavos
  from v_saldo_deuda where deuda_id = p_deuda_id;

  if v_moneda is null then
    raise exception 'DEUDA_NO_ENCONTRADA';
  end if;

  if v_saldada_en is not null then
    raise exception 'DEUDA_YA_SALDADA';
  end if;

  if p_monto_centavos > v_restante_centavos then
    raise exception 'PAGO_EXCEDE_SALDO'
      using detail = json_build_object('restante', v_restante_centavos)::text;
  end if;

  if v_moneda = 'ARS' then
    v_monto_caja_centavos := p_monto_centavos;
  else
    v_monto_caja_centavos := p_monto_caja_centavos;
    if v_monto_caja_centavos is null or v_monto_caja_centavos <= 0 then
      raise exception 'MONTO_CAJA_INVALIDO';
    end if;
  end if;

  insert into pagos_deuda (deuda_id, monto_centavos, monto_caja_centavos, medio_pago, fecha, nota)
  values (p_deuda_id, p_monto_centavos, v_monto_caja_centavos, p_medio_pago, coalesce(p_fecha, current_date), p_nota)
  returning id into v_pago_id;

  -- v_restante_centavos es el restante ANTES de este pago (todavía no
  -- corrió el insert de arriba cuando se calculó) — si este pago lo cubre
  -- por completo, la deuda queda saldada hoy.
  if v_restante_centavos - p_monto_centavos <= 0 then
    update deudas set saldada_en = current_date where id = p_deuda_id;
    v_saldada := true;
  end if;

  return json_build_object('id', v_pago_id, 'saldada', v_saldada);
end;
$$;

revoke execute on function registrar_pago_deuda(uuid, bigint, medio_pago, date, bigint, text) from anon, public;
grant execute on function registrar_pago_deuda(uuid, bigint, medio_pago, date, bigint, text) to authenticated;

-- ============================================================
-- 7.1) crear_comprobante — MISMA firma que 0025_ventas_credito.sql (el
--      lote va DENTRO de cada ítem del jsonb, `p_items[].lote_id`
--      opcional, no es un parámetro nuevo): create or replace alcanza,
--      sin drop. Resto del cuerpo idéntico a 0025; agrega la validación
--      de lote (LOTE_INVALIDO / STOCK_LOTE_INSUFICIENTE) antes de
--      insertar el movimiento de stock.
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

  -- Un ítem por (producto, lote): la MISMA presentación puede repartirse
  -- entre varios lotes en una sola venta ("30 del lote viejo y 20 del
  -- nuevo"), así que ya no es 1 ítem por producto. Dos filas del mismo
  -- (producto, lote) — lote_id null incluido — siguen siendo un error:
  -- hay que fusionarlas en una sola con la cantidad sumada, no mandarlas
  -- separadas (mismo criterio que el unique de la tabla).
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

    insert into movimientos_stock (producto_id, tipo, cantidad, vendedor_id, comprobante_id, lote_id, nota)
    values (v_producto_id, 'egreso', v_cantidad, v_vendedor_id, v_comprobante_id, v_lote_id, null);

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

-- ============================================================
-- 7.2) actualizar_comprobante — misma firma que 0025, misma validación de
--      lote agregada al loop de ítems.
-- ============================================================

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

  -- Si no se manda p_cobrado_centavos, se conserva el cobrado_centavos ya
  -- guardado en el comprobante (v_cobrado_actual) — no se asume el monto
  -- completo, a diferencia de crear_comprobante.
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

  -- delete+insert completo (arriba): "mover unidades de un lote a otro" es
  -- solo mandar p_items con otro lote_id para esa presentación, no hace
  -- falta ningún diff — mismo criterio de siempre. Un ítem por (producto,
  -- lote); ver comentario equivalente en crear_comprobante.
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

    insert into movimientos_stock (producto_id, tipo, cantidad, vendedor_id, comprobante_id, lote_id, nota)
    values (v_producto_id, 'egreso', v_cantidad, v_vendedor_id, p_comprobante_id, v_lote_id, null);

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
-- 7.3) registrar_entrega_revendedor — misma firma que 0026, misma
--      validación de lote agregada al loop de ítems (solo para
--      p_tipo = 'entrega': una devolución no puede "faltar stock de
--      lote", devuelve al lote de origen).
-- ============================================================

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

  -- Un ítem por (producto, lote): "30 botellas del lote viejo y 20 del
  -- nuevo" en una sola entrega es dos filas de la misma presentación con
  -- lote_id distinto — ver comentario equivalente en crear_comprobante.
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

    insert into movimientos_stock (producto_id, tipo, cantidad, vendedor_id, entrega_id, lote_id, nota)
    values (v_producto_id, v_tipo_movimiento, v_cantidad, v_admin_id, v_entrega_id, v_lote_id, null);

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
-- 8.1) v_costo_lote_item — mismas columnas existentes (gastos_directos_
--      centavos, gastos_compartidos_centavos, total_gastos_centavos,
--      costo_unitario_centavos), ahora sumando también lote_costos
--      (directos por producto_id, compartidos repartidos por volumen
--      igual que los gastos). Los gastos legado con lote_id asignado
--      siguen contando igual que siempre (concepto_lote is null los
--      distingue de los pagos nuevos, que SIEMPRE tienen producto_id
--      null y por lo tanto ya quedan afuera de directos_item; se excluyen
--      explícitamente de compartidos_lote para no duplicar lote_costos).
-- ============================================================

create or replace view v_costo_lote_item as
with peso_item as (
  select li.lote_id, li.producto_id, p.presentacion_ml * li.cantidad as peso
  from lote_items li
  join productos p on p.id = li.producto_id
),
compartidos_lote as (
  select lote_id, sum(monto_centavos) as total
  from gastos
  where lote_id is not null and producto_id is null and concepto_lote is null
  group by lote_id
),
compartidos_item as (
  select
    pi.lote_id,
    pi.producto_id,
    coalesce(round(
      cl.total::numeric * pi.peso / sum(pi.peso) over (partition by pi.lote_id)
    ), 0)::bigint as gastos_compartidos_centavos
  from peso_item pi
  left join compartidos_lote cl on cl.lote_id = pi.lote_id
),
directos_item as (
  select lote_id, producto_id, sum(monto_centavos) as gastos_directos_centavos
  from gastos
  where lote_id is not null and producto_id is not null
  group by lote_id, producto_id
),
costos_directos_item as (
  select lote_id, producto_id, sum(total_centavos) as costos_directos_centavos
  from lote_costos
  where producto_id is not null
  group by lote_id, producto_id
),
costos_compartidos_lote as (
  select lote_id, sum(total_centavos) as total
  from lote_costos
  where producto_id is null
  group by lote_id
),
costos_compartidos_item as (
  select
    pi.lote_id,
    pi.producto_id,
    coalesce(round(
      cc.total::numeric * pi.peso / sum(pi.peso) over (partition by pi.lote_id)
    ), 0)::bigint as costos_compartidos_centavos
  from peso_item pi
  left join costos_compartidos_lote cc on cc.lote_id = pi.lote_id
)
select
  li.lote_id,
  li.producto_id,
  p.nombre as producto_nombre,
  p.presentacion_ml,
  li.cantidad,
  l.fecha,
  l.created_at,
  coalesce(di.gastos_directos_centavos, 0) as gastos_directos_centavos,
  coalesce(ci.gastos_compartidos_centavos, 0) as gastos_compartidos_centavos,
  (
    coalesce(di.gastos_directos_centavos, 0) + coalesce(ci.gastos_compartidos_centavos, 0)
    + coalesce(cdi.costos_directos_centavos, 0) + coalesce(cci.costos_compartidos_centavos, 0)
  ) as total_gastos_centavos,
  case
    when (
      coalesce(di.gastos_directos_centavos, 0) + coalesce(ci.gastos_compartidos_centavos, 0)
      + coalesce(cdi.costos_directos_centavos, 0) + coalesce(cci.costos_compartidos_centavos, 0)
    ) = 0 then 0
    else round((
      coalesce(di.gastos_directos_centavos, 0) + coalesce(ci.gastos_compartidos_centavos, 0)
      + coalesce(cdi.costos_directos_centavos, 0) + coalesce(cci.costos_compartidos_centavos, 0)
    )::numeric / li.cantidad)::bigint
  end as costo_unitario_centavos,
  -- Columnas nuevas SIEMPRE al final: create or replace view no admite
  -- insertar columnas en el medio de las que ya existían.
  coalesce(cdi.costos_directos_centavos, 0) as costos_directos_centavos,
  coalesce(cci.costos_compartidos_centavos, 0) as costos_compartidos_centavos,
  (
    coalesce(di.gastos_directos_centavos, 0) + coalesce(ci.gastos_compartidos_centavos, 0)
    + coalesce(cdi.costos_directos_centavos, 0) + coalesce(cci.costos_compartidos_centavos, 0)
  ) as total_costo_centavos
from lote_items li
join productos p on p.id = li.producto_id
join lotes_produccion l on l.id = li.lote_id
left join compartidos_item ci on ci.lote_id = li.lote_id and ci.producto_id = li.producto_id
left join directos_item di on di.lote_id = li.lote_id and di.producto_id = li.producto_id
left join costos_directos_item cdi on cdi.lote_id = li.lote_id and cdi.producto_id = li.producto_id
left join costos_compartidos_item cci on cci.lote_id = li.lote_id and cci.producto_id = li.producto_id;

alter view v_costo_lote_item set (security_invoker = true);
revoke all on v_costo_lote_item from anon, public;
grant select on v_costo_lote_item to authenticated;

-- ============================================================
-- 8.2) v_costo_lote — mismas columnas existentes + total_costos_centavos/
--      total_costo_centavos (lote_costos, a nivel lote). total_gastos_
--      centavos/gastos_asignados siguen siendo solo gastos legado (los
--      pagos nuevos, concepto_lote = 'pago', quedan afuera — ya están
--      contados como lote_costos, no se puede duplicar).
-- ============================================================

create or replace view v_costo_lote as
select
  l.id as lote_id,
  l.fecha,
  l.nota,
  l.vendedor_id,
  l.created_at,
  coalesce(ti.cantidad_total, 0) as cantidad_total,
  coalesce(g.total_gastos_centavos, 0) as total_gastos_centavos,
  coalesce(g.gastos_asignados, 0) as gastos_asignados,
  coalesce(it.items, '[]'::jsonb) as items,
  -- Columnas nuevas SIEMPRE al final: create or replace view no admite
  -- insertar columnas en el medio de las que ya existían.
  coalesce(c.total_costos_centavos, 0) as total_costos_centavos,
  coalesce(g.total_gastos_centavos, 0) + coalesce(c.total_costos_centavos, 0) as total_costo_centavos
from lotes_produccion l
left join (
  select lote_id, sum(cantidad) as cantidad_total
  from lote_items
  group by lote_id
) ti on ti.lote_id = l.id
left join (
  select lote_id, sum(monto_centavos) as total_gastos_centavos, count(*) as gastos_asignados
  from gastos
  where lote_id is not null and concepto_lote is null
  group by lote_id
) g on g.lote_id = l.id
left join (
  select lote_id, sum(total_centavos) as total_costos_centavos
  from lote_costos
  group by lote_id
) c on c.lote_id = l.id
left join (
  select
    li.lote_id,
    jsonb_agg(
      jsonb_build_object(
        'producto_id', li.producto_id,
        'producto_nombre', p.nombre,
        'presentacion_ml', p.presentacion_ml,
        'cantidad', li.cantidad
      )
      order by p.presentacion_ml desc
    ) as items
  from lote_items li
  join productos p on p.id = li.producto_id
  group by li.lote_id
) it on it.lote_id = l.id;

alter view v_costo_lote set (security_invoker = true);
revoke all on v_costo_lote from anon, public;
grant select on v_costo_lote to authenticated;

-- ============================================================
-- 8.3) v_costo_lote_desglose — NUEVA. Una fila por (lote_id, producto_id):
--      desglose por concepto (aceite/etiqueta/envase directos; transporte/
--      otros compartidos por volumen; gastos legado sin concepto_lote se
--      pliegan en "otros", directos o repartidos según tuvieran o no
--      producto_id — mismo criterio de siempre) + "costo Ananja" y precios
--      de reventa sugeridos, a partir del costo REAL de este lote/
--      presentación y de los % PROPIOS del lote (lotes_produccion.
--      ganancia_pct/mayorista_pct/minorista_pct — la calculadora de
--      Precios se retira, la vista ya no lee versiones_precio en
--      absoluto): costo_ananja = costo_unitario × (1 + ganancia%) — lo
--      que cualquier vendedor le debe a la empresa por botella, la
--      ganancia de la empresa YA está adentro; mayorista/minorista
--      sugeridos = costo_ananja × (1 + mayorista%/minorista%) — apenas
--      sugerencias de reventa, el vendedor se queda con (precio de venta
--      − costo Ananja).
-- ============================================================

create view v_costo_lote_desglose as
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
transporte_lote as (
  select lote_id, sum(total_centavos) as total from lote_costos where concepto = 'transporte' group by lote_id
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
    coalesce(round(coalesce(tl.total, 0)::numeric * pi.peso / sum(pi.peso) over (partition by pi.lote_id)), 0)::bigint as transporte_centavos,
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
    coalesce(ci.transporte_centavos, 0) as transporte_centavos,
    coalesce(ld.monto, 0) + coalesce(ci.otro_compartido_centavos, 0) + coalesce(ci.legacy_compartido_centavos, 0) as otros_centavos
  from lote_items li
  join productos p on p.id = li.producto_id
  join lotes_produccion l on l.id = li.lote_id
  left join aceite_directo ad on ad.lote_id = li.lote_id and ad.producto_id = li.producto_id
  left join etiqueta_directo ed on ed.lote_id = li.lote_id and ed.producto_id = li.producto_id
  left join envase_directo ev on ev.lote_id = li.lote_id and ev.producto_id = li.producto_id
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
-- "Costo Ananja" = lo que cualquier vendedor (admin o revendedor) le debe
-- a la empresa por botella — el costo real YA incluye la ganancia de la
-- empresa en ese momento. Mayorista/minorista son apenas SUGERENCIAS de
-- reventa sobre el costo Ananja (no sobre el costo real): el vendedor se
-- queda con (precio de venta − costo Ananja). Los tres porcentajes son
-- del LOTE (lotes_produccion.ganancia_pct/mayorista_pct/minorista_pct),
-- no de versiones_precio — la vista ya no la lee en absoluto.
con_costo_ananja as (
  select
    u.*,
    round(u.costo_unitario_centavos * (100 + u.ganancia_pct) / 100)::bigint as costo_ananja_centavos
  from con_costo_unitario u
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
  round(costo_ananja_centavos * (100 + mayorista_pct) / 100)::bigint as precio_mayorista_sugerido_centavos,
  round(costo_ananja_centavos * (100 + minorista_pct) / 100)::bigint as precio_minorista_sugerido_centavos,
  -- created_at al final: desempate de "último lote" cuando dos lotes
  -- comparten fecha (usado por v_costo_producto más abajo), mismo
  -- criterio que ya usaba v_costo_lote_item.
  created_at
from con_costo_ananja;

alter view v_costo_lote_desglose set (security_invoker = true);
revoke all on v_costo_lote_desglose from anon, public;
grant select on v_costo_lote_desglose to authenticated;

-- ============================================================
-- 8.4b) v_costo_producto (0010_lotes_produccion.sql / 0015_lotes_multi.sql)
--      — recreada para leer de v_costo_lote_desglose en vez de
--      v_costo_lote_item: hallazgo de review — antes de este cambio ya
--      daba el mismo número por construcción (v_costo_lote_item.total_
--      gastos_centavos también suma lote_costos), pero las dos vistas
--      calculaban el total con DOS fórmulas SQL independientes que
--      podían divergir a futuro sin que nada lo marcara. Ahora hay una
--      sola fuente de verdad (v_costo_lote_desglose.costo_unitario_
--      centavos, que ya excluye concepto_lote='pago' — ver esa vista) y
--      v_costo_producto es apenas un consumidor más, igual que
--      v_costo_lote_item. MISMAS columnas y MISMO orden que la definición
--      vigente (no cambia el contrato hacia components/stock/stock-card.tsx).
-- ============================================================

create or replace view v_costo_producto as
with lotes_rank as (
  select
    producto_id,
    cantidad,
    total_centavos as total_gastos_centavos,
    fecha,
    created_at,
    row_number() over (
      partition by producto_id order by fecha desc, created_at desc
    ) as rn
  from v_costo_lote_desglose
),
ultimo_con_gastos as (
  select distinct on (producto_id)
    producto_id,
    lote_id,
    fecha,
    costo_unitario_centavos
  from v_costo_lote_desglose
  where total_centavos > 0
  order by producto_id, fecha desc, created_at desc
),
promedio_3_lotes as (
  select
    producto_id,
    case
      when sum(cantidad) = 0 then 0
      else round(sum(total_gastos_centavos)::numeric / sum(cantidad))::bigint
    end as costo_unitario_promedio_3_lotes_centavos,
    count(*) as lotes_considerados
  from lotes_rank
  where rn <= 3
  group by producto_id
)
select
  p.id as producto_id,
  p.nombre,
  p.presentacion_ml,
  u.lote_id as ultimo_lote_id,
  u.fecha as ultimo_lote_fecha,
  coalesce(u.costo_unitario_centavos, 0) as costo_unitario_ultimo_lote_centavos,
  coalesce(pr.costo_unitario_promedio_3_lotes_centavos, 0) as costo_unitario_promedio_3_lotes_centavos,
  coalesce(pr.lotes_considerados, 0) as lotes_considerados
from productos p
left join ultimo_con_gastos u on u.producto_id = p.id
left join promedio_3_lotes pr on pr.producto_id = p.id;

alter view v_costo_producto set (security_invoker = true);
revoke all on v_costo_producto from anon, public;
grant select on v_costo_producto to authenticated;

-- ============================================================
-- 8.4) v_saldo_lote — NUEVA. a_pagar = Σ lote_costos.se_paga; pagado = Σ
--      gastos con concepto_lote = 'pago' de ese lote; saldo = a_pagar −
--      pagado, nunca negativo (un pago de más ya lo rechaza
--      registrar_pago_lote). Borrar un pago desde Gastos (delete directo,
--      RLS ya lo permite) sube el saldo solo — no hace falta ningún
--      trigger extra.
-- ============================================================

create view v_saldo_lote as
with a_pagar as (
  select lote_id, sum(total_centavos) as total
  from lote_costos
  where se_paga
  group by lote_id
),
pagado as (
  select lote_id, sum(monto_centavos) as total
  from gastos
  where lote_id is not null and concepto_lote = 'pago'
  group by lote_id
)
select
  l.id as lote_id,
  l.fecha,
  coalesce(ap.total, 0) as a_pagar_centavos,
  coalesce(pg.total, 0) as pagado_centavos,
  greatest(coalesce(ap.total, 0) - coalesce(pg.total, 0), 0) as saldo_centavos
from lotes_produccion l
left join a_pagar ap on ap.lote_id = l.id
left join pagado pg on pg.lote_id = l.id;

alter view v_saldo_lote set (security_invoker = true);
revoke all on v_saldo_lote from anon, public;
grant select on v_saldo_lote to authenticated;

-- ============================================================
-- 8.5) v_stock_por_lote — NUEVA. Stock por lote es EXPLÍCITO (el dueño
--      elige de qué lote sale cada venta/entrega, ver
--      comprobante_items.lote_id / entrega_items.lote_id más arriba), no
--      FIFO: `salidas_asignadas` cuenta los egresos que SÍ llevan este
--      lote_id (netos de sus devoluciones — una devolución es un ingreso
--      con lote_id Y entrega_id, se identifica por tener entrega_id no
--      nulo: el ingreso de PRODUCCIÓN del lote nunca lo tiene). Los
--      egresos que no llevan ningún lote_id (ventas viejas, o cualquier
--      camino que todavía no lo pida) se reparten como fallback FIFO
--      entre los lotes de ese producto, del más viejo al más nuevo,
--      después de descontarles sus salidas asignadas directas — así
--      Σquedan siempre cierra contra v_stock_actual.
-- ============================================================

create view v_stock_por_lote as
with lote_prod as (
  select li.lote_id, li.producto_id, l.fecha, l.created_at, li.cantidad as producido
  from lote_items li
  join lotes_produccion l on l.id = li.lote_id
),
egresos_lote as (
  select lote_id, producto_id, sum(cantidad) as total
  from movimientos_stock
  where tipo = 'egreso' and lote_id is not null
  group by lote_id, producto_id
),
devoluciones_lote as (
  select lote_id, producto_id, sum(cantidad) as total
  from movimientos_stock
  where tipo = 'ingreso' and lote_id is not null and entrega_id is not null
  group by lote_id, producto_id
),
directas as (
  select
    lp.lote_id,
    lp.producto_id,
    lp.fecha,
    lp.created_at,
    lp.producido,
    least(
      greatest(coalesce(eg.total, 0) - coalesce(dv.total, 0), 0),
      lp.producido
    ) as salidas_asignadas
  from lote_prod lp
  left join egresos_lote eg on eg.lote_id = lp.lote_id and eg.producto_id = lp.producto_id
  left join devoluciones_lote dv on dv.lote_id = lp.lote_id and dv.producto_id = lp.producto_id
),
con_remanente as (
  select
    d.*,
    (d.producido - d.salidas_asignadas) as remanente_tras_directas
  from directas d
),
-- El pool de "salidas sin lote" tiene que netear sus propias devoluciones:
-- una devolución de revendedor sin lote elegido (ingreso, entrega_id no
-- nulo, lote_id null) revierte una salida sin lote anterior — sin esto,
-- Σquedan queda short contra v_stock_actual apenas hay un ciclo
-- entrega-sin-lote + devolución-sin-lote (BLOCKER encontrado en review:
-- entrega 5 sin lote + devolución 5 sin lote → v_stock_actual vuelve a la
-- base, pero el pool seguía en 5). Ingresos sin lote QUE NO son devolución
-- (ajuste manual, alta de stock fuera de un lote) no se netean acá a
-- propósito: no son la reversión de ninguna salida, son stock nuevo sin
-- lote de origen — no le corresponden a ningún lote, quedan fuera de la
-- atribución (mismo criterio ya documentado más arriba). delete/edición de
-- comprobante nunca generan un ingreso "de vuelta": actualizar_comprobante
-- borra los movimientos_stock viejos del comprobante y crea los nuevos
-- (nunca un ingreso reversor), y eliminar un comprobante los borra por
-- cascade — en ningún caso queda un ingreso fantasma que netear.
pool_sin_asignar as (
  select
    producto_id,
    greatest(
      coalesce(sum(case when tipo = 'egreso' then cantidad else 0 end), 0)
      - coalesce(sum(case when tipo = 'ingreso' and entrega_id is not null then cantidad else 0 end), 0),
      0
    ) as total
  from movimientos_stock
  where lote_id is null
  group by producto_id
),
acumulado as (
  select
    r.*,
    coalesce(sum(r.remanente_tras_directas) over (
      partition by r.producto_id order by r.fecha, r.created_at
      rows between unbounded preceding and 1 preceding
    ), 0) as capacidad_previa
  from con_remanente r
)
select
  a.lote_id,
  a.producto_id,
  a.fecha,
  a.producido,
  a.salidas_asignadas,
  least(
    greatest(coalesce(p.total, 0) - a.capacidad_previa, 0),
    a.remanente_tras_directas
  ) as salidas_sin_asignar_atribuidas,
  a.remanente_tras_directas - least(
    greatest(coalesce(p.total, 0) - a.capacidad_previa, 0),
    a.remanente_tras_directas
  ) as quedan
from acumulado a
left join pool_sin_asignar p on p.producto_id = a.producto_id;

alter view v_stock_por_lote set (security_invoker = true);
revoke all on v_stock_por_lote from anon, public;
grant select on v_stock_por_lote to authenticated;
