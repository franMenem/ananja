-- 0095_retirar_feria_vieja_tabla.sql
--
-- Etapa 2, paso 2 de 2 del retiro del sistema VIEJO de ferias (0083 y 0094
-- son los anteriores). DESTRUCTIVA (dropea una tabla, cuatro columnas, tres
-- índices, tres claves foráneas y dos funciones): va aparte de la 0094 para
-- que el dueño pueda aplicar la 0094, probar la app y recién después aprobar
-- esta. Se aplica en UNA sola transacción: si alguna precondición o algún
-- `drop` falla, no queda nada aplicado.
--
-- El sistema NUEVO (`feria_revendedoras`, `feria_participantes`,
-- `feria_precios`, `feria_degustaciones`, `v_feria_participantes`,
-- `v_feria_participante_productos`, funciones `feria_*`, y `feria_id` en
-- `entregas_revendedor` / `ventas_revendedor`, que apuntan a
-- `feria_revendedoras`, NO a `ferias`) NO se toca.
--
-- ── Por qué se redefinen dos funciones del sistema NUEVO ─────────────────
-- `feria_quitar_degustacion` y `feria_reabrir_participacion` (0079) archivan
-- movimientos de stock con `insert into movimientos_stock_borrados (..., feria_id, ...)
-- select ..., feria_id, ... from movimientos_stock`. Eso lee y
-- escribe las columnas `feria_id` que esta migración dropea. Postgres NO lo
-- detecta (el cuerpo de plpgsql no registra dependencias en `pg_depend`), así
-- que el `drop column` pasaría y las funciones fallarían recién en runtime
-- ("column feria_id does not exist"). Por eso, ANTES de los `drop`, se
-- redefinen con `create or replace` (misma firma, mismos grants) partiendo del
-- cuerpo vigente en producción (`pg_get_functiondef`, verificado por
-- `md5(prosrc)`: quitar_degustacion 5a6d268f..., reabrir_participacion
-- 872110693...) y quitando ÚNICAMENTE `feria_id` de la lista de columnas y del
-- `select` de cada `insert into movimientos_stock_borrados` (1 en la primera,
-- 2 en la segunda; las demás columnas quedan en la misma posición). El
-- `feria_id` de `feria_participantes`, `feria_degustaciones`,
-- `entregas_revendedor` y `ventas_revendedor` (sistema nuevo) NO se toca.
-- Barrido de otros usos (solo lectura contra prod, 2026-11-11): ninguna otra
-- función, vista, policy, trigger, default, constraint ni índice de `public`
-- depende de esas cuatro columnas ni de `ferias`.
--
-- ── Orden de despliegue ──────────────────────────────────────────────────
--   1) Código que ya no lee `feria_id` (comprobantes, movimientos de stock)
--      desplegado. SI ESTA MIGRACIÓN SE APLICA ANTES, la pantalla de editar
--      comprobante y el historial de stock fallan (piden una columna que ya
--      no existe).
--   2) 0094 aplicada (funciones y vista sin feria). Esta migración lo
--      verifica y aborta si no es así: sin cascade, un `drop column` fallaría
--      igual por la vista/triggers, pero acá el mensaje es explícito.
--   3) Esta migración.
--   4) Regenerar `lib/types.ts` (el tipo de `comprobantes`, `gastos`,
--      `movimientos_stock`, `movimientos_stock_borrados` pierde `feria_id`;
--      `ferias` y las firmas viejas desaparecen).
--
-- ── Qué hace ─────────────────────────────────────────────────────────────
--   * `comprobantes`, `gastos`, `movimientos_stock`: dropea la clave foránea
--     `*_feria_id_fkey` a `ferias`, el índice `idx_*_feria_id` y la columna
--     `feria_id` (explícitos y en ese orden; ningún `cascade`).
--   * `movimientos_stock_borrados`: dropea la columna `feria_id` (sin FK; la
--     llenaba `eliminar_movimiento_stock` hasta la 0094).
--   * `ferias`: dropea la tabla (se llevan sus triggers `trg_ferias_updated_at`,
--     `trg_ferias_vendedor`, `trg_proteger_estado_feria`, su índice, sus
--     policies y grants) y las funciones que solo usaban esos triggers:
--     `forzar_vendedor_feria()` y `proteger_estado_feria()`.
--   * Antes de todo eso, redefine `feria_quitar_degustacion` y
--     `feria_reabrir_participacion` sin `feria_id` en sus `insert into
--     movimientos_stock_borrados` (ver arriba) y verifica que no quede ninguna
--     función de `public` con `feria_id` en un insert a esa tabla.
--   No se toca `set_updated_at()` (la usan otras tablas).
--
-- ── Precondiciones (abortan con `raise exception`) ──────────────────────
-- 0094 aplicada (no existe `validar_feria_abierta`, ninguna RPC con
-- `p_feria_id` de comprobantes/gastos, `v_margen_ventas` sin `feria_id`) y
-- sin datos de feria vieja: `ferias` vacía, `feria_id` nulo en las cuatro
-- tablas. Verificado contra prod (solo lectura, 2026-11-10): cero filas en
-- todo. La única tabla con FK hacia `ferias` son las tres de arriba (las del
-- sistema nuevo apuntan a `feria_revendedoras`).
--
-- ============================================================
-- Verificación (solo lectura; correr DESPUÉS de aplicar)
-- ============================================================
--
--   -- Esperado: 0 filas.
--   select table_name from information_schema.columns
--    where table_schema = 'public' and column_name = 'feria_id'
--      and table_name in ('comprobantes', 'gastos', 'movimientos_stock', 'movimientos_stock_borrados');
--   select relname from pg_class where relnamespace = 'public'::regnamespace and relname = 'ferias';
--   select proname from pg_proc where pronamespace = 'public'::regnamespace
--      and proname in ('forzar_vendedor_feria', 'proteger_estado_feria', 'validar_feria_abierta');
--   -- Esperado: 4 (lo que se conserva del sistema nuevo).
--   select count(*) from pg_class where relnamespace = 'public'::regnamespace
--      and relname in ('feria_revendedoras', 'feria_participantes', 'feria_precios', 'feria_degustaciones');
--   -- Esperado: 3 (el sistema nuevo conserva su feria_id: entregas, ventas y las tres anteriores).
--   select count(*) from information_schema.columns where table_schema = 'public'
--      and column_name = 'feria_id' and table_name in ('entregas_revendedor', 'ventas_revendedor');  -- 2
--   -- La vista viva sigue leyendo (no debe dar error):
--   select count(*) from public.v_margen_ventas;
--   -- Esperado: 0 filas (ninguna función archiva ya feria_id en movimientos_stock_borrados).
--   select proname from pg_proc where pronamespace = 'public'::regnamespace
--      and prosrc ~* 'insert\s+into\s+(public\.)?movimientos_stock_borrados\s*\([^)]*feria_id';
--   -- Esperado: 2 filas, sin 'feria_id' en el archivo (prosrc nuevo, ver md5 abajo).
--   select proname, md5(prosrc), proacl::text from pg_proc where pronamespace = 'public'::regnamespace
--      and proname in ('feria_quitar_degustacion', 'feria_reabrir_participacion');
--   --   feria_quitar_degustacion     afe7ae8dcf30b260c697db591fb88636
--   --   feria_reabrir_participacion  65890c61790ea6a5ac56087941c4cbb0
--   -- (proacl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres})
--
-- ============================================================
-- Rollback
-- ============================================================
--
-- Las tablas estaban vacías, así que alcanza con recrear la estructura:
--   * Tabla `ferias`, su índice `ferias_pkey`, policies, triggers
--     (`trg_ferias_updated_at`, `trg_ferias_vendedor`, `trg_proteger_estado_feria`)
--     y funciones `forzar_vendedor_feria()` / `proteger_estado_feria()`:
--     0011_ferias.sql, más los cambios posteriores sobre esa tabla
--     (0022_rpcs_solo_admin.sql, 0082_cerrar_escrituras_directas.sql: revoke
--     de delete y de update de columnas a `authenticated`).
--   * Columnas: `alter table public.comprobantes add column feria_id uuid
--     references public.ferias(id) on delete restrict;` (idem `gastos` y
--     `movimientos_stock`), más `create index idx_*_feria_id on public.*(feria_id)`.
--     `movimientos_stock_borrados.feria_id uuid` (nullable, sin FK).
--   * Después, rehacer 0094 al revés (ver su rollback).
--   * Las dos funciones redefinidas: volver al cuerpo de `0079_feria_degustacion_carga.sql`
--     (la última migración anterior que las define) SOLO después de recrear
--     las columnas `feria_id` (incluida `movimientos_stock_borrados.feria_id`);
--     si no, esas versiones fallan.

