-- Ananja/Germá: Plata en manos de personas (segundo sector del rediseño,
-- después de Producción — ver memoria "Plata: rediseño").
--
-- Hoy `v_saldos_caja` tiene 3 cajas (efectivo/banco/mercado_pago) pero
-- "efectivo" es un pozo agregado: sabe CUÁNTO hay en efectivo en todo el
-- negocio, pero no CUÁNTO tiene cada persona en la mano ni de dónde salió.
-- El dueño (Fran) decidió: la plata de Ananja vive en dos lugares — la
-- "Cuenta Ananja" (banco + Mercado Pago reales, un solo total con sus dos
-- partes) y "plata en manos de personas" (todavía no llegó a esa cuenta).
-- Un cliente SIEMPRE le paga al vendedor que hizo la venta; una
-- revendedora le rinde siempre a su encargado (un admin, normalmente
-- una persona de confianza), y el encargado después la pasa a la Cuenta Ananja. No hay
-- "cajeros" por caja — la plata de una feria que trabajó Fran está en la
-- mano de Fran hasta que él la deposita.
--
-- Decisión de diseño clave (ver reporte de esta tarea para el detalle
-- completo): NO se agrega una tabla de "movimientos de tenedor" nueva y
-- genérica. En cambio:
--   - comprobantes/cobros/gastos/pagos_deuda/ajustes_caja YA tienen
--     `vendedor_id` = quien registró la fila. Bajo las reglas del negocio
--     ("el cliente le paga siempre al vendedor que hizo la venta", "un
--     admin paga un gasto de su propio bolsillo cuando es en efectivo"),
--     ese `vendedor_id` YA ES el tenedor de esa plata cuando
--     `medio_pago = 'efectivo'` — no hace falta una columna nueva.
--   - `rendiciones` es la única fuente que necesita un dato nuevo: CÓMO
--     llegó la plata (`via`) y, cuando corresponde, EN MANO DE QUIÉN queda
--     (`tenedor_id`, calculado por el RPC al registrar, no recalculado
--     después — así un cambio posterior de encargado no reescribe la
--     historia).
--   - El movimiento "depósito a la Cuenta Ananja" es genuinamente nuevo
--     (nadie lo modela hoy): tabla `depositos_cuenta` + RPC
--     `registrar_deposito_cuenta`. `transferencias_caja` (0024) NO se
--     reusa para esto a propósito: es genérica entre las 3 cajas (incluye
--     movimientos banco<->mercado_pago que no pasan por ninguna mano) y no
--     tiene forma de decir DE QUIÉN sale la plata — forzarla a cargar ese
--     dato hubiera sido un cambio de firma más invasivo que agregar una
--     tabla nueva y específica. `transferencias_caja` queda intacta y
--     sigue sirviendo para mover plata YA depositada entre banco y
--     mercado_pago; la UI debe dejar de ofrecer 'efectivo' como origen/
--     destino ahí (ver reporte, "qué falta en la UI").
--
-- Reconciliación exacta (ver reporte para la demostración completa):
-- `v_saldos_caja` donde `medio_pago = 'efectivo'` es, por construcción,
-- IGUAL a la suma de `v_plata_en_manos.total_centavos` sobre todos los
-- tenedores — ambos suman exactamente las mismas filas (comprobantes/
-- cobros/gastos/pagos_deuda/ajustes en efectivo, rendiciones via
-- 'encargado', depositos_cuenta), solo que una lo hace por caja y la otra
-- por persona. `v_saldos_caja` donde `medio_pago in ('banco',
-- 'mercado_pago')` es exactamente `v_cuenta_ananja` (banco_centavos /
-- mercado_pago_centavos). El TOTAL de `v_saldos_caja` (fila 'total') no
-- cambia de significado: sigue siendo toda la plata de Ananja, en mano o
-- en la cuenta — un depósito o una rendición 'encargado' no lo alteran,
-- solo mueven entre 'efectivo' y 'banco'/'mercado_pago'.
--
-- `transferencias_caja` (0024, anterior a este modelo) SÍ entra en la
-- reconciliación: la pantalla /tareas/transferir ya deployada sigue
-- creando filas `efectivo -> mercado_pago`/`banco`, y esa tabla ya tenía
-- `vendedor_id` (quien la cargó, la completa un trigger) desde su
-- creación — se usa esa misma columna como tenedor: una transferencia que
-- tiene a 'efectivo' como origen resta de la mano de quien la cargó
-- (salió hacia la Cuenta Ananja real), una que lo tiene como destino suma
-- (entró a su mano, ej. retirar efectivo real). Ver `v_plata_en_manos` §
-- `transferencias_centavos`.
--
-- Caveat documentado (no introducido por esta migración, preexistente):
-- `cajas` tiene grant `update (saldo_inicial_centavos)` a `authenticated`
-- bajo la policy `cajas_update` (es_vendedor()) — si algún día se edita
-- ese campo para 'efectivo' por fuera de un ajuste_caja, la reconciliación
-- de arriba se rompe por ese monto (hoy siempre 0, la UI nunca lo edita
-- directo). Base de prod hoy vacía (2026-09-12): sin datos históricos que
-- reconciliar.
--
-- Migración templated (__SCHEMA__, sin __BUCKET__ — no toca Storage). Sin
-- bloques @solo-public. Ver supabase/README.md.
--
-- Alcance:
--  1. vendedores.encargado_id + RPC asignar_encargado_revendedor.
--  2. rendiciones.via + rendiciones.tenedor_id.
--  3. Tabla depositos_cuenta + trigger + RLS.
--  4. Vistas v_plata_en_manos, v_cuenta_ananja, v_deuda_vendedor.
--  5. registrar_rendicion: drop + create con p_via default null (se
--     deriva del medio_pago si no llega — mismo comportamiento que antes
--     de esta migración para un caller de 5 argumentos).
--  6. RPC registrar_deposito_cuenta.
--  7. v_saldos_caja redefinida (rendiciones por via, resta depositos_cuenta).

-- ============================================================
-- 1) vendedores.encargado_id
-- ============================================================

