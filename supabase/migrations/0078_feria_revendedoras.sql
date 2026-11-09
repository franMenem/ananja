-- Ananja: FERIA DE REVENDEDORAS (capa de base de datos).
--
-- Qué es: el admin arma una feria (nombre, lugar, fecha) con un precio de
-- feria por producto, le suma participantes (revendedoras) y a cada una le
-- carga qué botellas se lleva: es una entrega normal pero marcada "de la
-- feria" (`entregas_revendedor.feria_id`). La revendedora NO carga venta por
-- venta ese día. Al final cierra su participación: por producto dice cuántas
-- devuelve y cuántas se usaron para degustar; la app calcula
--     vendidas = llevadas - devueltas - degustadas
-- les pone el precio de feria (ella puede corregirlo), registra las ventas
-- (con `ventas_revendedor.feria_id`) y la devolución, y guarda cuánta plata
-- juntó por medio (efectivo / Mercado Pago / banco). Lo vendido pasa a deuda
-- con Ananja como cualquier venta y se paga por el flujo de siempre
-- (`informar_pago_revendedor`).
--
-- NO reusa la `ferias` vieja (0011/0012, admin vendiendo en un stand; sigue
-- en la base con 0 filas y sus triggers/vistas/RPCs). Todo lo de acá lleva
-- otros nombres: tablas `feria_revendedoras`, `feria_precios`,
-- `feria_participantes`, `feria_degustaciones`; funciones `feria_*` (no hay
-- choque con `crear_feria`/`reabrir_feria`); vistas `v_feria_participante_
-- productos` y `v_feria_participantes`. `movimientos_stock.feria_id` es de la
-- feria vieja y NO se usa (su trigger `validar_feria_abierta` mira `ferias`).
--
-- Contenido:
--   1) Tablas nuevas (RLS activada; solo SELECT para `authenticated`; toda
--      escritura va por las funciones de abajo, que son security definer).
--   2) Columna `feria_id` (null) + índice en `entregas_revendedor` y
--      `ventas_revendedor`. Ambas tablas tienen `grant select` a nivel TABLA
--      para `authenticated` (verificado en prod con
--      `information_schema.table_privileges`), así que la columna nueva ya
--      se puede leer; no hace falta `grant select (feria_id)`.
--   3) Funciones del admin: `feria_crear`, `feria_editar`,
--      `feria_agregar_participante`, `feria_quitar_participante`,
--      `feria_cerrar`, `feria_reabrir`, `feria_reabrir_participacion`.
--   4) `registrar_entrega_revendedor`: firma nueva con `p_feria_id uuid
--      default null` al final (DROP de la firma vieja + CREATE). Cuerpo
--      idéntico al de 0055 salvo lo marcado "FERIA".
--   5) `insertar_venta_revendedor`: firma nueva con `p_feria_id uuid default
--      null` al final (DROP + CREATE). Cuerpo idéntico al de 0073 salvo
--      que guarda `feria_id`. Sigue siendo interna (sin grant).
--   5b) `ventas_revendedor_borradas.feria_id` (+ trigger de archivo que la
--      copia) y `eliminar_venta_revendedor` / `editar_venta_revendedor`
--      (misma firma, `create or replace`): una venta con `feria_id` solo la
--      toca un admin (`VENTA_DE_FERIA` al resto).
--   6) `feria_cerrar_participacion`: la que usa la revendedora (o su
--      coordinadora, o un admin) para cerrar su parte.
--   7) Vistas `v_feria_participante_productos` y `v_feria_participantes`.
--
-- Decisiones (donde el diseño no cerraba o no decía):
--   * `feria_cerrar_participacion` NO llama a `registrar_entrega_revendedor`
--     para la devolución: esa función exige admin o coordinadora
--     (`NO_AUTORIZADO`) y la revendedora que cierra su parte no es ninguna de
--     las dos. Hace el "insert equivalente": una entrega tipo 'devolucion'
--     con `feria_id`, sus `entrega_items` (con `lote_id` siempre que la
--     entrega original lo tenía) y el `movimientos_stock` de ingreso con
--     `entrega_id`/`lote_id`, igual que la función original. El trigger
--     `trg_entrega_items_foto_costo_lote` completa las fotos de costo como
--     siempre. Y chequea `STOCK_REVENDEDOR_INSUFICIENTE` como ella.
--   * `registrar_entrega_revendedor` con `p_feria_id` solo acepta tipo
--     'entrega' (`TIPO_INVALIDO` si no) y solo admin (`NO_AUTORIZADO` a una
--     coordinadora): la devolución de feria la genera siempre el cierre.
--     Si la participante ya cerró (`PARTICIPACION_CERRADA`) no se le puede
--     cargar más. Si no era participante, se la agrega.
--   * Las degustadas VUELVEN primero al lote (van dentro de la devolución) y
--     después sale un egreso `motivo = 'degustacion'` con ese `lote_id`
--     (así quedan en `v_perdidas_lote` como cualquier degustación). Ese
--     egreso lleva `entrega_id`, `comprobante_id` y `feria_id` en null, o
--     sea que `eliminar_movimiento_stock` (0072) lo ve como "manual" y un
--     admin podría borrarlo a mano; se identifica por la nota "Feria ...".
--     Atarlo a la devolución con `entrega_id` descuadraría las vistas de
--     stock del lote, y usar `movimientos_stock.feria_id` rompería con el
--     trigger de la feria vieja. Para saber cuántas fueron degustadas (la
--     devolución las mezcla) se guarda `feria_degustaciones`.
--   * Reparto por lote: si lo llevado de un producto salió de varios lotes,
--     lo que vuelve/se degusta se toma de los lotes en orden de entrega
--     (el primero se agota primero) y lo vendido de cada lote se registra
--     con ese `lote_id` explícito (una venta por producto y lote). Así el
--     stock por lote de la revendedora queda cuadrado. Una venta sin lote
--     (entregas viejas sin `lote_id`) queda con `lote_id` null (FIFO).
--   * `insertar_venta_revendedor` reparte por FIFO entre TODAS las entregas
--     de la revendedora (con lote explícito, entre las de ese lote): si
--     tenía botellas del mismo lote de entregas fuera de la feria, la
--     venta puede consumir de esas. Lo contable (deuda, stock) cuadra igual;
--     solo cambia de qué entrega sale cada fila.
--   * El medio de las ventas es el de la plata si exactamente un monto es
--     > 0; si no, null (informativo, no mueve saldos).
--   * `feria_editar` y `feria_agregar_participante` solo con la feria
--     abierta (`FERIA_CERRADA`). `feria_quitar_participante` rechaza si ya
--     hay movimientos (`PARTICIPANTE_CON_MOVIMIENTOS`). `feria_editar` no
--     borra los precios de productos que ya se entregaron en la feria.
--   * Ventas normales previas al cierre: durante el día la revendedora puede
--     haber cargado ventas por el flujo normal; por FIFO quedan atribuidas
--     (`entrega_item_id`) a las botellas de la feria. El cierre las cuenta
--     (`ya_vendidas`), NO las toca ni las vende de nuevo:
--         vendidas nuevas = llevadas - devueltas - degustadas - ya_vendidas
--     y el reparto por lote descuenta las ya vendidas de cada lote. Las
--     vistas cuentan esas ventas como vendidas de la feria. El json del
--     cierre devuelve `vendidas`/`total_centavos` (solo las NUEVAS),
--     `ya_vendidas` (total previo) y `diferencia_centavos` (plata juntada -
--     total nuevo, informativo).
--   * PARA CORREGIR UN CIERRE: `feria_reabrir_participacion` (solo admin, con
--     la feria abierta) DESHACE todo en una transacción -borra las ventas
--     del cierre (archivadas), los egresos de degustación (ids en
--     `feria_degustaciones.movimiento_ids`) y la devolución de feria, compensa
--     entregas automáticas, y deja a la persona 'pendiente' con montos en 0-
--     y después se vuelve a cerrar. Falla `STOCK_REVENDEDOR_INSUFICIENTE` si
--     al deshacer quedaría con stock negativo. No toca las ventas normales
--     previas.
--   * El cierre toma los locks en el orden vendedores -> feria ->
--     participante, y rechaza una fecha anterior a la entrega
--     (`FECHA_ANTERIOR_A_ENTREGA`, `producto` null).
--   * La fecha del cierre no puede ser futura (hoy en America/Argentina/
--     Buenos_Aires, como 0077).
--
-- `set search_path = public` va SIN comillas a propósito: `supabase/render.mjs`
-- solo reescribe la palabra `public` pelada después de `search_path =`, no
-- `'public'` entrecomillado (ver supabase/README.md). Hardcodea `public.` en
-- vez de `__SCHEMA__.` igual que 0049-0077: esta migración es solo de Ananja.
--
-- `lib/types.ts` se editó a mano; regenerarlo después de aplicar.
--
-- ============================================================
-- Cómo verificar (en el SQL Editor; las dos primeras como admin)
-- ============================================================
--
--   -- a) tablas, vistas y funciones nuevas
--   select count(*) from public.feria_revendedoras;      -- 0
--   select count(*) from public.v_feria_participantes;   -- 0
--   select proname, pg_get_function_identity_arguments(oid)
--   from pg_proc where pronamespace = 'public'::regnamespace
--     and (proname like 'feria\_%' or proname in
--          ('registrar_entrega_revendedor', 'insertar_venta_revendedor'));
--   -- esperado: UNA sola firma de registrar_entrega_revendedor (7 params,
--   -- termina en p_feria_id uuid) y UNA de insertar_venta_revendedor (11).
--
--   -- b) permisos
--   select routine_name, grantee from information_schema.routine_privileges
--   where routine_schema = 'public' and routine_name like 'feria\_%'
--     and grantee in ('anon', 'public');            -- 0 filas
--   select column_name from information_schema.column_privileges
--   where table_name = 'ventas_revendedor' and column_name = 'feria_id'
--     and grantee = 'authenticated';                -- 1 fila
--
--   -- c) flujo completo (con datos de prueba, en una transacción que se
--   --    revierte; como admin)
--   select public.feria_crear('Prueba', 'Plaza', current_date, null,
--     '[{"producto_id":"<producto>","precio_centavos":10000}]'::jsonb);
--   select public.feria_agregar_participante('<feria>', '<revendedora>');
--   select public.registrar_entrega_revendedor('<revendedora>', 'entrega',
--     current_date, null, '[{"producto_id":"<producto>","cantidad":10,
--     "lote_id":"<lote>","costo_ananja_unitario_centavos":5000}]'::jsonb,
--     false, '<feria>');
--   select public.feria_cerrar_participacion('<feria>', '<revendedora>',
--     current_date, '[{"producto_id":"<producto>","cantidad":2}]',
--     '[{"producto_id":"<producto>","cantidad":1}]', '[]', 70000, 0, 0, null);
--   -- esperado: vendidas = 7, total_centavos = 70000, devolucion_id no nulo;
--   -- una devolución de 3 (2 + 1), un egreso 'degustacion' de 1 y una venta
--   -- de 7 con feria_id. Después: rollback.
--
-- ============================================================
-- Rollback
-- ============================================================
--
--   -- (ventas_revendedor_borradas.feria_id: dropear la columna y volver a
--   --  crear el trigger sin ella; eliminar/editar_venta_revendedor: volver a
--   --  los cuerpos de 0073 y 0077.)
--   drop view public.v_feria_participantes;
--   drop view public.v_feria_participante_productos;
--   drop function public.feria_cerrar_participacion(uuid, uuid, date, jsonb, jsonb, jsonb, bigint, bigint, bigint, text);
--   drop function public.feria_reabrir_participacion(uuid, uuid);
--   drop function public.feria_reabrir(uuid);
--   drop function public.feria_cerrar(uuid);
--   drop function public.feria_quitar_participante(uuid, uuid);
--   drop function public.feria_agregar_participante(uuid, uuid);
--   drop function public.feria_editar(uuid, text, text, date, text, jsonb);
--   drop function public.feria_crear(text, text, date, text, jsonb);
--   -- volver a las firmas anteriores (cuerpos en 0055 y 0073):
--   drop function public.insertar_venta_revendedor(uuid, uuid, int, bigint, medio_pago, date, text, uuid, uuid, uuid, uuid);
--   drop function public.registrar_entrega_revendedor(uuid, text, date, text, jsonb, boolean, uuid);
--   --   ...y recrear las dos desde 0073 §5 y 0055 §10 con sus revoke/grant.
--   alter table public.ventas_revendedor drop column feria_id;
--   alter table public.entregas_revendedor drop column feria_id;
--   drop table public.feria_degustaciones;
--   drop table public.feria_participantes;
--   drop table public.feria_precios;
--   drop table public.feria_revendedoras;

