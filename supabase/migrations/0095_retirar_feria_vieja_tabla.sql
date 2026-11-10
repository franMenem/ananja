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
-- 1) Columnas feria_id de comprobantes, gastos y movimientos_stock
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
-- 2) Archivo de movimientos borrados (sin FK)
-- ============================================================

alter table public.movimientos_stock_borrados drop column feria_id;

-- ============================================================
-- 3) Tabla ferias (se llevan sus triggers, índice, policies y grants) y las
--    funciones que solo usaban esos triggers
-- ============================================================

drop table public.ferias;
drop function public.forzar_vendedor_feria();
drop function public.proteger_estado_feria();