alter table vendedores add column encargado_id uuid references vendedores(id);
create index idx_vendedores_encargado_id on vendedores(encargado_id);

-- Sin grant de columna para authenticated (igual criterio que rol/revende):
-- solo se toca vía RPC security definer, nunca por UPDATE directo desde el
-- cliente.

create function asignar_encargado_revendedor(
  p_vendedor_id uuid,
  p_encargado_id uuid default null
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

  if p_encargado_id is not null then
    if p_encargado_id = p_vendedor_id then
      raise exception 'ENCARGADO_INVALIDO';
    end if;

    if not exists (
      select 1 from vendedores where id = p_encargado_id and rol = 'admin' and activo
    ) then
      raise exception 'ENCARGADO_INVALIDO';
    end if;
  end if;

  update vendedores set encargado_id = p_encargado_id where id = p_vendedor_id;

  return json_build_object('id', p_vendedor_id, 'encargado_id', p_encargado_id);
end;
$$;

revoke execute on function asignar_encargado_revendedor(uuid, uuid) from anon, public;
grant execute on function asignar_encargado_revendedor(uuid, uuid) to authenticated;

-- ============================================================
-- 2) rendiciones.via + rendiciones.tenedor_id
--
-- via: cómo llegó la plata de la rendición.
--   'encargado'      (default) — la revendedora se la dio en mano (o se la
--                     transfirió a la cuenta PERSONAL) a su encargado; la
--                     plata queda en mano del encargado, todavía no está
--                     en la Cuenta Ananja. `medio_pago` en este caso es
--                     solo informativo ("cómo te la dio": efectivo, o
--                     transferencia a la cuenta personal del encargado) —
--                     NO determina qué caja de Ananja se acredita.
--   'directo_cuenta' — la revendedora depositó/transfirió directo a una
--                     cuenta real de Ananja. `medio_pago` sí determina la
--                     caja (banco/mercado_pago).
--   'cliente_directo' — un cliente de la revendedora le pagó directo a la
--                     Cuenta Ananja (no a la revendedora). Baja su deuda
--                     igual que cualquier rendición; nadie la tiene en
--                     mano. `medio_pago` determina la caja igual que
--                     'directo_cuenta'.
--
-- tenedor_id: snapshot calculado por el RPC al momento de la rendición
-- (coalesce(encargado_id de la revendedora, admin que la registró) cuando
-- via = 'encargado'; null en los otros dos casos). Snapshot y no columna
-- calculada: si el encargado de la revendedora cambia después, las
-- rendiciones viejas no deben reescribir de quién era la plata en ese
-- momento.
-- ============================================================

