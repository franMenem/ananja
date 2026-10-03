-- Ananja/Germá: secciones "Precios" y "Deudas"
--
--
-- Precios reemplaza la planilla mensual de costo por botella de Fran: cada
-- "versión de precios" guarda la cotización del dólar, el precio de la
-- materia prima en USD por unidad (litro/kilo, ver lib/negocio.ts §
-- materiaPrima) y, por presentación, envase/etiqueta/precio minorista. La
-- vista v_precio_item hace el mismo cálculo paso a paso que la planilla
-- (materia prima -> subtotal -> transporte -> IVA -> costo -> ganancia ->
-- precio base -> mayorista), con el mismo espejo en TypeScript en
-- lib/calculos.ts (calcularPrecioItem) para el desglose en vivo del
-- formulario y para tests sin base.
--
-- Deudas es un registro simple (USD/ARS, con fecha de saldado) que se
-- muestra en Caja con el equivalente en pesos de las deudas en USD al
-- dólar de la versión de precios vigente (lib/calculos.ts §
-- convertirUsdAPesos).
--
-- Alcance:
--  1. Tablas versiones_precio y versiones_precio_items.
--  2. Tabla deudas.
--  3. Vista v_precio_item (security_invoker).
--  4. RPC crear_version_precio.
--  5. Trigger forzar_vendedor_deuda (insert directo de deudas, a
--     diferencia de versiones_precio que solo se crea vía RPC).
--  6. RLS de las tres tablas.
--
-- Sin bloques @solo-public: esta migración no crea nada fuera del schema
-- de la app (sin Storage, sin triggers sobre auth.users), así que no hay
-- objetos globales que proteger de duplicarse entre negocios.

-- ============================================================
-- 1) versiones_precio / versiones_precio_items
-- ============================================================

create table versiones_precio (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  dolar_centavos bigint not null check (dolar_centavos > 0),
  materia_prima_usd_centavos bigint not null check (materia_prima_usd_centavos >= 0),
  transporte_pct numeric(5,2) not null default 8 check (transporte_pct >= 0),
  iva_pct numeric(5,2) not null default 21 check (iva_pct >= 0),
  ganancia_pct numeric(5,2) not null default 30 check (ganancia_pct >= 0),
  mayorista_pct numeric(5,2) not null default 20 check (mayorista_pct >= 0),
  nota text,
  vendedor_id uuid not null references vendedores(id),
  created_at timestamptz not null default now()
);

create index idx_versiones_precio_fecha on versiones_precio(fecha desc, created_at desc);
create index idx_versiones_precio_vendedor_id on versiones_precio(vendedor_id);

create table versiones_precio_items (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references versiones_precio(id) on delete cascade,
  producto_id uuid not null references productos(id),
  envase_centavos bigint not null check (envase_centavos >= 0),
  etiqueta_centavos bigint not null check (etiqueta_centavos >= 0),
  precio_minorista_centavos bigint not null check (precio_minorista_centavos >= 0),
  unique (version_id, producto_id)
);

create index idx_versiones_precio_items_version_id on versiones_precio_items(version_id);
create index idx_versiones_precio_items_producto_id on versiones_precio_items(producto_id);

-- ============================================================
-- 2) deudas
-- ============================================================

