-- Ananja/Germá: Ventas a crédito y foto opcional
--
--
-- Una venta puede cobrarse parcialmente: al registrarla se indica cuánto
-- se cobró en el momento (comprobantes.cobrado_centavos, default el monto
-- completo — comportamiento actual). Lo no cobrado queda como deuda del
-- cliente (venta a crédito, exige cliente) y se salda con cobros
-- posteriores (tabla cobros, uno o varios, cada uno en su propio medio y
-- fecha). La Caja solo suma lo efectivamente cobrado — nunca lo vendido a
-- crédito todavía pendiente; la Ganancia sigue reconociendo la venta
-- completa en su fecha (devengado), sin cambios. La foto del comprobante
-- deja de ser obligatoria fuera de una feria (decisión 5 del spec).
--
-- Migración templated (__SCHEMA__, sin __BUCKET__ — no toca Storage). Sin
-- bloques @solo-public: nada de esta migración es específica de un
-- negocio. Ver supabase/README.md.
--
-- Alcance:
--  1. comprobantes.cobrado_centavos + CHECKs + migración de datos (todo
--     lo existente hasta hoy queda cobrado en su totalidad).
--  2. Tabla cobros + trigger forzar_vendedor_cobro + RLS.
--  3. comprobantes.imagen_path: se elimina el CHECK que exigía foto fuera
--     de una feria — la validación pasa a la UI.
--  4. v_saldos_caja redefinida (cobrado_centavos en vez de monto_centavos,
--     más cobros por su propio medio) — security_invoker redeclarado aparte.
--  5. v_saldo_comprobante (nueva): cobrado total y deuda por venta.
--  6. v_deuda_cliente (nueva): vendido/cobrado/deuda agregados por cliente.
--  7. crear_comprobante/actualizar_comprobante recreadas con
--     p_cobrado_centavos, IMAGEN_REQUERIDA eliminado.
--  8. RPCs registrar_cobro / eliminar_cobro.

-- ============================================================
-- 1) comprobantes.cobrado_centavos
-- ============================================================

alter table comprobantes add column cobrado_centavos bigint not null default 0;

-- Todo lo existente hasta hoy está cobrado en su totalidad — antes de esta
-- migración no existía la venta a crédito.
update comprobantes set cobrado_centavos = monto_centavos;

alter table comprobantes add constraint comprobantes_cobrado_centavos_check
  check (cobrado_centavos >= 0 and cobrado_centavos <= monto_centavos);

-- Venta a crédito (cobrado_centavos < monto_centavos) exige cliente —
-- mismo criterio que CREDITO_REQUIERE_CLIENTE en el RPC, reforzado acá
-- como red de seguridad a nivel de esquema (decisión 1 del spec).
alter table comprobantes add constraint comprobantes_credito_requiere_cliente_check
  check (cobrado_centavos = monto_centavos or cliente_id is not null);

-- ============================================================
-- 2) cobros
-- ============================================================

create table cobros (
  id uuid primary key default gen_random_uuid(),
  -- on delete cascade: mismo criterio que comprobante_items/movimientos_stock
  -- (0001_schema.sql) — si se borra el comprobante, sus cobros no quedan huérfanos.
  comprobante_id uuid not null references comprobantes(id) on delete cascade,
  monto_centavos bigint not null check (monto_centavos > 0),
  medio_pago medio_pago not null,
  fecha date not null default current_date,
  nota text,
  vendedor_id uuid not null references vendedores(id),
  created_at timestamptz not null default now()
);

create index idx_cobros_comprobante_id on cobros(comprobante_id);
create index idx_cobros_fecha on cobros(fecha desc);

create function __SCHEMA__.forzar_vendedor_cobro()
returns trigger
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_vendedor_id uuid;
begin
  v_vendedor_id := __SCHEMA__.mi_vendedor_id();
  if v_vendedor_id is null then
    raise exception 'VENDEDOR_NO_REGISTRADO';
  end if;

  new.vendedor_id := v_vendedor_id;
  return new;
end;
$$;

revoke execute on function __SCHEMA__.forzar_vendedor_cobro() from anon, authenticated, public;

