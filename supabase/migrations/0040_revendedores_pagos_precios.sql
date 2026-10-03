-- Ananja: Revendedores — precios aprobados por entrega, ventas atribuidas
-- solas a la entrega más vieja, pagos informados por la revendedora con
-- confirmación del encargado (tercer sector del rediseño, ver memoria
-- "Ventas: rediseño" / "Revendedores: pagos a admin").
--
-- Modelo de negocio (decisión de Fran): lo que cada vendedor le debe a
-- Ananja por botella vendida es el "costo Ananja" de esa botella (costo de
-- producción + ganancia de Ananja, por lote). El vendedor se queda con la
-- diferencia entre lo que realmente cobró y ese costo. Un admin que vende
-- desde su espacio de revendedor sigue exactamente la misma regla. Las
-- ventas directas de un admin por comprobante NO cambian (toda la plata es
-- de Ananja).
--
-- Alcance:
--  1. entrega_items.costo_ananja_unitario_centavos / precio_sugerido_centavos
--     + registrar_entrega_revendedor los guarda (misma firma, p_items jsonb).
--  2. ventas_revendedor.entrega_item_id / lote_id / grupo_id + helper
--     stock_revendedor_por_entrega + registrar_venta_revendedor atribuye
--     cada venta a la entrega más vieja con stock (FIFO) y la parte en una
--     fila por entrega si cruza dos + eliminar_venta_revendedor borra el
--     grupo entero (mismas firmas).
--  3. Tabla pagos_revendedor + RPCs informar/confirmar/rechazar +
--     mi_encargado_revendedor + notificaciones.destinatario_id + tipo
--     'pago_revendedor' + policies de Storage para la carpeta propia de
--     cada revendedora (@solo-public).
--  5. Ventas cargadas por un admin en nombre de la revendedora
--     (registrar_venta_revendedor_admin, misma lógica FIFO vía el helper
--     interno insertar_venta_revendedor), con precio de venta y medio
--     opcionales (columnas nullable + registrada_por) y
--     fijar_precio_venta_revendedor para completar el precio después;
--     v_resumen_revendedor deja afuera de vendido/ganancia las ventas sin
--     precio y agrega unidades_sin_precio. La UI deployada nunca inserta
--     precio/medio null (solo el formulario nuevo de admin).
--  4. v_margen_ventas y v_cobranza_lote (mismas columnas) usan el lote y el
--     costo aprobado de cada venta/entrega de revendedora, para que
--     "Ganancia de los vendedores" (/ganancia) y lo esperado por lote den lo
--     mismo que "Tu ganancia" (/mi) y la deuda real.
--
-- Compatibilidad con la UI YA DEPLOYADA (el rato entre aplicar esta
-- migración y subir el código):
--  - Ninguna firma de función existente cambia (create or replace con los
--    mismos argumentos; grants se re-declaran igual).
--  - Columnas nuevas nullable o con default: los inserts viejos siguen
--    andando. Una entrega cargada con la pantalla vieja queda sin costo
--    aprobado → sus ventas usan el precio revendedor manual
--    (revendedor_precios), EXACTAMENTE como antes.
--  - Una venta de la pantalla vieja pasa por el RPC nuevo: si cruza dos
--    entregas se guardan dos filas (la lista vieja de /mi/ventas las muestra
--    como dos renglones; los totales y la deuda dan igual). Borrar
--    cualquiera de las dos borra la venta entera.
--  - notificaciones_select agrega "o es para mí": un admin sigue viendo todas
--    las notificaciones generales (destinatario_id null), igual que hoy.
--  - Base de prod al 2026-09-15: 0 entregas, 0 ventas de revendedor, 0
--    rendiciones — nada histórico que reinterpretar.
--
-- No toca v_deuda_vendedor, v_plata_en_manos, v_cuenta_ananja,
-- v_saldos_caja ni v_resumen_revendedor: un pago informado NO mueve plata
-- ni deuda hasta que se confirma, y al confirmarse se vuelve una fila de
-- `rendiciones` como cualquier otra (via 'encargado' con tenedor = el
-- encargado que la recibió, o 'directo_cuenta' si fue a la Cuenta Ananja),
-- así que esas vistas quedan consistentes sin cambiar su fórmula.
--
-- Migración templated (__SCHEMA__/__BUCKET__), ver supabase/README.md.

-- ============================================================
-- 1) Precio aprobado por ítem de entrega
-- ============================================================

-- Lo que la revendedora le debe a Ananja por cada botella de ESTE ítem
-- (precargado en pantalla con el costo Ananja del lote, editable por el
-- admin) y el precio de venta sugerido (precargado con el minorista
-- sugerido del lote). Nullable: entregas viejas / devoluciones no lo tienen.
alter table entrega_items
  add column costo_ananja_unitario_centavos bigint
    check (costo_ananja_unitario_centavos > 0),
  add column precio_sugerido_centavos bigint
    check (precio_sugerido_centavos > 0);

-- Misma firma y mismo cuerpo que la versión de prod (0029_costos_reales_lote.sql),
-- con tres agregados: (a) lee `costo_ananja_unitario_centavos` y
-- `precio_sugerido_centavos` de cada ítem (opcionales, solo en entregas —
-- en una devolución se ignoran), (b) valida que sean > 0, (c) bloquea la
-- fila del vendedor (`for no key update`) para que una venta simultánea de
-- la revendedora no se atribuya contra un stock a medio escribir.
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
  v_costo bigint;
  v_sugerido bigint;
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

  perform 1 from vendedores where id = p_vendedor_id for no key update;

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
    v_costo := null;
    v_sugerido := null;

    if v_producto_id is null or v_cantidad is null or v_cantidad <= 0 then
      raise exception 'SIN_ITEMS';
    end if;

    if p_tipo = 'entrega' then
      v_costo := nullif(v_item->>'costo_ananja_unitario_centavos', '')::bigint;
      v_sugerido := nullif(v_item->>'precio_sugerido_centavos', '')::bigint;

      if v_costo is not null and v_costo <= 0 then
        raise exception 'COSTO_INVALIDO';
      end if;

      if v_sugerido is not null and v_sugerido <= 0 then
        raise exception 'PRECIO_SUGERIDO_INVALIDO';
      end if;
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

revoke execute on function registrar_entrega_revendedor(uuid, text, date, text, jsonb, boolean) from anon, public;
grant execute on function registrar_entrega_revendedor(uuid, text, date, text, jsonb, boolean) to authenticated;

-- ============================================================
-- 2) Ventas atribuidas a la entrega de donde salieron
-- ============================================================

-- entrega_item_id: de qué ítem de entrega salieron estas botellas (null en
--   ventas anteriores a esta migración).
-- lote_id: copia del lote de ese ítem, para no tener que joinear.
-- grupo_id: una venta que cruza dos entregas con costos distintos se guarda
--   como dos filas con el mismo grupo_id (así cada fila conserva su propio
--   precio_costo_centavos y ninguna vista existente —v_deuda_vendedor,
--   v_resumen_revendedor, v_margen_ventas, gráficos— necesita cambiar: todas
--   ya suman cantidad × precio_costo por fila). Default gen_random_uuid():
--   una fila suelta es su propio grupo.
alter table ventas_revendedor
  add column entrega_item_id uuid references entrega_items(id),
  add column lote_id uuid references lotes_produccion(id),
  add column grupo_id uuid not null default gen_random_uuid();

-- Ventas cargadas por un admin en nombre de la revendedora (ej. lotes viejos
-- que ella nunca cargó): puede no saberse a cuánto se vendió ni cómo se
-- cobró. El check `precio_venta_centavos > 0` de 0018 sigue valiendo para
-- los valores cargados (un null lo pasa). La deuda con Ananja no cambia:
-- sale de precio_costo_centavos, que sigue siendo obligatorio.
-- registrada_por: el admin que la cargó (null = la cargó la propia
-- revendedora).
alter table ventas_revendedor
  alter column precio_venta_centavos drop not null,
  alter column medio_pago drop not null,
  add column registrada_por uuid references vendedores(id);