-- ============================================================
-- 0) Precondiciones
-- ============================================================

do $$
begin
  if exists (select 1 from public.ferias) then
    raise exception 'PRECONDICION_FALLIDA: public.ferias tiene filas';
  end if;
  if exists (select 1 from public.comprobantes where feria_id is not null) then
    raise exception 'PRECONDICION_FALLIDA: hay comprobantes con feria_id de la feria vieja';
  end if;
  if exists (select 1 from public.gastos where feria_id is not null) then
    raise exception 'PRECONDICION_FALLIDA: hay gastos con feria_id de la feria vieja';
  end if;
  if exists (select 1 from public.movimientos_stock where feria_id is not null) then
    raise exception 'PRECONDICION_FALLIDA: hay movimientos de stock con feria_id de la feria vieja';
  end if;
  if exists (select 1 from public.movimientos_stock_borrados where feria_id is not null) then
    raise exception 'PRECONDICION_FALLIDA: hay movimientos de stock borrados con feria_id de la feria vieja';
  end if;

  -- 0094 tiene que estar aplicada.
  if to_regprocedure('public.validar_feria_abierta()') is not null then
    raise exception 'PRECONDICION_FALLIDA: falta aplicar 0094 (validar_feria_abierta todavía existe)';
  end if;
  if exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('crear_comprobante', 'actualizar_comprobante', 'crear_gasto')
      and pg_get_function_arguments(oid) ilike '%feria%'
  ) then
    raise exception 'PRECONDICION_FALLIDA: falta aplicar 0094 (una RPC todavía recibe p_feria_id)';
  end if;
  if exists (
    select 1 from pg_attribute
    where attrelid = 'public.v_margen_ventas'::regclass
      and attname = 'feria_id' and not attisdropped
  ) then
    raise exception 'PRECONDICION_FALLIDA: falta aplicar 0094 (v_margen_ventas todavía expone feria_id)';
  end if;
