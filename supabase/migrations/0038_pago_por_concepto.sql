-- Ananja: el pedido al proveedor se paga por concepto (envasado de cada
-- presentación, transporte, otros) y "lo que cuesta" deja de ser siempre
-- igual a "lo que se paga".
--
-- Caso que motiva la migración (un pedido de 200 × 500 ml + 100 × 250 ml):
-- el proveedor cobró el envasado de 250 ml un monto calculado pero el dueño pagó
-- un poco más (redondeo), y lo facturó SIN IVA — como Ananja es
-- monotributo ese IVA no se recupera, así que al COSTO de la botella se le
-- suma el 21% aunque lo que se PAGA sea el neto.
--
-- Alcance:
--  1. `lote_costos.a_pagar_centavos` — lo que realmente se le paga al
--     proveedor por esa línea (null = no se paga en el pedido: aceite y
--     etiquetas, ya comprados antes). Backfill = `total_centavos` donde
--     `se_paga` (idéntico a hoy). Invariante nueva:
--     `se_paga = (a_pagar_centavos is not null)`.
--  2. `lotes_produccion.envase_cobrado_sin_iva` (default false).
--  3. `aplicar_costos_lote` (MISMA firma) — dos claves nuevas opcionales de
--     `p_costos`:
--     - `envase_cobrado_sin_iva` (boolean). PRESENTE: gobierna las líneas de
--       envase ("modo nuevo"): `precio_unitario_centavos` es lo que cobra
--       el proveedor, `neto_centavos` = ese precio, cobrado = precio × cantidad,
--       costo = cobrado (+ IVA si `true`, redondeado sobre el TOTAL), a
--       pagar = cobrado. Se persiste en `lotes_produccion`. AUSENTE: se usa
--       lo guardado en el lote — si es `false` (todos los lotes existentes y
--       todo lote creado por la UI vieja) es EXACTAMENTE el comportamiento de
--       0030 (`precios_incluyen_iva` gobierna el envase, a pagar = costo);
--       si es `true` (solo lo pudo haber puesto la UI nueva) se conserva el
--       modo nuevo, para que la UI vieja que todavía esté abierta no le
--       borre el IVA al costo al re-guardar (mismo criterio "ausente =
--       conservar" que `iva_pct` en `fijar_costos_lote`; en `crear_lote` el
--       lote recién insertado siempre tiene `false`, o sea comportamiento
--       viejo).
--     - `redondeos` (array): `[{concepto:'envase', producto_id,
--       monto_centavos}, {concepto:'transporte', monto_centavos}]` = lo que
--       el proveedor cobró de verdad por ese concepto. Envase: el cobrado pasa a ser
--       ese monto (el costo se recalcula desde ahí, con IVA si corresponde;
--       costo unitario = round(total / cantidad)). Transporte %: las líneas
--       por presentación se re-escalan proporcionalmente (floor) para que
--       sumen EXACTO ese monto, y los centavos que sobran van a la línea más
--       grande (desempate por producto_id) — espejo en
--       `reescalarTransporte` (lib/costos-lote.ts). Transporte FIJO: el monto
--       ya es exacto, un redondeo de transporte sin transporte % es
--       `REDONDEO_INVALIDO` (la UI nunca lo manda). Monto <= 0, concepto
--       desconocido, envase sin producto o repetido, o envase de una
--       presentación sin precio cargado: `REDONDEO_INVALIDO`.
--     Etiquetas/aceite: a pagar null. Otros y transporte fijo: a pagar =
--     total.
--  4. `fijar_costos_lote` (MISMA firma): el chequeo "no bajar lo a pagar por
--     debajo de lo ya pagado" (`COSTOS_MENORES_A_PAGADO`) ya NO recalcula
--     aparte: primero escribe con `aplicar_costos_lote` y después compara
--     contra lo que quedó escrito — si no cierra, la excepción revierte TODO
--     (delete/insert de lote_costos y update de lotes_produccion incluidos,
--     es una sola transacción). Así compara con EXACTAMENTE las mismas
--     reglas que el camino de escritura (lección de 0029), incluidos IVA del
--     envase, redondeos y el re-escalado del transporte. Se chequea por
--     concepto (pagos con `concepto_pago`) y en total (todos los pagos,
--     también los viejos sin concepto).
--  5. `v_saldo_lote`: mismas columnas, a pagar = Σ `a_pagar_centavos`.
--  6. `gastos.concepto_pago` ('envase'|'transporte'|'otro') — un pago de
--     envase lleva además `gastos.producto_id` (columna que ya existía).
--  7. `v_saldo_lote_concepto` (security_invoker): a pagar / pagado / saldo por
--     (lote, concepto, producto_id — solo envase). Los pagos viejos sin
--     `concepto_pago` solo cuentan en los totales de `v_saldo_lote`.
--  8. `registrar_pago_lote` (MISMA firma): cada ítem de `p_pagos` puede traer
--     `concepto` y `producto_id` (obligatorio para envase). Con concepto:
--     valida por concepto (Σ del lote de pagos de ese concepto <= su saldo,
--     si no `PAGO_EXCEDE_SALDO` con detail), categoría según concepto
--     (envase → "Envases", transporte → "Transporte de pedidos" nueva,
--     otro → "Pedidos de producción"), un concepto sin línea pagable en el
--     pedido (o un envase de una presentación ajena al lote) es
--     `PAGO_INVALIDO`, nota automática ("Envasado 500 ml ·
--     Pedido 15/08/2026") + " · p_nota". Sin concepto: comportamiento
--     exacto de antes. El total del lote de pagos se sigue validando contra
--     `v_saldo_lote` en ambos casos.
--
-- No toca datos existentes salvo el backfill aditivo de `a_pagar_centavos`
-- (mismo valor que ya se veía como "a pagar").
--
-- Nota multi-negocio: la nota automática del pago de envase dice "ml"
-- (unidad de Ananja); en Germá (en pausa) diría "ml" también — es solo
-- texto libre de la nota, el título que se ve en Gastos se arma en TS con
-- `formatPresentacion` (unidad correcta por negocio).
--
-- Migración templada (__SCHEMA__, sin __BUCKET__). Ver supabase/README.md.

-- ============================================================
-- 1) lote_costos.a_pagar_centavos
-- ============================================================

