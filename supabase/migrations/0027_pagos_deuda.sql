-- Ananja/Germá: pago parcial de deudas del negocio
-- (tabla `deudas`, 0016_precios_deudas.sql) — hasta ahora una deuda solo
-- podía marcarse saldada de una vez (`marcarDeudaSaldada`, un `update`
-- directo de `saldada_en`). El dueño quiere pagarlas de a poco, y cada pago
-- sale de una caja (Efectivo/Banco/Mercado Pago) y se resta de su saldo —
-- mismo diseño que los cobros de venta a crédito
-- (0025_ventas_credito.sql): tabla de pagos con su propio medio de pago,
-- vista de saldo (pagado/restante), RPCs de alta/baja gateadas por
-- `es_admin()` (0022_rpcs_solo_admin.sql), y `v_saldos_caja` extendida con
-- la nueva fuente.
--
-- Migración templated (__SCHEMA__, sin __BUCKET__ — no toca Storage). Sin
-- bloques @solo-public: nada de esta migración es específica de un
-- negocio. Ver supabase/README.md.
--
-- Alcance:
--  1. Tabla pagos_deuda + trigger forzar_vendedor_pago_deuda + RLS.
--  2. v_saldo_deuda (nueva): pagado/restante por deuda.
--  3. RPC registrar_pago_deuda.
--  4. RPC eliminar_pago_deuda (corrige altas equivocadas).
--  5. v_saldos_caja redefinida (resta pagos_deuda por su propia caja,
--     `monto_caja_centavos` — no `monto_centavos`: una deuda en USD paga un
--     monto en USD pero sale de la caja en pesos).

-- ============================================================
-- 1) pagos_deuda
-- ============================================================

create table pagos_deuda (
  id uuid primary key default gen_random_uuid(),
  -- on delete cascade: mismo criterio que cobros.comprobante_id (0025) — si
  -- se borra la deuda, sus pagos no quedan huérfanos.
  deuda_id uuid not null references deudas(id) on delete cascade,
  -- En la moneda de la deuda (deudas.moneda): USD para una deuda en USD,
  -- pesos para una deuda en ARS.
  monto_centavos bigint not null check (monto_centavos > 0),
  -- Pesos que efectivamente salieron de la caja — igual a monto_centavos
  -- para una deuda en ARS (el RPC lo fuerza), o la conversión a pesos al
  -- dólar que el usuario confirmó para una deuda en USD.
  monto_caja_centavos bigint not null check (monto_caja_centavos > 0),
  medio_pago medio_pago not null,
  fecha date not null default current_date,
  nota text,
  vendedor_id uuid not null references vendedores(id),
  created_at timestamptz not null default now()
);

create index idx_pagos_deuda_deuda_id on pagos_deuda(deuda_id);
create index idx_pagos_deuda_fecha on pagos_deuda(fecha desc);

create function __SCHEMA__.forzar_vendedor_pago_deuda()
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

revoke execute on function __SCHEMA__.forzar_vendedor_pago_deuda() from anon, authenticated, public;

create trigger trg_pagos_deuda_vendedor
  before insert on pagos_deuda
  for each row execute function __SCHEMA__.forzar_vendedor_pago_deuda();

alter table pagos_deuda enable row level security;
revoke all on pagos_deuda from anon, authenticated, public;
grant select on pagos_deuda to authenticated;

create policy pagos_deuda_select on pagos_deuda for select to authenticated
  using (__SCHEMA__.es_vendedor());
-- Sin policy de insert/delete: alta vía RPC registrar_pago_deuda, baja vía
-- RPC eliminar_pago_deuda (ambas security definer, gateadas por es_admin()).

-- ============================================================
-- 2) v_saldo_deuda — pagado/restante por deuda, mismo criterio que
--    v_saldo_comprobante (0025_ventas_credito.sql).
-- ============================================================

create view v_saldo_deuda as
select
  d.id as deuda_id,
  d.descripcion,
  d.moneda,
  d.monto_centavos,
  d.fecha,
  d.nota,
  d.saldada_en,
  d.created_at,
  coalesce((select sum(p.monto_centavos) from pagos_deuda p where p.deuda_id = d.id), 0) as pagado_centavos,
  d.monto_centavos - coalesce((select sum(p.monto_centavos) from pagos_deuda p where p.deuda_id = d.id), 0) as restante_centavos
from deudas d;

alter view v_saldo_deuda set (security_invoker = true);
revoke all on v_saldo_deuda from anon, public;
grant select on v_saldo_deuda to authenticated;

-- ============================================================
-- 3) registrar_pago_deuda — admin. Se apoya en v_saldo_deuda para no
--    duplicar el cálculo de restante (mismo criterio que registrar_cobro
--    con v_saldo_comprobante). Para una deuda en ARS fuerza
--    monto_caja_centavos = monto_centavos, ignorando lo que mande el
--    cliente en p_monto_caja_centavos (decisión del spec: no tiene sentido
--    "convertir" pesos a pesos).
-- ============================================================

create function registrar_pago_deuda(
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
-- 4) eliminar_pago_deuda — admin. Corrige un alta equivocada: borra el pago
--    y, si la deuda ya no queda totalmente pagada, limpia saldada_en (igual
--    intención que eliminar_cobro, que no toca un campo "saldada" porque
--    comprobantes no tiene uno — acá sí hace falta).
-- ============================================================

create function eliminar_pago_deuda(p_pago_id uuid)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_deuda_id uuid;
  v_restante_centavos bigint;
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select deuda_id into v_deuda_id from pagos_deuda where id = p_pago_id;
  if v_deuda_id is null then
    raise exception 'PAGO_NO_ENCONTRADO';
  end if;

  delete from pagos_deuda where id = p_pago_id;

  select restante_centavos into v_restante_centavos
  from v_saldo_deuda where deuda_id = v_deuda_id;

  if coalesce(v_restante_centavos, 0) > 0 then
    update deudas set saldada_en = null where id = v_deuda_id and saldada_en is not null;
  end if;

  return json_build_object('id', p_pago_id);
end;
$$;

revoke execute on function eliminar_pago_deuda(uuid) from anon, public;
grant execute on function eliminar_pago_deuda(uuid) to authenticated;

-- ============================================================
-- 5) v_saldos_caja — redefinida: resta pagos_deuda por su propia caja
--    (monto_caja_centavos). security_invoker se redeclara APARTE del
--    create or replace (0019_vistas_security_invoker.sql): create or
--    replace view no conserva las reloptions previas.
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
      - coalesce((select sum(pd.monto_caja_centavos) from pagos_deuda pd where pd.medio_pago = c.medio_pago), 0)
      as saldo_centavos
  from cajas c
)
select medio_pago, saldo_centavos from por_caja
union all
select 'total' as medio_pago, coalesce(sum(saldo_centavos), 0) as saldo_centavos from por_caja;

alter view v_saldos_caja set (security_invoker = true);
