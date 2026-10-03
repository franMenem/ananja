-- Ananja/Germá: sección "Tareas" — transferencias entre cajas
--
--
-- Ananja tiene una sola cuenta donde tiene que terminar toda la plata: hoy
-- Mercado Pago. Cuando se acumula efectivo en Caja, el admin lo pasa a esa
-- cuenta y la app registra una transferencia entre cajas: efectivo baja,
-- la cuenta destino sube, el total de v_saldos_caja no cambia (lo que una
-- caja pierde como origen lo gana exactamente otra como destino).
--
-- Migración templated (__SCHEMA__, sin __BUCKET__ — no toca Storage). Sin
-- bloques @solo-public: el seed de destino_efectivo es un default general,
-- no específico de un negocio. Ver supabase/README.md.
--
-- Alcance:
--  1. Tabla transferencias_caja + trigger forzar_vendedor_transferencia_caja.
--  2. RLS de transferencias_caja.
--  3. cajas.destino_efectivo + CHECK + índice único parcial + seed
--     (mercado_pago = true, en los dos negocios).
--  4. RPC fijar_destino_efectivo.
--  5. RPC registrar_transferencia_caja.
--  6. v_saldos_caja redefinida (resta transferencias como origen, suma
--     como destino) — security_invoker redeclarado aparte.

-- ============================================================
-- 1) transferencias_caja
-- ============================================================

create table transferencias_caja (
  id uuid primary key default gen_random_uuid(),
  origen medio_pago not null,
  destino medio_pago not null check (origen <> destino),
  monto_centavos bigint not null check (monto_centavos > 0),
  fecha date not null default current_date,
  nota text,
  vendedor_id uuid not null references vendedores(id),
  created_at timestamptz not null default now()
);

create index idx_transferencias_caja_vendedor_id on transferencias_caja(vendedor_id);
create index idx_transferencias_caja_fecha on transferencias_caja(fecha desc);

create function __SCHEMA__.forzar_vendedor_transferencia_caja()
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

revoke execute on function __SCHEMA__.forzar_vendedor_transferencia_caja() from anon, authenticated, public;

create trigger trg_transferencias_caja_vendedor
  before insert on transferencias_caja
  for each row execute function __SCHEMA__.forzar_vendedor_transferencia_caja();

-- ============================================================
-- 2) RLS — sin policy de insert: el insert llega solo vía RPC
--    registrar_transferencia_caja (security definer).
-- ============================================================

alter table transferencias_caja enable row level security;
revoke all on transferencias_caja from anon, authenticated, public;
grant select on transferencias_caja to authenticated;

create policy transferencias_caja_select on transferencias_caja for select to authenticated
  using (__SCHEMA__.es_vendedor());

-- ============================================================
-- 3) cajas.destino_efectivo — cuenta configurable (ver spec §
--    Alternativas descartadas: columna en cajas, no tabla configuracion).
-- ============================================================

alter table cajas add column destino_efectivo boolean not null default false;

-- El efectivo nunca puede ser su propio destino.
alter table cajas add constraint cajas_destino_efectivo_no_es_efectivo
  check (not (medio_pago = 'efectivo' and destino_efectivo));

-- A lo sumo una fila con destino_efectivo = true en toda la tabla — la
-- garantía real de "un solo destino", no depende de que fijar_destino_efectivo
-- siempre desactive las demás filas antes de activar la nueva (aunque lo hace).
create unique index idx_cajas_destino_efectivo_unico on cajas (destino_efectivo) where destino_efectivo;

-- Seed: Mercado Pago es el destino por default (decisión 1 del spec) — no
-- es @solo-public, aplica igual en los dos negocios; configurable después
-- vía fijar_destino_efectivo.
update cajas set destino_efectivo = true where medio_pago = 'mercado_pago';

-- ============================================================
-- 4) fijar_destino_efectivo — admin, rechaza 'efectivo' como destino.
-- ============================================================