alter table lote_costos
  add column a_pagar_centavos bigint check (a_pagar_centavos is null or a_pagar_centavos >= 0);

update lote_costos set a_pagar_centavos = total_centavos where se_paga;

alter table lote_costos
  add constraint lote_costos_a_pagar_se_paga check (se_paga = (a_pagar_centavos is not null));

-- ============================================================
-- 2) lotes_produccion.envase_cobrado_sin_iva
-- ============================================================

alter table lotes_produccion
  add column envase_cobrado_sin_iva boolean not null default false;

-- ============================================================
-- 3) gastos.concepto_pago
-- ============================================================

alter table gastos
  add column concepto_pago text
    check (concepto_pago is null or concepto_pago in ('envase', 'transporte', 'otro'));

alter table gastos
  add constraint gastos_concepto_pago_es_pago check (concepto_pago is null or concepto_lote = 'pago'),
  add constraint gastos_concepto_pago_envase_producto
    check (concepto_pago is distinct from 'envase' or producto_id is not null);

-- Categoría nueva para el transporte del pedido: es costo de producción (ya
-- está adentro del costo de la botella vía lote_costos), así Ganancia no lo
-- resta dos veces — mismo criterio que "Pedidos de producción" en 0031.
insert into categorias_gasto (nombre, es_costo_produccion)
values ('Transporte de pedidos', true)
on conflict (nombre) do nothing;

-- ============================================================
-- 4) __SCHEMA__.aplicar_costos_lote — misma firma. Cambios respecto de
--    0030: lectura de `envase_cobrado_sin_iva`/`redondeos`, sección de
--    envase, re-escalado del transporte % y `a_pagar_centavos` en cada
--    insert. Aceite y etiquetas: idénticos (a pagar null).
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

  -- Transporte: % -> línea directa por presentación sobre (aceite + envase,
  -- costo) de ESA presentación; fijo -> línea compartida. Igual que 0030,
  -- más el re-escalado por redondeo (0038, espejo `reescalarTransporte`).
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
        insert into lote_costos (lote_id, producto_id, concepto, descripcion, total_centavos, se_paga, a_pagar_centavos)
        values (p_lote_id, v_item.producto_id, 'transporte', v_transporte_pct || '% sobre aceite + envase', v_monto, true, v_monto);
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
          descripcion = v_transporte_pct || '% sobre aceite + envase · Redondeo: calculado $'
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