alter table rendiciones
  add column via text not null default 'encargado'
    check (via in ('encargado', 'directo_cuenta', 'cliente_directo'));

alter table rendiciones
  add column tenedor_id uuid references vendedores(id);

create index idx_rendiciones_tenedor_id on rendiciones(tenedor_id);

-- ============================================================
-- 3) depositos_cuenta — "pasar a la cuenta": una persona deposita lo que
--    tiene en mano (efectivo, o lo que le rindieron) en la Cuenta Ananja
--    real (banco o mercado_pago). Solo admins tienen plata en mano en este
--    modelo (ver v_plata_en_manos), así que tenedor_id siempre es un admin
--    activo.
-- ============================================================

create table depositos_cuenta (
  id uuid primary key default gen_random_uuid(),
  tenedor_id uuid not null references vendedores(id),
  medio_pago medio_pago not null check (medio_pago <> 'efectivo'),
  monto_centavos bigint not null check (monto_centavos > 0),
  fecha date not null default current_date,
  nota text,
  -- Quien registra el depósito (normalmente el propio tenedor, pero un
  -- admin puede cargarlo por otro) — mismo patrón que
  -- transferencias_caja.vendedor_id / pagos_deuda.vendedor_id: lo completa
  -- el trigger, nunca lo manda el cliente.
  vendedor_id uuid not null references vendedores(id),
  created_at timestamptz not null default now()
);

create index idx_depositos_cuenta_tenedor_id on depositos_cuenta(tenedor_id);
create index idx_depositos_cuenta_fecha on depositos_cuenta(fecha desc);

create function __SCHEMA__.forzar_vendedor_deposito_cuenta()
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

revoke execute on function __SCHEMA__.forzar_vendedor_deposito_cuenta() from anon, authenticated, public;

create trigger trg_depositos_cuenta_vendedor
  before insert on depositos_cuenta
  for each row execute function __SCHEMA__.forzar_vendedor_deposito_cuenta();

alter table depositos_cuenta enable row level security;
revoke all on depositos_cuenta from anon, authenticated, public;
grant select on depositos_cuenta to authenticated;

create policy depositos_cuenta_select on depositos_cuenta for select to authenticated
  using (__SCHEMA__.es_admin());
-- Sin insert/update/delete directo: alta vía RPC registrar_deposito_cuenta.

-- ============================================================
-- 4) Vistas
-- ============================================================