-- ============================================================
-- 1) Tablas
-- ============================================================

create table public.feria_revendedoras (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  lugar text,
  fecha date not null,
  estado text not null default 'abierta' check (estado in ('abierta', 'cerrada')),
  nota text,
  admin_id uuid references public.vendedores(id),
  created_at timestamptz not null default now()
);

create table public.feria_precios (
  feria_id uuid not null references public.feria_revendedoras(id) on delete cascade,
  producto_id uuid not null references public.productos(id),
  precio_centavos bigint not null check (precio_centavos > 0),
  primary key (feria_id, producto_id)
);

create table public.feria_participantes (
  feria_id uuid not null references public.feria_revendedoras(id) on delete cascade,
  vendedor_id uuid not null references public.vendedores(id),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'cerrada')),
  cerrada_at timestamptz,
  efectivo_centavos bigint not null default 0 check (efectivo_centavos >= 0),
  mercado_pago_centavos bigint not null default 0 check (mercado_pago_centavos >= 0),
  banco_centavos bigint not null default 0 check (banco_centavos >= 0),
  nota text,
  created_at timestamptz not null default now(),
  primary key (feria_id, vendedor_id)
);

-- Cuántas de las botellas devueltas fueron en realidad degustadas (la
-- devolución las mezcla: las degustadas vuelven primero al lote).
create table public.feria_degustaciones (
  feria_id uuid not null,
  vendedor_id uuid not null,
  producto_id uuid not null references public.productos(id),
  cantidad int not null check (cantidad > 0),
  -- ids de los `movimientos_stock` de egreso 'degustacion' que generó el
  -- cierre: así `feria_reabrir_participacion` los deshace sin depender de la nota.
  movimiento_ids uuid[] not null default '{}',
  primary key (feria_id, vendedor_id, producto_id),
  foreign key (feria_id, vendedor_id)
    references public.feria_participantes(feria_id, vendedor_id) on delete cascade
);

create index idx_feria_participantes_vendedor on public.feria_participantes(vendedor_id);
create index idx_feria_precios_producto on public.feria_precios(producto_id);
create index idx_feria_degustaciones_producto on public.feria_degustaciones(producto_id);
create index idx_feria_revendedoras_admin on public.feria_revendedoras(admin_id);

alter table public.feria_revendedoras enable row level security;
alter table public.feria_precios enable row level security;
alter table public.feria_participantes enable row level security;
alter table public.feria_degustaciones enable row level security;

revoke all on public.feria_revendedoras from anon, authenticated, public;
revoke all on public.feria_precios from anon, authenticated, public;
revoke all on public.feria_participantes from anon, authenticated, public;
revoke all on public.feria_degustaciones from anon, authenticated, public;

grant select on public.feria_revendedoras to authenticated;
grant select on public.feria_precios to authenticated;
grant select on public.feria_participantes to authenticated;
grant select on public.feria_degustaciones to authenticated;

-- La participante ve su fila; su coordinadora, las de sus revendedoras; el
-- admin todo. No hay recursión: la policy de `feria_participantes` no mira
-- las otras tres.
create policy feria_participantes_select on public.feria_participantes
  for select to authenticated
  using (
    public.es_admin()
    or vendedor_id = public.mi_vendedor_id()
    or public.es_coordinador_de(vendedor_id)
  );

create policy feria_degustaciones_select on public.feria_degustaciones
  for select to authenticated
  using (
    public.es_admin()
    or vendedor_id = public.mi_vendedor_id()
    or public.es_coordinador_de(vendedor_id)
  );

create policy feria_revendedoras_select on public.feria_revendedoras
  for select to authenticated
  using (
    public.es_admin()
    or exists (
      select 1 from public.feria_participantes fp
      where fp.feria_id = feria_revendedoras.id
        and (fp.vendedor_id = public.mi_vendedor_id() or public.es_coordinador_de(fp.vendedor_id))
    )
  );

create policy feria_precios_select on public.feria_precios
  for select to authenticated
  using (
    public.es_admin()
    or exists (
      select 1 from public.feria_participantes fp
      where fp.feria_id = feria_precios.feria_id
        and (fp.vendedor_id = public.mi_vendedor_id() or public.es_coordinador_de(fp.vendedor_id))
    )
  );

-- ============================================================
-- 2) feria_id en entregas y ventas de revendedoras
-- ============================================================

alter table public.entregas_revendedor
  add column feria_id uuid references public.feria_revendedoras(id);
alter table public.ventas_revendedor
  add column feria_id uuid references public.feria_revendedoras(id);

create index idx_entregas_revendedor_feria on public.entregas_revendedor(feria_id) where feria_id is not null;
create index idx_ventas_revendedor_feria on public.ventas_revendedor(feria_id) where feria_id is not null;

-- ============================================================
-- 3) Funciones del admin
-- ============================================================

