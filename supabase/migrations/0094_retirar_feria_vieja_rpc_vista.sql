-- 0094_retirar_feria_vieja_rpc_vista.sql
--
-- Etapa 2, paso 1 de 2 del retiro del sistema VIEJO de ferias (la etapa 1 es
-- la 0083). Este paso NO borra ninguna columna ni tabla: solo saca de las
-- funciones, los triggers y la vista todo lo que mencionaba la feria vieja,
-- para que el paso 2 (0095) pueda dropear columnas y tabla sin que nada vivo
-- las referencie. Se aplica en UNA sola transacción (si algo falla, no queda
-- nada aplicado).
--
-- El sistema NUEVO (`feria_revendedoras`, `feria_participantes`,
-- `feria_precios`, `feria_degustaciones`, `v_feria_participantes`,
-- `v_feria_participante_productos`, funciones `feria_*`, y `feria_id` en
-- `entregas_revendedor` / `ventas_revendedor`, que apuntan a
-- `feria_revendedoras`, NO a `ferias`) NO se toca.
--
-- ── Orden de despliegue (la app está en producción) ─────────────────────
--   1) CÓDIGO primero: el commit que deja de leer `feria_id` de
--      `comprobantes` y `movimientos_stock`, deja de mandar `p_feria_id` y
--      saca `feria_id` de los tipos de dominio. Desplegarlo y esperar a que
--      Vercel termine.
--   2) Esta migración (0094).
--   3) Probar en la app: cargar un comprobante, editarlo, cargar un gasto,
--      eliminar un egreso manual de stock, abrir /ganancia, /plata e Inicio.
--   4) 0095 (dropea columnas y tabla; destructiva).
--   5) Regenerar `lib/types.ts`.
--   Si se aplicara 0094 ANTES que el código: el código viejo ya mandaba
--   `p_feria_id` solo cuando el comprobante tenía feria (siempre `undefined`,
--   o sea omitido, porque no hay ninguno), así que no se rompe; lo único que
--   leía `feria_id` era el select de `comprobantes` (editar) y de
--   `movimientos_stock` (historial), que en 0094 todavía existen: tampoco
--   rompe. Lo que SÍ rompe es aplicar 0095 antes que el código.
--
-- ── Qué hace ─────────────────────────────────────────────────────────────
--   1) Dropea los triggers `trg_comprobantes_validar_feria`,
--      `trg_gastos_validar_feria`, `trg_movimientos_stock_validar_feria` y la
--      función `validar_feria_abierta()`.
--   2) `crear_comprobante`, `actualizar_comprobante` y `crear_gasto`: se
--      recrean (drop + create, firma nueva, sin sobrecargas) sin el parámetro
--      `p_feria_id` y sin los bloques que lo validaban contra `ferias`. Los
--      demás parámetros conservan nombre, tipo y default; PostgREST llama por
--      nombre, así que el orden no importa. Cuerpo = el VIGENTE en prod
--      (`pg_get_functiondef`, proyecto uqgcixuvwyijvrzljjuz, 2026-11-10),
--      verificado por md5 contra la copia que se editó; el diff exacto está
--      abajo.
--   3) `eliminar_movimiento_stock(uuid)` (última: 0072): misma firma
--      (create or replace); la regla "movimiento manual" pasa de "sin
--      comprobante, sin entrega y sin feria" a "sin comprobante y sin
--      entrega" (y deja de copiar `feria_id` al archivo
--      `movimientos_stock_borrados`). Es equivalente: `feria_id` es siempre
--      nulo (precondición) y nada puede volver a escribirlo.
--      `lib/dominio/movimientos-stock.ts` (`esMovimientoStockBorrable`) es su
--      espejo y se actualiza en el commit de código.
--   4) `v_margen_ventas` sin la columna `feria_id` (drop view + create view:
--      `create or replace view` no puede quitar columnas). Cuerpo = el
--      vigente en prod menos las 13 líneas de `feria_id`. Ver "La vista".
--
-- ── Precondiciones (abortan con `raise exception`) ──────────────────────
-- `public.ferias` vacía, ningún `feria_id` no nulo en `comprobantes`,
-- `gastos`, `movimientos_stock` ni `movimientos_stock_borrados`, y que las
-- firmas viejas de las tres RPC existan tal como se esperan (si alguien ya
-- las cambió, aborta en vez de pisar). Verificado contra prod (solo lectura,
-- 2026-11-10): los cinco conteos dan 0.
--
-- ── La vista ─────────────────────────────────────────────────────────────
-- Es lo más delicado (calcula la ganancia de todo el negocio). Se verificó
-- contra prod, solo lectura: ninguna vista, regla ni función de la base
-- depende de `v_margen_ventas` (`pg_depend`; `rendiciones_parte_ananja` la
-- nombra solo en un comentario). El código la lee con una lista fija de
-- columnas que no incluye `feria_id` (`lib/data/ganancia.ts`). Por eso se
-- recrea. El texto nuevo es EXACTAMENTE `pg_get_viewdef` de prod sin las 13
-- líneas `feria_id` (más prefijos `public.`, que `pg_get_viewdef` vuelve a
-- sacar): md5 del `pg_get_viewdef(..., true)` de prod hoy
-- e309c37761cb18536e272392484d9bec; md5 que debe tener DESPUÉS de aplicar
-- (el de prod con esas 13 líneas quitadas, calculado en prod):
-- 5ae05a1a79e992f765cd505365c888fd. Se repone `security_invoker = true`; los
-- privilegios quedan en solo `select` para `authenticated` (los default
-- privileges de Supabase le dan a toda vista nueva los siete a anon y
-- authenticated; se revocan, igual que 0090). Hoy prod tiene
-- `authenticated=rm` (select + maintain, resto de 0090): `maintain` no hace
-- nada sobre una vista y no se repone. `service_role` sigue con lo que le dan
-- los default privileges. La vista no tenía comentarios.
--
-- ── Diff contra prod (solo lo de feria) ─────────────────────────────────
--   --- prod/crear_comprobante
--   +++ 0094/crear_comprobante
--   @@ -13,3 +13,2 @@
--      v_alertas text[] := array[]::text[];
--   -  v_feria_estado text;
--      v_cobrado_centavos bigint;
--   @@ -40,12 +39,2 @@
--
--   -  if p_feria_id is not null then
--   -    select estado into v_feria_estado from ferias where id = p_feria_id;
--   -    if v_feria_estado is null then
--   -      raise exception 'FERIA_NO_ENCONTRADA';
--   -    end if;
--   -    if v_feria_estado <> 'abierta' then
--   -      raise exception 'FERIA_CERRADA';
--   -    end if;
--   -  end if;
--   -
--      v_cobrado_centavos := coalesce(p_cobrado_centavos, p_monto_centavos);
--   @@ -62,3 +51,3 @@
--        vendedor_id, monto_centavos, medio_pago, imagen_path, fecha,
--   -    estado_ocr, ocr_monto_centavos, nota, cliente_id, feria_id, cobrado_centavos
--   +    estado_ocr, ocr_monto_centavos, nota, cliente_id, cobrado_centavos
--      ) values (
--   @@ -66,3 +55,3 @@
--        coalesce(p_fecha, current_date), coalesce(p_estado_ocr, 'no_intentado'),
--   -    p_ocr_monto_centavos, p_nota, p_cliente_id, p_feria_id, v_cobrado_centavos
--   +    p_ocr_monto_centavos, p_nota, p_cliente_id, v_cobrado_centavos
--      ) returning id into v_comprobante_id;
--
--   --- prod/actualizar_comprobante
--   +++ 0094/actualizar_comprobante
--   @@ -12,4 +12,2 @@
--      v_alertas text[] := array[]::text[];
--   -  v_feria_actual uuid;
--   -  v_feria_estado text;
--      v_cobrado_actual bigint;
--   @@ -36,3 +34,3 @@
--
--   -  select feria_id, cobrado_centavos into v_feria_actual, v_cobrado_actual
--   +  select cobrado_centavos into v_cobrado_actual
--      from comprobantes where id = p_comprobante_id;
--   @@ -40,6 +38,2 @@
--        raise exception 'COMPROBANTE_NO_ENCONTRADO';
--   -  end if;
--   -
--   -  if p_feria_id is distinct from v_feria_actual then
--   -    raise exception 'FERIA_NO_MODIFICABLE';
--      end if;
--   @@ -50,12 +44,2 @@
--        raise exception 'CLIENTE_INVALIDO';
--   -  end if;
--   -
--   -  if p_feria_id is not null then
--   -    select estado into v_feria_estado from ferias where id = p_feria_id;
--   -    if v_feria_estado is null then
--   -      raise exception 'FERIA_NO_ENCONTRADA';
--   -    end if;
--   -    if v_feria_estado <> 'abierta' then
--   -      raise exception 'FERIA_CERRADA';
--   -    end if;
--      end if;
--
--   --- prod/crear_gasto
--   +++ 0094/crear_gasto
--   @@ -3,3 +3,2 @@
--      v_gasto_id uuid;
--   -  v_feria_estado text;
--    begin
--   @@ -34,14 +33,4 @@
--
--   -  if p_feria_id is not null then
--   -    select estado into v_feria_estado from ferias where id = p_feria_id;
--   -    if v_feria_estado is null then
--   -      raise exception 'FERIA_NO_ENCONTRADA';
--   -    end if;
--   -    if v_feria_estado <> 'abierta' then
--   -      raise exception 'FERIA_CERRADA';
--   -    end if;
--   -  end if;
--   -
--   -  insert into gastos (vendedor_id, monto_centavos, categoria_id, medio_pago, fecha, nota, imagen_path, lote_id, feria_id, producto_id)
--   -  values (v_vendedor_id, p_monto_centavos, p_categoria_id, p_medio_pago, coalesce(p_fecha, current_date), p_nota, p_imagen_path, p_lote_id, p_feria_id, p_producto_id)
--   +  insert into gastos (vendedor_id, monto_centavos, categoria_id, medio_pago, fecha, nota, imagen_path, lote_id, producto_id)
--   +  values (v_vendedor_id, p_monto_centavos, p_categoria_id, p_medio_pago, coalesce(p_fecha, current_date), p_nota, p_imagen_path, p_lote_id, p_producto_id)
--      returning id into v_gasto_id;
--
--   --- prod/eliminar_movimiento_stock
--   +++ 0094/eliminar_movimiento_stock
--   @@ -16,5 +16,7 @@
--
--   -  -- Manual = egreso cargado a mano. Ver la cabecera: ningún otro camino deja
--   -  -- un egreso sin comprobante, sin entrega y sin feria, y los ingresos no se
--   -  -- pueden distinguir con certeza de los de producción.
--   +  -- Manual = egreso cargado a mano. Ver la cabecera de
--   +  -- 0072_eliminar_movimiento_stock.sql: ningún otro camino deja un egreso sin
--   +  -- comprobante y sin entrega, y los ingresos no se pueden distinguir con
--   +  -- certeza de los de producción. (Desde 0094 la regla ya no pregunta por
--   +  -- feria: la feria vieja se retiró y `feria_id` era siempre nulo.)
--      if v_mov.tipo <> 'egreso'
--   @@ -22,3 +24,2 @@
--        or v_mov.entrega_id is not null
--   -    or v_mov.feria_id is not null
--      then
--   @@ -29,3 +30,3 @@
--        movimiento_id, producto_id, tipo, cantidad, vendedor_id, comprobante_id,
--   -    nota, created_at, lote_id, feria_id, entrega_id, motivo, borrado_por
--   +    nota, created_at, lote_id, entrega_id, motivo, borrado_por
--      ) values (
--   @@ -33,3 +34,3 @@
--        v_mov.comprobante_id, v_mov.nota, v_mov.created_at, v_mov.lote_id,
--   -    v_mov.feria_id, v_mov.entrega_id, v_mov.motivo, public.mi_vendedor_id()
--   +    v_mov.entrega_id, v_mov.motivo, public.mi_vendedor_id()
--      );
--
--   Firmas: se quita `p_feria_id uuid default null` de crear_comprobante, actualizar_comprobante y crear_gasto (nada más).
--   Vista: se quitan 13 líneas `feria_id` del select (11 `x.feria_id` y 2 `NULL::uuid AS feria_id`) y se prefijan las relaciones con `public.`.
--
-- ============================================================
-- Verificación (solo lectura; correr DESPUÉS de aplicar)
-- ============================================================
--
--   -- Esperado: ninguna firma con feria. Una sola fila por función.
--   select p.oid::regprocedure::text, p.proacl::text, p.proconfig::text
--     from pg_proc p where p.pronamespace = 'public'::regnamespace
--      and p.proname in ('crear_comprobante', 'actualizar_comprobante', 'crear_gasto');
--   --   proacl = {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--   --   proconfig = {search_path=public}
--   -- Esperado: 0 filas.
--   select proname from pg_proc where pronamespace = 'public'::regnamespace
--      and proname = 'validar_feria_abierta';
--   select tgname from pg_trigger where not tgisinternal and tgname like '%validar_feria';
--   select 1 from pg_attribute where attrelid = 'public.v_margen_ventas'::regclass
--      and attname = 'feria_id' and not attisdropped;
--   -- Esperado: la vista conserva security_invoker y solo select para authenticated.
--   select reloptions::text, relacl::text from pg_class
--     where oid = 'public.v_margen_ventas'::regclass;
--   --   {security_invoker=true} / {postgres=arwdDxtm/postgres,authenticated=r/postgres,service_role=arwdDxtm/postgres}
--   -- Esperado: igual a 5ae05a1a79e992f765cd505365c888fd.
--   select md5(pg_get_viewdef('public.v_margen_ventas'::regclass, true));
--   -- Esperado: sin error (con rol postgres da 0 filas por es_admin(); entrando como admin, las de siempre).
--   select count(*) from public.v_margen_ventas;
--   -- Esperado: la regla manual sin feria.
--   select pg_get_functiondef('public.eliminar_movimiento_stock(uuid)'::regprocedure) not ilike '%feria%';
--
-- ============================================================
-- Rollback
-- ============================================================
--
-- Las tablas con feria estaban vacías, así que alcanza con recrear las
-- funciones y la vista como estaban. Cada diff de arriba es el inverso
-- exacto: volver a agregar `p_feria_id uuid default null` (en la posición
-- original: tras `p_cliente_id` en comprobantes; tras `p_lote_id` en
-- `crear_gasto`), las líneas quitadas y los bloques de validación; hacer
-- `drop function` de la firma nueva antes (no `create or replace`). Los
-- triggers se recrean con
--   create trigger trg_comprobantes_validar_feria before insert or update of feria_id
--     on public.comprobantes for each row execute function public.validar_feria_abierta();
-- (idem `gastos` y `movimientos_stock`), y `validar_feria_abierta()` es el
-- cuerpo que está en 0012_ferias_validar_feria.sql. La vista: volver a
-- agregar, en cada subconsulta, la columna `feria_id` justo después de
-- `vendedor_id` (`c.feria_id` en las ramas de `comprobantes`, `NULL::uuid AS
-- feria_id` en las de `ventas_revendedor`, y el pasamanos `d_1.feria_id` /
-- `s.feria_id` / `c.feria_id` / `t.feria_id` en las demás), 13 líneas en
-- total (el cuerpo de este archivo con esas 13 líneas repuestas es el de prod
-- anterior; su md5 es e309c37761cb18536e272392484d9bec, sin los prefijos `public.`).

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
  if to_regprocedure('public.crear_comprobante(bigint, public.medio_pago, text, date, text, public.estado_ocr, bigint, jsonb, boolean, uuid, uuid, bigint)') is null then
    raise exception 'PRECONDICION_FALLIDA: crear_comprobante no tiene la firma esperada (con p_feria_id)';
  end if;
  if to_regprocedure('public.actualizar_comprobante(uuid, bigint, public.medio_pago, text, date, text, public.estado_ocr, bigint, jsonb, boolean, uuid, uuid, bigint)') is null then
    raise exception 'PRECONDICION_FALLIDA: actualizar_comprobante no tiene la firma esperada (con p_feria_id)';
  end if;
  if to_regprocedure('public.crear_gasto(bigint, uuid, public.medio_pago, date, text, text, uuid, uuid, uuid)') is null then
    raise exception 'PRECONDICION_FALLIDA: crear_gasto no tiene la firma esperada (con p_feria_id)';
  end if;
end;
$$;

-- ============================================================
-- 1) Triggers de validación de feria y su función
--    (con `feria_id` siempre nulo salían en la primera línea; sin las RPC
--    que lo escribían ya no tienen nada que validar)
-- ============================================================