-- v_plata_en_manos: por persona (siempre un admin — es la única que puede
-- registrar comprobantes/cobros/gastos/pagos_deuda/transferencias y
-- recibir rendiciones 'encargado' en este modelo), desglosado por origen.
-- La suma de total_centavos sobre todas las filas es exactamente
-- v_saldos_caja.efectivo (ver comentario de cabecera).
--
-- transferencias_centavos (agregado por la revisión adversarial de esta
-- migración): `transferencias_caja` (0024) es anterior a este modelo de
-- tenedores y NO tiene tenedor_id — pero la pantalla /tareas/transferir ya
-- deployada sigue creando filas `efectivo -> mercado_pago` (y podría crear
-- `mercado_pago/banco -> efectivo`, ej. sacar plata real para tener
-- efectivo a mano) y hay que seguir sosteniendo el invariante de la
-- cabecera para ESAS filas también, no solo para las nuevas
-- (depositos_cuenta). Se atribuye cada transferencia que toca 'efectivo' a
-- `vendedor_id` (quien la cargó, columna que la tabla YA tiene desde 0024
-- — la completa un trigger, nunca el cliente): resta cuando 'efectivo' es
-- el origen (esa plata salió de su mano hacia la Cuenta Ananja real, igual
-- que un depósito), suma cuando 'efectivo' es el destino (esa plata entró
-- a su mano, ej. retirar efectivo del banco real). Sin esto, cualquier
-- transferencia vieja/nueva que toque 'efectivo' deja a v_saldos_caja.efectivo
-- y la suma de v_plata_en_manos desincronizados por el monto exacto de la
-- transferencia.
create view v_plata_en_manos as
select
  v.id as tenedor_id,
  v.nombre,
  coalesce((
    select sum(cp.cobrado_centavos) from comprobantes cp
    where cp.vendedor_id = v.id and cp.medio_pago = 'efectivo'
  ), 0)
    + coalesce((
      select sum(co.monto_centavos) from cobros co
      where co.vendedor_id = v.id and co.medio_pago = 'efectivo'
    ), 0) as ventas_cobros_centavos,
  coalesce((
    select sum(r.monto_centavos) from rendiciones r
    where r.tenedor_id = v.id and r.via = 'encargado'
  ), 0) as rendiciones_centavos,
  coalesce((
    select sum(g.monto_centavos) from gastos g
    where g.vendedor_id = v.id and g.medio_pago = 'efectivo'
  ), 0) as gastos_centavos,
  coalesce((
    select sum(pd.monto_caja_centavos) from pagos_deuda pd
    where pd.vendedor_id = v.id and pd.medio_pago = 'efectivo'
  ), 0) as pagos_deuda_centavos,
  coalesce((
    select sum(a.monto_centavos) from ajustes_caja a
    where a.vendedor_id = v.id and a.medio_pago = 'efectivo'
  ), 0) as ajustes_centavos,
  (
    coalesce((
      select sum(t.monto_centavos) from transferencias_caja t
      where t.vendedor_id = v.id and t.destino = 'efectivo'
    ), 0)
    - coalesce((
      select sum(t.monto_centavos) from transferencias_caja t
      where t.vendedor_id = v.id and t.origen = 'efectivo'
    ), 0)
  ) as transferencias_centavos,
  coalesce((
    select sum(dc.monto_centavos) from depositos_cuenta dc
    where dc.tenedor_id = v.id
  ), 0) as depositos_centavos,
  (
    coalesce((
      select sum(cp.cobrado_centavos) from comprobantes cp
      where cp.vendedor_id = v.id and cp.medio_pago = 'efectivo'
    ), 0)
    + coalesce((
      select sum(co.monto_centavos) from cobros co
      where co.vendedor_id = v.id and co.medio_pago = 'efectivo'
    ), 0)
    + coalesce((
      select sum(r.monto_centavos) from rendiciones r
      where r.tenedor_id = v.id and r.via = 'encargado'
    ), 0)
    - coalesce((
      select sum(g.monto_centavos) from gastos g
      where g.vendedor_id = v.id and g.medio_pago = 'efectivo'
    ), 0)
    - coalesce((
      select sum(pd.monto_caja_centavos) from pagos_deuda pd
      where pd.vendedor_id = v.id and pd.medio_pago = 'efectivo'
    ), 0)
    + coalesce((
      select sum(a.monto_centavos) from ajustes_caja a
      where a.vendedor_id = v.id and a.medio_pago = 'efectivo'
    ), 0)
    + coalesce((
      select sum(t.monto_centavos) from transferencias_caja t
      where t.vendedor_id = v.id and t.destino = 'efectivo'
    ), 0)
    - coalesce((
      select sum(t.monto_centavos) from transferencias_caja t
      where t.vendedor_id = v.id and t.origen = 'efectivo'
    ), 0)
    - coalesce((
      select sum(dc.monto_centavos) from depositos_cuenta dc
      where dc.tenedor_id = v.id
    ), 0)
  ) as total_centavos