create table deudas (
  id uuid primary key default gen_random_uuid(),
  descripcion text not null check (btrim(descripcion) <> ''),
  moneda text not null check (moneda in ('USD', 'ARS')),
  monto_centavos bigint not null check (monto_centavos > 0),
  fecha date not null default current_date,
  nota text,
  saldada_en date,
  vendedor_id uuid not null references vendedores(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_deudas_updated_at
  before update on deudas
  for each row execute function set_updated_at();

create index idx_deudas_vendedor_id on deudas(vendedor_id);
create index idx_deudas_saldada_en on deudas(saldada_en);

-- ============================================================
-- 3) v_precio_item — un CTE por paso de la planilla, en el mismo orden
--    que calcularPrecioItem (lib/calculos.ts): materia prima -> subtotal
--    -> transporte -> con_transporte -> IVA -> costo -> ganancia ->
--    precio_base -> precio_mayorista. round() de Postgres sobre numeric
--    redondea half-up para valores positivos, igual que Math.round de TS
--    (todos los montos de esta vista son >= 0).
-- ============================================================

create view v_precio_item as
with materia as (
  select
    vp.id as version_id,
    vpi.producto_id,
    round(vp.dolar_centavos * vp.materia_prima_usd_centavos * p.presentacion_ml / 100000.0)::bigint as materia_prima_centavos
  from versiones_precio vp
  join versiones_precio_items vpi on vpi.version_id = vp.id
  join productos p on p.id = vpi.producto_id
),
subtotal as (
  select
    m.version_id,
    m.producto_id,
    m.materia_prima_centavos,
    (m.materia_prima_centavos + vpi.envase_centavos + vpi.etiqueta_centavos) as subtotal_centavos
  from materia m
  join versiones_precio_items vpi
    on vpi.version_id = m.version_id and vpi.producto_id = m.producto_id
),
transporte as (
  select
    s.version_id,
    s.producto_id,
    s.materia_prima_centavos,
    s.subtotal_centavos,
    round(s.subtotal_centavos * vp.transporte_pct / 100)::bigint as transporte_centavos
  from subtotal s
  join versiones_precio vp on vp.id = s.version_id
),
con_transporte as (
  select
    t.*,
    (t.subtotal_centavos + t.transporte_centavos) as con_transporte_centavos
  from transporte t
),
con_iva as (
  select
    ct.*,
    round(ct.con_transporte_centavos * vp.iva_pct / 100)::bigint as iva_centavos
  from con_transporte ct
  join versiones_precio vp on vp.id = ct.version_id
),
con_costo as (
  select
    i.*,
    (i.con_transporte_centavos + i.iva_centavos) as costo_centavos
  from con_iva i
),
con_ganancia as (
  select
    c.*,
    round(c.costo_centavos * vp.ganancia_pct / 100)::bigint as ganancia_centavos
  from con_costo c
  join versiones_precio vp on vp.id = c.version_id
),
con_precio_base as (
  select
    g.*,
    (g.costo_centavos + g.ganancia_centavos) as precio_base_centavos
  from con_ganancia g
),
final as (
  select
    pb.*,
    round(pb.precio_base_centavos * (100 + vp.mayorista_pct) / 100)::bigint as precio_mayorista_centavos
  from con_precio_base pb
  join versiones_precio vp on vp.id = pb.version_id
)
select
  f.version_id,
  vp.fecha,
  vp.dolar_centavos,
  f.producto_id,
  p.nombre as producto_nombre,
  p.presentacion_ml,
  f.materia_prima_centavos,
  vpi.envase_centavos,
  vpi.etiqueta_centavos,
  f.subtotal_centavos,
  f.transporte_centavos,
  f.con_transporte_centavos,
  f.iva_centavos,
  f.costo_centavos,
  f.ganancia_centavos,
  f.precio_base_centavos,
  f.precio_mayorista_centavos,
  vpi.precio_minorista_centavos
from final f
join versiones_precio vp on vp.id = f.version_id
join versiones_precio_items vpi on vpi.version_id = f.version_id and vpi.producto_id = f.producto_id
join productos p on p.id = f.producto_id;

alter view v_precio_item set (security_invoker = true);
revoke all on v_precio_item from anon, public;
grant select on v_precio_item to authenticated;

-- ============================================================
-- 4) crear_version_precio
-- ============================================================