drop trigger trg_comprobantes_validar_feria on public.comprobantes;
drop trigger trg_gastos_validar_feria on public.gastos;
drop trigger trg_movimientos_stock_validar_feria on public.movimientos_stock;
drop function public.validar_feria_abierta();

-- ============================================================
-- 2) crear_comprobante, actualizar_comprobante, crear_gasto sin p_feria_id
--    (drop + create: la firma cambia; nunca create or replace con otra
--    firma, que dejaría una sobrecarga ambigua para PostgREST)
-- ============================================================

drop function public.crear_comprobante(bigint, public.medio_pago, text, date, text, public.estado_ocr, bigint, jsonb, boolean, uuid, uuid, bigint);

create function public.crear_comprobante(
  p_monto_centavos bigint,
  p_medio_pago public.medio_pago,
  p_imagen_path text,
  p_fecha date,
  p_nota text default null,
  p_estado_ocr public.estado_ocr default 'no_intentado'::public.estado_ocr,
  p_ocr_monto_centavos bigint default null,
  p_items jsonb default '[]'::jsonb,
  p_permitir_negativo boolean default false,
  p_cliente_id uuid default null,
  p_cobrado_centavos bigint default null
)
returns json
language plpgsql
security definer
set search_path = public
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
  v_cobrado_centavos bigint;
  v_vistos text[] := '{}';