end;
$$;

-- ============================================================
-- 1) Funciones del sistema nuevo que archivaban feria_id en
--    movimientos_stock_borrados (cuerpo de prod sin esa columna)
-- ============================================================

create or replace function public.feria_quitar_degustacion(p_feria_id uuid, p_vendedor_id uuid, p_producto_id uuid)
 returns json
 language plpgsql
 security definer
 set search_path = public
as $function$
declare
  v_yo uuid;
  v_feria_estado text;
  v_part_estado text;
  v_cantidad int;
  v_mov_ids uuid[];
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;
  v_yo := public.mi_vendedor_id();

  -- Orden de locks: vendedores -> feria -> participante -> depósito.
  perform 1 from vendedores where id = p_vendedor_id for no key update;

  select estado into v_feria_estado from feria_revendedoras where id = p_feria_id for share;
  if v_feria_estado is null then
    raise exception 'FERIA_NO_ENCONTRADA';
  end if;
  if v_feria_estado <> 'abierta' then
    raise exception 'FERIA_CERRADA';
  end if;

  select estado into v_part_estado
  from feria_participantes
  where feria_id = p_feria_id and vendedor_id = p_vendedor_id
  for update;
  if v_part_estado is null then
    raise exception 'PARTICIPANTE_NO_ENCONTRADO';
  end if;
  if v_part_estado <> 'pendiente' then
    raise exception 'PARTICIPACION_CERRADA';
  end if;

  perform pg_advisory_xact_lock(hashtext('ananja:deposito'));

  select cantidad, movimiento_ids into v_cantidad, v_mov_ids
  from feria_degustaciones
  where feria_id = p_feria_id and vendedor_id = p_vendedor_id
    and producto_id = p_producto_id and origen = 'carga'
  for update;

  if v_cantidad is null then
    return json_build_object('ok', true, 'cantidad', 0);
  end if;

  -- Mismo patrón de archivo que `feria_reabrir_participacion`.
  insert into movimientos_stock_borrados (
    movimiento_id, producto_id, tipo, cantidad, vendedor_id, comprobante_id,
    nota, created_at, lote_id, entrega_id, motivo, borrado_por
  )
  select id, producto_id, tipo, cantidad, vendedor_id, comprobante_id,
         nota, created_at, lote_id, entrega_id, motivo, v_yo
  from movimientos_stock where id = any(v_mov_ids);

  delete from movimientos_stock where id = any(v_mov_ids);

  delete from feria_degustaciones
  where feria_id = p_feria_id and vendedor_id = p_vendedor_id
    and producto_id = p_producto_id and origen = 'carga';

  return json_build_object('ok', true, 'cantidad', v_cantidad);