create index idx_ventas_revendedor_entrega_item_id on ventas_revendedor(entrega_item_id);
create index idx_ventas_revendedor_grupo_id on ventas_revendedor(grupo_id);

-- Stock que le queda a un vendedor en cada ítem de entrega de un producto,
-- en orden FIFO. Espejo EXACTO de `lib/revendedor-stock.ts` § stockPorEntrega
-- (tests en tests/revendedor-stock.test.ts) — si cambia una regla, cambian
-- las dos:
--  1. Entregas en orden (fecha, created_at, id del ítem).
--  2. A cada ítem se le restan las ventas ya atribuidas a él (mínimo 0).
--  3. Ventas sin atribución (anteriores a 0040): FIFO desde la más vieja.
--  4. Devoluciones con lote: dentro de ese lote, de la más nueva a la más
--     vieja; lo que no alcanza pasa al paso 5.
--  5. Devoluciones sin lote + sobrante: de la más nueva a la más vieja.
-- Sin security definer propio y sin grant a nadie: solo la llaman los RPCs
-- (security definer) de abajo.
create function __SCHEMA__.stock_revendedor_por_entrega(p_vendedor_id uuid, p_producto_id uuid)
returns table (
  orden int,
  entrega_item_id uuid,
  lote_id uuid,
  quedan int,
  costo_ananja_unitario_centavos bigint,
  precio_sugerido_centavos bigint,
  fecha date
)
language plpgsql
stable
set search_path = __SCHEMA__
as $$
#variable_conflict use_column
declare
  v_ids uuid[];
  v_lotes uuid[];
  v_quedan int[];
  v_costos bigint[];
  v_sugeridos bigint[];
  v_fechas date[];
  v_n int;
  v_i int;
  v_resto bigint;
  v_tomar int;
  v_sobrante bigint := 0;
  r record;
begin
  select
    array_agg(t.id order by t.fecha, t.created_at, t.id),
    array_agg(t.lote_id order by t.fecha, t.created_at, t.id),
    array_agg(t.quedan order by t.fecha, t.created_at, t.id),
    array_agg(t.costo order by t.fecha, t.created_at, t.id),
    array_agg(t.sugerido order by t.fecha, t.created_at, t.id),
    array_agg(t.fecha order by t.fecha, t.created_at, t.id)
  into v_ids, v_lotes, v_quedan, v_costos, v_sugeridos, v_fechas
  from (
    select
      ei.id,
      ei.lote_id,
      e.fecha,
      e.created_at,
      greatest(
        ei.cantidad - coalesce((
          select sum(vr.cantidad) from ventas_revendedor vr where vr.entrega_item_id = ei.id
        ), 0),
        0
      )::int as quedan,
      ei.costo_ananja_unitario_centavos as costo,
      ei.precio_sugerido_centavos as sugerido
    from entrega_items ei
    join entregas_revendedor e on e.id = ei.entrega_id
    where e.vendedor_id = p_vendedor_id
      and e.tipo = 'entrega'
      and ei.producto_id = p_producto_id
  ) t;

  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n = 0 then
    return;
  end if;

  -- 3) ventas sin atribución: de la más vieja a la más nueva
  select coalesce(sum(vr.cantidad), 0) into v_resto
  from ventas_revendedor vr
  where vr.vendedor_id = p_vendedor_id
    and vr.producto_id = p_producto_id
    and vr.entrega_item_id is null;

  for v_i in 1..v_n loop
    exit when v_resto <= 0;
    v_tomar := least(v_quedan[v_i], v_resto);
    v_quedan[v_i] := v_quedan[v_i] - v_tomar;
    v_resto := v_resto - v_tomar;
  end loop;

  -- 4) devoluciones con lote: dentro de su lote, de la más nueva a la más vieja
  for r in
    select ei.lote_id as lote, sum(ei.cantidad) as total
    from entrega_items ei
    join entregas_revendedor e on e.id = ei.entrega_id
    where e.vendedor_id = p_vendedor_id
      and e.tipo = 'devolucion'
      and ei.producto_id = p_producto_id
      and ei.lote_id is not null
    group by ei.lote_id
  loop
    v_resto := r.total;
    for v_i in reverse v_n..1 loop
      exit when v_resto <= 0;
      if v_lotes[v_i] = r.lote then
        v_tomar := least(v_quedan[v_i], v_resto);
        v_quedan[v_i] := v_quedan[v_i] - v_tomar;
        v_resto := v_resto - v_tomar;
      end if;
    end loop;
    v_sobrante := v_sobrante + v_resto;
  end loop;

  -- 5) devoluciones sin lote + sobrante: de la más nueva a la más vieja
  select coalesce(sum(ei.cantidad), 0) + v_sobrante into v_resto
  from entrega_items ei
  join entregas_revendedor e on e.id = ei.entrega_id
  where e.vendedor_id = p_vendedor_id
    and e.tipo = 'devolucion'
    and ei.producto_id = p_producto_id
    and ei.lote_id is null;

  for v_i in reverse v_n..1 loop
    exit when v_resto <= 0;
    v_tomar := least(v_quedan[v_i], v_resto);
    v_quedan[v_i] := v_quedan[v_i] - v_tomar;
    v_resto := v_resto - v_tomar;
  end loop;

  for v_i in 1..v_n loop
    orden := v_i;
    entrega_item_id := v_ids[v_i];
    lote_id := v_lotes[v_i];
    quedan := v_quedan[v_i];
    costo_ananja_unitario_centavos := v_costos[v_i];
    precio_sugerido_centavos := v_sugeridos[v_i];
    fecha := v_fechas[v_i];
    return next;
  end loop;
end;
$$;

revoke execute on function __SCHEMA__.stock_revendedor_por_entrega(uuid, uuid) from anon, authenticated, public;