begin
  if not public.es_admin() then
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

  v_cobrado_centavos := coalesce(p_cobrado_centavos, p_monto_centavos);

  if v_cobrado_centavos < 0 or v_cobrado_centavos > p_monto_centavos then
    raise exception 'COBRADO_INVALIDO';
  end if;

  if v_cobrado_centavos < p_monto_centavos and p_cliente_id is null then
    raise exception 'CREDITO_REQUIERE_CLIENTE';
  end if;

  insert into comprobantes (
    vendedor_id, monto_centavos, medio_pago, imagen_path, fecha,
    estado_ocr, ocr_monto_centavos, nota, cliente_id, cobrado_centavos
  ) values (
    v_vendedor_id, p_monto_centavos, p_medio_pago, p_imagen_path,
    coalesce(p_fecha, current_date), coalesce(p_estado_ocr, 'no_intentado'),
    p_ocr_monto_centavos, p_nota, p_cliente_id, v_cobrado_centavos
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

revoke all on function public.crear_comprobante(bigint, public.medio_pago, text, date, text, public.estado_ocr, bigint, jsonb, boolean, uuid, bigint) from public, anon;
grant execute on function public.crear_comprobante(bigint, public.medio_pago, text, date, text, public.estado_ocr, bigint, jsonb, boolean, uuid, bigint) to authenticated, service_role;

drop function public.actualizar_comprobante(uuid, bigint, public.medio_pago, text, date, text, public.estado_ocr, bigint, jsonb, boolean, uuid, uuid, bigint);

create function public.actualizar_comprobante(
  p_comprobante_id uuid,
  p_monto_centavos bigint,
  p_medio_pago public.medio_pago,
  p_imagen_path text,
  p_fecha date,
  p_nota text default null,
  p_estado_ocr public.estado_ocr default 'no_intentado'::public.estado_ocr,
  p_ocr_monto_centavos bigint default null,
  p_items jsonb default '[]'::jsonb,
  p_permitir_negativo boolean default false,
  p_cliente_id uuid default null,
  p_cobrado_centavos bigint default null
)
returns json
language plpgsql
security definer
set search_path = public
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
  v_cobrado_actual bigint;
  v_cobros_total bigint;
  v_cobrado_centavos bigint;
  v_vistos text[] := '{}';
begin
  if not public.es_admin() then
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

  select cobrado_centavos into v_cobrado_actual
  from comprobantes where id = p_comprobante_id;
  if not found then
    raise exception 'COMPROBANTE_NO_ENCONTRADO';
  end if;

  if p_cliente_id is not null and not exists (
    select 1 from clientes where id = p_cliente_id and activo
  ) then
    raise exception 'CLIENTE_INVALIDO';
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

revoke all on function public.actualizar_comprobante(uuid, bigint, public.medio_pago, text, date, text, public.estado_ocr, bigint, jsonb, boolean, uuid, bigint) from public, anon;
grant execute on function public.actualizar_comprobante(uuid, bigint, public.medio_pago, text, date, text, public.estado_ocr, bigint, jsonb, boolean, uuid, bigint) to authenticated, service_role;

drop function public.crear_gasto(bigint, uuid, public.medio_pago, date, text, text, uuid, uuid, uuid);

create function public.crear_gasto(
  p_monto_centavos bigint,
  p_categoria_id uuid,
  p_medio_pago public.medio_pago,
  p_fecha date,
  p_nota text default null,
  p_imagen_path text default null,
  p_lote_id uuid default null,
  p_producto_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendedor_id uuid;
  v_gasto_id uuid;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select id into v_vendedor_id from vendedores where user_id = auth.uid();
  if v_vendedor_id is null then
    raise exception 'VENDEDOR_NO_REGISTRADO';
  end if;

  if p_monto_centavos is null or p_monto_centavos <= 0 then
    raise exception 'MONTO_INVALIDO';
  end if;

  if p_lote_id is not null and not exists (select 1 from lotes_produccion where id = p_lote_id) then
    raise exception 'LOTE_NO_ENCONTRADO';
  end if;

  if p_producto_id is not null then
    if p_lote_id is null then
      raise exception 'PRODUCTO_NO_EN_LOTE';
    end if;
    if not exists (
      select 1 from lote_items
      where lote_id = p_lote_id and producto_id = p_producto_id
    ) then
      raise exception 'PRODUCTO_NO_EN_LOTE';
    end if;
  end if;

  insert into gastos (vendedor_id, monto_centavos, categoria_id, medio_pago, fecha, nota, imagen_path, lote_id, producto_id)
  values (v_vendedor_id, p_monto_centavos, p_categoria_id, p_medio_pago, coalesce(p_fecha, current_date), p_nota, p_imagen_path, p_lote_id, p_producto_id)
  returning id into v_gasto_id;

  insert into notificaciones (tipo, titulo, detalle, referencia_id)
  values ('gasto_nuevo', 'Nuevo gasto registrado', p_nota, v_gasto_id);

  return json_build_object('gasto_id', v_gasto_id);
end;
$$;

revoke all on function public.crear_gasto(bigint, uuid, public.medio_pago, date, text, text, uuid, uuid) from public, anon;
grant execute on function public.crear_gasto(bigint, uuid, public.medio_pago, date, text, text, uuid, uuid) to authenticated, service_role;

-- ============================================================
-- 3) eliminar_movimiento_stock sin feria (misma firma: create or replace)
-- ============================================================

create or replace function public.eliminar_movimiento_stock(p_movimiento_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mov public.movimientos_stock%rowtype;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select * into v_mov
  from public.movimientos_stock
  where id = p_movimiento_id
  for update;

  if not found then
    raise exception 'MOVIMIENTO_INVALIDO';
  end if;

  -- Manual = egreso cargado a mano. Ver la cabecera de
  -- 0072_eliminar_movimiento_stock.sql: ningún otro camino deja un egreso sin
  -- comprobante y sin entrega, y los ingresos no se pueden distinguir con
  -- certeza de los de producción. (Desde 0094 la regla ya no pregunta por
  -- feria: la feria vieja se retiró y `feria_id` era siempre nulo.)
  if v_mov.tipo <> 'egreso'
    or v_mov.comprobante_id is not null
    or v_mov.entrega_id is not null
  then
    raise exception 'MOVIMIENTO_NO_MANUAL';
  end if;

  insert into public.movimientos_stock_borrados (
    movimiento_id, producto_id, tipo, cantidad, vendedor_id, comprobante_id,
    nota, created_at, lote_id, entrega_id, motivo, borrado_por
  ) values (
    v_mov.id, v_mov.producto_id, v_mov.tipo, v_mov.cantidad, v_mov.vendedor_id,
    v_mov.comprobante_id, v_mov.nota, v_mov.created_at, v_mov.lote_id,
    v_mov.entrega_id, v_mov.motivo, public.mi_vendedor_id()
  );

  delete from public.movimientos_stock where id = v_mov.id;

  return json_build_object('id', v_mov.id);
end;
$$;

revoke all on function public.eliminar_movimiento_stock(uuid) from public, anon;
grant execute on function public.eliminar_movimiento_stock(uuid) to authenticated, service_role;

-- ============================================================
-- 4) v_margen_ventas sin la columna feria_id
--    (drop view + create view: create or replace no puede quitar columnas;
--    ningún objeto depende de la vista, así que el drop sin cascade pasa; si
--    alguno apareciera, falla y se revierte todo)
-- ============================================================

drop view public.v_margen_ventas;

create view public.v_margen_ventas
with (security_invoker = true)
as
WITH lote_directo AS (
         SELECT dl.lote_id,
            dl.producto_id,
            COALESCE(sum(dl.cantidad), 0::bigint) AS asignado_directo
           FROM ( SELECT ci.lote_id,
                    ci.producto_id,
                    ci.cantidad
                   FROM public.comprobante_items ci
                  WHERE ci.lote_id IS NOT NULL
                UNION ALL
                 SELECT vr.lote_id,
                    vr.producto_id,
                    vr.cantidad
                   FROM public.ventas_revendedor vr
                  WHERE vr.lote_id IS NOT NULL) dl
          GROUP BY dl.lote_id, dl.producto_id
        ), lote_capacidad AS (
         SELECT li.lote_id,
            li.producto_id,
            l.fecha,
            l.created_at,
            GREATEST(li.cantidad - COALESCE(ld.asignado_directo, 0::bigint), 0::bigint) AS capacidad
           FROM public.lote_items li
             JOIN public.lotes_produccion l ON l.id = li.lote_id
             LEFT JOIN lote_directo ld ON ld.lote_id = li.lote_id AND ld.producto_id = li.producto_id
        ), lote_capacidad_off AS (
         SELECT lc.lote_id,
            lc.producto_id,
            lc.fecha,
            lc.created_at,
            lc.capacidad,
            COALESCE(sum(lc.capacidad) OVER (PARTITION BY lc.producto_id ORDER BY lc.fecha, lc.created_at, lc.lote_id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0::numeric)::bigint AS offset_previo
           FROM lote_capacidad lc
          WHERE lc.capacidad > 0
        ), lote_capacidad_rango AS (
         SELECT o.lote_id,
            o.producto_id,
            o.fecha,
            o.created_at,
            o.capacidad,
            o.offset_previo,
            o.offset_previo + o.capacidad AS fin_posicion
           FROM lote_capacidad_off o
        ), demanda_sin_lote AS (
         SELECT 'comprobante'::text AS origen,
            ci.comprobante_id AS documento_id,
            c.fecha,
            c.created_at,
            ci.id AS orden_id,
            ci.producto_id,
            ci.cantidad,
            c.vendedor_id,
            ci.precio_unitario_centavos,
            NULL::bigint AS precio_costo_real_centavos,
            NULL::bigint AS costo_lote_unitario_centavos,
            NULL::bigint AS costo_produccion_unitario_centavos
           FROM public.comprobante_items ci
             JOIN public.comprobantes c ON c.id = ci.comprobante_id
          WHERE ci.lote_id IS NULL
        UNION ALL
         SELECT 'revendedor'::text AS origen,
            vr.id AS documento_id,
            vr.fecha,
            vr.created_at,
            vr.id AS orden_id,
            vr.producto_id,
            vr.cantidad,
            vr.vendedor_id,
            vr.precio_venta_centavos AS precio_unitario_centavos,
            vr.precio_costo_centavos AS precio_costo_real_centavos,
            NULL::bigint AS costo_lote_unitario_centavos,
            NULL::bigint AS costo_produccion_unitario_centavos
           FROM public.ventas_revendedor vr
          WHERE vr.lote_id IS NULL
        ), demanda_off AS (
         SELECT d_1.origen,
            d_1.documento_id,
            d_1.fecha,
            d_1.created_at,
            d_1.orden_id,
            d_1.producto_id,
            d_1.cantidad,
            d_1.vendedor_id,
            d_1.precio_unitario_centavos,
            d_1.precio_costo_real_centavos,
            d_1.costo_lote_unitario_centavos,
            d_1.costo_produccion_unitario_centavos,
            COALESCE(sum(d_1.cantidad) OVER (PARTITION BY d_1.producto_id ORDER BY d_1.fecha, d_1.created_at, d_1.orden_id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0::bigint) AS offset_previo
           FROM demanda_sin_lote d_1
        ), demanda_con_frontera AS (
         SELECT d_1.origen,
            d_1.documento_id,
            d_1.fecha,
            d_1.created_at,
            d_1.orden_id,
            d_1.producto_id,
            d_1.cantidad,
            d_1.vendedor_id,
            d_1.precio_unitario_centavos,
            d_1.precio_costo_real_centavos,
            d_1.costo_lote_unitario_centavos,
            d_1.costo_produccion_unitario_centavos,
            d_1.offset_previo,
            COALESCE(( SELECT max(lcr.fin_posicion) AS max
                   FROM lote_capacidad_rango lcr
                  WHERE lcr.producto_id = d_1.producto_id AND lcr.fecha <= d_1.fecha), 0::bigint) AS frontera,
            GREATEST(LEAST(d_1.offset_previo + d_1.cantidad, COALESCE(( SELECT max(lcr.fin_posicion) AS max
                   FROM lote_capacidad_rango lcr
                  WHERE lcr.producto_id = d_1.producto_id AND lcr.fecha <= d_1.fecha), 0::bigint)) - d_1.offset_previo, 0::bigint) AS cantidad_satisfecha
           FROM demanda_off d_1
        ), sin_lote_resuelto AS (
         SELECT d_1.origen,
            d_1.documento_id,
            d_1.fecha,
            d_1.producto_id,
            lcr.lote_id,
            d_1.vendedor_id,
            d_1.precio_unitario_centavos,
            d_1.precio_costo_real_centavos,
            d_1.costo_lote_unitario_centavos,
            d_1.costo_produccion_unitario_centavos,
            (LEAST(d_1.offset_previo + d_1.cantidad_satisfecha, lcr.fin_posicion) - GREATEST(d_1.offset_previo, lcr.offset_previo))::integer AS cantidad,
            true AS costo_estimado
           FROM demanda_con_frontera d_1
             JOIN lote_capacidad_rango lcr ON lcr.producto_id = d_1.producto_id AND lcr.offset_previo < (d_1.offset_previo + d_1.cantidad_satisfecha) AND lcr.fin_posicion > d_1.offset_previo
          WHERE d_1.cantidad_satisfecha > 0
        ), sin_lote_no_resuelto AS (
         SELECT d_1.origen,
            d_1.documento_id,
            d_1.fecha,
            d_1.producto_id,
            NULL::uuid AS lote_id,
            d_1.vendedor_id,
            d_1.precio_unitario_centavos,
            d_1.precio_costo_real_centavos,
            d_1.costo_lote_unitario_centavos,
            d_1.costo_produccion_unitario_centavos,
            (d_1.cantidad - d_1.cantidad_satisfecha)::integer AS cantidad,
            true AS costo_estimado
           FROM demanda_con_frontera d_1
          WHERE (d_1.cantidad - d_1.cantidad_satisfecha) > 0
        ), sin_lote_agregado AS (
         SELECT s.origen,
            s.documento_id,
            s.fecha,
            s.producto_id,
            s.lote_id,
            s.vendedor_id,
            s.precio_unitario_centavos,
            s.precio_costo_real_centavos,
            s.costo_lote_unitario_centavos,
            s.costo_produccion_unitario_centavos,
            s.cantidad,
            s.costo_estimado
           FROM sin_lote_resuelto s
        UNION ALL
         SELECT s.origen,
            s.documento_id,
            s.fecha,
            s.producto_id,
            s.lote_id,
            s.vendedor_id,
            s.precio_unitario_centavos,
            s.precio_costo_real_centavos,
            s.costo_lote_unitario_centavos,
            s.costo_produccion_unitario_centavos,
            s.cantidad,
            s.costo_estimado
           FROM sin_lote_no_resuelto s
        ), con_lote AS (
         SELECT 'comprobante'::text AS origen,
            ci.comprobante_id AS documento_id,
            c.fecha,
            ci.producto_id,
            ci.lote_id,
            c.vendedor_id,
            ci.precio_unitario_centavos,
            NULL::bigint AS precio_costo_real_centavos,
            ci.costo_lote_unitario_centavos,
            ci.costo_produccion_unitario_centavos,
            ci.cantidad,
            false AS costo_estimado
           FROM public.comprobante_items ci
             JOIN public.comprobantes c ON c.id = ci.comprobante_id
          WHERE ci.lote_id IS NOT NULL
        UNION ALL
         SELECT 'revendedor'::text AS origen,
            vr.id AS documento_id,
            vr.fecha,
            vr.producto_id,
            vr.lote_id,
            vr.vendedor_id,
            vr.precio_venta_centavos AS precio_unitario_centavos,
            vr.precio_costo_centavos AS precio_costo_real_centavos,
            NULL::bigint AS costo_lote_unitario_centavos,
            NULL::bigint AS costo_produccion_unitario_centavos,
            vr.cantidad,
            false AS costo_estimado
           FROM public.ventas_revendedor vr
          WHERE vr.lote_id IS NOT NULL
        ), todas AS (
         SELECT c.origen,
            c.documento_id,
            c.fecha,
            c.producto_id,
            c.lote_id,
            c.vendedor_id,
            c.precio_unitario_centavos,
            c.precio_costo_real_centavos,
            c.costo_lote_unitario_centavos,
            c.costo_produccion_unitario_centavos,
            c.cantidad,
            c.costo_estimado
           FROM con_lote c
        UNION ALL
         SELECT s.origen,
            s.documento_id,
            s.fecha,
            s.producto_id,
            s.lote_id,
            s.vendedor_id,
            s.precio_unitario_centavos,
            s.precio_costo_real_centavos,
            s.costo_lote_unitario_centavos,
            s.costo_produccion_unitario_centavos,
            s.cantidad,
            s.costo_estimado
           FROM sin_lote_agregado s
        ), costo_seguro AS (
         SELECT v_costo_lote_vigente.lote_id,
            v_costo_lote_vigente.producto_id,
                CASE
                    WHEN v_costo_lote_vigente.tiene_costos THEN v_costo_lote_vigente.costo_unitario_centavos
                    ELSE NULL::bigint
                END AS costo_produccion_unitario_centavos,
                CASE
                    WHEN v_costo_lote_vigente.tiene_costos THEN v_costo_lote_vigente.costo_ananja_centavos
                    ELSE NULL::bigint
                END AS costo_ananja_unitario_centavos
           FROM public.v_costo_lote_vigente
        ), costo_venta_revendedor AS (
         SELECT c.venta_id,
            c.costo_lote_incompleto,
                CASE
                    WHEN c.costo_lote_incompleto THEN c.cobrado_unitario_centavos
                    ELSE LEAST(c.cobrado_unitario_centavos, c.costo_lote_unitario_centavos)
                END AS ananja_unitario_centavos,
                CASE
                    WHEN c.costo_lote_incompleto THEN NULL::bigint
                    WHEN enc.id IS NULL THEN 0::bigint
                    ELSE GREATEST(c.cobrado_unitario_centavos - c.costo_lote_unitario_centavos, 0::bigint)
                END AS encargado_unitario_centavos,
            c.costo_produccion_unitario_centavos AS produccion_unitario_centavos,
            c.costo_lote_unitario_centavos AS ananja_display_centavos
           FROM public.v_costo_lote_venta c
             JOIN public.vendedores yo ON yo.id = c.vendedor_id
             LEFT JOIN public.vendedores enc ON enc.id = yo.encargado_id AND enc.activo AND enc.id <> yo.id
        )
 SELECT t.origen,
    t.documento_id,
    t.fecha,
    t.vendedor_id,
    t.producto_id,
    t.lote_id,
    t.cantidad,
        CASE
            WHEN t.origen = 'revendedor'::text THEN COALESCE(cv.produccion_unitario_centavos, d.costo_produccion_unitario_centavos)
            WHEN t.origen = 'comprobante'::text THEN COALESCE(t.costo_produccion_unitario_centavos, d.costo_produccion_unitario_centavos)
            ELSE d.costo_produccion_unitario_centavos
        END AS costo_produccion_unitario_centavos,
        CASE
            WHEN t.origen = 'revendedor'::text THEN COALESCE(cv.ananja_display_centavos, d.costo_ananja_unitario_centavos)
            WHEN t.origen = 'comprobante'::text THEN COALESCE(t.costo_lote_unitario_centavos, d.costo_ananja_unitario_centavos)
            ELSE d.costo_ananja_unitario_centavos
        END AS costo_ananja_unitario_centavos,
    t.precio_unitario_centavos AS precio_unitario_venta_centavos,
    t.costo_estimado,
        CASE
            WHEN t.origen = 'revendedor'::text THEN cv.ananja_unitario_centavos * t.cantidad
            WHEN t.origen = 'comprobante'::text AND t.costo_lote_unitario_centavos IS NOT NULL THEN t.costo_lote_unitario_centavos * t.cantidad
            WHEN d.costo_ananja_unitario_centavos IS NOT NULL THEN d.costo_ananja_unitario_centavos * t.cantidad
            ELSE NULL::bigint
        END AS ingreso_ananja_centavos,
        CASE
            WHEN t.origen = 'revendedor'::text THEN
            CASE
                WHEN cv.costo_lote_incompleto THEN NULL::bigint
                WHEN cv.ananja_unitario_centavos IS NOT NULL AND COALESCE(cv.produccion_unitario_centavos, d.costo_produccion_unitario_centavos) IS NOT NULL THEN (cv.ananja_unitario_centavos - COALESCE(cv.produccion_unitario_centavos, d.costo_produccion_unitario_centavos)) * t.cantidad
                ELSE NULL::bigint
            END
            WHEN t.origen = 'comprobante'::text AND t.costo_lote_unitario_centavos IS NOT NULL AND COALESCE(t.costo_produccion_unitario_centavos, d.costo_produccion_unitario_centavos) IS NOT NULL THEN (t.costo_lote_unitario_centavos - COALESCE(t.costo_produccion_unitario_centavos, d.costo_produccion_unitario_centavos)) * t.cantidad
            WHEN d.costo_ananja_unitario_centavos IS NOT NULL AND d.costo_produccion_unitario_centavos IS NOT NULL THEN (d.costo_ananja_unitario_centavos - d.costo_produccion_unitario_centavos) * t.cantidad
            ELSE NULL::bigint
        END AS margen_ananja_centavos,
        CASE
            WHEN t.origen = 'revendedor'::text THEN
            CASE
                WHEN t.precio_unitario_centavos IS NOT NULL AND t.precio_costo_real_centavos IS NOT NULL THEN (t.precio_unitario_centavos - t.precio_costo_real_centavos) * t.cantidad
                ELSE NULL::bigint
            END
            WHEN t.precio_unitario_centavos IS NOT NULL AND t.origen = 'comprobante'::text AND t.costo_lote_unitario_centavos IS NOT NULL THEN (t.precio_unitario_centavos - t.costo_lote_unitario_centavos) * t.cantidad
            WHEN t.precio_unitario_centavos IS NOT NULL AND d.costo_ananja_unitario_centavos IS NOT NULL THEN (t.precio_unitario_centavos - d.costo_ananja_unitario_centavos) * t.cantidad
            ELSE NULL::bigint
        END AS margen_vendedor_centavos,
        CASE
            WHEN t.origen = 'revendedor'::text THEN cv.encargado_unitario_centavos * t.cantidad
            ELSE 0::bigint
        END AS margen_encargado_centavos
   FROM todas t
     LEFT JOIN costo_seguro d ON d.lote_id = t.lote_id AND d.producto_id = t.producto_id
     LEFT JOIN costo_venta_revendedor cv ON t.origen = 'revendedor'::text AND cv.venta_id = t.documento_id
  WHERE public.es_admin();

-- Los privilegios por defecto de Supabase le dan a toda vista nueva los siete
-- a anon y authenticated: se dejan solo lectura (misma decisión que 0090).
revoke all on public.v_margen_ventas from public, anon, authenticated;
grant select on public.v_margen_ventas to authenticated;