create function fijar_destino_efectivo(p_medio_pago medio_pago)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if p_medio_pago = 'efectivo' then
    raise exception 'MEDIO_INVALIDO';
  end if;

  if not exists (select 1 from cajas where medio_pago = p_medio_pago) then
    raise exception 'MEDIO_INVALIDO';
  end if;

  update cajas set destino_efectivo = false where destino_efectivo;
  update cajas set destino_efectivo = true where medio_pago = p_medio_pago;

  return json_build_object('medio_pago', p_medio_pago);
end;
$$;

revoke execute on function fijar_destino_efectivo(medio_pago) from anon, public;
grant execute on function fijar_destino_efectivo(medio_pago) to authenticated;

-- ============================================================
-- 5) registrar_transferencia_caja — admin. Orden de validaciones: monto,
--    medios iguales, saldo suficiente (mismo orden que los errores listados
--    en la spec/Global Constraints). vendedor_id lo completa el trigger.
-- ============================================================

create function registrar_transferencia_caja(
  p_origen medio_pago,
  p_destino medio_pago,
  p_monto_centavos bigint,
  p_fecha date,
  p_nota text default null,
  p_permitir_negativo boolean default false
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_transferencia_id uuid;
  v_saldo_origen bigint;
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if p_monto_centavos is null or p_monto_centavos <= 0 then
    raise exception 'MONTO_INVALIDO';
  end if;

  if p_origen = p_destino then
    raise exception 'MEDIOS_IGUALES';
  end if;

  select saldo_centavos into v_saldo_origen
  from v_saldos_caja where medio_pago = p_origen::text;

  if coalesce(v_saldo_origen, 0) - p_monto_centavos < 0 and not p_permitir_negativo then
    raise exception 'SALDO_INSUFICIENTE'
      using detail = json_build_object(
        'origen', p_origen,
        'disponible', coalesce(v_saldo_origen, 0)
      )::text;
  end if;

  insert into transferencias_caja (origen, destino, monto_centavos, fecha, nota)
  values (p_origen, p_destino, p_monto_centavos, coalesce(p_fecha, current_date), p_nota)
  returning id into v_transferencia_id;

  return json_build_object('id', v_transferencia_id);
end;
$$;

revoke execute on function registrar_transferencia_caja(medio_pago, medio_pago, bigint, date, text, boolean) from anon, public;
grant execute on function registrar_transferencia_caja(medio_pago, medio_pago, bigint, date, text, boolean) to authenticated;

-- ============================================================
-- 6) v_saldos_caja — redefinida con transferencias. security_invoker se
--    redeclara APARTE del create or replace (0019_vistas_security_invoker.sql):
--    create or replace view no conserva las reloptions previas.
-- ============================================================

create or replace view v_saldos_caja as
with por_caja as (
  select
    c.medio_pago::text as medio_pago,
    c.saldo_inicial_centavos
      + coalesce((select sum(cp.monto_centavos) from comprobantes cp where cp.medio_pago = c.medio_pago), 0)
      - coalesce((select sum(g.monto_centavos) from gastos g where g.medio_pago = c.medio_pago), 0)
      + coalesce((select sum(a.monto_centavos) from ajustes_caja a where a.medio_pago = c.medio_pago), 0)
      + coalesce((select sum(r.monto_centavos) from rendiciones r where r.medio_pago = c.medio_pago), 0)
      - coalesce((select sum(t.monto_centavos) from transferencias_caja t where t.origen = c.medio_pago), 0)
      + coalesce((select sum(t.monto_centavos) from transferencias_caja t where t.destino = c.medio_pago), 0)
      as saldo_centavos
  from cajas c
)
select medio_pago, saldo_centavos from por_caja
union all
select 'total' as medio_pago, coalesce(sum(saldo_centavos), 0) as saldo_centavos from por_caja;

alter view v_saldos_caja set (security_invoker = true);