-- insertar_venta_revendedor: lógica compartida de alta de una venta de
-- revendedora — la usan registrar_venta_revendedor (la propia revendedora,
-- misma firma que prod) y registrar_venta_revendedor_admin (un admin en su
-- nombre), así las dos atribuyen, validan stock y resuelven el costo EXACTO
-- igual. Sin security definer propio y sin grant: solo la llaman esos RPCs.
-- Cambios respecto del registrar_venta_revendedor de
-- 0026_roles_pendiente_espacio_revendedor.sql:
--  - Ya no exige precio revendedor manual de entrada: el costo por botella
--    sale de la entrega de donde sale la botella; el precio manual
--    (revendedor_precios) queda solo como respaldo para entregas sin costo
--    aprobado (las cargadas con la pantalla vieja). Sin ninguno de los dos:
--    PRECIO_NO_ASIGNADO, igual que antes.
--  - Reparte la venta FIFO entre entregas (una fila por tramo, mismo
--    grupo_id). Devuelve además `grupo_id` e `ids` (la UI vieja solo lee
--    `id`, que sigue siendo la primera fila).
--  - Bloquea la fila del vendedor para que dos ventas simultáneas no se
--    atribuyan al mismo stock.
--  - La fecha no puede ser futura (fecha de Argentina) ni anterior a la
--    entrega de donde saldría alguna botella (FECHA_ANTERIOR_A_ENTREGA, con
--    la fecha de esa entrega en el detalle): una venta vieja cargada tarde
--    no puede llevarse botellas que todavía no le habían entregado.
--  - `p_grupo_id` (opcional, lo manda el formulario de admin): si ya existe
--    una venta con ese grupo para este vendedor, la devuelve sin volver a
--    insertar (`ya_existia: true`) — un reintento después de perder la
--    respuesta no duplica la venta. Con otro vendedor: GRUPO_INVALIDO.
create function __SCHEMA__.insertar_venta_revendedor(
  p_vendedor_id uuid,
  p_producto_id uuid,
  p_cantidad int,
  p_precio_venta_centavos bigint,
  p_medio_pago medio_pago,
  p_fecha date,
  p_nota text,
  p_registrada_por uuid,
  p_grupo_id uuid
)
returns json
language plpgsql
set search_path = __SCHEMA__
as $$
declare
  v_dueño_grupo uuid;
  v_vendedor_id uuid := p_vendedor_id;
  v_precio_manual_centavos bigint;
  v_costo_centavos bigint;
  v_en_poder int;
  v_nombre text;
  v_grupo_id uuid := gen_random_uuid();
  v_venta_id uuid;
  v_ids uuid[] := '{}';
  v_resto int;
  v_tomar int;
  v_tramo record;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'CANTIDAD_INVALIDA';
  end if;

  -- Opcional acá (una venta cargada por un admin puede no tenerlo); si
  -- viene, tiene que ser > 0. registrar_venta_revendedor lo exige antes.
  if p_precio_venta_centavos is not null and p_precio_venta_centavos <= 0 then
    raise exception 'PRECIO_INVALIDO';
  end if;

  if p_fecha is null then
    raise exception 'FECHA_INVALIDA';
  end if;

  if p_fecha > (now() at time zone 'America/Argentina/Buenos_Aires')::date then
    raise exception 'FECHA_FUTURA';
  end if;

  perform 1 from vendedores where id = v_vendedor_id for no key update;

  if p_grupo_id is not null then
    select vendedor_id into v_dueño_grupo from ventas_revendedor where grupo_id = p_grupo_id limit 1;
    if v_dueño_grupo is not null then
      if v_dueño_grupo <> v_vendedor_id then
        raise exception 'GRUPO_INVALIDO';
      end if;
      select array_agg(id order by created_at, id) into v_ids
      from ventas_revendedor where grupo_id = p_grupo_id;
      return json_build_object('id', v_ids[1], 'grupo_id', p_grupo_id, 'ids', v_ids, 'ya_existia', true);
    end if;
    v_grupo_id := p_grupo_id;
  end if;

  select en_poder into v_en_poder
  from v_stock_revendedor where vendedor_id = v_vendedor_id and producto_id = p_producto_id;

  if coalesce(v_en_poder, 0) < p_cantidad then
    select nombre into v_nombre from productos where id = p_producto_id;
    raise exception 'STOCK_REVENDEDOR_INSUFICIENTE'
      using detail = json_build_object(
        'producto', v_nombre,
        'producto_id', p_producto_id,
        'disponible', coalesce(v_en_poder, 0)
      )::text;
  end if;

  select precio_centavos into v_precio_manual_centavos
  from revendedor_precios where vendedor_id = v_vendedor_id and producto_id = p_producto_id;

  v_resto := p_cantidad;

  for v_tramo in
    select s.entrega_item_id, s.lote_id, s.quedan, s.costo_ananja_unitario_centavos, s.fecha
    from __SCHEMA__.stock_revendedor_por_entrega(v_vendedor_id, p_producto_id) s
    where s.quedan > 0
    order by s.orden
  loop
    exit when v_resto <= 0;

    if v_tramo.fecha > p_fecha then
      select nombre into v_nombre from productos where id = p_producto_id;
      raise exception 'FECHA_ANTERIOR_A_ENTREGA'
        using detail = json_build_object(
          'producto', v_nombre,
          'producto_id', p_producto_id,
          'entrega_fecha', v_tramo.fecha
        )::text;
    end if;

    v_tomar := least(v_tramo.quedan, v_resto);
    v_costo_centavos := coalesce(v_tramo.costo_ananja_unitario_centavos, v_precio_manual_centavos);

    if v_costo_centavos is null then
      raise exception 'PRECIO_NO_ASIGNADO';
    end if;

    insert into ventas_revendedor (
      vendedor_id, producto_id, cantidad, precio_venta_centavos, precio_costo_centavos,
      medio_pago, fecha, nota, entrega_item_id, lote_id, grupo_id, registrada_por
    ) values (
      v_vendedor_id, p_producto_id, v_tomar, p_precio_venta_centavos, v_costo_centavos,
      p_medio_pago, p_fecha, p_nota, v_tramo.entrega_item_id,
      v_tramo.lote_id, v_grupo_id, p_registrada_por
    ) returning id into v_venta_id;

    v_ids := array_append(v_ids, v_venta_id);
    v_resto := v_resto - v_tomar;
  end loop;

  -- No debería pasar: el stock por entrega nunca es menor que en_poder (ya
  -- validado arriba). Red de seguridad por si los datos quedaron
  -- inconsistentes (ej. una devolución forzada con "Guardar igual").
  if v_resto > 0 then
    select nombre into v_nombre from productos where id = p_producto_id;
    raise exception 'STOCK_REVENDEDOR_INSUFICIENTE'
      using detail = json_build_object(
        'producto', v_nombre,
        'producto_id', p_producto_id,
        'disponible', p_cantidad - v_resto
      )::text;
  end if;

  return json_build_object('id', v_ids[1], 'grupo_id', v_grupo_id, 'ids', v_ids);
end;
$$;

revoke execute on function __SCHEMA__.insertar_venta_revendedor(uuid, uuid, int, bigint, medio_pago, date, text, uuid, uuid) from anon, authenticated, public;