create function public.feria_crear(
  p_nombre text,
  p_lugar text,
  p_fecha date,
  p_nota text,
  p_precios jsonb
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_feria_id uuid;
  v_precio jsonb;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'NOMBRE_INVALIDO';
  end if;

  if p_fecha is null then
    raise exception 'FECHA_INVALIDA';
  end if;

  p_precios := coalesce(p_precios, '[]'::jsonb);
  if jsonb_typeof(p_precios) <> 'array' then
    raise exception 'PRECIO_INVALIDO';
  end if;

  insert into feria_revendedoras (nombre, lugar, fecha, nota, admin_id)
  values (btrim(p_nombre), nullif(btrim(p_lugar), ''), p_fecha, nullif(btrim(p_nota), ''), public.mi_vendedor_id())
  returning id into v_feria_id;

  for v_precio in select * from jsonb_array_elements(p_precios)
  loop
    if nullif(v_precio->>'producto_id', '') is null
       or nullif(v_precio->>'precio_centavos', '') is null
       or (v_precio->>'precio_centavos')::bigint <= 0 then
      raise exception 'PRECIO_INVALIDO';
    end if;

    insert into feria_precios (feria_id, producto_id, precio_centavos)
    values (v_feria_id, (v_precio->>'producto_id')::uuid, (v_precio->>'precio_centavos')::bigint)
    on conflict (feria_id, producto_id) do update set precio_centavos = excluded.precio_centavos;
  end loop;

  return json_build_object('feria_id', v_feria_id);
end;
$$;

revoke execute on function public.feria_crear(text, text, date, text, jsonb) from anon, public;
grant execute on function public.feria_crear(text, text, date, text, jsonb) to authenticated;

create function public.feria_editar(
  p_feria_id uuid,
  p_nombre text,
  p_lugar text,
  p_fecha date,
  p_nota text,
  p_precios jsonb
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
  v_precio jsonb;
  v_productos uuid[] := '{}';
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select estado into v_estado from feria_revendedoras where id = p_feria_id for update;
  if v_estado is null then
    raise exception 'FERIA_NO_ENCONTRADA';
  end if;
  if v_estado <> 'abierta' then
    raise exception 'FERIA_CERRADA';
  end if;

  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'NOMBRE_INVALIDO';
  end if;

  if p_fecha is null then
    raise exception 'FECHA_INVALIDA';
  end if;

  p_precios := coalesce(p_precios, '[]'::jsonb);
  if jsonb_typeof(p_precios) <> 'array' then
    raise exception 'PRECIO_INVALIDO';
  end if;

  update feria_revendedoras
  set nombre = btrim(p_nombre),
      lugar = nullif(btrim(p_lugar), ''),
      fecha = p_fecha,
      nota = nullif(btrim(p_nota), '')
  where id = p_feria_id;

  for v_precio in select * from jsonb_array_elements(p_precios)
  loop
    if nullif(v_precio->>'producto_id', '') is null
       or nullif(v_precio->>'precio_centavos', '') is null
       or (v_precio->>'precio_centavos')::bigint <= 0 then
      raise exception 'PRECIO_INVALIDO';
    end if;

    insert into feria_precios (feria_id, producto_id, precio_centavos)
    values (p_feria_id, (v_precio->>'producto_id')::uuid, (v_precio->>'precio_centavos')::bigint)
    on conflict (feria_id, producto_id) do update set precio_centavos = excluded.precio_centavos;

    v_productos := array_append(v_productos, (v_precio->>'producto_id')::uuid);
  end loop;

  -- Los precios de productos que ya se entregaron en esta feria no se
  -- borran aunque no vengan en `p_precios` (el cierre los necesita).
  delete from feria_precios fp
  where fp.feria_id = p_feria_id
    and not (fp.producto_id = any(v_productos))
    and not exists (
      select 1
      from entregas_revendedor e
      join entrega_items ei on ei.entrega_id = e.id
      where e.feria_id = p_feria_id and ei.producto_id = fp.producto_id
    );

  return json_build_object('feria_id', p_feria_id);
end;
$$;

revoke execute on function public.feria_editar(uuid, text, text, date, text, jsonb) from anon, public;
grant execute on function public.feria_editar(uuid, text, text, date, text, jsonb) to authenticated;

create function public.feria_agregar_participante(p_feria_id uuid, p_vendedor_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select estado into v_estado from feria_revendedoras where id = p_feria_id for update;
  if v_estado is null then
    raise exception 'FERIA_NO_ENCONTRADA';
  end if;
  if v_estado <> 'abierta' then
    raise exception 'FERIA_CERRADA';
  end if;

  if not exists (
    select 1 from vendedores
    where id = p_vendedor_id and activo and (rol = 'revendedor' or (rol = 'admin' and revende))
  ) then
    raise exception 'REVENDEDOR_INVALIDO';
  end if;

  insert into feria_participantes (feria_id, vendedor_id)
  values (p_feria_id, p_vendedor_id)
  on conflict (feria_id, vendedor_id) do nothing;

  return json_build_object('ok', true);
end;
$$;

revoke execute on function public.feria_agregar_participante(uuid, uuid) from anon, public;
grant execute on function public.feria_agregar_participante(uuid, uuid) to authenticated;

create function public.feria_quitar_participante(p_feria_id uuid, p_vendedor_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if exists (
    select 1 from entregas_revendedor
    where feria_id = p_feria_id and vendedor_id = p_vendedor_id
  ) or exists (
    select 1 from ventas_revendedor
    where feria_id = p_feria_id and vendedor_id = p_vendedor_id
  ) then
    raise exception 'PARTICIPANTE_CON_MOVIMIENTOS';
  end if;

  delete from feria_participantes where feria_id = p_feria_id and vendedor_id = p_vendedor_id;

  return json_build_object('ok', true);
end;
$$;

revoke execute on function public.feria_quitar_participante(uuid, uuid) from anon, public;
grant execute on function public.feria_quitar_participante(uuid, uuid) to authenticated;

create function public.feria_cerrar(p_feria_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select estado into v_estado from feria_revendedoras where id = p_feria_id for update;
  if v_estado is null then
    raise exception 'FERIA_NO_ENCONTRADA';
  end if;
  if v_estado <> 'abierta' then
    raise exception 'FERIA_CERRADA';
  end if;

  if exists (
    select 1 from feria_participantes where feria_id = p_feria_id and estado = 'pendiente'
  ) then
    raise exception 'PARTICIPANTES_PENDIENTES';
  end if;

  update feria_revendedoras set estado = 'cerrada' where id = p_feria_id;

  return json_build_object('feria_id', p_feria_id);
end;
$$;

revoke execute on function public.feria_cerrar(uuid) from anon, public;
grant execute on function public.feria_cerrar(uuid) to authenticated;

create function public.feria_reabrir(p_feria_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select estado into v_estado from feria_revendedoras where id = p_feria_id for update;
  if v_estado is null then
    raise exception 'FERIA_NO_ENCONTRADA';
  end if;

  update feria_revendedoras set estado = 'abierta' where id = p_feria_id;

  return json_build_object('feria_id', p_feria_id);
end;
$$;

revoke execute on function public.feria_reabrir(uuid) from anon, public;
grant execute on function public.feria_reabrir(uuid) to authenticated;

create function public.feria_reabrir_participacion(p_feria_id uuid, p_vendedor_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
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
  where d.feria_id = p_feria_id and d.vendedor_id = p_vendedor_id;

  insert into movimientos_stock_borrados (
    movimiento_id, producto_id, tipo, cantidad, vendedor_id, comprobante_id,
    nota, created_at, lote_id, feria_id, entrega_id, motivo, borrado_por
  )
  select id, producto_id, tipo, cantidad, vendedor_id, comprobante_id,
         nota, created_at, lote_id, feria_id, entrega_id, motivo, v_yo
  from movimientos_stock where id = any(v_mov_ids);

  delete from movimientos_stock where id = any(v_mov_ids);

  -- (c) Devolución de la feria: sus ingresos, sus items y la entrega.
  for v_dev in
    select id from entregas_revendedor
    where feria_id = p_feria_id and vendedor_id = p_vendedor_id and tipo = 'devolucion'
  loop
    insert into movimientos_stock_borrados (
      movimiento_id, producto_id, tipo, cantidad, vendedor_id, comprobante_id,
      nota, created_at, lote_id, feria_id, entrega_id, motivo, borrado_por
    )
    select id, producto_id, tipo, cantidad, vendedor_id, comprobante_id,
           nota, created_at, lote_id, feria_id, entrega_id, motivo, v_yo
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
  delete from feria_degustaciones where feria_id = p_feria_id and vendedor_id = p_vendedor_id;

  update feria_participantes
  set estado = 'pendiente', cerrada_at = null,
      efectivo_centavos = 0, mercado_pago_centavos = 0, banco_centavos = 0, nota = null
  where feria_id = p_feria_id and vendedor_id = p_vendedor_id;

  return json_build_object('ok', true, 'ventas_borradas', v_ventas);
end;
$$;

revoke execute on function public.feria_reabrir_participacion(uuid, uuid) from anon, public;
grant execute on function public.feria_reabrir_participacion(uuid, uuid) to authenticated;

-- ============================================================
-- 4) registrar_entrega_revendedor — firma nueva con p_feria_id
-- ============================================================

-- Cambia la FIRMA (parámetro nuevo al final): DROP + CREATE, nunca `create or
-- replace` (dejaría dos sobrecargas ambiguas). Los llamadores que pasan 6
-- argumentos (`registrar_carga_revendedor`, 0043/0046/0062) siguen
-- compilando: el 7.º tiene default.
drop function public.registrar_entrega_revendedor(uuid, text, date, text, jsonb, boolean);

create function public.registrar_entrega_revendedor(
  p_vendedor_id uuid,
  p_tipo text,
  p_fecha date,
  p_nota text default null::text,
  p_items jsonb default '[]'::jsonb,
  p_permitir_negativo boolean default false,
  p_feria_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
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
  v_es_coordinador boolean;
  v_es_admin boolean;
  v_feria_estado text;
  v_part_estado text;
begin
  v_es_admin := public.es_admin();
  v_es_coordinador := public.es_coordinador();

  if not (v_es_admin or v_es_coordinador) then
    raise exception 'NO_AUTORIZADO';
  end if;

  if v_es_coordinador and not v_es_admin then
    if p_tipo <> 'entrega' then
      raise exception 'NO_AUTORIZADO';
    end if;
    if not public.es_coordinador_de(p_vendedor_id) then
      raise exception 'NO_AUTORIZADO';
    end if;
    -- Un coordinador nunca fuerza stock negativo: esa decisión queda
    -- reservada a un admin.
    p_permitir_negativo := false;
  end if;

  v_admin_id := public.mi_vendedor_id();

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

  -- ── FERIA (migración 0078) ──────────────────────────────────────────────
  -- Una entrega de feria: solo la carga un admin, solo tipo 'entrega' (la
  -- devolución de feria la genera `feria_cerrar_participacion`), la feria
  -- tiene que existir y estar abierta, y la participante no puede haber
  -- cerrado ya su parte. Si no era participante, se la agrega.
  if p_feria_id is not null then
    if not v_es_admin then
      raise exception 'NO_AUTORIZADO';
    end if;
    if p_tipo <> 'entrega' then
      raise exception 'TIPO_INVALIDO';
    end if;

    select estado into v_feria_estado from feria_revendedoras where id = p_feria_id for share;
    if v_feria_estado is null then
      raise exception 'FERIA_NO_ENCONTRADA';
    end if;
    if v_feria_estado <> 'abierta' then
      raise exception 'FERIA_CERRADA';
    end if;

    insert into feria_participantes (feria_id, vendedor_id)
    values (p_feria_id, p_vendedor_id)
    on conflict (feria_id, vendedor_id) do nothing;

    select estado into v_part_estado
    from feria_participantes
    where feria_id = p_feria_id and vendedor_id = p_vendedor_id
    for update;
    if v_part_estado <> 'pendiente' then
      raise exception 'PARTICIPACION_CERRADA';
    end if;
  end if;
  -- ── fin de FERIA ────────────────────────────────────────────────────────

  insert into entregas_revendedor (vendedor_id, tipo, fecha, nota, admin_id, feria_id)
  values (p_vendedor_id, p_tipo, coalesce(p_fecha, current_date), p_nota, v_admin_id, p_feria_id)
  returning id into v_entrega_id;

  v_tipo_movimiento := case when p_tipo = 'entrega' then 'egreso' else 'ingreso' end;
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

    if v_es_coordinador and not v_es_admin and v_lote_id is null then
      -- Un ítem de un coordinador SIEMPRE trae lote_id: el reparto entre
      -- varios lotes (FIFO, "más viejo primero") ya lo resolvió el
      -- CLIENTE con `repartirCantidadEntreLotes` (`lib/lotes-split.ts`,
      -- misma función que usa un admin) usando
      -- `lotes_disponibles_coordinador` (punto 11) — acá no hay
      -- auto-selección de lote, solo se valida como cualquier otro ítem
      -- con lote (LOTE_INVALIDO/STOCK_LOTE_INSUFICIENTE más abajo, sin
      -- diferencia entre admin y coordinador).
      raise exception 'LOTE_INVALIDO';
    end if;

    if p_tipo = 'entrega' then
      v_costo := nullif(v_item->>'costo_ananja_unitario_centavos', '')::bigint;
      v_sugerido := nullif(v_item->>'precio_sugerido_centavos', '')::bigint;

      if v_es_coordinador and not v_es_admin then
        -- Nunca confía en lo que mande el cliente: siempre el vigente.
        v_costo := null;
      end if;

      if v_costo is null and v_lote_id is not null then
        select d.costo_ananja_centavos into v_costo
        from v_costo_lote_vigente d
        where d.lote_id = v_lote_id and d.producto_id = v_producto_id and d.tiene_costos;
      end if;

      if v_es_coordinador and not v_es_admin and v_costo is null then
        raise exception 'COSTO_FALTANTE';
      end if;

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

revoke execute on function public.registrar_entrega_revendedor(uuid, text, date, text, jsonb, boolean, uuid) from anon, public;
grant execute on function public.registrar_entrega_revendedor(uuid, text, date, text, jsonb, boolean, uuid) to authenticated;


-- ============================================================
-- 5) insertar_venta_revendedor — firma nueva con p_feria_id
-- ============================================================

drop function public.insertar_venta_revendedor(uuid, uuid, int, bigint, medio_pago, date, text, uuid, uuid, uuid);

create function public.insertar_venta_revendedor(
  p_vendedor_id uuid,
  p_producto_id uuid,
  p_cantidad int,
  p_precio_venta_centavos bigint,
  p_medio_pago medio_pago,
  p_fecha date,
  p_nota text,
  p_registrada_por uuid,
  p_grupo_id uuid,
  p_lote_id uuid default null,
  p_feria_id uuid default null
)
returns json
language plpgsql
set search_path = public
as $$
declare
  v_dueño_grupo uuid;
  v_vendedor_id uuid := p_vendedor_id;
  v_precio_manual_centavos bigint;
  v_costo_centavos bigint;
  v_en_poder int;
  v_en_lote int;
  v_nombre text;
  v_grupo_id uuid := gen_random_uuid();
  v_venta_id uuid;
  v_ids uuid[] := '{}';
  v_resto int;
  v_tomar int;
  v_tramo record;
  v_toma_directo boolean;
  v_faltante int;
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

  -- ── NUEVO: "agarra directo del depósito" ────────────────────────────────
  -- Si la persona tiene el interruptor y no le alcanza lo que tiene en poder
  -- (en total, o del lote elegido), lo que falta se saca del depósito ahora:
  -- se crea una entrega automática atada a esta venta (`v_grupo_id`) y las
  -- validaciones y el reparto de más abajo corren sobre el stock ya
  -- completado. Sin el flag este bloque no hace nada.
  select v.toma_directo into v_toma_directo from vendedores v where v.id = v_vendedor_id;

  if coalesce(v_toma_directo, false) then
    if p_lote_id is null then
      select coalesce(en_poder, 0) into v_en_poder
      from v_stock_revendedor where vendedor_id = v_vendedor_id and producto_id = p_producto_id;
      v_faltante := p_cantidad - coalesce(v_en_poder, 0);
    else
      select coalesce(sum(s.quedan), 0) into v_en_lote
      from public.stock_revendedor_por_entrega(v_vendedor_id, p_producto_id) s
      where s.lote_id = p_lote_id;
      v_faltante := p_cantidad - v_en_lote;
    end if;

    if v_faltante > 0 then
      perform public.tomar_del_deposito(
        v_vendedor_id, p_producto_id, v_faltante, p_fecha, p_lote_id, v_grupo_id, null
      );
    end if;
  end if;
  -- ── fin de lo nuevo ─────────────────────────────────────────────────────

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

  -- Si se eligió lote, ese lote puntual tiene que alcanzar por sí solo —
  -- no cae a los demás lotes aunque el total de arriba sobre. Chequeo
  -- aparte (antes de repartir) para no dejar filas parciales insertadas: el
  -- loop de abajo, filtrado al mismo lote, es la garantía real (misma fila
  -- bloqueada con `for no key update`, no hay carrera en el medio).
  if p_lote_id is not null then
    select coalesce(sum(s.quedan), 0) into v_en_lote
    from public.stock_revendedor_por_entrega(v_vendedor_id, p_producto_id) s
    where s.lote_id = p_lote_id;

    if v_en_lote < p_cantidad then
      select nombre into v_nombre from productos where id = p_producto_id;
      raise exception 'STOCK_INSUFICIENTE_LOTE'
        using detail = json_build_object(
          'producto', v_nombre,
          'producto_id', p_producto_id,
          'lote_id', p_lote_id,
          'disponible', v_en_lote
        )::text;
    end if;
  end if;

  select precio_centavos into v_precio_manual_centavos
  from revendedor_precios where vendedor_id = v_vendedor_id and producto_id = p_producto_id;

  v_resto := p_cantidad;

  for v_tramo in
    select s.entrega_item_id, s.lote_id, s.quedan, s.costo_ananja_unitario_centavos, s.fecha
    from public.stock_revendedor_por_entrega(v_vendedor_id, p_producto_id) s
    where s.quedan > 0
      and (p_lote_id is null or s.lote_id = p_lote_id)
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
      medio_pago, fecha, nota, entrega_item_id, lote_id, grupo_id, registrada_por, feria_id
    ) values (
      v_vendedor_id, p_producto_id, v_tomar, p_precio_venta_centavos, v_costo_centavos,
      p_medio_pago, p_fecha, p_nota, v_tramo.entrega_item_id,
      v_tramo.lote_id, v_grupo_id, p_registrada_por, p_feria_id
    ) returning id into v_venta_id;

    v_ids := array_append(v_ids, v_venta_id);
    v_resto := v_resto - v_tomar;
  end loop;

  -- No debería pasar: ya se validó arriba (total y, si corresponde, el
  -- lote elegido). Red de seguridad por si los datos quedaron
  -- inconsistentes (ej. una devolución forzada con "Guardar igual").
  if v_resto > 0 then
    select nombre into v_nombre from productos where id = p_producto_id;
    if p_lote_id is not null then
      raise exception 'STOCK_INSUFICIENTE_LOTE'
        using detail = json_build_object(
          'producto', v_nombre,
          'producto_id', p_producto_id,
          'lote_id', p_lote_id,
          'disponible', p_cantidad - v_resto
        )::text;
    else
      raise exception 'STOCK_REVENDEDOR_INSUFICIENTE'
        using detail = json_build_object(
          'producto', v_nombre,
          'producto_id', p_producto_id,
          'disponible', p_cantidad - v_resto
        )::text;
    end if;
  end if;

  return json_build_object('id', v_ids[1], 'grupo_id', v_grupo_id, 'ids', v_ids);
end;
$$;

revoke execute on function public.insertar_venta_revendedor(uuid, uuid, int, bigint, medio_pago, date, text, uuid, uuid, uuid, uuid) from anon, authenticated, public;

-- ============================================================
-- 5b) Archivo de ventas borradas con feria_id + ventas de feria protegidas
-- ============================================================

-- `feria_reabrir_participacion` borra las ventas del cierre: el trigger de
-- archivo (0045) tiene que guardar también a qué feria pertenecían.
alter table public.ventas_revendedor_borradas add column feria_id uuid;

-- Misma firma: `create or replace` conserva el trigger y los permisos.
create or replace function public.ventas_revendedor_registrar_borrada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into ventas_revendedor_borradas (
    venta_id, vendedor_id, producto_id, cantidad, precio_venta_centavos,
    precio_costo_centavos, medio_pago, fecha, nota, entrega_item_id, lote_id,
    grupo_id, registrada_por, created_at, borrada_por, feria_id
  ) values (
    old.id, old.vendedor_id, old.producto_id, old.cantidad, old.precio_venta_centavos,
    old.precio_costo_centavos, old.medio_pago, old.fecha, old.nota, old.entrega_item_id, old.lote_id,
    old.grupo_id, old.registrada_por, old.created_at,
    (select v.id from vendedores v where v.user_id = auth.uid() order by v.activo desc limit 1),
    old.feria_id
  );
  return null;
end;
$$;

-- Una venta que salió del cierre de una feria solo la corrige un admin
-- (reabriendo la participación). Cuerpos = los vigentes en prod (0073/0077)
-- más el chequeo `VENTA_DE_FERIA`; misma firma => `create or replace`.
create or replace function public.eliminar_venta_revendedor(p_venta_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendedor_id uuid;
  v_dueño_id uuid;
  v_grupo_id uuid;
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_auto record;
  v_dev_id uuid;
  v_ya int;
  v_en_lote int;
  v_devolver int;
  v_rend public.rendiciones%rowtype;
  v_total numeric;
  v_pendiente numeric;
begin
  v_vendedor_id := public.mi_vendedor_id();
  if v_vendedor_id is null then
    raise exception 'NO_AUTORIZADO';
  end if;

  select vendedor_id, grupo_id into v_dueño_id, v_grupo_id
  from ventas_revendedor where id = p_venta_id;
  if v_dueño_id is null then
    raise exception 'VENTA_NO_ENCONTRADA';
  end if;

  if not public.es_admin() then
    if v_dueño_id <> v_vendedor_id then
      raise exception 'NO_AUTORIZADO';
    end if;

    -- FERIA: la venta salió del cierre de una feria (solo la corrige un
    -- admin, reabriendo la participación).
    if exists (
      select 1 from ventas_revendedor where grupo_id = v_grupo_id and feria_id is not null
    ) then
      raise exception 'VENTA_DE_FERIA';
    end if;

    if exists (
      select 1 from ventas_revendedor
      where grupo_id = v_grupo_id and registrada_por is not null and registrada_por <> v_vendedor_id
    ) then
      raise exception 'NO_AUTORIZADO';
    end if;
  end if;

  -- Si hay entregas automáticas que compensar, se escribirán movimientos de
  -- stock: primero el lock global del depósito (mismo orden que en el resto
  -- de los caminos, ver cabecera), antes de borrar nada.
  if exists (
    select 1 from entregas_revendedor e
    where e.vendedor_id = v_dueño_id
      and e.tipo = 'entrega'
      and e.automatica
      and e.venta_grupo_id = v_grupo_id
  ) then
    perform pg_advisory_xact_lock(hashtext('ananja:deposito'));
  end if;

  delete from ventas_revendedor where grupo_id = v_grupo_id and vendedor_id = v_dueño_id;

  -- ── NUEVO (a): compensar las entregas automáticas de esta venta ─────────
  -- Una devolución automática por cada (producto, lote) que la toma directa
  -- sacó del depósito, por lo que SIGUE en poder de la persona (si en el
  -- medio vendió o devolvió otras botellas de ese lote, solo se devuelve el
  -- remanente) y sin repetir lo ya compensado. Nada se borra: la entrega
  -- original y sus movimientos quedan, y el ingreso de la devolución vuelve
  -- a subir el stock del depósito y del lote (v_stock_por_lote lo netea por
  -- `entrega_id` + `lote_id`).
  v_dev_id := null;

  for v_auto in
    select ei.producto_id, ei.lote_id, sum(ei.cantidad)::int as total
    from entregas_revendedor e
    join entrega_items ei on ei.entrega_id = e.id
    where e.vendedor_id = v_dueño_id
      and e.tipo = 'entrega'
      and e.automatica
      and e.venta_grupo_id = v_grupo_id
    group by ei.producto_id, ei.lote_id
    order by ei.producto_id, ei.lote_id
  loop
    select coalesce(sum(ei2.cantidad), 0)::int into v_ya
    from entregas_revendedor d
    join entrega_items ei2 on ei2.entrega_id = d.id
    where d.vendedor_id = v_dueño_id
      and d.tipo = 'devolucion'
      and d.automatica
      and d.venta_grupo_id = v_grupo_id
      and ei2.producto_id = v_auto.producto_id
      and ei2.lote_id is not distinct from v_auto.lote_id;

    select coalesce(sum(s.quedan), 0)::int into v_en_lote
    from public.stock_revendedor_por_entrega(v_dueño_id, v_auto.producto_id) s
    where s.lote_id is not distinct from v_auto.lote_id;

    v_devolver := least(v_auto.total - v_ya, v_en_lote);

    if v_devolver > 0 then
      if v_dev_id is null then
        insert into entregas_revendedor (vendedor_id, tipo, fecha, nota, admin_id, automatica, venta_grupo_id)
        values (v_dueño_id, 'devolucion', v_hoy, null, v_vendedor_id, true, v_grupo_id)
        returning id into v_dev_id;
      end if;

      insert into entrega_items (entrega_id, producto_id, cantidad, lote_id)
      values (v_dev_id, v_auto.producto_id, v_devolver, v_auto.lote_id);

      insert into movimientos_stock (producto_id, tipo, cantidad, vendedor_id, entrega_id, lote_id, nota, motivo)
      values (v_auto.producto_id, 'ingreso', v_devolver, v_vendedor_id, v_dev_id, v_auto.lote_id, null, null);
    end if;
  end loop;

  -- ── NUEVO (b): deshacer la rendición de una venta de coordinadora ───────
  select * into v_rend
  from rendiciones
  where venta_grupo_id = v_grupo_id and vendedor_id = v_dueño_id
  order by created_at, id
  limit 1
  for update;

  if found then
    insert into rendiciones_borradas (
      rendicion_id, vendedor_id, monto_centavos, medio_pago, fecha, nota, admin_id,
      created_at, via, tenedor_id, encargado_diferencia_id, venta_grupo_id, borrada_por
    ) values (
      v_rend.id, v_rend.vendedor_id, v_rend.monto_centavos, v_rend.medio_pago, v_rend.fecha,
      v_rend.nota, v_rend.admin_id, v_rend.created_at, v_rend.via, v_rend.tenedor_id,
      v_rend.encargado_diferencia_id, v_rend.venta_grupo_id, v_vendedor_id
    );

    delete from rendiciones where id = v_rend.id;

    -- Con la rendición ya fuera, lo que la coordinadora tiene en mano no
    -- puede quedar negativo (si ya depositó esa plata) ni por debajo de un
    -- aviso de depósito pendiente (si la avisó y todavía no la confirmaron).
    -- La excepción deshace TODO lo de esta función.
    select pm.total_centavos into v_total
    from v_plata_en_manos pm
    where pm.tenedor_id = v_rend.tenedor_id;

    if not found then
      raise exception 'NO_AUTORIZADO';
    end if;

    if v_total < 0 then
      raise exception 'YA_PASO_LA_PLATA'
        using detail = json_build_object(
          'en_mano_centavos', v_total,
          'monto_centavos', v_rend.monto_centavos
        )::text;
    end if;

    select coalesce(sum(di.monto_centavos), 0) into v_pendiente
    from depositos_informados di
    where di.tenedor_id = v_rend.tenedor_id and di.estado = 'pendiente';

    if v_pendiente > v_total then
      raise exception 'YA_PASO_LA_PLATA'
        using detail = json_build_object(
          'en_mano_centavos', v_total,
          'pendiente_centavos', v_pendiente,
          'monto_centavos', v_rend.monto_centavos
        )::text;
    end if;
  end if;

  return json_build_object('id', p_venta_id, 'grupo_id', v_grupo_id);
end;
$$;

revoke execute on function public.eliminar_venta_revendedor(uuid) from anon, public;
grant execute on function public.eliminar_venta_revendedor(uuid) to authenticated;

create or replace function public.editar_venta_revendedor(
  p_grupo_id uuid,
  p_medio_pago medio_pago,
  p_precio_venta_centavos bigint,
  p_fecha date,
  p_nota text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid;
  v_duenio_id uuid;
  v_nombre text;
  v_producto_id uuid;
  v_entrega_fecha date;
  v_filas int;
begin
  v_yo := public.mi_vendedor_id();
  if v_yo is null then
    raise exception 'NO_AUTORIZADO';
  end if;

  select vendedor_id into v_duenio_id
  from ventas_revendedor where grupo_id = p_grupo_id limit 1;
  if v_duenio_id is null then
    raise exception 'VENTA_NO_ENCONTRADA';
  end if;

  -- Mismo permiso que `eliminar_venta_revendedor` (0073 § 6).
  if not public.es_admin() then
    if v_duenio_id <> v_yo then
      raise exception 'NO_AUTORIZADO';
    end if;

    -- FERIA: la venta salió del cierre de una feria (solo la corrige un
    -- admin, reabriendo la participación).
    if exists (
      select 1 from ventas_revendedor where grupo_id = p_grupo_id and feria_id is not null
    ) then
      raise exception 'VENTA_DE_FERIA';
    end if;

    if exists (
      select 1 from ventas_revendedor
      where grupo_id = p_grupo_id and registrada_por is not null and registrada_por <> v_yo
    ) then
      raise exception 'NO_AUTORIZADO';
    end if;
  end if;

  -- Serializa con una carga o un borrado simultáneo de la misma persona.
  perform 1 from vendedores where id = v_duenio_id for no key update;

  -- La venta de una coordinadora ya generó su rendición: no se edita.
  if exists (select 1 from rendiciones where venta_grupo_id = p_grupo_id) then
    raise exception 'VENTA_CON_RENDICION';
  end if;

  if p_medio_pago is null then
    raise exception 'MEDIO_INVALIDO';
  end if;

  if p_precio_venta_centavos is not null and p_precio_venta_centavos <= 0 then
    raise exception 'PRECIO_INVALIDO';
  end if;

  -- Precio nulo solo si la venta ya no tenía precio (una venta cargada por un
  -- admin sin saber a cuánto se vendió): no se puede "borrar" un precio.
  if p_precio_venta_centavos is null and exists (
    select 1 from ventas_revendedor
    where grupo_id = p_grupo_id and precio_venta_centavos is not null
  ) then
    raise exception 'PRECIO_INVALIDO';
  end if;

  if p_fecha is null then
    raise exception 'FECHA_INVALIDA';
  end if;

  if p_fecha > (now() at time zone 'America/Argentina/Buenos_Aires')::date then
    raise exception 'FECHA_FUTURA';
  end if;

  -- La venta no puede ser anterior a la entrega de la que salió cada fila.
  select v.producto_id, e.fecha into v_producto_id, v_entrega_fecha
  from ventas_revendedor v
  join entrega_items ei on ei.id = v.entrega_item_id
  join entregas_revendedor e on e.id = ei.entrega_id
  where v.grupo_id = p_grupo_id
    and e.fecha > p_fecha
  order by e.fecha
  limit 1;

  if v_entrega_fecha is not null then
    select nombre into v_nombre from productos where id = v_producto_id;
    raise exception 'FECHA_ANTERIOR_A_ENTREGA'
      using detail = json_build_object(
        'producto', v_nombre,
        'producto_id', v_producto_id,
        'entrega_fecha', v_entrega_fecha
      )::text;
  end if;

  update ventas_revendedor
  set medio_pago = p_medio_pago,
      precio_venta_centavos = p_precio_venta_centavos,
      fecha = p_fecha,
      nota = nullif(btrim(p_nota), '')
  where grupo_id = p_grupo_id;

  get diagnostics v_filas = row_count;

  return json_build_object('grupo_id', p_grupo_id, 'filas', v_filas);
end;
$$;

revoke execute on function public.editar_venta_revendedor(uuid, medio_pago, bigint, date, text) from anon, public;
grant execute on function public.editar_venta_revendedor(uuid, medio_pago, bigint, date, text) to authenticated;

-- ============================================================
-- 6) feria_cerrar_participacion
-- ============================================================

create function public.feria_cerrar_participacion(
  p_feria_id uuid,
  p_vendedor_id uuid,
  p_fecha date,
  p_devueltas jsonb,
  p_degustadas jsonb,
  p_precios jsonb,
  p_efectivo_centavos bigint,
  p_mercado_pago_centavos bigint,
  p_banco_centavos bigint,
  p_nota text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo uuid;
  v_vendedor uuid;
  v_vendedor_nombre text;
  v_feria_nombre text;
  v_feria_estado text;
  v_part_estado text;
  v_efectivo bigint := coalesce(p_efectivo_centavos, 0);
  v_mp bigint := coalesce(p_mercado_pago_centavos, 0);
  v_banco bigint := coalesce(p_banco_centavos, 0);
  v_medio medio_pago;
  v_registrada_por uuid;
  v_prod record;
  v_b record;
  v_dev int;
  v_deg int;
  v_pool int;
  v_pool_left int;
  v_deg_left int;
  v_take int;
  v_deg_lote int;
  v_resta int;
  v_vendidas_prod int;
  v_ya int;
  v_ya_total int := 0;
  v_disp int;
  v_fecha_ent date;
  v_mov_id uuid;
  v_mov_ids uuid[];
  v_precio bigint;
  v_en_poder int;
  v_entrega_id uuid;
  v_vendidas jsonb := '[]'::jsonb;
  v_total bigint := 0;
  v_nota_venta text;
  v_nota_deg text;
begin
  v_yo := public.mi_vendedor_id();
  if v_yo is null then
    raise exception 'NO_AUTORIZADO';
  end if;

  v_vendedor := coalesce(p_vendedor_id, v_yo);

  -- Admin; o la propia revendedora; o su coordinadora. `es_vendedor()` NO
  -- sirve acá (es alias de `es_admin()`, ver 0018).
  if not (
    public.es_admin()
    or (v_vendedor = v_yo and public.puede_revender())
    or public.es_coordinador_de(v_vendedor)
  ) then
    raise exception 'NO_AUTORIZADO';
  end if;

  if p_fecha is null then
    raise exception 'FECHA_INVALIDA';
  end if;
  if p_fecha > (now() at time zone 'America/Argentina/Buenos_Aires')::date then
    raise exception 'FECHA_FUTURA';
  end if;

  if v_efectivo < 0 or v_mp < 0 or v_banco < 0 then
    raise exception 'MONTO_INVALIDO';
  end if;

  p_devueltas := coalesce(p_devueltas, '[]'::jsonb);
  p_degustadas := coalesce(p_degustadas, '[]'::jsonb);
  p_precios := coalesce(p_precios, '[]'::jsonb);
  if jsonb_typeof(p_devueltas) <> 'array'
     or jsonb_typeof(p_degustadas) <> 'array'
     or jsonb_typeof(p_precios) <> 'array' then
    raise exception 'CANTIDAD_INVALIDA';
  end if;

  -- Orden de locks: vendedores -> feria -> participante (igual que
  -- `registrar_entrega_revendedor`).
  perform 1 from vendedores where id = v_vendedor for no key update;

  select nombre, estado into v_feria_nombre, v_feria_estado
  from feria_revendedoras where id = p_feria_id for share;
  if v_feria_estado is null then
    raise exception 'FERIA_NO_ENCONTRADA';
  end if;
  if v_feria_estado <> 'abierta' then
    raise exception 'FERIA_CERRADA';
  end if;

  -- Serializa con otro cierre (doble toque) y con una carga de la misma persona.
  select estado into v_part_estado
  from feria_participantes
  where feria_id = p_feria_id and vendedor_id = v_vendedor
  for update;
  if v_part_estado is null then
    raise exception 'PARTICIPANTE_NO_ENCONTRADO';
  end if;
  if v_part_estado <> 'pendiente' then
    raise exception 'PARTICIPACION_CERRADA';
  end if;

  select nombre into v_vendedor_nombre from vendedores where id = v_vendedor;

  -- La fecha del cierre no puede ser anterior a la entrega de la feria.
  select e.fecha into v_fecha_ent
  from entregas_revendedor e
  where e.feria_id = p_feria_id and e.vendedor_id = v_vendedor and e.tipo = 'entrega'
    and e.fecha > p_fecha
  order by e.fecha desc
  limit 1;
  if v_fecha_ent is not null then
    raise exception 'FECHA_ANTERIOR_A_ENTREGA'
      using detail = json_build_object(
        'producto', null::text,
        'entrega_fecha', v_fecha_ent
      )::text;
  end if;

  -- Cantidades negativas o sin producto, en cualquiera de las dos listas.
  if exists (
    select 1
    from (
      select x from jsonb_array_elements(p_devueltas) x
      union all
      select x from jsonb_array_elements(p_degustadas) x
    ) l
    where nullif(l.x->>'producto_id', '') is null
       or nullif(l.x->>'cantidad', '') is null
       or (l.x->>'cantidad')::int < 0
  ) then
    raise exception 'CANTIDAD_INVALIDA';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_precios) x
    where nullif(x->>'producto_id', '') is null
       or nullif(x->>'precio_centavos', '') is null
       or (x->>'precio_centavos')::bigint <= 0
  ) then
    raise exception 'PRECIO_INVALIDO';
  end if;

  -- Un producto que no se llevó a esta feria no se puede devolver ni degustar.
  if exists (
    select 1
    from (
      select x from jsonb_array_elements(p_devueltas) x
      union all
      select x from jsonb_array_elements(p_degustadas) x
    ) l
    where (l.x->>'cantidad')::int > 0
      and not exists (
        select 1
        from entregas_revendedor e
        join entrega_items ei on ei.entrega_id = e.id
        where e.feria_id = p_feria_id and e.vendedor_id = v_vendedor and e.tipo = 'entrega'
          and ei.producto_id = (l.x->>'producto_id')::uuid
      )
  ) then
    raise exception 'CANTIDAD_INVALIDA';
  end if;

  -- Medio: el de la plata si exactamente un monto es > 0; si no, null.
  if (v_efectivo > 0)::int + (v_mp > 0)::int + (v_banco > 0)::int = 1 then
    v_medio := case
      when v_efectivo > 0 then 'efectivo'::medio_pago
      when v_mp > 0 then 'mercado_pago'::medio_pago
      else 'banco'::medio_pago
    end;
  end if;

  -- Si carga otra persona (admin o coordinadora), queda anotado.
  v_registrada_por := case when v_yo <> v_vendedor then v_yo else null end;
  v_nota_venta := 'Feria ' || v_feria_nombre;
  v_nota_deg := 'Feria ' || v_feria_nombre || ' · ' || v_vendedor_nombre;

  for v_prod in
    select ei.producto_id, p.nombre, sum(ei.cantidad)::int as entregadas
    from entregas_revendedor e
    join entrega_items ei on ei.entrega_id = e.id
    join productos p on p.id = ei.producto_id
    where e.feria_id = p_feria_id and e.vendedor_id = v_vendedor and e.tipo = 'entrega'
    group by ei.producto_id, p.nombre
    order by p.nombre
  loop
    select coalesce(sum((x->>'cantidad')::int), 0) into v_dev
    from jsonb_array_elements(p_devueltas) x
    where (x->>'producto_id')::uuid = v_prod.producto_id;

    select coalesce(sum((x->>'cantidad')::int), 0) into v_deg
    from jsonb_array_elements(p_degustadas) x
    where (x->>'producto_id')::uuid = v_prod.producto_id;

    -- Ventas normales que ella ya cargó durante el día y que por FIFO
    -- quedaron atribuidas a las botellas de esta feria: no se tocan ni se
    -- venden de nuevo.
    select coalesce(sum(vr.cantidad), 0)::int into v_ya
    from ventas_revendedor vr
    join entrega_items ei on ei.id = vr.entrega_item_id
    join entregas_revendedor e on e.id = ei.entrega_id
    where vr.vendedor_id = v_vendedor and vr.producto_id = v_prod.producto_id
      and e.feria_id = p_feria_id and e.tipo = 'entrega' and vr.feria_id is null;

    v_pool := v_dev + v_deg;
    if v_pool > v_prod.entregadas - v_ya then
      raise exception 'CANTIDAD_INVALIDA'
        using detail = json_build_object(
          'producto', v_prod.nombre,
          'producto_id', v_prod.producto_id,
          'entregadas', v_prod.entregadas,
          'ya_vendidas', v_ya
        )::text;
    end if;

    v_ya_total := v_ya_total + v_ya;
    -- Solo las vendidas NUEVAS (las previas ya están cargadas).
    v_vendidas_prod := v_prod.entregadas - v_ya - v_pool;

    v_precio := null;
    if v_vendidas_prod > 0 then
      -- El precio que corrigió la revendedora manda sobre el de la feria.
      select (x->>'precio_centavos')::bigint into v_precio
      from jsonb_array_elements(p_precios) x
      where (x->>'producto_id')::uuid = v_prod.producto_id
      limit 1;

      if v_precio is null then
        select precio_centavos into v_precio
        from feria_precios where feria_id = p_feria_id and producto_id = v_prod.producto_id;
      end if;

      if v_precio is null then
        raise exception 'PRECIO_NO_ASIGNADO'
          using detail = json_build_object(
            'producto', v_prod.nombre,
            'producto_id', v_prod.producto_id
          )::text;
      end if;
    end if;

    v_pool_left := v_pool;
    v_deg_left := v_deg;
    v_mov_ids := '{}';

    -- Un tramo por lote de lo que se llevó, en orden de entrega.
    for v_b in
      select ei.lote_id, sum(ei.cantidad)::int as cantidad,
             (
               select coalesce(sum(vr.cantidad), 0)::int
               from ventas_revendedor vr
               join entrega_items ei2 on ei2.id = vr.entrega_item_id
               join entregas_revendedor e2 on e2.id = ei2.entrega_id
               where vr.vendedor_id = v_vendedor and vr.producto_id = v_prod.producto_id
                 and e2.feria_id = p_feria_id and e2.tipo = 'entrega' and vr.feria_id is null
                 and ei2.lote_id is not distinct from ei.lote_id
             ) as ya
      from entregas_revendedor e
      join entrega_items ei on ei.entrega_id = e.id
      where e.feria_id = p_feria_id and e.vendedor_id = v_vendedor and e.tipo = 'entrega'
        and ei.producto_id = v_prod.producto_id
      group by ei.lote_id
      order by min(e.created_at), ei.lote_id
    loop
      -- Lo que queda de este lote sin vender antes.
      v_disp := greatest(v_b.cantidad - v_b.ya, 0);
      v_take := least(v_disp, v_pool_left);
      v_pool_left := v_pool_left - v_take;
      v_resta := v_disp - v_take;

      if v_take > 0 then
        -- 1) Devolución (devueltas + degustadas: las degustadas vuelven
        -- primero al lote).
        if v_entrega_id is null then
          insert into entregas_revendedor (vendedor_id, tipo, fecha, nota, admin_id, feria_id)
          values (v_vendedor, 'devolucion', p_fecha, v_nota_venta, v_yo, p_feria_id)
          returning id into v_entrega_id;
        end if;

        insert into entrega_items (entrega_id, producto_id, cantidad, lote_id)
        values (v_entrega_id, v_prod.producto_id, v_take, v_b.lote_id);

        insert into movimientos_stock (producto_id, tipo, cantidad, vendedor_id, entrega_id, lote_id, nota, motivo)
        values (v_prod.producto_id, 'ingreso', v_take, v_yo, v_entrega_id, v_b.lote_id, null, null);

        -- 2) Degustación: sale otra vez del lote, con motivo 'degustacion'.
        v_deg_lote := least(v_take, v_deg_left);
        v_deg_left := v_deg_left - v_deg_lote;
        if v_deg_lote > 0 then
          insert into movimientos_stock (producto_id, tipo, cantidad, vendedor_id, lote_id, nota, motivo)
          values (v_prod.producto_id, 'egreso', v_deg_lote, v_yo, v_b.lote_id, v_nota_deg, 'degustacion')
          returning id into v_mov_id;
          v_mov_ids := v_mov_ids || v_mov_id;
        end if;
      end if;

      -- 3) Ventas: lo que sobra de este lote, con el lote explícito.
      if v_resta > 0 then
        perform public.insertar_venta_revendedor(
          v_vendedor, v_prod.producto_id, v_resta, v_precio, v_medio, p_fecha,
          v_nota_venta, v_registrada_por, gen_random_uuid(), v_b.lote_id, p_feria_id
        );
      end if;
    end loop;

    if v_pool > 0 then
      select en_poder into v_en_poder
      from v_stock_revendedor where vendedor_id = v_vendedor and producto_id = v_prod.producto_id;

      if coalesce(v_en_poder, 0) < 0 then
        raise exception 'STOCK_REVENDEDOR_INSUFICIENTE'
          using detail = json_build_object(
            'producto', v_prod.nombre,
            'producto_id', v_prod.producto_id,
            'disponible', coalesce(v_en_poder, 0) + v_pool
          )::text;
      end if;
    end if;

    if v_deg > 0 then
      insert into feria_degustaciones (feria_id, vendedor_id, producto_id, cantidad, movimiento_ids)
      values (p_feria_id, v_vendedor, v_prod.producto_id, v_deg, v_mov_ids);
    end if;

    if v_vendidas_prod > 0 then
      v_vendidas := v_vendidas || jsonb_build_array(jsonb_build_object(
        'producto_id', v_prod.producto_id,
        'cantidad', v_vendidas_prod,
        'precio_centavos', v_precio
      ));
      v_total := v_total + v_vendidas_prod * v_precio;
    end if;
  end loop;

  -- 4) La participación queda cerrada, con la plata que juntó por medio.
  update feria_participantes
  set estado = 'cerrada',
      cerrada_at = now(),
      efectivo_centavos = v_efectivo,
      mercado_pago_centavos = v_mp,
      banco_centavos = v_banco,
      nota = nullif(btrim(p_nota), '')
  where feria_id = p_feria_id and vendedor_id = v_vendedor;

  -- `vendidas` y `total_centavos` cuentan solo las ventas NUEVAS de este
  -- cierre; `ya_vendidas` es el total de botellas de la feria que ella ya
  -- había cargado como ventas normales antes del cierre. `diferencia_centavos`
  -- (informativo) = plata juntada - total de lo vendido ahora.
  return json_build_object(
    'vendidas', v_vendidas,
    'ya_vendidas', v_ya_total,
    'total_centavos', v_total,
    'diferencia_centavos', (v_efectivo + v_mp + v_banco) - v_total,
    'devolucion_id', v_entrega_id
  );