-- ============================================================
-- 5) v_saldo_lote — mismas columnas, a pagar desde a_pagar_centavos.
-- ============================================================

create or replace view v_saldo_lote as
with a_pagar as (
  select lote_id, sum(a_pagar_centavos) as total
  from lote_costos
  where a_pagar_centavos is not null
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

-- ============================================================
-- 6) v_saldo_lote_concepto — a pagar / pagado / saldo por concepto pagable.
--    producto_id solo en envase (transporte y otros son del pedido entero).
--    Pagos sin concepto_pago (anteriores a 0038) NO entran acá.
-- ============================================================

create view v_saldo_lote_concepto as
with movimientos as (
  select
    lote_id,
    concepto,
    case when concepto = 'envase' then producto_id end as producto_id,
    a_pagar_centavos as a_pagar,
    0::bigint as pagado
  from lote_costos
  where a_pagar_centavos is not null
  union all
  select
    lote_id,
    concepto_pago,
    case when concepto_pago = 'envase' then producto_id end,
    0::bigint,
    monto_centavos
  from gastos
  where lote_id is not null and concepto_lote = 'pago' and concepto_pago is not null
),
agrupado as (
  select lote_id, concepto, producto_id, sum(a_pagar) as a_pagar, sum(pagado) as pagado
  from movimientos
  group by lote_id, concepto, producto_id
)
select
  lote_id,
  concepto,
  producto_id,
  a_pagar as a_pagar_centavos,
  pagado as pagado_centavos,
  greatest(a_pagar - pagado, 0) as saldo_centavos
from agrupado;

alter view v_saldo_lote_concepto set (security_invoker = true);
revoke all on v_saldo_lote_concepto from anon, public;
grant select on v_saldo_lote_concepto to authenticated;

-- ============================================================
-- 6b) v_costo_lote_item — IDÉNTICA a la vigente en prod salvo
--     `directos_item`, que ahora excluye los pagos del pedido
--     (`concepto_lote is null`, mismo criterio que `compartidos_lote` y que
--     `legacy_directo` de v_costo_lote_desglose). Desde 0038 un pago de
--     envasado lleva `gastos.producto_id`: sin este filtro, pagar "Envasado
--     500 ml" sumaba otra vez el envasado por botella al costo unitario
--     (que ya incluye esa línea vía lote_costos). Mismas columnas y orden →
--     create or replace alcanza; conserva grants. Nadie depende de esta vista.
-- ============================================================