-- registrar_venta_revendedor: la propia revendedora (o un admin desde su
-- espacio de revendedor). Misma firma que prod; precio y medio siguen
-- siendo obligatorios en este camino.
create or replace function registrar_venta_revendedor(
  p_producto_id uuid,
  p_cantidad int,
  p_precio_venta_centavos bigint,
  p_medio_pago medio_pago,
  p_fecha date,
  p_nota text default null
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
begin
  if not __SCHEMA__.puede_revender() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'CANTIDAD_INVALIDA';
  end if;

  if p_precio_venta_centavos is null or p_precio_venta_centavos <= 0 then
    raise exception 'PRECIO_INVALIDO';
  end if;

  if p_medio_pago is null then
    raise exception 'MEDIO_INVALIDO';
  end if;

  return __SCHEMA__.insertar_venta_revendedor(
    __SCHEMA__.mi_vendedor_id(), p_producto_id, p_cantidad, p_precio_venta_centavos,
    p_medio_pago, p_fecha, p_nota, null, null
  );
end;
$$;

revoke execute on function registrar_venta_revendedor(uuid, int, bigint, medio_pago, date, text) from anon, public;
grant execute on function registrar_venta_revendedor(uuid, int, bigint, medio_pago, date, text) to authenticated;

-- registrar_venta_revendedor_admin: un admin carga una venta en nombre de
-- una revendedora (o de un admin con espacio de revendedor) — ej. botellas
-- de lotes viejos que ella nunca cargó. Precio de venta y medio opcionales
-- (a veces no se sabe); la deuda con Ananja se genera igual, al costo de
-- la entrega de donde salen las botellas. Queda registrado quién la cargó.
-- `p_grupo_id`: id de la venta generado por el formulario, para que un
-- reintento no la duplique (ver insertar_venta_revendedor).
create function registrar_venta_revendedor_admin(
  p_vendedor_id uuid,
  p_producto_id uuid,
  p_cantidad int,
  p_fecha date,
  p_precio_venta_centavos bigint default null,
  p_medio_pago medio_pago default null,
  p_nota text default null,
  p_grupo_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if not exists (
    select 1 from vendedores
    where id = p_vendedor_id and activo and (rol = 'revendedor' or (rol = 'admin' and revende))
  ) then
    raise exception 'REVENDEDOR_INVALIDO';
  end if;

  return __SCHEMA__.insertar_venta_revendedor(
    p_vendedor_id, p_producto_id, p_cantidad, p_precio_venta_centavos,
    p_medio_pago, p_fecha, p_nota, __SCHEMA__.mi_vendedor_id(), p_grupo_id
  );
end;
$$;

revoke execute on function registrar_venta_revendedor_admin(uuid, uuid, int, date, bigint, medio_pago, text, uuid) from anon, public;
grant execute on function registrar_venta_revendedor_admin(uuid, uuid, int, date, bigint, medio_pago, text, uuid) to authenticated;

-- fijar_precio_venta_revendedor: completa (o corrige) a cuánto se vendió
-- una venta, en todas sus filas (mismo grupo_id). Lo puede hacer un admin o
-- la propia revendedora dueña de la venta. `p_medio_pago` opcional: si
-- viene, también se guarda. No toca precio_costo_centavos (la deuda).
create function fijar_precio_venta_revendedor(
  p_grupo_id uuid,
  p_precio_venta_centavos bigint,
  p_medio_pago medio_pago default null
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_yo uuid;
  v_dueño_id uuid;
  v_filas int;
begin
  v_yo := __SCHEMA__.mi_vendedor_id();
  if v_yo is null then
    raise exception 'NO_AUTORIZADO';
  end if;

  select vendedor_id into v_dueño_id from ventas_revendedor where grupo_id = p_grupo_id limit 1;
  if v_dueño_id is null then
    raise exception 'VENTA_NO_ENCONTRADA';
  end if;

  if not __SCHEMA__.es_admin() and not (v_dueño_id = v_yo and __SCHEMA__.puede_revender()) then
    raise exception 'NO_AUTORIZADO';
  end if;

  if p_precio_venta_centavos is null or p_precio_venta_centavos <= 0 then
    raise exception 'PRECIO_INVALIDO';
  end if;

  update ventas_revendedor set
    precio_venta_centavos = p_precio_venta_centavos,
    medio_pago = coalesce(p_medio_pago, medio_pago)
  where grupo_id = p_grupo_id;

  get diagnostics v_filas = row_count;

  return json_build_object('grupo_id', p_grupo_id, 'filas', v_filas);
end;
$$;

revoke execute on function fijar_precio_venta_revendedor(uuid, bigint, medio_pago) from anon, public;
grant execute on function fijar_precio_venta_revendedor(uuid, bigint, medio_pago) to authenticated;

-- Misma firma. Borra el grupo entero (una venta partida en dos entregas es
-- UNA venta para la revendedora). Quién puede (decisión de Fran):
--  - Un admin: cualquier venta de cualquier revendedora.
--  - La revendedora: solo sus ventas que cargó ella misma; una venta que
--    cargó un admin en su nombre (registrada_por de otra persona) solo la
--    borra un admin → NO_AUTORIZADO.
create or replace function eliminar_venta_revendedor(
  p_venta_id uuid
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_vendedor_id uuid;
  v_dueño_id uuid;
  v_grupo_id uuid;
begin
  v_vendedor_id := __SCHEMA__.mi_vendedor_id();
  if v_vendedor_id is null then
    raise exception 'NO_AUTORIZADO';
  end if;

  select vendedor_id, grupo_id into v_dueño_id, v_grupo_id
  from ventas_revendedor where id = p_venta_id;
  if v_dueño_id is null then
    raise exception 'VENTA_NO_ENCONTRADA';
  end if;

  if not __SCHEMA__.es_admin() then
    if v_dueño_id <> v_vendedor_id then
      raise exception 'NO_AUTORIZADO';
    end if;

    if exists (
      select 1 from ventas_revendedor
      where grupo_id = v_grupo_id and registrada_por is not null and registrada_por <> v_vendedor_id
    ) then
      raise exception 'NO_AUTORIZADO';
    end if;
  end if;

  delete from ventas_revendedor where grupo_id = v_grupo_id and vendedor_id = v_dueño_id;

  return json_build_object('id', p_venta_id, 'grupo_id', v_grupo_id);
end;
$$;

revoke execute on function eliminar_venta_revendedor(uuid) from anon, public;
grant execute on function eliminar_venta_revendedor(uuid) to authenticated;

-- ============================================================
-- 3) Pagos informados por la revendedora
-- ============================================================

-- La RLS de `vendedores` solo le deja leer a una revendedora su propia fila
-- (`user_id = auth.uid() or es_vendedor()`), así que no puede leer el
-- nombre de su encargado con un select directo. Este RPC le devuelve solo
-- eso: su encargado, si es un admin activo (misma condición que usa
-- informar_pago_revendedor para decidir el destinatario).
create function mi_encargado_revendedor()
returns table (id uuid, nombre text)
language sql
stable
security definer
set search_path = __SCHEMA__
as $$
  select enc.id, enc.nombre
  from vendedores yo
  join vendedores enc on enc.id = yo.encargado_id
  where yo.id = __SCHEMA__.mi_vendedor_id()
    and __SCHEMA__.puede_revender()
    and enc.rol = 'admin'
    and enc.activo;
$$;

revoke execute on function mi_encargado_revendedor() from anon, public;
grant execute on function mi_encargado_revendedor() to authenticated;

create table pagos_revendedor (
  id uuid primary key default gen_random_uuid(),
  -- quien paga (revendedora, o admin con espacio de revendedor)
  vendedor_id uuid not null references vendedores(id),
  -- a quién: su encargado al momento de informar (snapshot, igual criterio
  -- que rendiciones.tenedor_id); null = directo a la Cuenta Ananja
  destinatario_id uuid references vendedores(id),
  monto_centavos bigint not null check (monto_centavos > 0),
  medio_pago medio_pago not null,
  fecha date not null,
  -- archivo en Storage, siempre dentro de revendedores/<vendedor_id>/
  imagen_path text,
  nota text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'confirmado', 'rechazado')),
  rendicion_id uuid references rendiciones(id),
  resuelto_por uuid references vendedores(id),
  resuelto_en timestamptz,
  motivo_rechazo text,
  created_at timestamptz not null default now(),
  -- a la Cuenta Ananja no se le puede dar efectivo (no hay caja física)
  constraint pagos_revendedor_ananja_sin_efectivo
    check (destinatario_id is not null or medio_pago <> 'efectivo'),
  constraint pagos_revendedor_estado_coherente check (
    (estado = 'pendiente' and rendicion_id is null and resuelto_por is null
      and resuelto_en is null and motivo_rechazo is null)
    or (estado = 'confirmado' and rendicion_id is not null and resuelto_por is not null
      and resuelto_en is not null and motivo_rechazo is null)
    or (estado = 'rechazado' and rendicion_id is null and resuelto_por is not null
      and resuelto_en is not null and motivo_rechazo is not null)
  )
);

create index idx_pagos_revendedor_vendedor_id on pagos_revendedor(vendedor_id, fecha desc);
create index idx_pagos_revendedor_pendientes on pagos_revendedor(destinatario_id)
  where estado = 'pendiente';
-- Un pago confirmado genera exactamente una rendición, y una rendición
-- pertenece a lo sumo a un pago.
create unique index uq_pagos_revendedor_rendicion_id on pagos_revendedor(rendicion_id)
  where rendicion_id is not null;

alter table pagos_revendedor enable row level security;
revoke all on pagos_revendedor from anon, authenticated, public;
grant select on pagos_revendedor to authenticated;

-- Misma regla que rendiciones/ventas_revendedor: la revendedora ve los
-- suyos, un admin ve todos. Sin insert/update/delete directo: solo RPCs.
create policy pagos_revendedor_select on pagos_revendedor for select to authenticated
  using (__SCHEMA__.es_admin() or vendedor_id = __SCHEMA__.mi_vendedor_id());

-- Notificación dirigida: destinatario_id null = para todos los admins
-- (todas las notificaciones que existían hasta hoy); con valor = solo para
-- esa persona.
alter type tipo_notificacion add value if not exists 'pago_revendedor';

alter table notificaciones add column destinatario_id uuid references vendedores(id);

drop policy if exists notificaciones_select on notificaciones;
create policy notificaciones_select on notificaciones for select to authenticated
  using (
    __SCHEMA__.es_vendedor()
    and (destinatario_id is null or destinatario_id = __SCHEMA__.mi_vendedor_id())
  );

-- informar_pago_revendedor: la revendedora (o un admin desde su espacio de
-- revendedor) avisa que pagó. No mueve deuda ni plata: queda 'pendiente'
-- hasta que el destinatario lo confirma.
create function informar_pago_revendedor(
  p_monto_centavos bigint,
  p_medio_pago medio_pago,
  p_fecha date,
  p_imagen_path text default null,
  p_nota text default null
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_vendedor_id uuid;
  v_nombre text;
  v_encargado_id uuid;
  v_destinatario_id uuid;
  v_imagen text;
  v_pago_id uuid;
begin
  if not __SCHEMA__.puede_revender() then
    raise exception 'NO_AUTORIZADO';
  end if;

  v_vendedor_id := __SCHEMA__.mi_vendedor_id();

  if p_monto_centavos is null or p_monto_centavos <= 0 then
    raise exception 'MONTO_INVALIDO';
  end if;

  if p_medio_pago is null then
    raise exception 'MEDIO_INVALIDO';
  end if;

  if p_fecha is null then
    raise exception 'FECHA_INVALIDA';
  end if;

  select nombre, encargado_id into v_nombre, v_encargado_id
  from vendedores where id = v_vendedor_id;

  -- Solo cuenta como encargado un admin activo; si no, va a la Cuenta Ananja.
  select id into v_destinatario_id
  from vendedores where id = v_encargado_id and rol = 'admin' and activo;

  if v_destinatario_id is null and p_medio_pago = 'efectivo' then
    raise exception 'MEDIO_INVALIDO';
  end if;

  v_imagen := nullif(btrim(p_imagen_path), '');

  if v_imagen is null and p_medio_pago <> 'efectivo' then
    raise exception 'COMPROBANTE_REQUERIDO';
  end if;

  if v_imagen is not null
    and left(v_imagen, length('revendedores/' || v_vendedor_id::text || '/'))
      <> 'revendedores/' || v_vendedor_id::text || '/'
  then
    raise exception 'COMPROBANTE_INVALIDO';
  end if;

  insert into pagos_revendedor (
    vendedor_id, destinatario_id, monto_centavos, medio_pago, fecha, imagen_path, nota
  ) values (
    v_vendedor_id, v_destinatario_id, p_monto_centavos, p_medio_pago, p_fecha, v_imagen,
    nullif(btrim(p_nota), '')
  ) returning id into v_pago_id;

  insert into notificaciones (tipo, titulo, detalle, referencia_id, destinatario_id)
  values (
    'pago_revendedor',
    'Pago de ' || v_nombre,
    'Revisalo en Tareas para confirmarlo.',
    v_pago_id,
    v_destinatario_id
  );

  return json_build_object('id', v_pago_id, 'destinatario_id', v_destinatario_id);
end;
$$;

revoke execute on function informar_pago_revendedor(bigint, medio_pago, date, text, text) from anon, public;
grant execute on function informar_pago_revendedor(bigint, medio_pago, date, text, text) to authenticated;

-- confirmar_pago_revendedor: el encargado destinatario (o cualquier admin si
-- el pago fue a la Cuenta Ananja, o si el encargado ya no es un admin
-- activo) confirma que recibió la plata. Crea la rendición con las mismas
-- reglas que registrar_rendicion (no se llama a ese RPC porque su tenedor
-- sería el encargado ACTUAL de la revendedora, y acá tiene que ser quien
-- efectivamente recibió el pago):
--  - destinatario = encargado → via 'encargado', tenedor = ese encargado
--    (la plata aparece en sus manos en v_plata_en_manos; cualquier medio).
--    Si ese encargado ya no es un admin activo, el tenedor es el admin que
--    confirma: registrar_deposito_cuenta exige un tenedor admin activo y
--    v_plata_en_manos solo lista admins, así que la plata quedaría trabada
--    en manos de alguien que ya no puede pasarla a la cuenta.
--  - destinatario = Ananja → via 'directo_cuenta', sin tenedor (entra a
--    banco/mercado_pago en v_saldos_caja/v_cuenta_ananja); efectivo =
--    MEDIO_INVALIDO (el check de la tabla ya lo impide, se repite como red).
-- Nadie confirma ni rechaza su propio pago: un admin con espacio de
-- revendedor y sin encargado paga "a Ananja", y sin esta regla podría
-- confirmarse la plata a sí mismo.
-- No se exige que la revendedora siga activa: si se la dio de baja después
-- de informar el pago, la plata igual se recibió y tiene que registrarse.
-- `for update` sobre el pago: dos confirmaciones simultáneas no pueden
-- crear dos rendiciones (la segunda ve estado <> 'pendiente').
create function confirmar_pago_revendedor(p_pago_id uuid)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_admin_id uuid;
  v_pago pagos_revendedor%rowtype;
  v_destinatario_activo boolean;
  v_via text;
  v_tenedor_id uuid;
  v_rendicion_id uuid;
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;
  v_admin_id := __SCHEMA__.mi_vendedor_id();

  select * into v_pago from pagos_revendedor where id = p_pago_id for update;
  if not found then
    raise exception 'PAGO_NO_ENCONTRADO';
  end if;

  if v_pago.estado <> 'pendiente' then
    raise exception 'PAGO_YA_RESUELTO';
  end if;

  if v_pago.vendedor_id = v_admin_id then
    raise exception 'NO_AUTORIZADO';
  end if;

  v_destinatario_activo := v_pago.destinatario_id is not null and exists (
    select 1 from vendedores where id = v_pago.destinatario_id and rol = 'admin' and activo
  );

  if v_destinatario_activo and v_pago.destinatario_id <> v_admin_id then
    raise exception 'NO_AUTORIZADO';
  end if;

  v_via := case when v_pago.destinatario_id is null then 'directo_cuenta' else 'encargado' end;

  if v_via <> 'encargado' and v_pago.medio_pago = 'efectivo' then
    raise exception 'MEDIO_INVALIDO';
  end if;

  v_tenedor_id := case
    when v_via <> 'encargado' then null
    when v_destinatario_activo then v_pago.destinatario_id
    else v_admin_id
  end;

  insert into rendiciones (vendedor_id, monto_centavos, medio_pago, fecha, nota, admin_id, via, tenedor_id)
  values (
    v_pago.vendedor_id, v_pago.monto_centavos, v_pago.medio_pago, v_pago.fecha,
    coalesce(v_pago.nota, 'Pago informado desde la app'), v_admin_id, v_via, v_tenedor_id
  )
  returning id into v_rendicion_id;

  update pagos_revendedor set
    estado = 'confirmado',
    rendicion_id = v_rendicion_id,
    resuelto_por = v_admin_id,
    resuelto_en = now()
  where id = p_pago_id;

  return json_build_object('id', p_pago_id, 'rendicion_id', v_rendicion_id, 'via', v_via, 'tenedor_id', v_tenedor_id);
end;
$$;

revoke execute on function confirmar_pago_revendedor(uuid) from anon, public;
grant execute on function confirmar_pago_revendedor(uuid) to authenticated;

-- rechazar_pago_revendedor: mismas reglas de quién puede resolver; exige
-- motivo (la revendedora lo ve en /mi). No crea nada en rendiciones.
create function rechazar_pago_revendedor(p_pago_id uuid, p_motivo text)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_admin_id uuid;
  v_pago pagos_revendedor%rowtype;
  v_motivo text;
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;
  v_admin_id := __SCHEMA__.mi_vendedor_id();

  v_motivo := nullif(btrim(p_motivo), '');
  if v_motivo is null then
    raise exception 'MOTIVO_REQUERIDO';
  end if;

  select * into v_pago from pagos_revendedor where id = p_pago_id for update;
  if not found then
    raise exception 'PAGO_NO_ENCONTRADO';
  end if;

  if v_pago.estado <> 'pendiente' then
    raise exception 'PAGO_YA_RESUELTO';
  end if;

  if v_pago.vendedor_id = v_admin_id then
    raise exception 'NO_AUTORIZADO';
  end if;

  if v_pago.destinatario_id is not null
    and v_pago.destinatario_id <> v_admin_id
    and exists (
      select 1 from vendedores where id = v_pago.destinatario_id and rol = 'admin' and activo
    )
  then
    raise exception 'NO_AUTORIZADO';
  end if;

  update pagos_revendedor set
    estado = 'rechazado',
    motivo_rechazo = v_motivo,
    resuelto_por = v_admin_id,
    resuelto_en = now()
  where id = p_pago_id;

  return json_build_object('id', p_pago_id);
end;
$$;

revoke execute on function rechazar_pago_revendedor(uuid, text) from anon, public;
grant execute on function rechazar_pago_revendedor(uuid, text) to authenticated;

-- registrar_rendicion: recreada desde la definición de prod (0037, misma
-- firma, grants y validaciones). Único cambio, la misma regla que
-- confirmar_pago_revendedor: con via 'encargado', el tenedor es el
-- encargado de la revendedora SOLO si sigue siendo un admin activo; si no
-- (dado de baja, o ya no es admin), la plata queda en manos del admin que
-- registra la rendición — si no, quedaba trabada en manos de alguien que ya
-- no puede pasarla a la cuenta (registrar_deposito_cuenta exige un tenedor
-- admin activo).
create or replace function registrar_rendicion(
  p_vendedor_id uuid,
  p_monto_centavos bigint,
  p_medio_pago medio_pago,
  p_fecha date,
  p_nota text default null,
  p_via text default null
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_admin_id uuid;
  v_rendicion_id uuid;
  v_encargado_id uuid;
  v_tenedor_id uuid;
  v_via text;
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

  if p_monto_centavos is null or p_monto_centavos <= 0 then
    raise exception 'MONTO_INVALIDO';
  end if;

  -- Sin via explícito: se deriva del medio_pago, igual que se comportaba
  -- la base ANTES de 0037 (toda rendición acreditaba su medio_pago tal
  -- cual, sin distinción de via).
  v_via := coalesce(p_via, case when p_medio_pago = 'efectivo' then 'encargado' else 'directo_cuenta' end);

  if v_via not in ('encargado', 'directo_cuenta', 'cliente_directo') then
    raise exception 'VIA_INVALIDA';
  end if;

  if v_via <> 'encargado' and p_medio_pago = 'efectivo' then
    raise exception 'MEDIO_INVALIDO';
  end if;

  if v_via = 'encargado' then
    select enc.id into v_encargado_id
    from vendedores yo
    join vendedores enc on enc.id = yo.encargado_id
    where yo.id = p_vendedor_id and enc.rol = 'admin' and enc.activo;
    v_tenedor_id := coalesce(v_encargado_id, v_admin_id);
  else
    v_tenedor_id := null;
  end if;

  insert into rendiciones (vendedor_id, monto_centavos, medio_pago, fecha, nota, admin_id, via, tenedor_id)
  values (p_vendedor_id, p_monto_centavos, p_medio_pago, coalesce(p_fecha, current_date), p_nota, v_admin_id, v_via, v_tenedor_id)
  returning id into v_rendicion_id;

  return json_build_object('id', v_rendicion_id, 'via', v_via, 'tenedor_id', v_tenedor_id);
end;
$$;

revoke execute on function registrar_rendicion(uuid, bigint, medio_pago, date, text, text) from anon, public;
grant execute on function registrar_rendicion(uuid, bigint, medio_pago, date, text, text) to authenticated;

-- Storage: hasta hoy solo los admins suben y leen (`es_vendedor()` =
-- `es_admin()`). Una revendedora necesita subir el comprobante de su pago y
-- volver a verlo — solo dentro de su propia carpeta
-- `revendedores/<su vendedor_id>/...`. Los admins ya leen todo el bucket
-- con storage_select___SCHEMA__.
-- @solo-public:inicio
create policy storage_insert_revendedor___SCHEMA__ on storage.objects
  for insert to authenticated
  with check (
    bucket_id = '__BUCKET__'
    and __SCHEMA__.puede_revender()
    and (storage.foldername(name))[1] = 'revendedores'
    and (storage.foldername(name))[2] = __SCHEMA__.mi_vendedor_id()::text
  );

create policy storage_select_revendedor___SCHEMA__ on storage.objects
  for select to authenticated
  using (
    bucket_id = '__BUCKET__'
    and __SCHEMA__.puede_revender()
    and (storage.foldername(name))[1] = 'revendedores'
    and (storage.foldername(name))[2] = __SCHEMA__.mi_vendedor_id()::text
  );
-- @solo-public:fin

-- ============================================================
-- 4) Margen y cobranza con el costo aprobado
-- ============================================================

-- v_margen_ventas: recreada desde la definición de prod (0031_margen_ventas.sql,
-- pg_get_viewdef al 2026-09-15), mismas columnas en el mismo orden. Cambios,
-- solo para filas de revendedora:
--  - Una venta con `lote_id` (todas las de 0040 en adelante) va directo a
--    `con_lote` con ese lote (`costo_estimado = false`) y descuenta su
--    cantidad de la capacidad FIFO del lote (`lote_directo`), igual que un
--    comprobante con lote. Solo las ventas viejas sin lote siguen pasando por
--    la estimación FIFO.
--  - `ingreso_ananja` = precio_costo real × cantidad (como antes).
--  - `margen_ananja` = (precio_costo real − costo de producción) × cantidad:
--    lo que Ananja gana de verdad es el costo que el admin aprobó en la
--    entrega, no el costo Ananja teórico del lote (antes usaba el teórico).
--  - `margen_vendedor` = (precio de venta − precio_costo real) × cantidad:
--    exactamente lo que la revendedora ve como "Tu ganancia" en /mi (antes
--    restaba el costo Ananja teórico del lote y quedaba null sin costos).
-- `costo_ananja_unitario_centavos` sigue mostrando el costo teórico del lote
-- (informativo). Comprobantes: misma fórmula. Ojo: el costo ESTIMADO (FIFO)
-- de los comprobantes sin lote sí puede moverse, porque las ventas de
-- revendedora con lote ahora descuentan capacidad de su lote igual que un
-- comprobante con lote. v_resultado_feria depende de esta vista y solo suma
-- filas de feria (siempre comprobantes): su margen de Ananja puede cambiar
-- solo por ese reparto FIFO distinto, no por la fórmula.
create or replace view v_margen_ventas as
with lote_directo as (
  select dl.lote_id, dl.producto_id, coalesce(sum(dl.cantidad), 0)::bigint as asignado_directo
  from (
    select ci.lote_id, ci.producto_id, ci.cantidad
    from comprobante_items ci
    where ci.lote_id is not null
    union all
    select vr.lote_id, vr.producto_id, vr.cantidad
    from ventas_revendedor vr
    where vr.lote_id is not null
  ) dl
  group by dl.lote_id, dl.producto_id
), lote_capacidad as (
  select li.lote_id,
    li.producto_id,
    l.fecha,
    l.created_at,
    greatest(li.cantidad - coalesce(ld.asignado_directo, 0::bigint), 0::bigint) as capacidad
  from lote_items li
    join lotes_produccion l on l.id = li.lote_id
    left join lote_directo ld on ld.lote_id = li.lote_id and ld.producto_id = li.producto_id
), lote_capacidad_off as (
  select lc.lote_id,
    lc.producto_id,
    lc.fecha,
    lc.created_at,
    lc.capacidad,
    coalesce(sum(lc.capacidad) over (partition by lc.producto_id order by lc.fecha, lc.created_at, lc.lote_id rows between unbounded preceding and 1 preceding), 0::numeric)::bigint as offset_previo
  from lote_capacidad lc
  where lc.capacidad > 0
), lote_capacidad_rango as (
  select lote_capacidad_off.lote_id,
    lote_capacidad_off.producto_id,
    lote_capacidad_off.fecha,
    lote_capacidad_off.created_at,
    lote_capacidad_off.capacidad,
    lote_capacidad_off.offset_previo,
    lote_capacidad_off.offset_previo + lote_capacidad_off.capacidad as fin_posicion
  from lote_capacidad_off
), demanda_sin_lote as (
  select 'comprobante'::text as origen,
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
  select 'revendedor'::text as origen,
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
  where vr.lote_id is null
), demanda_off as (
  select d_1.origen,
    d_1.documento_id,
    d_1.fecha,
    d_1.created_at,
    d_1.orden_id,
    d_1.producto_id,
    d_1.cantidad,
    d_1.vendedor_id,
    d_1.feria_id,
    d_1.precio_unitario_centavos,
    d_1.precio_costo_real_centavos,
    coalesce(sum(d_1.cantidad) over (partition by d_1.producto_id order by d_1.fecha, d_1.created_at, d_1.orden_id rows between unbounded preceding and 1 preceding), 0::bigint) as offset_previo
  from demanda_sin_lote d_1
), demanda_con_frontera as (
  select d_1.origen,
    d_1.documento_id,
    d_1.fecha,
    d_1.created_at,
    d_1.orden_id,
    d_1.producto_id,
    d_1.cantidad,
    d_1.vendedor_id,
    d_1.feria_id,
    d_1.precio_unitario_centavos,
    d_1.precio_costo_real_centavos,
    d_1.offset_previo,
    coalesce((
      select max(lcr.fin_posicion) as max
      from lote_capacidad_rango lcr
      where lcr.producto_id = d_1.producto_id and lcr.fecha <= d_1.fecha
    ), 0::bigint) as frontera,
    greatest(least(d_1.offset_previo + d_1.cantidad, coalesce((
      select max(lcr.fin_posicion) as max
      from lote_capacidad_rango lcr
      where lcr.producto_id = d_1.producto_id and lcr.fecha <= d_1.fecha
    ), 0::bigint)) - d_1.offset_previo, 0::bigint) as cantidad_satisfecha
  from demanda_off d_1
), sin_lote_resuelto as (
  select d_1.origen,
    d_1.documento_id,
    d_1.fecha,
    d_1.producto_id,
    lcr.lote_id,
    d_1.vendedor_id,
    d_1.feria_id,
    d_1.precio_unitario_centavos,
    d_1.precio_costo_real_centavos,
    (least(d_1.offset_previo + d_1.cantidad_satisfecha, lcr.fin_posicion) - greatest(d_1.offset_previo, lcr.offset_previo))::integer as cantidad,
    true as costo_estimado
  from demanda_con_frontera d_1
    join lote_capacidad_rango lcr on lcr.producto_id = d_1.producto_id and lcr.offset_previo < (d_1.offset_previo + d_1.cantidad_satisfecha) and lcr.fin_posicion > d_1.offset_previo
  where d_1.cantidad_satisfecha > 0
), sin_lote_no_resuelto as (
  select d_1.origen,
    d_1.documento_id,
    d_1.fecha,
    d_1.producto_id,
    null::uuid as lote_id,
    d_1.vendedor_id,
    d_1.feria_id,
    d_1.precio_unitario_centavos,
    d_1.precio_costo_real_centavos,
    (d_1.cantidad - d_1.cantidad_satisfecha)::integer as cantidad,
    true as costo_estimado
  from demanda_con_frontera d_1
  where (d_1.cantidad - d_1.cantidad_satisfecha) > 0
), sin_lote_agregado as (
  select sin_lote_resuelto.origen,
    sin_lote_resuelto.documento_id,
    sin_lote_resuelto.fecha,
    sin_lote_resuelto.producto_id,
    sin_lote_resuelto.lote_id,
    sin_lote_resuelto.vendedor_id,
    sin_lote_resuelto.feria_id,
    sin_lote_resuelto.precio_unitario_centavos,
    sin_lote_resuelto.precio_costo_real_centavos,
    sin_lote_resuelto.cantidad,
    sin_lote_resuelto.costo_estimado
  from sin_lote_resuelto
  union all
  select sin_lote_no_resuelto.origen,
    sin_lote_no_resuelto.documento_id,
    sin_lote_no_resuelto.fecha,
    sin_lote_no_resuelto.producto_id,
    sin_lote_no_resuelto.lote_id,
    sin_lote_no_resuelto.vendedor_id,
    sin_lote_no_resuelto.feria_id,
    sin_lote_no_resuelto.precio_unitario_centavos,
    sin_lote_no_resuelto.precio_costo_real_centavos,
    sin_lote_no_resuelto.cantidad,
    sin_lote_no_resuelto.costo_estimado
  from sin_lote_no_resuelto
), con_lote as (
  select 'comprobante'::text as origen,
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
  union all
  select 'revendedor'::text as origen,
    vr.id as documento_id,
    vr.fecha,
    vr.producto_id,
    vr.lote_id,
    vr.vendedor_id,
    null::uuid as feria_id,
    vr.precio_venta_centavos as precio_unitario_centavos,
    vr.precio_costo_centavos as precio_costo_real_centavos,
    vr.cantidad,
    false as costo_estimado
  from ventas_revendedor vr
  where vr.lote_id is not null
), todas as (
  select con_lote.origen,
    con_lote.documento_id,
    con_lote.fecha,
    con_lote.producto_id,
    con_lote.lote_id,
    con_lote.vendedor_id,
    con_lote.feria_id,
    con_lote.precio_unitario_centavos,
    con_lote.precio_costo_real_centavos,
    con_lote.cantidad,
    con_lote.costo_estimado
  from con_lote
  union all
  select sin_lote_agregado.origen,
    sin_lote_agregado.documento_id,
    sin_lote_agregado.fecha,
    sin_lote_agregado.producto_id,
    sin_lote_agregado.lote_id,
    sin_lote_agregado.vendedor_id,
    sin_lote_agregado.feria_id,
    sin_lote_agregado.precio_unitario_centavos,
    sin_lote_agregado.precio_costo_real_centavos,
    sin_lote_agregado.cantidad,
    sin_lote_agregado.costo_estimado
  from sin_lote_agregado
), costo_seguro as (
  select v_costo_lote_desglose.lote_id,
    v_costo_lote_desglose.producto_id,
    case
      when v_costo_lote_desglose.tiene_costos then v_costo_lote_desglose.costo_unitario_centavos
      else null::bigint
    end as costo_produccion_unitario_centavos,
    case
      when v_costo_lote_desglose.tiene_costos then v_costo_lote_desglose.costo_ananja_centavos
      else null::bigint
    end as costo_ananja_unitario_centavos
  from v_costo_lote_desglose
)
select t.origen,
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
    when t.origen = 'revendedor'::text then t.precio_costo_real_centavos * t.cantidad
    when d.costo_ananja_unitario_centavos is not null then d.costo_ananja_unitario_centavos * t.cantidad
    else null::bigint
  end as ingreso_ananja_centavos,
  case
    when t.origen = 'revendedor'::text then
      case
        when t.precio_costo_real_centavos is not null and d.costo_produccion_unitario_centavos is not null
          then (t.precio_costo_real_centavos - d.costo_produccion_unitario_centavos) * t.cantidad
        else null::bigint
      end
    when d.costo_ananja_unitario_centavos is not null and d.costo_produccion_unitario_centavos is not null
      then (d.costo_ananja_unitario_centavos - d.costo_produccion_unitario_centavos) * t.cantidad
    else null::bigint
  end as margen_ananja_centavos,
  case
    when t.origen = 'revendedor'::text then
      case
        when t.precio_unitario_centavos is not null and t.precio_costo_real_centavos is not null
          then (t.precio_unitario_centavos - t.precio_costo_real_centavos) * t.cantidad
        else null::bigint
      end
    when t.precio_unitario_centavos is not null and d.costo_ananja_unitario_centavos is not null
      then (t.precio_unitario_centavos - d.costo_ananja_unitario_centavos) * t.cantidad
    else null::bigint
  end as margen_vendedor_centavos
from todas t
  left join costo_seguro d on d.lote_id = t.lote_id and d.producto_id = t.producto_id;

alter view v_margen_ventas set (security_invoker = true);

-- v_cobranza_lote: recreada desde la definición de prod, mismas columnas.
-- Único cambio: `esperado_por_vendidas_centavos`. Antes era costo Ananja del
-- lote × unidades vendidas netas; ahora las botellas entregadas a
-- revendedoras con costo aprobado (entrega_items.costo_ananja_unitario_centavos)
-- cuentan a ese costo aprobado, y el resto (comprobantes, entregas viejas sin
-- costo) sigue al costo del lote. Las devoluciones de un lote/producto
-- descuentan primero de lo entregado con costo aprobado, al costo promedio
-- aprobado de ese lote/producto (una devolución no dice de qué entrega
-- vuelve). Sin entregas con costo aprobado, el resultado es idéntico al de
-- antes. `esperado_total_centavos` (todo lo producido menos pérdidas) sigue
-- al costo del lote: todavía no se sabe a quién ni a cuánto se va a entregar.
create or replace view v_cobranza_lote as
with vendidas_brutas as (
  select movimientos_stock.lote_id,
    movimientos_stock.producto_id,
    sum(movimientos_stock.cantidad) as unidades
  from movimientos_stock
  where movimientos_stock.tipo = 'egreso'::tipo_movimiento and movimientos_stock.lote_id is not null and movimientos_stock.motivo = 'venta'::text
  group by movimientos_stock.lote_id, movimientos_stock.producto_id
), devoluciones as (
  select movimientos_stock.lote_id,
    movimientos_stock.producto_id,
    sum(movimientos_stock.cantidad) as unidades
  from movimientos_stock
  where movimientos_stock.tipo = 'ingreso'::tipo_movimiento and movimientos_stock.lote_id is not null and movimientos_stock.entrega_id is not null
  group by movimientos_stock.lote_id, movimientos_stock.producto_id
), perdidas as (
  select v_perdidas_lote.lote_id,
    v_perdidas_lote.producto_id,
    sum(v_perdidas_lote.unidades) as unidades
  from v_perdidas_lote
  group by v_perdidas_lote.lote_id, v_perdidas_lote.producto_id
), entregas_aprobadas as (
  select ei.lote_id,
    ei.producto_id,
    sum(ei.cantidad) as unidades,
    sum(ei.cantidad::bigint * ei.costo_ananja_unitario_centavos) as monto
  from entrega_items ei
    join entregas_revendedor e on e.id = ei.entrega_id
  where e.tipo = 'entrega' and ei.lote_id is not null and ei.costo_ananja_unitario_centavos is not null
  group by ei.lote_id, ei.producto_id
), netas as (
  select d.lote_id,
    d.producto_id,
    greatest(coalesce(vb.unidades, 0::bigint) - coalesce(dv.unidades, 0::bigint), 0::bigint) as vendidas,
    greatest(coalesce(ea.unidades, 0::bigint) - coalesce(dv.unidades, 0::bigint), 0::bigint) as aprobadas,
    ea.unidades as aprobadas_brutas,
    ea.monto as monto_aprobado
  from v_costo_lote_desglose d
    left join vendidas_brutas vb on vb.lote_id = d.lote_id and vb.producto_id = d.producto_id
    left join devoluciones dv on dv.lote_id = d.lote_id and dv.producto_id = d.producto_id
    left join entregas_aprobadas ea on ea.lote_id = d.lote_id and ea.producto_id = d.producto_id
)
select d.lote_id,
  d.producto_id,
  d.producto_nombre,
  d.presentacion_ml,
  d.cantidad as producidas,
  n.vendidas,
  coalesce(p.unidades, 0::numeric) as perdidas,
  coalesce(sp.quedan, 0::numeric) as en_deposito,
  d.costo_ananja_centavos,
  d.costo_ananja_centavos::numeric * (d.cantidad::numeric - coalesce(p.unidades, 0::numeric)) as esperado_total_centavos,
  (
    coalesce(round(n.monto_aprobado * n.aprobadas::numeric / nullif(n.aprobadas_brutas, 0)::numeric), 0::numeric)
    + d.costo_ananja_centavos::numeric * greatest(n.vendidas - n.aprobadas, 0::bigint)::numeric
  )::bigint as esperado_por_vendidas_centavos
from v_costo_lote_desglose d
  join netas n on n.lote_id = d.lote_id and n.producto_id = d.producto_id
  left join perdidas p on p.lote_id = d.lote_id and p.producto_id = d.producto_id
  left join v_stock_por_lote sp on sp.lote_id = d.lote_id and sp.producto_id = d.producto_id;

alter view v_cobranza_lote set (security_invoker = true);

-- v_resumen_revendedor: recreada desde la definición de prod (0026), mismas
-- columnas + `unidades_sin_precio` al final. Una venta sin precio de venta
-- (cargada por un admin sin saber a cuánto se vendió) NO cuenta en
-- `vendido_centavos` ni en `ganancia_centavos` (sumarla como $0 inventaría
-- una pérdida), pero SÍ en `costo_centavos` y `debe_centavos`: lo que se le
-- debe a Ananja por esas botellas no depende del precio de venta.
create or replace view v_resumen_revendedor as
with base as (
  select v.id as vendedor_id,
    v.nombre,
    coalesce((
      select sum(vr.cantidad * vr.precio_venta_centavos) from ventas_revendedor vr
      where vr.vendedor_id = v.id and vr.precio_venta_centavos is not null
    ), 0::numeric) as vendido_centavos,
    coalesce((
      select sum(vr.cantidad * vr.precio_costo_centavos) from ventas_revendedor vr
      where vr.vendedor_id = v.id
    ), 0::numeric) as costo_centavos,
    coalesce((
      select sum(vr.cantidad * vr.precio_costo_centavos) from ventas_revendedor vr
      where vr.vendedor_id = v.id and vr.precio_venta_centavos is not null
    ), 0::numeric) as costo_con_precio_centavos,
    coalesce((
      select sum(r.monto_centavos) from rendiciones r
      where r.vendedor_id = v.id
    ), 0::numeric) as rendido_centavos,
    coalesce((
      select count(*) from ventas_revendedor vr
      where vr.vendedor_id = v.id
    ), 0::bigint) as cantidad_ventas,
    coalesce((
      select sum(vr.cantidad) from ventas_revendedor vr
      where vr.vendedor_id = v.id and vr.precio_venta_centavos is null
    ), 0::bigint) as unidades_sin_precio
  from vendedores v
  where v.rol = 'revendedor'::text or v.rol = 'admin'::text and v.revende
)
select vendedor_id,
  nombre,
  vendido_centavos,
  costo_centavos,
  vendido_centavos - costo_con_precio_centavos as ganancia_centavos,
  rendido_centavos,
  costo_centavos - rendido_centavos as debe_centavos,
  cantidad_ventas,
  unidades_sin_precio
from base;

alter view v_resumen_revendedor set (security_invoker = true);