from vendedores v
where v.rol = 'admin' and __SCHEMA__.es_admin();

alter view v_plata_en_manos set (security_invoker = true);
revoke all on v_plata_en_manos from anon, public;
grant select on v_plata_en_manos to authenticated;

-- v_cuenta_ananja: banco + mercado_pago reales, con el total. Se apoya en
-- v_saldos_caja para no duplicar su fórmula.
--
-- Corrección NIT (revisión adversarial): un `where es_admin()` puesto
-- directo en una consulta agregada SIN group by no evita la fila —
-- Postgres igual devuelve una única fila con los `coalesce(...)` en 0 aun
-- si el where descarta todas las filas de entrada (es la semántica
-- estándar de un agregado sin group by: siempre una fila). Envolver el
-- agregado en una subconsulta y filtrar afuera sí hace que un no-admin
-- reciba CERO filas — mismo comportamiento que v_plata_en_manos (ahí el
-- filtro es sobre `vendedores`, una tabla real, así que si no hay filas
-- que pasen la condición no hay agregación de por medio que "invente" una).
create view v_cuenta_ananja as
select banco_centavos, mercado_pago_centavos, total_centavos
from (
  select
    coalesce(sum(saldo_centavos) filter (where medio_pago = 'banco'), 0) as banco_centavos,
    coalesce(sum(saldo_centavos) filter (where medio_pago = 'mercado_pago'), 0) as mercado_pago_centavos,
    coalesce(sum(saldo_centavos) filter (where medio_pago in ('banco', 'mercado_pago')), 0) as total_centavos
  from v_saldos_caja
) t
where __SCHEMA__.es_admin();

alter view v_cuenta_ananja set (security_invoker = true);
revoke all on v_cuenta_ananja from anon, public;
grant select on v_cuenta_ananja to authenticated;

-- v_deuda_vendedor: cuánto le debe cada vendedor (revendedor, o admin con
-- espacio propio) a Ananja, con signo — positivo = debe, negativo = Ananja
-- le debe a él (deja la puerta abierta a pagarle ganancia acumulada más
-- adelante, sin cambiar esta vista). Una revendedora ve solo su propia
-- fila (mismo criterio de mi_vendedor_id() que el resto de la RLS de
-- revendedores); un admin ve todas.
create view v_deuda_vendedor as
select
  v.id as vendedor_id,
  v.nombre,
  coalesce((
    select sum(vr.cantidad * vr.precio_costo_centavos) from ventas_revendedor vr
    where vr.vendedor_id = v.id
  ), 0) as costo_vendido_centavos,
  coalesce((
    select sum(r.monto_centavos) from rendiciones r
    where r.vendedor_id = v.id
  ), 0) as entregado_centavos,
  coalesce((
    select sum(vr.cantidad * vr.precio_costo_centavos) from ventas_revendedor vr
    where vr.vendedor_id = v.id
  ), 0)
    - coalesce((
      select sum(r.monto_centavos) from rendiciones r
      where r.vendedor_id = v.id
    ), 0) as saldo_centavos
from vendedores v
where (v.rol = 'revendedor' or (v.rol = 'admin' and v.revende))
  and (__SCHEMA__.es_admin() or v.id = __SCHEMA__.mi_vendedor_id());

alter view v_deuda_vendedor set (security_invoker = true);
revoke all on v_deuda_vendedor from anon, public;
grant select on v_deuda_vendedor to authenticated;