create or replace view v_costo_lote_item as
with peso_item as (
  select li_1.lote_id,
    li_1.producto_id,
    (p_1.presentacion_ml * li_1.cantidad) as peso
  from lote_items li_1
  join productos p_1 on p_1.id = li_1.producto_id
),
compartidos_lote as (
  select gastos.lote_id,
    sum(gastos.monto_centavos) as total
  from gastos
  where gastos.lote_id is not null and gastos.producto_id is null and gastos.concepto_lote is null
  group by gastos.lote_id
),
compartidos_item as (
  select pi.lote_id,
    pi.producto_id,
    (coalesce(round((cl.total * pi.peso::numeric) / (sum(pi.peso) over (partition by pi.lote_id))::numeric), 0::numeric))::bigint as gastos_compartidos_centavos
  from peso_item pi
  left join compartidos_lote cl on cl.lote_id = pi.lote_id
),
directos_item as (
  select gastos.lote_id,
    gastos.producto_id,
    sum(gastos.monto_centavos) as gastos_directos_centavos
  from gastos
  where gastos.lote_id is not null and gastos.producto_id is not null and gastos.concepto_lote is null
  group by gastos.lote_id, gastos.producto_id
),
costos_directos_item as (
  select lote_costos.lote_id,
    lote_costos.producto_id,
    sum(lote_costos.total_centavos) as costos_directos_centavos
  from lote_costos
  where lote_costos.producto_id is not null
  group by lote_costos.lote_id, lote_costos.producto_id
),
costos_compartidos_lote as (
  select lote_costos.lote_id,
    sum(lote_costos.total_centavos) as total
  from lote_costos
  where lote_costos.producto_id is null
  group by lote_costos.lote_id
),
costos_compartidos_item as (
  select pi.lote_id,
    pi.producto_id,
    (coalesce(round((cc.total * pi.peso::numeric) / (sum(pi.peso) over (partition by pi.lote_id))::numeric), 0::numeric))::bigint as costos_compartidos_centavos
  from peso_item pi
  left join costos_compartidos_lote cc on cc.lote_id = pi.lote_id
)
select li.lote_id,
  li.producto_id,
  p.nombre as producto_nombre,
  p.presentacion_ml,
  li.cantidad,
  l.fecha,
  l.created_at,
  coalesce(di.gastos_directos_centavos, 0::numeric) as gastos_directos_centavos,
  coalesce(ci.gastos_compartidos_centavos, 0::bigint) as gastos_compartidos_centavos,
  (coalesce(di.gastos_directos_centavos, 0::numeric) + coalesce(ci.gastos_compartidos_centavos, 0::bigint)::numeric
    + coalesce(cdi.costos_directos_centavos, 0::numeric) + coalesce(cci.costos_compartidos_centavos, 0::bigint)::numeric) as total_gastos_centavos,
  case
    when (coalesce(di.gastos_directos_centavos, 0::numeric) + coalesce(ci.gastos_compartidos_centavos, 0::bigint)::numeric
      + coalesce(cdi.costos_directos_centavos, 0::numeric) + coalesce(cci.costos_compartidos_centavos, 0::bigint)::numeric) = 0::numeric
      then 0::bigint
    else (round((coalesce(di.gastos_directos_centavos, 0::numeric) + coalesce(ci.gastos_compartidos_centavos, 0::bigint)::numeric
      + coalesce(cdi.costos_directos_centavos, 0::numeric) + coalesce(cci.costos_compartidos_centavos, 0::bigint)::numeric) / li.cantidad::numeric))::bigint
  end as costo_unitario_centavos,
  coalesce(cdi.costos_directos_centavos, 0::numeric) as costos_directos_centavos,
  coalesce(cci.costos_compartidos_centavos, 0::bigint) as costos_compartidos_centavos,
  (coalesce(di.gastos_directos_centavos, 0::numeric) + coalesce(ci.gastos_compartidos_centavos, 0::bigint)::numeric
    + coalesce(cdi.costos_directos_centavos, 0::numeric) + coalesce(cci.costos_compartidos_centavos, 0::bigint)::numeric) as total_costo_centavos
from lote_items li
join productos p on p.id = li.producto_id
join lotes_produccion l on l.id = li.lote_id
left join compartidos_item ci on ci.lote_id = li.lote_id and ci.producto_id = li.producto_id
left join directos_item di on di.lote_id = li.lote_id and di.producto_id = li.producto_id
left join costos_directos_item cdi on cdi.lote_id = li.lote_id and cdi.producto_id = li.producto_id
left join costos_compartidos_item cci on cci.lote_id = li.lote_id and cci.producto_id = li.producto_id;

alter view v_costo_lote_item set (security_invoker = true);

-- ============================================================
-- 7) __SCHEMA__.fijar_costos_lote — misma firma. Escribe primero y verifica
--    después (ver cabecera, punto 4).
-- ============================================================

create or replace function __SCHEMA__.fijar_costos_lote(
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
  v_existe boolean;
  v_concepto record;
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select true into v_existe from lotes_produccion where id = p_lote_id for update;
  if v_existe is null then
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

  -- "No bajar lo a pagar por debajo de lo ya pagado", contra lo que
  -- aplicar_costos_lote ACABA de escribir. Un raise acá revierte todo lo de
  -- arriba (misma transacción). Primero por concepto (pagos con
  -- concepto_pago), después el total (incluye pagos viejos sin concepto).
  for v_concepto in
    select concepto, producto_id, a_pagar_centavos, pagado_centavos
    from v_saldo_lote_concepto
    where lote_id = p_lote_id and pagado_centavos > a_pagar_centavos
    order by concepto, producto_id
  loop
    raise exception 'COSTOS_MENORES_A_PAGADO'
      using detail = json_build_object(
        'pagado_centavos', v_concepto.pagado_centavos,
        'nuevo_total_centavos', v_concepto.a_pagar_centavos,
        'concepto', v_concepto.concepto,
        'producto_id', v_concepto.producto_id
      )::text;
  end loop;

  select coalesce(sum(monto_centavos), 0) into v_pagado_centavos
  from gastos where lote_id = p_lote_id and concepto_lote = 'pago';

  select coalesce(sum(a_pagar_centavos), 0) into v_nuevo_a_pagar_centavos
  from lote_costos where lote_id = p_lote_id and a_pagar_centavos is not null;

  if v_nuevo_a_pagar_centavos < v_pagado_centavos then
    raise exception 'COSTOS_MENORES_A_PAGADO'
      using detail = json_build_object(
        'pagado_centavos', v_pagado_centavos,
        'nuevo_total_centavos', v_nuevo_a_pagar_centavos
      )::text;
  end if;

  return json_build_object('lote_id', p_lote_id);
end;
$$;

-- ============================================================
-- 8) __SCHEMA__.registrar_pago_lote — misma firma. Ítems sin `concepto`:
--    idéntico a la versión vigente (0028). Con `concepto`: ver cabecera,
--    punto 8.
-- ============================================================