end;
$function$;

revoke all on function public.feria_quitar_degustacion(uuid, uuid, uuid) from public, anon;
grant execute on function public.feria_quitar_degustacion(uuid, uuid, uuid) to authenticated, service_role;

create or replace function public.feria_reabrir_participacion(p_feria_id uuid, p_vendedor_id uuid)
 returns json
 language plpgsql
 security definer
 set search_path = public
as $function$
declare
  v_yo uuid;
  v_feria_estado text;
  v_part_estado text;
  v_grupos uuid[];
  v_grupo uuid;
  v_dev record;
  v_auto record;
  v_dev_id uuid;
  v_ya int;
  v_en_lote int;
  v_devolver int;
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_prod record;
  v_en_poder int;
  v_mov_ids uuid[];
  v_ventas int := 0;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;
  v_yo := public.mi_vendedor_id();

  -- Orden de locks: vendedores -> feria -> participante.
  perform 1 from vendedores where id = p_vendedor_id for no key update;

  select estado into v_feria_estado from feria_revendedoras where id = p_feria_id for share;
  if v_feria_estado is null then
    raise exception 'FERIA_NO_ENCONTRADA';
  end if;
  -- Con la feria cerrada primero hay que reabrirla (`feria_reabrir`).
  if v_feria_estado <> 'abierta' then
    raise exception 'FERIA_CERRADA';
  end if;

  select estado into v_part_estado
  from feria_participantes
  where feria_id = p_feria_id and vendedor_id = p_vendedor_id
  for update;
  if v_part_estado is null then
    raise exception 'PARTICIPANTE_NO_ENCONTRADO';
  end if;
  if v_part_estado = 'pendiente' then
    return json_build_object('ok', true, 'ventas_borradas', 0);
  end if;

  -- Lock global del depósito (mismo orden que el resto de los caminos) antes
  -- de escribir movimientos de stock.
  perform pg_advisory_xact_lock(hashtext('ananja:deposito'));

  select coalesce(array_agg(distinct grupo_id), '{}') into v_grupos
  from ventas_revendedor
  where feria_id = p_feria_id and vendedor_id = p_vendedor_id;

  if exists (select 1 from rendiciones where venta_grupo_id = any(v_grupos)) then
    raise exception 'VENTA_CON_RENDICION';
  end if;

  -- (a) Ventas de la feria. El trigger de archivo las guarda en
  -- `ventas_revendedor_borradas` (con `feria_id`).
  delete from ventas_revendedor where feria_id = p_feria_id and vendedor_id = p_vendedor_id;
  get diagnostics v_ventas = row_count;

  -- (b) Egresos de degustación (archivados como `eliminar_movimiento_stock`).
  select coalesce(array_agg(m), '{}') into v_mov_ids
  from feria_degustaciones d, unnest(d.movimiento_ids) m
  where d.feria_id = p_feria_id and d.vendedor_id = p_vendedor_id
    and d.origen = 'cierre';

  insert into movimientos_stock_borrados (
    movimiento_id, producto_id, tipo, cantidad, vendedor_id, comprobante_id,
    nota, created_at, lote_id, entrega_id, motivo, borrado_por
  )
  select id, producto_id, tipo, cantidad, vendedor_id, comprobante_id,
         nota, created_at, lote_id, entrega_id, motivo, v_yo
  from movimientos_stock where id = any(v_mov_ids);

  delete from movimientos_stock where id = any(v_mov_ids);

  -- (c) Devolución de la feria: sus ingresos, sus items y la entrega.
  for v_dev in
    select id from entregas_revendedor
    where feria_id = p_feria_id and vendedor_id = p_vendedor_id and tipo = 'devolucion'
  loop
    insert into movimientos_stock_borrados (
      movimiento_id, producto_id, tipo, cantidad, vendedor_id, comprobante_id,
      nota, created_at, lote_id, entrega_id, motivo, borrado_por
    )
    select id, producto_id, tipo, cantidad, vendedor_id, comprobante_id,
           nota, created_at, lote_id, entrega_id, motivo, v_yo
    from movimientos_stock where entrega_id = v_dev.id;

    delete from movimientos_stock where entrega_id = v_dev.id;
    delete from entrega_items where entrega_id = v_dev.id;
    delete from entregas_revendedor where id = v_dev.id;
  end loop;

  -- Compensar las entregas automáticas de las ventas borradas (toma directa
  -- del depósito): igual que `eliminar_venta_revendedor`, una devolución
  -- automática por (producto, lote) con lo que SIGUE en poder de la persona.
  foreach v_grupo in array v_grupos
  loop
    v_dev_id := null;

    for v_auto in
      select ei.producto_id, ei.lote_id, sum(ei.cantidad)::int as total
      from entregas_revendedor e
      join entrega_items ei on ei.entrega_id = e.id
      where e.vendedor_id = p_vendedor_id
        and e.tipo = 'entrega'
        and e.automatica
        and e.venta_grupo_id = v_grupo
      group by ei.producto_id, ei.lote_id
      order by ei.producto_id, ei.lote_id
    loop
      select coalesce(sum(ei2.cantidad), 0)::int into v_ya
      from entregas_revendedor d
      join entrega_items ei2 on ei2.entrega_id = d.id
      where d.vendedor_id = p_vendedor_id
        and d.tipo = 'devolucion'
        and d.automatica
        and d.venta_grupo_id = v_grupo
        and ei2.producto_id = v_auto.producto_id
        and ei2.lote_id is not distinct from v_auto.lote_id;

      select coalesce(sum(s.quedan), 0)::int into v_en_lote
      from public.stock_revendedor_por_entrega(p_vendedor_id, v_auto.producto_id) s
      where s.lote_id is not distinct from v_auto.lote_id;

      v_devolver := least(v_auto.total - v_ya, v_en_lote);

      if v_devolver > 0 then
        if v_dev_id is null then
          insert into entregas_revendedor (vendedor_id, tipo, fecha, nota, admin_id, automatica, venta_grupo_id)
          values (p_vendedor_id, 'devolucion', v_hoy, null, v_yo, true, v_grupo)
          returning id into v_dev_id;
        end if;

        insert into entrega_items (entrega_id, producto_id, cantidad, lote_id)
        values (v_dev_id, v_auto.producto_id, v_devolver, v_auto.lote_id);

        insert into movimientos_stock (producto_id, tipo, cantidad, vendedor_id, entrega_id, lote_id, nota, motivo)
        values (v_auto.producto_id, 'ingreso', v_devolver, v_yo, v_dev_id, v_auto.lote_id, null, null);
      end if;
    end loop;
  end loop;

  -- Nada de lo que tiene en poder puede quedar negativo (ej.: ya vendió o
  -- devolvió después las botellas que el cierre había devuelto). La excepción
  -- deshace TODO lo de esta función.
  for v_prod in
    select distinct ei.producto_id, p.nombre
    from entregas_revendedor e
    join entrega_items ei on ei.entrega_id = e.id
    join productos p on p.id = ei.producto_id
    where e.feria_id = p_feria_id and e.vendedor_id = p_vendedor_id and e.tipo = 'entrega'
  loop
    select en_poder into v_en_poder
    from v_stock_revendedor
    where vendedor_id = p_vendedor_id and producto_id = v_prod.producto_id;

    if coalesce(v_en_poder, 0) < 0 then
      raise exception 'STOCK_REVENDEDOR_INSUFICIENTE'
        using detail = json_build_object(
          'producto', v_prod.nombre,
          'producto_id', v_prod.producto_id,
          'disponible', 0
        )::text;
    end if;
  end loop;

  -- (d) y (e)
  delete from feria_degustaciones
  where feria_id = p_feria_id and vendedor_id = p_vendedor_id and origen = 'cierre';

  update feria_participantes
  set estado = 'pendiente', cerrada_at = null,
      efectivo_centavos = 0, mercado_pago_centavos = 0, banco_centavos = 0, nota = null
  where feria_id = p_feria_id and vendedor_id = p_vendedor_id;

  return json_build_object('ok', true, 'ventas_borradas', v_ventas);