end;
$$;

revoke execute on function public.feria_cerrar_participacion(uuid, uuid, date, jsonb, jsonb, jsonb, bigint, bigint, bigint, text) from anon, public;
grant execute on function public.feria_cerrar_participacion(uuid, uuid, date, jsonb, jsonb, jsonb, bigint, bigint, bigint, text) to authenticated;

-- ============================================================
-- 7) Vistas
-- ============================================================

-- Por (feria, participante, producto): llevó / devolvió / degustó / vendió y
-- el precio de feria. `devueltas` NO incluye las degustadas (la devolución
-- las mezcla; se restan con `feria_degustaciones`). Entran los productos con
-- algún movimiento aunque lo demás sea 0.
create view public.v_feria_participante_productos
with (security_invoker = true) as
with ent as (
  select e.feria_id, e.vendedor_id, ei.producto_id,
         (sum(ei.cantidad) filter (where e.tipo = 'entrega'))::bigint as entregadas,
         (sum(ei.cantidad) filter (where e.tipo = 'devolucion'))::bigint as devolucion_total
  from public.entregas_revendedor e
  join public.entrega_items ei on ei.entrega_id = e.id
  where e.feria_id is not null
  group by e.feria_id, e.vendedor_id, ei.producto_id
),
-- Ventas de la feria: las del cierre (`feria_id`) MÁS las ventas normales
-- que la revendedora cargó antes (`feria_id` null) y que por FIFO quedaron
-- atribuidas a una entrega de feria suya.
ven as (
  select feria_id, vendedor_id, producto_id, sum(cantidad)::bigint as vendidas
  from (
    select feria_id, vendedor_id, producto_id, cantidad
    from public.ventas_revendedor
    where feria_id is not null
    union all
    select e.feria_id, vr.vendedor_id, vr.producto_id, vr.cantidad
    from public.ventas_revendedor vr
    join public.entrega_items ei on ei.id = vr.entrega_item_id
    join public.entregas_revendedor e on e.id = ei.entrega_id
    where vr.feria_id is null and e.feria_id is not null and e.tipo = 'entrega'
      and e.vendedor_id = vr.vendedor_id
  ) v
  group by feria_id, vendedor_id, producto_id
),
deg as (
  select feria_id, vendedor_id, producto_id, cantidad::bigint as degustadas
  from public.feria_degustaciones
),
claves as (
  select feria_id, vendedor_id, producto_id from ent
  union
  select feria_id, vendedor_id, producto_id from ven
  union
  select feria_id, vendedor_id, producto_id from deg
)
select
  c.feria_id,
  c.vendedor_id,
  c.producto_id,
  p.nombre as producto_nombre,
  coalesce(ent.entregadas, 0)::bigint as entregadas,
  greatest(coalesce(ent.devolucion_total, 0) - coalesce(deg.degustadas, 0), 0)::bigint as devueltas,
  coalesce(deg.degustadas, 0)::bigint as degustadas,
  coalesce(ven.vendidas, 0)::bigint as vendidas,
  fp.precio_centavos as precio_feria_centavos