create function crear_version_precio(
  p_fecha date,
  p_dolar_centavos bigint,
  p_materia_prima_usd_centavos bigint,
  p_transporte_pct numeric default 8,
  p_iva_pct numeric default 21,
  p_ganancia_pct numeric default 30,
  p_mayorista_pct numeric default 20,
  p_nota text default null,
  p_items jsonb default '[]'::jsonb
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_vendedor_id uuid;
  v_version_id uuid;
  v_item jsonb;
  v_producto_id uuid;
  v_envase_centavos bigint;
  v_etiqueta_centavos bigint;
  v_precio_minorista_centavos bigint;
  v_total_productos int;
  v_total_items int;
begin
  select id into v_vendedor_id from vendedores where user_id = auth.uid();
  if v_vendedor_id is null then
    raise exception 'VENDEDOR_NO_REGISTRADO';
  end if;

  if p_dolar_centavos is null or p_dolar_centavos <= 0 then
    raise exception 'DOLAR_INVALIDO';
  end if;

  select count(*) into v_total_productos from productos;
  v_total_items := coalesce(jsonb_array_length(p_items), 0);

  if p_items is null or v_total_items <> v_total_productos then
    raise exception 'ITEMS_INVALIDOS';
  end if;

  insert into versiones_precio (
    fecha, dolar_centavos, materia_prima_usd_centavos,
    transporte_pct, iva_pct, ganancia_pct, mayorista_pct, nota, vendedor_id
  ) values (
    coalesce(p_fecha, current_date), p_dolar_centavos,
    coalesce(p_materia_prima_usd_centavos, 0),
    coalesce(p_transporte_pct, 8), coalesce(p_iva_pct, 21),
    coalesce(p_ganancia_pct, 30), coalesce(p_mayorista_pct, 20),
    p_nota, v_vendedor_id
  ) returning id into v_version_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_producto_id := (v_item->>'producto_id')::uuid;
    v_envase_centavos := (v_item->>'envase_centavos')::bigint;
    v_etiqueta_centavos := (v_item->>'etiqueta_centavos')::bigint;
    v_precio_minorista_centavos := (v_item->>'precio_minorista_centavos')::bigint;

    if v_producto_id is null
       or v_envase_centavos is null or v_envase_centavos < 0
       or v_etiqueta_centavos is null or v_etiqueta_centavos < 0
       or v_precio_minorista_centavos is null or v_precio_minorista_centavos < 0
       or not exists (select 1 from productos where id = v_producto_id) then
      raise exception 'ITEMS_INVALIDOS';
    end if;

    insert into versiones_precio_items (
      version_id, producto_id, envase_centavos, etiqueta_centavos, precio_minorista_centavos
    ) values (
      v_version_id, v_producto_id, v_envase_centavos, v_etiqueta_centavos, v_precio_minorista_centavos
    );
  end loop;

  -- El UNIQUE (version_id, producto_id) + el conteo exacto contra
  -- productos ya garantizan "una fila por cada producto, sin duplicados":
  -- si p_items trajera un producto_id repetido, el UNIQUE lo bloquea con
  -- una violación de Postgres genérica antes de llegar acá (mismo riesgo
  -- ya aceptado por crear_feria con sus 2 productos fijos).

  return json_build_object('id', v_version_id);
end;
$$;

revoke execute on function crear_version_precio(date, bigint, bigint, numeric, numeric, numeric, numeric, text, jsonb) from anon, public;
grant execute on function crear_version_precio(date, bigint, bigint, numeric, numeric, numeric, numeric, text, jsonb) to authenticated;

-- ============================================================
-- 5) forzar_vendedor_deuda — deudas admite insert directo (a diferencia
--    de versiones_precio, que solo se crea vía RPC), así que necesita el
--    mismo trigger defensivo que ferias/movimientos_stock: el cliente
--    nunca manda vendedor_id, lo fuerza el trigger al usuario logueado.
-- ============================================================

create function forzar_vendedor_deuda()
returns trigger
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_vendedor_id uuid;
begin
  select id into v_vendedor_id from vendedores where user_id = auth.uid();
  if v_vendedor_id is null then
    raise exception 'VENDEDOR_NO_REGISTRADO';
  end if;

  new.vendedor_id := v_vendedor_id;
  return new;
end;
$$;

create trigger trg_deudas_vendedor
  before insert on deudas
  for each row execute function forzar_vendedor_deuda();

revoke execute on function forzar_vendedor_deuda() from anon, authenticated, public;

-- ============================================================
-- 6) RLS
-- ============================================================

alter table versiones_precio enable row level security;
revoke all on versiones_precio from anon, authenticated, public;
grant select on versiones_precio to authenticated;

create policy versiones_precio_select on versiones_precio for select to authenticated using (true);
-- Sin insert/update/delete: el alta es solo vía crear_version_precio
-- (security definer, bypasea RLS); una versión mal cargada se corrige
-- creando una nueva, no editando la vieja (decisión 3 del spec).

alter table versiones_precio_items enable row level security;
revoke all on versiones_precio_items from anon, authenticated, public;
grant select on versiones_precio_items to authenticated;

create policy versiones_precio_items_select on versiones_precio_items for select to authenticated using (true);
-- Mismo criterio: alta solo vía RPC, sin update/delete.

alter table deudas enable row level security;
revoke all on deudas from anon, authenticated, public;
grant select, insert on deudas to authenticated;
grant update (saldada_en) on deudas to authenticated;

create policy deudas_select on deudas for select to authenticated using (true);
create policy deudas_insert on deudas for insert to authenticated with check (true);
create policy deudas_update on deudas for update to authenticated using (true) with check (true);
-- Sin delete: una deuda mal cargada se marca saldada y se crea la
-- correcta, igual que un ajuste de caja (nunca se edita ni se borra).