create trigger trg_cobros_vendedor
  before insert on cobros
  for each row execute function __SCHEMA__.forzar_vendedor_cobro();

alter table cobros enable row level security;
revoke all on cobros from anon, authenticated, public;
grant select on cobros to authenticated;

create policy cobros_select on cobros for select to authenticated
  using (__SCHEMA__.es_vendedor());
-- Sin policy de insert/delete: alta vía RPC registrar_cobro, baja vía RPC
-- eliminar_cobro (ambas security definer, gateadas por es_admin()).

-- ============================================================
-- 3) comprobantes.imagen_path — el CHECK que exigía foto fuera de una
--    feria se elimina (decisión 5 del spec); la validación pasa a la UI.
-- ============================================================

alter table comprobantes drop constraint comprobantes_imagen_path_check;

-- ============================================================
-- 4) v_saldos_caja — redefinida: cobrado_centavos en vez de
--    monto_centavos, más cobros (por su propio medio, no el de la venta).
--    security_invoker se redeclara APARTE del create or replace
--    (0019_vistas_security_invoker.sql): create or replace view no
--    conserva las reloptions previas.
-- ============================================================

create or replace view v_saldos_caja as
with por_caja as (
  select
    c.medio_pago::text as medio_pago,
    c.saldo_inicial_centavos
      + coalesce((select sum(cp.cobrado_centavos) from comprobantes cp where cp.medio_pago = c.medio_pago), 0)
      - coalesce((select sum(g.monto_centavos) from gastos g where g.medio_pago = c.medio_pago), 0)
      + coalesce((select sum(a.monto_centavos) from ajustes_caja a where a.medio_pago = c.medio_pago), 0)
      + coalesce((select sum(r.monto_centavos) from rendiciones r where r.medio_pago = c.medio_pago), 0)
      - coalesce((select sum(t.monto_centavos) from transferencias_caja t where t.origen = c.medio_pago), 0)
      + coalesce((select sum(t.monto_centavos) from transferencias_caja t where t.destino = c.medio_pago), 0)
      + coalesce((select sum(co.monto_centavos) from cobros co where co.medio_pago = c.medio_pago), 0)
      as saldo_centavos
  from cajas c
)
select medio_pago, saldo_centavos from por_caja
union all
select 'total' as medio_pago, coalesce(sum(saldo_centavos), 0) as saldo_centavos from por_caja;

alter view v_saldos_caja set (security_invoker = true);

-- ============================================================
-- 5) v_saldo_comprobante — cobrado total y deuda de cada venta.
-- ============================================================

create view v_saldo_comprobante as
select
  c.id as comprobante_id,
  c.monto_centavos,
  c.cobrado_centavos
    + coalesce((select sum(co.monto_centavos) from cobros co where co.comprobante_id = c.id), 0)
    as cobrado_total_centavos,
  c.monto_centavos - c.cobrado_centavos
    - coalesce((select sum(co.monto_centavos) from cobros co where co.comprobante_id = c.id), 0)
    as deuda_centavos
from comprobantes c;

alter view v_saldo_comprobante set (security_invoker = true);
revoke all on v_saldo_comprobante from anon, public;
grant select on v_saldo_comprobante to authenticated;

-- ============================================================
-- 6) v_deuda_cliente — vendido/cobrado/deuda agregados por cliente,
--    apoyada en v_saldo_comprobante para no duplicar la subquery de
--    cobros en dos vistas.
-- ============================================================

create view v_deuda_cliente as
select
  cl.id as cliente_id,
  cl.nombre,
  coalesce(sum(c.monto_centavos), 0) as vendido_centavos,
  coalesce(sum(sc.cobrado_total_centavos), 0) as cobrado_centavos,
  coalesce(sum(sc.deuda_centavos), 0) as deuda_centavos,
  count(*) filter (where sc.deuda_centavos > 0) as cantidad_ventas_pendientes
from clientes cl
join comprobantes c on c.cliente_id = cl.id
join v_saldo_comprobante sc on sc.comprobante_id = c.id
group by cl.id, cl.nombre;