from claves c
join public.v_productos_publicos p on p.id = c.producto_id
left join ent on ent.feria_id = c.feria_id and ent.vendedor_id = c.vendedor_id and ent.producto_id = c.producto_id
left join ven on ven.feria_id = c.feria_id and ven.vendedor_id = c.vendedor_id and ven.producto_id = c.producto_id
left join deg on deg.feria_id = c.feria_id and deg.vendedor_id = c.vendedor_id and deg.producto_id = c.producto_id
left join public.feria_precios fp on fp.feria_id = c.feria_id and fp.producto_id = c.producto_id;

revoke all on public.v_feria_participante_productos from anon, public;
grant select on public.v_feria_participante_productos to authenticated;

-- Totales por participante. `faltan` = lo que se llevó y todavía no se
-- explicó (ni devuelta, ni degustada, ni vendida).
create view public.v_feria_participantes
with (security_invoker = true) as
select
  fp.feria_id,
  fp.vendedor_id,
  v.nombre as vendedor_nombre,
  fp.estado,
  fp.cerrada_at,
  coalesce(pp.entregadas, 0)::bigint as entregadas,
  coalesce(pp.devueltas, 0)::bigint as devueltas,
  coalesce(pp.degustadas, 0)::bigint as degustadas,
  coalesce(pp.vendidas, 0)::bigint as vendidas,
  (coalesce(pp.entregadas, 0) - coalesce(pp.devueltas, 0) - coalesce(pp.degustadas, 0) - coalesce(pp.vendidas, 0))::bigint as faltan,
  coalesce(vt.total_vendido_centavos, 0)::bigint as total_vendido_centavos,
  coalesce(vt.costo_centavos, 0)::bigint as costo_centavos,
  fp.efectivo_centavos,
  fp.mercado_pago_centavos,
  fp.banco_centavos