create or replace function __SCHEMA__.registrar_pago_lote(
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
  v_categoria_envases_id uuid;
  v_categoria_transporte_id uuid;
  v_saldo bigint;
  v_pago jsonb;
  v_medio medio_pago;
  v_monto bigint;
  v_concepto text;
  v_producto_id uuid;
  v_presentacion_ml int;
  v_fecha_lote date;
  v_hay_concepto boolean := false;
  v_total_pagos bigint := 0;
  v_excedido record;
  v_categoria_item uuid;
  v_nota_item text;
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

  -- Bloquea la fila del lote hasta el commit: dos pagos concurrentes sobre
  -- el MISMO lote se serializan y nunca ven el mismo saldo "viejo".
  select fecha into v_fecha_lote from lotes_produccion where id = p_lote_id for update;

  if not found then
    raise exception 'LOTE_NO_ENCONTRADO';
  end if;

  if p_pagos is null or jsonb_array_length(p_pagos) = 0 then
    raise exception 'SIN_PAGOS';
  end if;

  -- Self-healing de categorías (nombre libre para el usuario): se recrean
  -- si se borraron o renombraron; `on conflict` las deja intactas si existen.
  insert into categorias_gasto (nombre) values ('Pedidos de producción')
  on conflict (nombre) do nothing;

  select id into v_categoria_id from categorias_gasto where nombre = 'Pedidos de producción';
  if v_categoria_id is null then
    raise exception 'CATEGORIA_PEDIDOS_FALTANTE';
  end if;

  for v_pago in select * from jsonb_array_elements(p_pagos)
  loop
    v_medio := nullif(v_pago->>'medio_pago', '')::medio_pago;
    v_monto := (v_pago->>'monto_centavos')::bigint;
    v_concepto := nullif(v_pago->>'concepto', '');
    v_producto_id := nullif(v_pago->>'producto_id', '')::uuid;

    if v_medio is null or v_monto is null or v_monto <= 0 then
      raise exception 'PAGO_INVALIDO';
    end if;

    if v_concepto is not null then
      if v_concepto not in ('envase', 'transporte', 'otro') then
        raise exception 'PAGO_INVALIDO';
      end if;
      if v_concepto = 'envase' and v_producto_id is null then
        raise exception 'PAGO_INVALIDO';
      end if;
      v_hay_concepto := true;
    end if;

    v_total_pagos := v_total_pagos + v_monto;
  end loop;

  -- Total del lote de pagos contra el saldo del pedido (como siempre) —
  -- incluye los pagos viejos sin concepto.
  select saldo_centavos into v_saldo from v_saldo_lote where lote_id = p_lote_id;

  if v_total_pagos > coalesce(v_saldo, 0) then
    raise exception 'PAGO_EXCEDE_SALDO'
      using detail = json_build_object('saldo_centavos', coalesce(v_saldo, 0))::text;
  end if;

  -- Por concepto: primero, que el concepto exista como línea pagable del
  -- pedido (envase de una presentación sin precio cargado o que no es del
  -- lote, transporte/otros que el pedido no tiene) -> PAGO_INVALIDO; después,
  -- Σ de los ítems de ese concepto <= su saldo.
  if v_hay_concepto then
    select b.concepto, b.producto_id
      into v_excedido
    from (
      select distinct
        e->>'concepto' as concepto,
        case when e->>'concepto' = 'envase' then nullif(e->>'producto_id', '')::uuid end as producto_id
      from jsonb_array_elements(p_pagos) e
      where nullif(e->>'concepto', '') is not null
    ) b
    left join v_saldo_lote_concepto s
      on s.lote_id = p_lote_id
      and s.concepto = b.concepto
      and s.producto_id is not distinct from b.producto_id
    where s.lote_id is null or s.a_pagar_centavos <= 0
    order by b.concepto, b.producto_id
    limit 1;

    if found then
      raise exception 'PAGO_INVALIDO'
        using detail = json_build_object(
          'concepto', v_excedido.concepto,
          'producto_id', v_excedido.producto_id
        )::text;
    end if;

    select b.concepto, b.producto_id, coalesce(s.saldo_centavos, 0) as saldo_centavos
      into v_excedido
    from (
      select
        e->>'concepto' as concepto,
        case when e->>'concepto' = 'envase' then nullif(e->>'producto_id', '')::uuid end as producto_id,
        sum((e->>'monto_centavos')::bigint) as monto
      from jsonb_array_elements(p_pagos) e
      where nullif(e->>'concepto', '') is not null
      group by 1, 2
    ) b
    left join v_saldo_lote_concepto s
      on s.lote_id = p_lote_id
      and s.concepto = b.concepto
      and s.producto_id is not distinct from b.producto_id
    where b.monto > coalesce(s.saldo_centavos, 0)
    order by b.concepto, b.producto_id
    limit 1;

    if found then
      raise exception 'PAGO_EXCEDE_SALDO'
        using detail = json_build_object(
          'saldo_centavos', v_excedido.saldo_centavos,
          'concepto', v_excedido.concepto,
          'producto_id', v_excedido.producto_id
        )::text;
    end if;

    -- Envases ya es costo de producción (0031); Transporte de pedidos se
    -- crea en esta migración, acá solo por self-healing.
    insert into categorias_gasto (nombre, es_costo_produccion) values ('Envases', true)
    on conflict (nombre) do nothing;
    insert into categorias_gasto (nombre, es_costo_produccion) values ('Transporte de pedidos', true)
    on conflict (nombre) do nothing;

    select id into v_categoria_envases_id from categorias_gasto where nombre = 'Envases';
    select id into v_categoria_transporte_id from categorias_gasto where nombre = 'Transporte de pedidos';
  end if;

  for v_pago in select * from jsonb_array_elements(p_pagos)
  loop
    v_medio := (v_pago->>'medio_pago')::medio_pago;
    v_monto := (v_pago->>'monto_centavos')::bigint;
    v_concepto := nullif(v_pago->>'concepto', '');

    if v_concepto is null then
      insert into gastos (vendedor_id, monto_centavos, categoria_id, medio_pago, fecha, nota, lote_id, concepto_lote)
      values (v_vendedor_id, v_monto, v_categoria_id, v_medio, coalesce(p_fecha, current_date), p_nota, p_lote_id, 'pago')
      returning id into v_gasto_id;

      v_nota_item := p_nota;
    else
      v_producto_id := case when v_concepto = 'envase' then (v_pago->>'producto_id')::uuid end;

      if v_concepto = 'envase' then
        select presentacion_ml into v_presentacion_ml from productos where id = v_producto_id;
        v_categoria_item := v_categoria_envases_id;
        v_nota_item := 'Envasado ' || coalesce(v_presentacion_ml::text || ' ml', '');
      elsif v_concepto = 'transporte' then
        v_categoria_item := v_categoria_transporte_id;
        v_nota_item := 'Transporte';
      else
        v_categoria_item := v_categoria_id;
        v_nota_item := 'Otros';
      end if;

      v_nota_item := v_nota_item || ' · Pedido ' || to_char(v_fecha_lote, 'DD/MM/YYYY')
        || coalesce(' · ' || nullif(btrim(p_nota), ''), '');

      insert into gastos (
        vendedor_id, monto_centavos, categoria_id, medio_pago, fecha, nota,
        lote_id, concepto_lote, concepto_pago, producto_id
      )
      values (
        v_vendedor_id, v_monto, v_categoria_item, v_medio, coalesce(p_fecha, current_date), v_nota_item,
        p_lote_id, 'pago', v_concepto, v_producto_id
      )
      returning id into v_gasto_id;
    end if;

    insert into notificaciones (tipo, titulo, detalle, referencia_id)
    values ('gasto_nuevo', 'Nuevo gasto registrado', v_nota_item, v_gasto_id);

    v_gasto_ids := array_append(v_gasto_ids, v_gasto_id);
  end loop;

  return json_build_object('gasto_ids', v_gasto_ids);
end;
$$;