alter view v_deuda_cliente set (security_invoker = true);
revoke all on v_deuda_cliente from anon, public;
grant select on v_deuda_cliente to authenticated;

-- ============================================================
-- 7) crear_comprobante / actualizar_comprobante — ganan p_cobrado_centavos
--    (firma nueva: hace falta drop + create, no alcanza con
--    create or replace porque agrega un parámetro).
-- ============================================================

drop function if exists crear_comprobante(bigint, medio_pago, text, date, text, estado_ocr, bigint, jsonb, boolean, uuid, uuid);
drop function if exists actualizar_comprobante(uuid, bigint, medio_pago, text, date, text, estado_ocr, bigint, jsonb, boolean, uuid, uuid);

create function crear_comprobante(
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
  v_stock int;
  v_umbral int;
  v_nombre text;
  v_alertas text[] := array[]::text[];
  v_feria_estado text;
  v_cobrado_centavos bigint;
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

    if v_producto_id is null or v_cantidad is null or v_cantidad <= 0 then
      raise exception 'SIN_ITEMS';
    end if;

    insert into comprobante_items (comprobante_id, producto_id, cantidad)
    values (v_comprobante_id, v_producto_id, v_cantidad);

    insert into movimientos_stock (producto_id, tipo, cantidad, vendedor_id, comprobante_id, nota)
    values (v_producto_id, 'egreso', v_cantidad, v_vendedor_id, v_comprobante_id, null);

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

create function actualizar_comprobante(
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
  v_stock int;
  v_umbral int;
  v_nombre text;
  v_alertas text[] := array[]::text[];
  v_feria_actual uuid;
  v_feria_estado text;
  v_cobrado_actual bigint;
  v_cobros_total bigint;
  v_cobrado_centavos bigint;
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

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_cantidad := (v_item->>'cantidad')::int;

    if v_producto_id is null or v_cantidad is null or v_cantidad <= 0 then
      raise exception 'SIN_ITEMS';
    end if;

    insert into comprobante_items (comprobante_id, producto_id, cantidad)
    values (p_comprobante_id, v_producto_id, v_cantidad);

    insert into movimientos_stock (producto_id, tipo, cantidad, vendedor_id, comprobante_id, nota)
    values (v_producto_id, 'egreso', v_cantidad, v_vendedor_id, p_comprobante_id, null);

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
-- 8) registrar_cobro / eliminar_cobro
-- ============================================================

create function registrar_cobro(
  p_comprobante_id uuid,
  p_monto_centavos bigint,
  p_medio_pago medio_pago,
  p_fecha date,
  p_nota text default null
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_cobro_id uuid;
  v_deuda_centavos bigint;
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if p_monto_centavos is null or p_monto_centavos <= 0 then
    raise exception 'MONTO_INVALIDO';
  end if;

  select deuda_centavos into v_deuda_centavos
  from v_saldo_comprobante where comprobante_id = p_comprobante_id;

  if v_deuda_centavos is null then
    raise exception 'COMPROBANTE_NO_ENCONTRADO';
  end if;

  if p_monto_centavos > v_deuda_centavos then
    raise exception 'COBRO_EXCEDE_DEUDA'
      using detail = json_build_object('deuda', v_deuda_centavos)::text;
  end if;

  insert into cobros (comprobante_id, monto_centavos, medio_pago, fecha, nota)
  values (p_comprobante_id, p_monto_centavos, p_medio_pago, coalesce(p_fecha, current_date), p_nota)
  returning id into v_cobro_id;

  return json_build_object('id', v_cobro_id);
end;
$$;

revoke execute on function registrar_cobro(uuid, bigint, medio_pago, date, text) from anon, public;
grant execute on function registrar_cobro(uuid, bigint, medio_pago, date, text) to authenticated;

create function eliminar_cobro(p_cobro_id uuid)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if not exists (select 1 from cobros where id = p_cobro_id) then
    raise exception 'COBRO_NO_ENCONTRADO';
  end if;

  delete from cobros where id = p_cobro_id;

  return json_build_object('id', p_cobro_id);
end;
$$;

revoke execute on function eliminar_cobro(uuid) from anon, public;
grant execute on function eliminar_cobro(uuid) to authenticated;