end;
$function$;

revoke all on function public.feria_reabrir_participacion(uuid, uuid) from public, anon;
grant execute on function public.feria_reabrir_participacion(uuid, uuid) to authenticated, service_role;

-- Defensa en profundidad: ninguna función de `public` puede seguir
-- archivando `feria_id` en `movimientos_stock_borrados` (el `drop column` de
-- abajo no lo detectaría; fallaría en runtime). La lista de columnas del
-- insert no lleva paréntesis, así que `[^)]*` no cruza otros insert.
do $$
declare
  v_fn text;
begin
  select string_agg(proname, ', ') into v_fn
  from pg_proc
  where pronamespace = 'public'::regnamespace
    and prosrc ~* 'insert\s+into\s+(public\.)?movimientos_stock_borrados\s*\([^)]*feria_id';
  if v_fn is not null then
    raise exception 'VERIFICACION_FALLIDA: funciones que todavía archivan feria_id en movimientos_stock_borrados: %', v_fn;
  end if;
end;
$$;

-- ============================================================
-- 2) Columnas feria_id de comprobantes, gastos y movimientos_stock
--    (clave foránea, índice y columna, en ese orden)
-- ============================================================

alter table public.comprobantes drop constraint comprobantes_feria_id_fkey;
drop index public.idx_comprobantes_feria_id;
alter table public.comprobantes drop column feria_id;

alter table public.gastos drop constraint gastos_feria_id_fkey;
drop index public.idx_gastos_feria_id;
alter table public.gastos drop column feria_id;

alter table public.movimientos_stock drop constraint movimientos_stock_feria_id_fkey;
drop index public.idx_movimientos_stock_feria_id;
alter table public.movimientos_stock drop column feria_id;

-- ============================================================
-- 3) Archivo de movimientos borrados (sin FK)
-- ============================================================

alter table public.movimientos_stock_borrados drop column feria_id;

-- ============================================================
-- 4) Tabla ferias (se llevan sus triggers, índice, policies y grants) y las
--    funciones que solo usaban esos triggers
-- ============================================================

drop table public.ferias;
drop function public.forzar_vendedor_feria();
drop function public.proteger_estado_feria();