from public.feria_participantes fp
join public.vendedores v on v.id = fp.vendedor_id
left join (
  select feria_id, vendedor_id,
         sum(entregadas) as entregadas, sum(devueltas) as devueltas,
         sum(degustadas) as degustadas, sum(vendidas) as vendidas
  from public.v_feria_participante_productos
  group by feria_id, vendedor_id
) pp on pp.feria_id = fp.feria_id and pp.vendedor_id = fp.vendedor_id
left join (
  select feria_id, vendedor_id,
         sum(cantidad * coalesce(precio_venta_centavos, 0)) as total_vendido_centavos,
         sum(cantidad * precio_costo_centavos) as costo_centavos
  from (
    select feria_id, vendedor_id, cantidad, precio_venta_centavos, precio_costo_centavos
    from public.ventas_revendedor
    where feria_id is not null
    union all
    select e.feria_id, vr.vendedor_id, vr.cantidad, vr.precio_venta_centavos, vr.precio_costo_centavos
    from public.ventas_revendedor vr
    join public.entrega_items ei on ei.id = vr.entrega_item_id
    join public.entregas_revendedor e on e.id = ei.entrega_id
    where vr.feria_id is null and e.feria_id is not null and e.tipo = 'entrega'
      and e.vendedor_id = vr.vendedor_id
  ) v
  group by feria_id, vendedor_id
) vt on vt.feria_id = fp.feria_id and vt.vendedor_id = fp.vendedor_id;

revoke all on public.v_feria_participantes from anon, public;
grant select on public.v_feria_participantes to authenticated;