-- ============================================================
-- 5) registrar_rendicion — drop + create: agrega p_via al final con
--    default NULL (no 'encargado' fijo — ver corrección de la revisión
--    adversarial más abajo), así los callers viejos (5 argumentos) siguen
--    funcionando IGUAL que antes de esta migración. Resto del cuerpo
--    idéntico a 0026_roles_pendiente_espacio_revendedor.sql salvo el
--    cálculo de tenedor_id/via.
--
-- Corrección (revisión adversarial de esta migración, verificada en
-- Postgres local antes de aplicar): la versión original defaulteaba
-- `p_via` a 'encargado' a secas. Eso rompía la pantalla de rendición YA
-- DEPLOYADA durante el hueco entre aplicar esta migración y subir el
-- código nuevo: esa pantalla deja elegir cualquier medio_pago (efectivo/
-- banco/mercado_pago) esperando que ESE medio se acredite en la Cuenta
-- Ananja — con default 'encargado' fijo, un cobro en
-- mercado_pago o en banco pasaba a contarse como 'efectivo' (en mano de
-- alguien), y la Cuenta Ananja quedaba subvaluada sin que nadie lo pidiera. Encima nada impedía la combinación sin sentido
-- `p_medio_pago = 'efectivo'` + `p_via = 'directo_cuenta'`/'cliente_directo'`
-- (plata "directo a la cuenta" pero en efectivo no existe: no hay caja
-- física) — con esa combinación la plata desaparecía de todas las vistas
-- (la plata esfumada no figuraba en manos de nadie ni en la Cuenta Ananja).
--
-- Fix: `p_via default null`; cuando llega null, se DERIVA del
-- `p_medio_pago` que el caller ya mandaba antes de esta migración —
-- 'efectivo' -> 'encargado' (comportamiento viejo: quedaba en la caja
-- efectivo, ahora "en mano" de alguien), 'banco'/'mercado_pago' ->
-- 'directo_cuenta' (comportamiento viejo: acreditaba esa caja real
-- directo) — así un caller de 5 argumentos (todos los que existen hoy)
-- se comporta BYTE A BYTE igual que antes de 0037. Un caller nuevo que sí
-- mande `p_via` explícito no tiene ese default, y queda validado: `via`
-- fuera de las tres opciones es VIA_INVALIDA; `via <> 'encargado'` con
-- `medio_pago = 'efectivo'` es MEDIO_INVALIDO (mismo código que ya usa
-- fijar_destino_efectivo/registrar_deposito_cuenta para "ese medio no
-- corresponde acá").
-- ============================================================

drop function if exists registrar_rendicion(uuid, bigint, medio_pago, date, text);

create function registrar_rendicion(
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
  -- la base ANTES de esta migración (toda rendición acreditaba su
  -- medio_pago tal cual, sin distinción de via).
  v_via := coalesce(p_via, case when p_medio_pago = 'efectivo' then 'encargado' else 'directo_cuenta' end);

  if v_via not in ('encargado', 'directo_cuenta', 'cliente_directo') then
    raise exception 'VIA_INVALIDA';
  end if;

  if v_via <> 'encargado' and p_medio_pago = 'efectivo' then
    raise exception 'MEDIO_INVALIDO';
  end if;

  if v_via = 'encargado' then
    select encargado_id into v_encargado_id from vendedores where id = p_vendedor_id;
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

-- ============================================================
-- 6) registrar_deposito_cuenta — "Pasar a la cuenta". p_tenedor_id no
--    tiene que ser necesariamente quien llama al RPC: un admin puede
--    cargar el depósito de otro admin (igual criterio que
--    registrar_rendicion, donde admin_id != vendedor_id de la
--    revendedora).
-- ============================================================

create function registrar_deposito_cuenta(
  p_tenedor_id uuid,
  p_medio_pago medio_pago,
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
  v_deposito_id uuid;
  v_en_mano bigint;
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if p_medio_pago = 'efectivo' then
    raise exception 'MEDIO_INVALIDO';
  end if;

  if not exists (select 1 from vendedores where id = p_tenedor_id and rol = 'admin' and activo) then
    raise exception 'TENEDOR_INVALIDO';
  end if;

  if p_monto_centavos is null or p_monto_centavos <= 0 then
    raise exception 'MONTO_INVALIDO';
  end if;

  select total_centavos into v_en_mano from v_plata_en_manos where tenedor_id = p_tenedor_id;

  if coalesce(v_en_mano, 0) - p_monto_centavos < 0 and not p_permitir_negativo then
    raise exception 'SALDO_INSUFICIENTE'
      using detail = json_build_object('disponible', coalesce(v_en_mano, 0))::text;
  end if;

  insert into depositos_cuenta (tenedor_id, medio_pago, monto_centavos, fecha, nota)
  values (p_tenedor_id, p_medio_pago, p_monto_centavos, coalesce(p_fecha, current_date), p_nota)
  returning id into v_deposito_id;

  return json_build_object('id', v_deposito_id);
end;
$$;

revoke execute on function registrar_deposito_cuenta(uuid, medio_pago, bigint, date, text, boolean) from anon, public;
grant execute on function registrar_deposito_cuenta(uuid, medio_pago, bigint, date, text, boolean) to authenticated;

-- ============================================================
-- 7) v_saldos_caja — redefinida: rendiciones se reparten por `via` (las
--    'encargado' van siempre a 'efectivo', las 'directo_cuenta'/
--    'cliente_directo' van a su propio medio_pago) y se resta
--    depositos_cuenta (todo depósito sale del pozo 'efectivo', entra a su
--    medio_pago real). Mismas columnas que antes (medio_pago,
--    saldo_centavos) — ningún consumidor existente se rompe. Resto de la
--    fórmula (comprobantes.cobrado_centavos, gastos, ajustes,
--    transferencias_caja, cobros, pagos_deuda) idéntico a
--    0027_pagos_deuda.sql. security_invoker se redeclara aparte del
--    create or replace (0019_vistas_security_invoker.sql).
-- ============================================================

create or replace view v_saldos_caja as
with por_caja as (
  select
    c.medio_pago::text as medio_pago,
    c.saldo_inicial_centavos
      + coalesce((select sum(cp.cobrado_centavos) from comprobantes cp where cp.medio_pago = c.medio_pago), 0)
      - coalesce((select sum(g.monto_centavos) from gastos g where g.medio_pago = c.medio_pago), 0)
      + coalesce((select sum(a.monto_centavos) from ajustes_caja a where a.medio_pago = c.medio_pago), 0)
      + case
          when c.medio_pago = 'efectivo' then
            coalesce((select sum(r.monto_centavos) from rendiciones r where r.via = 'encargado'), 0)
          else
            coalesce((
              select sum(r.monto_centavos) from rendiciones r
              where r.via in ('directo_cuenta', 'cliente_directo') and r.medio_pago = c.medio_pago
            ), 0)
        end
      - coalesce((select sum(t.monto_centavos) from transferencias_caja t where t.origen = c.medio_pago), 0)
      + coalesce((select sum(t.monto_centavos) from transferencias_caja t where t.destino = c.medio_pago), 0)
      + coalesce((select sum(co.monto_centavos) from cobros co where co.medio_pago = c.medio_pago), 0)
      - coalesce((select sum(pd.monto_caja_centavos) from pagos_deuda pd where pd.medio_pago = c.medio_pago), 0)
      + case
          when c.medio_pago = 'efectivo' then
            - coalesce((select sum(dc.monto_centavos) from depositos_cuenta dc), 0)
          else
            coalesce((select sum(dc.monto_centavos) from depositos_cuenta dc where dc.medio_pago = c.medio_pago), 0)
        end
      as saldo_centavos
  from cajas c
)
select medio_pago, saldo_centavos from por_caja
union all
select 'total' as medio_pago, coalesce(sum(saldo_centavos), 0) as saldo_centavos from por_caja;

alter view v_saldos_caja set (security_invoker = true);
