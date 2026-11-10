-- 0083_retirar_feria_vieja_segura.sql
--
-- DESTRUCTIVA (dropea una tabla, tres vistas y cuatro funciones): va aparte de
-- la 0082 para que el dueño la apruebe por separado. Se aplica en UNA sola
-- transacción: si alguna precondición o algún `drop` falla, no queda nada
-- aplicado.
--
-- Retira la parte MUERTA del sistema viejo de ferias (el de `ferias` /
-- `feria_productos`, que la 0065 dejó explícitamente en pie) cuando es
-- demostrablemente segura. El sistema NUEVO (`feria_revendedoras`,
-- `feria_participantes`, `feria_precios`, `feria_degustaciones`, y `feria_id` en
-- `entregas_revendedor` / `ventas_revendedor`) NO se toca.
--
-- ── Qué se retira ───────────────────────────────────────────────────────
--   * vistas `v_resultado_feria`, `v_feria_totales`, `v_feria_stock`
--     (en ese orden: la primera lee a la segunda). Ningún código de app/,
--     components/ ni lib/ las consulta (solo comentarios en
--     lib/dominio/margen.ts y tipos en lib/types.ts); `pg_depend` muestra que
--     solo `v_resultado_feria` depende de `v_feria_totales` y nada depende de
--     las otras dos. Además tenían todos los privilegios (insert, update,
--     delete, truncate) para `authenticated`.
--   * tabla `feria_productos` (0 filas), con sus triggers
--     `trg_feria_productos_cerrada` y `trg_proteger_degustacion_feria` (se van
--     con la tabla). Nada la referencia por FK ni la lee: solo `crear_feria`
--     (muerta) y la vista `v_feria_stock`.
--   * funciones sin EXECUTE para `authenticated`/`anon` (0050), sin llamadores
--     y sin dependientes: `crear_feria(text, text, date, text, jsonb, boolean)`
--     y `reabrir_feria(uuid)`; y las funciones trigger que solo usaba
--     `feria_productos`: `proteger_feria_productos_cerrada()` y
--     `proteger_degustacion_feria()`.
--
-- ── Qué NO se retira (ver "Etapa 2" abajo) ──────────────────────────────
--   * tabla `ferias` y sus triggers (`trg_ferias_updated_at`,
--     `trg_ferias_vendedor`, `trg_proteger_estado_feria`) y funciones
--     (`forzar_vendedor_feria`, `proteger_estado_feria`): la tabla la
--     referencian por FK `comprobantes.feria_id`, `gastos.feria_id` y
--     `movimientos_stock.feria_id`, y por nombre `crear_comprobante`,
--     `actualizar_comprobante` y `crear_gasto` (dentro de
--     `if p_feria_id is not null`).
--   * columnas `feria_id` de `comprobantes`, `gastos` y `movimientos_stock`
--     (y sus índices): las leen lib/data/stock.ts, lib/data/comprobantes.ts,
--     lib/dominio/movimientos-stock.ts y la vista viva `v_margen_ventas`.
--   * parámetros `p_feria_id` de `crear_comprobante`, `actualizar_comprobante`
--     y `crear_gasto`: cambiar la firma rompería la app publicada.
--   * triggers `trg_comprobantes_validar_feria`, `trg_gastos_validar_feria`,
--     `trg_movimientos_stock_validar_feria` y su función
--     `validar_feria_abierta()`: están sobre tablas vivas; son inofensivos
--     (con `feria_id` nulo salen en la primera línea) y se retiran junto con
--     las columnas.
--   * `lib/types.ts` y `tests/invariantes.integration.test.ts`: ver abajo.
--
-- ── Precondiciones (abortan con `raise exception`) ──────────────────────
-- Esta migración borra datos si hubiera filas: por eso aborta si `ferias` o
-- `feria_productos` tienen alguna fila, o si algún comprobante, gasto o
-- movimiento de stock tiene `feria_id` no nulo. Verificado contra prod
-- (solo lectura): los cinco conteos dan 0. Sin `cascade` en ningún `drop`: si
-- algo vivo dependiera de un objeto, el `drop` falla y se revierte todo.
--
-- ── Cosas que cambian y hay que saber ───────────────────────────────────
--   * `tests/invariantes.integration.test.ts` ya no tiene el
--     caso del invariante 5 (leía `v_feria_totales`): fue retirado junto con
--     esta migración. El invariante 6 usa `ferias`, que se conserva.
--   * `lib/types.ts` conserva tipos de lo retirado (`feria_productos`,
--     `v_feria_*`, `crear_feria`, `reabrir_feria`): inofensivo hasta
--     regenerarlo (`generador-de-ts`); regenerar después de aplicar.
--   * El schema `miel` (negocio en pausa) NO se toca: todos los nombres van
--     con `public.`.
--
-- ── Etapa 2 (coordinada con código; NO está en esta migración) ──────────
--   Orden: CÓDIGO PRIMERO, base después, para no romper la app publicada.
--   1) Código: sacar `p_feria_id` de las llamadas a `crear_comprobante`
--      (components/comprobante-form/use-guardar-comprobante.ts),
--      `actualizar_comprobante` y `crear_gasto`; dejar de leer `feria_id` de
--      `comprobantes` y `movimientos_stock` (lib/data/comprobantes.ts,
--      lib/data/stock.ts, lib/dominio/movimientos-stock.ts,
--      app/(app)/comprobantes/[id]/editar/page.tsx, components/comprobante-form.tsx);
--      limpiar el test de integración. Desplegar.
--   2) Base (migración nueva): redefinir las tres RPC SIN `p_feria_id`
--      (`drop function` + `create`, nunca `create or replace` con firma
--      distinta; preservar grants y chequeos de rol); sacar `feria_id` de
--      `v_margen_ventas` (la vista tiene que dejar de exponerlo; hoy
--      `v_resultado_feria` ya no existe tras esta 0083); dropear los tres
--      triggers `trg_*_validar_feria` y `validar_feria_abierta()`; dropear las
--      columnas `feria_id` de `comprobantes`, `gastos`, `movimientos_stock`
--      (llevan FK a `ferias` e índices `idx_*_feria_id`); y al final dropear
--      `ferias` con sus triggers y `forzar_vendedor_feria()` /
--      `proteger_estado_feria()`. Tocar también `movimientos_stock_borrados.feria_id`
--      si se quiere limpiar (sin FK; la llena `eliminar_movimiento_stock`, 0072).
--   3) Regenerar `lib/types.ts`.
--
-- ============================================================
-- Verificación (solo lectura; correr DESPUÉS de aplicar)
-- ============================================================
--
--   -- Esperado: 0 filas (objetos retirados).
--   select relname from pg_class where relnamespace = 'public'::regnamespace
--     and relname in ('feria_productos', 'v_feria_totales', 'v_feria_stock', 'v_resultado_feria');
--   select proname from pg_proc where pronamespace = 'public'::regnamespace
--     and proname in ('crear_feria', 'reabrir_feria',
--                     'proteger_feria_productos_cerrada', 'proteger_degustacion_feria');
--   -- Esperado: 1 fila cada una (lo que se conserva).
--   select count(*) from pg_class where relnamespace = 'public'::regnamespace
--     and relname in ('ferias', 'feria_revendedoras', 'feria_participantes',
--                     'feria_precios', 'feria_degustaciones');                 -- 5
--   select count(*) from pg_trigger where tgrelid = 'public.ferias'::regclass and not tgisinternal; -- 3
--   select count(*) from pg_proc where pronamespace = 'public'::regnamespace
--     and proname in ('validar_feria_abierta', 'forzar_vendedor_feria', 'proteger_estado_feria'); -- 3
--   -- La vista viva sigue leyendo (no debe dar error):
--   select count(*) from public.v_margen_ventas;
--
-- ============================================================
-- Rollback
-- ============================================================
--
-- Las tablas estaban vacías, así que alcanza con recrear la estructura:
--   * `feria_productos`, índices `feria_productos_*` / `idx_feria_productos_*`,
--     grants y policies, vista `v_feria_stock` (+ `security_invoker`), vista
--     `v_feria_totales`, triggers `trg_proteger_degustacion_feria` y función
--     `proteger_degustacion_feria()`, `crear_feria` (cuerpo vigente: 0022_rpcs_solo_admin.sql,
--     luego sin EXECUTE por 0050_revocar_rpc_sin_uso.sql), `reabrir_feria` (0022 y 0050):
--     0011_ferias.sql (y 0022 para esas dos funciones).
--   * `proteger_feria_productos_cerrada()` y `trg_feria_productos_cerrada`:
--     0012_ferias_validar_feria.sql.
--   * `v_resultado_feria` (+ `security_invoker`, revoke/grant): 0031_margen_ventas.sql §5.
--   * Privilegios por defecto de `authenticated` sobre las vistas: eran
--     excesivos; si hiciera falta devolver el acceso, `grant select` alcanza.
--   Si se restauran las vistas: primero `v_feria_totales`, después `v_resultado_feria`.

-- ============================================================
-- 0) Precondiciones
-- ============================================================

do $$
begin
  if exists (select 1 from public.ferias) then
    raise exception 'PRECONDICION_FALLIDA: public.ferias tiene filas';
  end if;
  if exists (select 1 from public.feria_productos) then
    raise exception 'PRECONDICION_FALLIDA: public.feria_productos tiene filas';
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
end;
$$;

-- ============================================================
-- 1) Vistas (primero la que depende de otra)
-- ============================================================

drop view if exists public.v_resultado_feria;
drop view if exists public.v_feria_totales;
drop view if exists public.v_feria_stock;

-- ============================================================
-- 2) Tabla feria_productos (se llevan sus índices, policies, grants y los
--    triggers trg_feria_productos_cerrada y trg_proteger_degustacion_feria)
-- ============================================================

drop table if exists public.feria_productos;

-- ============================================================
-- 3) Funciones muertas (los triggers que las usaban ya no existen)
-- ============================================================

drop function if exists public.crear_feria(text, text, date, text, jsonb, boolean);
drop function if exists public.reabrir_feria(uuid);
drop function if exists public.proteger_feria_productos_cerrada();
drop function if exists public.proteger_degustacion_feria();
