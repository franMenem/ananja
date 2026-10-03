-- Ananja: la diferencia del encargado.
--
-- Regla de negocio (decisiones de Fran, 2026-09-15):
--  1. Lo que Ananja cobra por botella es SIEMPRE el costo Ananja del lote
--     (`v_costo_lote_desglose.costo_ananja_centavos`). El admin puede
--     cobrarle a la revendedora otro monto (`entrega_items.
--     costo_ananja_unitario_centavos`, "le cobrás a la revendedora"); ella
--     debe lo cobrado, como siempre (`v_deuda_vendedor` no cambia).
--  2. La DIFERENCIA (cobrado − costo del lote), si es positiva, es del
--     ENCARGADO de la revendedora. Si se le cobró menos que el costo, no hay
--     diferencia y nadie debe el faltante: lo absorbe Ananja (pasó con el
--     primer lote — no se crean deudas por eso).
--  3. La diferencia se GANA CUANDO ELLA PAGA, no cuando vende: sus pagos
--     (rendiciones, por fecha, created_at, id) cubren sus ventas FIFO (por
--     fecha, created_at, id); de cada monto cubierto de una venta, la parte
--     proporcional a la diferencia (cubierto × diferencia / cobrado) se le
--     debe al encargado que tenía la revendedora AL MOMENTO DEL PAGO
--     (`rendiciones.encargado_diferencia_id`). Sin encargado admin activo →
--     null → se lo queda Ananja.
--  4. El encargado igual pasa TODA la plata a la Cuenta Ananja (plata en
--     manos no cambia). Después Ananja le debe la diferencia ganada.
--  5. Pagarle al encargado = un gasto (`registrar_pago_diferencia_encargado`)
--     de la categoría "Diferencias de encargados", así `v_saldos_caja`,
--     `v_cuenta_ananja` y `v_plata_en_manos` ya lo restan sin tocarlas.
--
-- COSTO DEL LOTE COMPLETO (revisión 2026-09-15): `tiene_costos` solo dice
-- que el total es > 0. La foto del costo del lote y la diferencia se
-- calculan SOLO con los costos del lote/presentación COMPLETOS, con la
-- misma regla que la app (`faltantesCostosLote` / `costosLoteCompletos
-- DeProducto` en lib/tareas.ts): aceite (dólar + USD por litro, o una línea
-- de aceite con precio), línea de envase de ESA presentación (una en $ 0
-- cuenta) y alguna línea de transporte. Mientras falte algo, la diferencia
-- de esas ventas NO se puede calcular: no se gana nada todavía y se avisa
-- (`v_diferencia_pendiente`). Cuando el lote se completa, las fotos vacías
-- se llenan solas (trigger diferido al final de la transacción, así
-- `aplicar_costos_lote` — que borra y vuelve a insertar todas las líneas —
-- deja la foto con los costos finales). Una foto ya tomada nunca se pisa.
--
-- Qué hace:
--  § 1 Columnas nuevas (todas nullable, la UI desplegada no las manda):
--      - entrega_items.costo_lote_unitario_centavos: foto del costo Ananja
--        del lote (completo) al entregar. Las ventas la heredan por
--        `ventas_revendedor.entrega_item_id`.
--      - rendiciones.encargado_diferencia_id (FK a vendedores; rendiciones ya
--        tenía 3 FKs a vendedores, ningún embed de PostgREST cambia).
--      - gastos.encargado_beneficiario_id — SIN FK a propósito: gastos tiene
--        una sola FK a vendedores y la app hace `gastos … vendedores(nombre)`
--        sin hint en /caja, /gastos y /notificaciones; una segunda FK volvería
--        ambiguo ese embed (PGRST201) y rompería la UI desplegada. La valida
--        el RPC y un trigger impide editarla desde REST.
--  § 2 Categoría "Diferencias de encargados": es_costo_produccion = TRUE
--      (el pago NO se resta como gasto operativo en /ganancia ni en
--      `v_resultado_feria`, porque `v_margen_ventas.margen_ananja_centavos`
--      ya excluye la diferencia: restarlo otra vez la contaría dos veces) y
--      activa = false (no aparece para elegirla a mano en "Nuevo gasto"; la
--      usa solo el RPC).
--  § 3 Costos completos: vista `v_lote_costos_completos` (la regla, una sola
--      vez en SQL) y función `lote_costos_completos(lote, producto)` para los
--      triggers (no ejecutable por usuarios).
--  § 4 Triggers en vez de reescribir los RPCs (mismas firmas y cuerpos de
--      `registrar_entrega_revendedor`, `registrar_rendicion`,
--      `confirmar_pago_revendedor` y `registrar_carga_revendedor`): foto del
--      costo del lote, encargado de la rendición, fotos que se completan
--      cuando el lote se completa, y protección del gasto de un pago de
--      diferencia (beneficiario y categoría no editables).
--  § 5 Backfill: foto de los ítems de entrega existentes (costo Ananja
--      actual de su lote, solo si está completo) y encargado actual de la
--      revendedora en las rendiciones existentes.
--  § 6 Vistas: v_costo_lote_venta (costo del lote de cada venta de
--      revendedora), v_diferencia_encargado (por revendedora, encargado y
--      fecha), v_diferencia_pendiente (ventas con costo del lote incompleto)
--      y v_deuda_encargados (devengado, pagado, saldo, pendiente_desde).
--  § 7 v_margen_ventas (desde la definición ACTUAL de prod, 0040): mismas
--      columnas + margen_encargado_centavos. Filas de revendedora:
--        - costo del lote incompleto: ingreso_ananja = lo cobrado
--          (provisorio), margen_ananja y margen_encargado = null ("no
--          sabemos": /ganancia lo cuenta como unidades sin costo);
--        - revendedora SIN encargado admin activo HOY: ingreso_ananja = lo
--          cobrado, margen_encargado = 0 (la diferencia queda para Ananja);
--        - con encargado: ingreso_ananja = min(cobrado, costo_lote) ×
--          cantidad, margen_encargado = max(cobrado − costo_lote, 0) ×
--          cantidad.
--        margen_ananja = (lo de Ananja − costo producción) × cantidad;
--        margen_vendedor = (precio venta − cobrado) × cantidad (igual que
--        antes). APROXIMACIÓN documentada: acá se usa el encargado ACTUAL de
--        la revendedora (mismo criterio que el trigger de rendiciones), no
--        el de cada pago como en v_diferencia_encargado. Si una revendedora
--        cambia de tener a no tener encargado entre pagos, /ganancia y
--        v_deuda_encargados pueden diferir en esa parte.
--  § 8 v_cobranza_lote (desde prod, 0040): esperado_por_vendidas vuelve a
--      ser lo que se le debe a Ananja, costo Ananja del lote × vendidas
--      (como antes de 0040). Mismas columnas.
--  § 9 RPC registrar_pago_diferencia_encargado.
--
-- La UI desplegada sigue funcionando entre aplicar esto y desplegar: no
-- cambia ninguna firma, las vistas existentes conservan sus columnas y los
-- inserts existentes no mandan las columnas nuevas.
--
-- APLICADA en prod `public` el 2026-09-15 con el OK de Fran (versión 20260915202815).

-- ─── § 1 Columnas ──────────────────────────────────────────────────────────

alter table entrega_items
  add column costo_lote_unitario_centavos bigint
  constraint entrega_items_costo_lote_unitario_centavos_check check (costo_lote_unitario_centavos >= 0);

alter table rendiciones
  add column encargado_diferencia_id uuid references vendedores(id);

create index rendiciones_encargado_diferencia_id_idx on rendiciones (encargado_diferencia_id);

alter table gastos
  add column encargado_beneficiario_id uuid;

create index gastos_encargado_beneficiario_id_idx on gastos (encargado_beneficiario_id)
  where encargado_beneficiario_id is not null;

-- ─── § 2 Categoría ─────────────────────────────────────────────────────────

insert into categorias_gasto (nombre, es_costo_produccion, activa)
values ('Diferencias de encargados', true, false)
on conflict (nombre) do update set es_costo_produccion = true, activa = false;

-- ─── § 3 Costos del lote completos ────────────────────────────────────────
-- Espejo: lib/tareas.ts § costosLoteCompletosDeProducto (fixture compartido
-- en tests/fixtures/diferencia-encargado.json).

create view v_lote_costos_completos as
select
  li.lote_id,
  li.producto_id,
  (
    (
      (coalesce(l.dolar_centavos, 0) > 0 and coalesce(l.precio_litro_aceite_usd_centavos, 0) > 0)
      or exists (
        select 1 from lote_costos c
        where c.lote_id = li.lote_id
          and c.concepto = 'aceite'
          and (coalesce(c.total_centavos, 0) > 0 or coalesce(c.costo_unitario_centavos, 0) > 0)
      )
    )
    and exists (
      select 1 from lote_costos c
      where c.lote_id = li.lote_id and c.concepto = 'envase' and c.producto_id = li.producto_id
    )
    and exists (
      select 1 from lote_costos c
      where c.lote_id = li.lote_id and c.concepto = 'transporte'
    )
  ) as completo
from lote_items li
join lotes_produccion l on l.id = li.lote_id;

alter view v_lote_costos_completos set (security_invoker = true);
revoke all on v_lote_costos_completos from anon, public;
grant select on v_lote_costos_completos to authenticated;

create or replace function lote_costos_completos(p_lote_id uuid, p_producto_id uuid)
returns boolean
language sql
stable
security definer
set search_path = __SCHEMA__
as $$
  select coalesce((
    select completo from v_lote_costos_completos
    where lote_id = p_lote_id and producto_id = p_producto_id
  ), false);
$$;

revoke execute on function lote_costos_completos(uuid, uuid) from anon, authenticated, public;

-- ─── § 4 Triggers ──────────────────────────────────────────────────────────

-- Foto del costo Ananja del lote en cada ítem de ENTREGA (no devolución),
-- solo con los costos de esa presentación completos. Si no, null: se llena
-- cuando el lote se complete (trg_*_completar_fotos).
create or replace function entrega_items_foto_costo_lote()
returns trigger
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
begin
  new.costo_lote_unitario_centavos := null;
  if new.lote_id is not null
     and exists (select 1 from entregas_revendedor e where e.id = new.entrega_id and e.tipo = 'entrega')
     and __SCHEMA__.lote_costos_completos(new.lote_id, new.producto_id) then
    select d.costo_ananja_centavos into new.costo_lote_unitario_centavos
    from v_costo_lote_desglose d
    where d.lote_id = new.lote_id and d.producto_id = new.producto_id and d.tiene_costos;
  end if;
  return new;
end;
$$;

revoke execute on function entrega_items_foto_costo_lote() from anon, authenticated, public;

create trigger trg_entrega_items_foto_costo_lote
before insert on entrega_items
for each row execute function entrega_items_foto_costo_lote();

-- Completa las fotos vacías de un lote cuando sus costos quedan completos.
-- Nunca pisa una foto ya tomada. Constraint trigger DIFERIDO: corre al
-- final de la transacción, cuando `fijar_costos_lote` ya dejó todas las
-- líneas finales (si la transacción falla, no corre).
create or replace function completar_fotos_costo_lote()
returns trigger
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_lote_id uuid;
begin
  if tg_table_name = 'lote_costos' then
    v_lote_id := new.lote_id;
  else
    v_lote_id := new.id;
  end if;

  update entrega_items ei
  set costo_lote_unitario_centavos = d.costo_ananja_centavos
  from entregas_revendedor e, v_costo_lote_desglose d
  where ei.lote_id = v_lote_id
    and ei.costo_lote_unitario_centavos is null
    and e.id = ei.entrega_id
    and e.tipo = 'entrega'
    and d.lote_id = ei.lote_id
    and d.producto_id = ei.producto_id
    and d.tiene_costos
    and __SCHEMA__.lote_costos_completos(ei.lote_id, ei.producto_id);

  return null;
end;
$$;

revoke execute on function completar_fotos_costo_lote() from anon, authenticated, public;

create constraint trigger trg_lote_costos_completar_fotos
after insert or update on lote_costos
deferrable initially deferred
for each row execute function completar_fotos_costo_lote();

create constraint trigger trg_lotes_produccion_completar_fotos
after update on lotes_produccion
deferrable initially deferred
for each row execute function completar_fotos_costo_lote();

-- Encargado de la revendedora al momento del pago — mismo criterio que
-- `registrar_rendicion` para el tenedor: solo si es admin activo (y no es
-- ella misma).
create or replace function rendiciones_encargado_diferencia()
returns trigger
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
begin
  new.encargado_diferencia_id := null;
  select enc.id into new.encargado_diferencia_id
  from vendedores yo
  join vendedores enc on enc.id = yo.encargado_id
  where yo.id = new.vendedor_id
    and enc.rol = 'admin'
    and enc.activo
    and enc.id <> new.vendedor_id;
  return new;
end;
$$;

revoke execute on function rendiciones_encargado_diferencia() from anon, authenticated, public;

create trigger trg_rendiciones_encargado_diferencia
before insert on rendiciones
for each row execute function rendiciones_encargado_diferencia();

-- gastos se puede editar por REST (policy gastos_update). En un pago de
-- diferencia se pueden cambiar monto, medio, fecha y nota, pero no el
-- beneficiario ni la categoría; y ningún gasto común se puede pasar a la
-- categoría "Diferencias de encargados" (quedaría afuera de los gastos
-- operativos sin deber nada a nadie). Borrarlo sí se puede: la deuda con el
-- encargado vuelve a subir. SECURITY INVOKER a propósito: current_user es
-- el rol del que edita ('authenticated' desde la app; el dueño adentro de
-- un RPC security definer).
create or replace function gastos_proteger_pago_diferencia()
returns trigger
language plpgsql
set search_path = __SCHEMA__
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if new.encargado_beneficiario_id is distinct from old.encargado_beneficiario_id then
    raise exception 'CAMPO_NO_EDITABLE';
  end if;

  if new.categoria_id is distinct from old.categoria_id
     and (
       old.encargado_beneficiario_id is not null
       or exists (
         select 1 from categorias_gasto cg
         where cg.id = new.categoria_id and cg.nombre = 'Diferencias de encargados'
       )
     ) then
    raise exception 'CATEGORIA_NO_EDITABLE';
  end if;

  return new;
end;
$$;

revoke execute on function gastos_proteger_pago_diferencia() from anon, authenticated, public;

create trigger trg_gastos_proteger_pago_diferencia
before update on gastos
for each row execute function gastos_proteger_pago_diferencia();

-- ─── § 5 Backfill ──────────────────────────────────────────────────────────

update entrega_items ei
set costo_lote_unitario_centavos = d.costo_ananja_centavos
from entregas_revendedor e, v_costo_lote_desglose d, v_lote_costos_completos lc
where e.id = ei.entrega_id
  and e.tipo = 'entrega'
  and d.lote_id = ei.lote_id
  and d.producto_id = ei.producto_id
  and d.tiene_costos
  and lc.lote_id = ei.lote_id
  and lc.producto_id = ei.producto_id
  and lc.completo
  and ei.costo_lote_unitario_centavos is null;

update rendiciones r
set encargado_diferencia_id = enc.id
from vendedores yo
join vendedores enc on enc.id = yo.encargado_id
where yo.id = r.vendedor_id
  and enc.rol = 'admin'
  and enc.activo
  and enc.id <> r.vendedor_id
  and r.encargado_diferencia_id is null;

-- ─── § 6 Vistas de la diferencia ──────────────────────────────────────────

-- Costo del lote que cuenta para cada venta de revendedora. Espejo:
-- lib/diferencia-encargado.ts § costoLoteDeVenta.
--   - sin ítem de entrega o ítem sin lote (ventas viejas): lo cobrado (sin
--     diferencia);
--   - foto de la entrega;
--   - sin foto: costo Ananja actual del lote, SOLO si está completo;
--   - si no: null y costo_lote_incompleto = true (no se puede calcular).
create view v_costo_lote_venta as
select
  vr.id as venta_id,
  vr.vendedor_id,
  vr.fecha,
  vr.created_at,
  vr.cantidad,
  vr.precio_costo_centavos as cobrado_unitario_centavos,
  case
    when ei.lote_id is null then vr.precio_costo_centavos
    else coalesce(
      ei.costo_lote_unitario_centavos,
      case when lc.completo and d.tiene_costos then d.costo_ananja_centavos end
    )
  end as costo_lote_unitario_centavos,
  (
    ei.lote_id is not null
    and ei.costo_lote_unitario_centavos is null
    and not coalesce(lc.completo and d.tiene_costos, false)
  ) as costo_lote_incompleto
from ventas_revendedor vr
left join entrega_items ei on ei.id = vr.entrega_item_id
left join v_lote_costos_completos lc on lc.lote_id = ei.lote_id and lc.producto_id = ei.producto_id
left join v_costo_lote_desglose d on d.lote_id = ei.lote_id and d.producto_id = ei.producto_id;

alter view v_costo_lote_venta set (security_invoker = true);
revoke all on v_costo_lote_venta from anon, public;
grant select on v_costo_lote_venta to authenticated;

-- Diferencia ganada por revendedora, encargado y fecha (solo admins).
-- `encargado_id` null = pagos sin encargado: queda para Ananja. `fecha` =
-- el día en que se ganó: el más tardío entre el pago y la venta que cubre.
-- Las ventas con costo del lote incompleto ocupan su lugar en el FIFO
-- (consumen pagos) pero no ganan nada hasta que se completen los costos.
-- Espejo: lib/diferencia-encargado.ts § devengarDiferencias.
create view v_diferencia_encargado as
with ventas as (
  select
    c.vendedor_id,
    c.venta_id as id,
    c.fecha,
    c.created_at,
    (c.cantidad::bigint * c.cobrado_unitario_centavos)::numeric as monto,
    case
      when c.costo_lote_unitario_centavos is null then null::numeric
      else (c.cantidad::bigint * greatest(c.cobrado_unitario_centavos - c.costo_lote_unitario_centavos, 0))::numeric
    end as diferencia
  from v_costo_lote_venta c
  where c.cantidad > 0 and c.cobrado_unitario_centavos > 0
), ventas_acum as (
  select
    v.vendedor_id, v.fecha, v.monto, v.diferencia,
    coalesce(sum(v.monto) over (
      partition by v.vendedor_id order by v.fecha, v.created_at, v.id
      rows between unbounded preceding and 1 preceding
    ), 0) as desde
  from ventas v
), pagos_acum as (
  select
    r.vendedor_id,
    r.encargado_diferencia_id,
    r.fecha,
    r.monto_centavos::numeric as monto,
    coalesce(sum(r.monto_centavos) over (
      partition by r.vendedor_id order by r.fecha, r.created_at, r.id
      rows between unbounded preceding and 1 preceding
    ), 0)::numeric as desde
  from rendiciones r
), cruce as (
  select
    p.vendedor_id,
    p.encargado_diferencia_id as encargado_id,
    greatest(v.fecha, p.fecha) as fecha,
    (least(v.desde + v.monto, p.desde + p.monto) - greatest(v.desde, p.desde))
      * v.diferencia / v.monto as devengado
  from ventas_acum v
  join pagos_acum p
    on p.vendedor_id = v.vendedor_id
   and p.desde < v.desde + v.monto
   and v.desde < p.desde + p.monto
  where v.diferencia > 0
)
select
  c.vendedor_id,
  c.encargado_id,
  c.fecha,
  round(sum(c.devengado))::bigint as devengado_centavos
from cruce c
where __SCHEMA__.es_admin()
group by c.vendedor_id, c.encargado_id, c.fecha;

alter view v_diferencia_encargado set (security_invoker = true);
revoke all on v_diferencia_encargado from anon, public;
grant select on v_diferencia_encargado to authenticated;

-- Ventas de cada revendedora cuya diferencia todavía no se puede calcular
-- porque los costos de su lote están incompletos (solo admins).
create view v_diferencia_pendiente as
select
  c.vendedor_id,
  count(*)::bigint as ventas_costo_incompleto,
  sum(c.cantidad)::bigint as unidades_costo_incompleto
from v_costo_lote_venta c
where c.costo_lote_incompleto and __SCHEMA__.es_admin()
group by c.vendedor_id;

alter view v_diferencia_pendiente set (security_invoker = true);
revoke all on v_diferencia_pendiente from anon, public;
grant select on v_diferencia_pendiente to authenticated;

-- Lo que Ananja le debe a cada encargado (solo admins). Una fila por admin
-- con algo ganado o pagado. saldo negativo = se le pagó de más.
-- `pendiente_desde`: fecha de la diferencia más vieja todavía sin pagar
-- (los pagos saldan primero lo más viejo; se recorre de lo más nuevo a lo
-- más viejo hasta cubrir el saldo; si no alcanza, la más vieja). Espejo:
-- lib/diferencia-encargado.ts § deudaEncargados.
create view v_deuda_encargados as
with devengado_fecha as (
  select encargado_id, fecha, sum(devengado_centavos) as monto
  from v_diferencia_encargado
  where encargado_id is not null
  group by encargado_id, fecha
), devengado as (
  select encargado_id, sum(monto) as monto
  from devengado_fecha
  group by encargado_id
), pagado as (
  select encargado_beneficiario_id as encargado_id, sum(monto_centavos) as monto
  from gastos
  where encargado_beneficiario_id is not null
  group by encargado_beneficiario_id
), saldos as (
  select
    v.id as encargado_id,
    v.nombre,
    v.activo,
    coalesce(d.monto, 0) as devengado,
    coalesce(p.monto, 0) as pagado
  from vendedores v
  left join devengado d on d.encargado_id = v.id
  left join pagado p on p.encargado_id = v.id
  where d.monto is not null or p.monto is not null
), acumulado as (
  select
    encargado_id,
    fecha,
    sum(monto) over (partition by encargado_id order by fecha desc rows between unbounded preceding and current row) as acum
  from devengado_fecha
)
select
  s.encargado_id,
  s.nombre,
  s.activo,
  s.devengado::bigint as devengado_centavos,
  s.pagado::bigint as pagado_centavos,
  (s.devengado - s.pagado)::bigint as saldo_centavos,
  case
    when s.devengado - s.pagado <= 0 then null::date
    else coalesce(
      (select max(a.fecha) from acumulado a where a.encargado_id = s.encargado_id and a.acum >= s.devengado - s.pagado),
      (select min(a.fecha) from acumulado a where a.encargado_id = s.encargado_id)
    )
  end as pendiente_desde
from saldos s
where __SCHEMA__.es_admin();

alter view v_deuda_encargados set (security_invoker = true);
revoke all on v_deuda_encargados from anon, public;
grant select on v_deuda_encargados to authenticated;

-- ─── § 7 v_margen_ventas ──────────────────────────────────────────────────
-- Recreada desde pg_get_viewdef de prod (0040). Cambian solo las filas de
-- revendedora en ingreso/margen de Ananja (costo_venta_revendedor) y se
-- agrega margen_encargado_centavos al final. Espejo: lib/margen.ts §
-- calcularFilaMargen.

create or replace view v_margen_ventas as
with lote_directo as (
  select dl.lote_id, dl.producto_id, coalesce(sum(dl.cantidad), 0::bigint) as asignado_directo
  from (
    select ci.lote_id, ci.producto_id, ci.cantidad
    from comprobante_items ci
    where ci.lote_id is not null
    union all
    select vr.lote_id, vr.producto_id, vr.cantidad
    from ventas_revendedor vr
    where vr.lote_id is not null
  ) dl
  group by dl.lote_id, dl.producto_id
), lote_capacidad as (
  select li.lote_id, li.producto_id, l.fecha, l.created_at,
    greatest(li.cantidad - coalesce(ld.asignado_directo, 0::bigint), 0::bigint) as capacidad
  from lote_items li
  join lotes_produccion l on l.id = li.lote_id
  left join lote_directo ld on ld.lote_id = li.lote_id and ld.producto_id = li.producto_id
), lote_capacidad_off as (
  select lc.lote_id, lc.producto_id, lc.fecha, lc.created_at, lc.capacidad,
    coalesce(sum(lc.capacidad) over (
      partition by lc.producto_id order by lc.fecha, lc.created_at, lc.lote_id
      rows between unbounded preceding and 1 preceding
    ), 0::numeric)::bigint as offset_previo
  from lote_capacidad lc
  where lc.capacidad > 0
), lote_capacidad_rango as (
  select o.lote_id, o.producto_id, o.fecha, o.created_at, o.capacidad, o.offset_previo,
    o.offset_previo + o.capacidad as fin_posicion
  from lote_capacidad_off o
), demanda_sin_lote as (
  select 'comprobante'::text as origen, ci.comprobante_id as documento_id, c.fecha, c.created_at,
    ci.id as orden_id, ci.producto_id, ci.cantidad, c.vendedor_id, c.feria_id,
    ci.precio_unitario_centavos, null::bigint as precio_costo_real_centavos
  from comprobante_items ci
  join comprobantes c on c.id = ci.comprobante_id
  where ci.lote_id is null
  union all
  select 'revendedor'::text as origen, vr.id as documento_id, vr.fecha, vr.created_at,
    vr.id as orden_id, vr.producto_id, vr.cantidad, vr.vendedor_id, null::uuid as feria_id,
    vr.precio_venta_centavos as precio_unitario_centavos, vr.precio_costo_centavos as precio_costo_real_centavos
  from ventas_revendedor vr
  where vr.lote_id is null
), demanda_off as (
  select d_1.origen, d_1.documento_id, d_1.fecha, d_1.created_at, d_1.orden_id, d_1.producto_id,
    d_1.cantidad, d_1.vendedor_id, d_1.feria_id, d_1.precio_unitario_centavos, d_1.precio_costo_real_centavos,
    coalesce(sum(d_1.cantidad) over (
      partition by d_1.producto_id order by d_1.fecha, d_1.created_at, d_1.orden_id
      rows between unbounded preceding and 1 preceding
    ), 0::bigint) as offset_previo
  from demanda_sin_lote d_1
), demanda_con_frontera as (
  select d_1.origen, d_1.documento_id, d_1.fecha, d_1.created_at, d_1.orden_id, d_1.producto_id,
    d_1.cantidad, d_1.vendedor_id, d_1.feria_id, d_1.precio_unitario_centavos, d_1.precio_costo_real_centavos,
    d_1.offset_previo,
    coalesce((
      select max(lcr.fin_posicion) from lote_capacidad_rango lcr
      where lcr.producto_id = d_1.producto_id and lcr.fecha <= d_1.fecha
    ), 0::bigint) as frontera,
    greatest(least(d_1.offset_previo + d_1.cantidad, coalesce((
      select max(lcr.fin_posicion) from lote_capacidad_rango lcr
      where lcr.producto_id = d_1.producto_id and lcr.fecha <= d_1.fecha
    ), 0::bigint)) - d_1.offset_previo, 0::bigint) as cantidad_satisfecha
  from demanda_off d_1
), sin_lote_resuelto as (
  select d_1.origen, d_1.documento_id, d_1.fecha, d_1.producto_id, lcr.lote_id, d_1.vendedor_id,
    d_1.feria_id, d_1.precio_unitario_centavos, d_1.precio_costo_real_centavos,
    (least(d_1.offset_previo + d_1.cantidad_satisfecha, lcr.fin_posicion)
      - greatest(d_1.offset_previo, lcr.offset_previo))::integer as cantidad,
    true as costo_estimado
  from demanda_con_frontera d_1
  join lote_capacidad_rango lcr
    on lcr.producto_id = d_1.producto_id
   and lcr.offset_previo < (d_1.offset_previo + d_1.cantidad_satisfecha)
   and lcr.fin_posicion > d_1.offset_previo
  where d_1.cantidad_satisfecha > 0
), sin_lote_no_resuelto as (
  select d_1.origen, d_1.documento_id, d_1.fecha, d_1.producto_id, null::uuid as lote_id, d_1.vendedor_id,
    d_1.feria_id, d_1.precio_unitario_centavos, d_1.precio_costo_real_centavos,
    (d_1.cantidad - d_1.cantidad_satisfecha)::integer as cantidad,
    true as costo_estimado
  from demanda_con_frontera d_1
  where (d_1.cantidad - d_1.cantidad_satisfecha) > 0
), sin_lote_agregado as (
  select s.origen, s.documento_id, s.fecha, s.producto_id, s.lote_id, s.vendedor_id, s.feria_id,
    s.precio_unitario_centavos, s.precio_costo_real_centavos, s.cantidad, s.costo_estimado
  from sin_lote_resuelto s
  union all
  select s.origen, s.documento_id, s.fecha, s.producto_id, s.lote_id, s.vendedor_id, s.feria_id,
    s.precio_unitario_centavos, s.precio_costo_real_centavos, s.cantidad, s.costo_estimado
  from sin_lote_no_resuelto s
), con_lote as (
  select 'comprobante'::text as origen, ci.comprobante_id as documento_id, c.fecha, ci.producto_id,
    ci.lote_id, c.vendedor_id, c.feria_id, ci.precio_unitario_centavos,
    null::bigint as precio_costo_real_centavos, ci.cantidad, false as costo_estimado
  from comprobante_items ci
  join comprobantes c on c.id = ci.comprobante_id
  where ci.lote_id is not null
  union all
  select 'revendedor'::text as origen, vr.id as documento_id, vr.fecha, vr.producto_id,
    vr.lote_id, vr.vendedor_id, null::uuid as feria_id, vr.precio_venta_centavos as precio_unitario_centavos,
    vr.precio_costo_centavos as precio_costo_real_centavos, vr.cantidad, false as costo_estimado
  from ventas_revendedor vr
  where vr.lote_id is not null
), todas as (
  select c.origen, c.documento_id, c.fecha, c.producto_id, c.lote_id, c.vendedor_id, c.feria_id,
    c.precio_unitario_centavos, c.precio_costo_real_centavos, c.cantidad, c.costo_estimado
  from con_lote c
  union all
  select s.origen, s.documento_id, s.fecha, s.producto_id, s.lote_id, s.vendedor_id, s.feria_id,
    s.precio_unitario_centavos, s.precio_costo_real_centavos, s.cantidad, s.costo_estimado
  from sin_lote_agregado s
), costo_seguro as (
  select v_costo_lote_desglose.lote_id, v_costo_lote_desglose.producto_id,
    case when v_costo_lote_desglose.tiene_costos then v_costo_lote_desglose.costo_unitario_centavos
         else null::bigint end as costo_produccion_unitario_centavos,
    case when v_costo_lote_desglose.tiene_costos then v_costo_lote_desglose.costo_ananja_centavos
         else null::bigint end as costo_ananja_unitario_centavos
  from v_costo_lote_desglose
), costo_venta_revendedor as (
  -- Por venta de revendedora, por botella: lo que es de Ananja y lo que es
  -- del encargado (ver § 7 en la cabecera). Encargado = el ACTUAL de la
  -- revendedora, admin activo y distinto de ella.
  select
    c.venta_id,
    c.costo_lote_incompleto,
    case
      when c.costo_lote_incompleto or enc.id is null then c.cobrado_unitario_centavos
      else least(c.cobrado_unitario_centavos, c.costo_lote_unitario_centavos)
    end as ananja_unitario_centavos,
    case
      when c.costo_lote_incompleto then null::bigint
      when enc.id is null then 0::bigint
      else greatest(c.cobrado_unitario_centavos - c.costo_lote_unitario_centavos, 0::bigint)
    end as encargado_unitario_centavos
  from v_costo_lote_venta c
  join vendedores yo on yo.id = c.vendedor_id
  left join vendedores enc
    on enc.id = yo.encargado_id
   and enc.rol = 'admin'
   and enc.activo
   and enc.id <> yo.id
)
select
  t.origen,
  t.documento_id,
  t.fecha,
  t.vendedor_id,
  t.feria_id,
  t.producto_id,
  t.lote_id,
  t.cantidad,
  d.costo_produccion_unitario_centavos,
  d.costo_ananja_unitario_centavos,
  t.precio_unitario_centavos as precio_unitario_venta_centavos,
  t.costo_estimado,
  case
    when t.origen = 'revendedor'::text then cv.ananja_unitario_centavos * t.cantidad
    when d.costo_ananja_unitario_centavos is not null then d.costo_ananja_unitario_centavos * t.cantidad
    else null::bigint
  end as ingreso_ananja_centavos,
  case
    when t.origen = 'revendedor'::text then
      case
        when cv.costo_lote_incompleto then null::bigint
        when cv.ananja_unitario_centavos is not null and d.costo_produccion_unitario_centavos is not null
          then (cv.ananja_unitario_centavos - d.costo_produccion_unitario_centavos) * t.cantidad
        else null::bigint
      end
    when d.costo_ananja_unitario_centavos is not null and d.costo_produccion_unitario_centavos is not null
      then (d.costo_ananja_unitario_centavos - d.costo_produccion_unitario_centavos) * t.cantidad
    else null::bigint
  end as margen_ananja_centavos,
  case
    when t.origen = 'revendedor'::text then
      case
        when t.precio_unitario_centavos is not null and t.precio_costo_real_centavos is not null
          then (t.precio_unitario_centavos - t.precio_costo_real_centavos) * t.cantidad
        else null::bigint
      end
    when t.precio_unitario_centavos is not null and d.costo_ananja_unitario_centavos is not null
      then (t.precio_unitario_centavos - d.costo_ananja_unitario_centavos) * t.cantidad
    else null::bigint
  end as margen_vendedor_centavos,
  case
    when t.origen = 'revendedor'::text then cv.encargado_unitario_centavos * t.cantidad
    else 0::bigint
  end as margen_encargado_centavos
from todas t
left join costo_seguro d on d.lote_id = t.lote_id and d.producto_id = t.producto_id
left join costo_venta_revendedor cv on t.origen = 'revendedor'::text and cv.venta_id = t.documento_id;

alter view v_margen_ventas set (security_invoker = true);

-- ─── § 8 v_cobranza_lote ──────────────────────────────────────────────────
-- Recreada desde pg_get_viewdef de prod (0040). Mismas columnas; solo
-- cambia esperado_por_vendidas_centavos (espejo: lib/costos-lote.ts §
-- calcularCobranzaLote).

create or replace view v_cobranza_lote as
with vendidas_brutas as (
  select movimientos_stock.lote_id, movimientos_stock.producto_id, sum(movimientos_stock.cantidad) as unidades
  from movimientos_stock
  where movimientos_stock.tipo = 'egreso'::tipo_movimiento
    and movimientos_stock.lote_id is not null
    and movimientos_stock.motivo = 'venta'::text
  group by movimientos_stock.lote_id, movimientos_stock.producto_id
), devoluciones as (
  select movimientos_stock.lote_id, movimientos_stock.producto_id, sum(movimientos_stock.cantidad) as unidades
  from movimientos_stock
  where movimientos_stock.tipo = 'ingreso'::tipo_movimiento
    and movimientos_stock.lote_id is not null
    and movimientos_stock.entrega_id is not null
  group by movimientos_stock.lote_id, movimientos_stock.producto_id
), perdidas as (
  select v_perdidas_lote.lote_id, v_perdidas_lote.producto_id, sum(v_perdidas_lote.unidades) as unidades
  from v_perdidas_lote
  group by v_perdidas_lote.lote_id, v_perdidas_lote.producto_id
), netas as (
  select d_1.lote_id, d_1.producto_id,
    greatest(coalesce(vb.unidades, 0::bigint) - coalesce(dv.unidades, 0::bigint), 0::bigint) as vendidas
  from v_costo_lote_desglose d_1
  left join vendidas_brutas vb on vb.lote_id = d_1.lote_id and vb.producto_id = d_1.producto_id
  left join devoluciones dv on dv.lote_id = d_1.lote_id and dv.producto_id = d_1.producto_id
)
select
  d.lote_id,
  d.producto_id,
  d.producto_nombre,
  d.presentacion_ml,
  d.cantidad as producidas,
  n.vendidas,
  coalesce(p.unidades, 0::numeric) as perdidas,
  coalesce(sp.quedan, 0::numeric) as en_deposito,
  d.costo_ananja_centavos,
  d.costo_ananja_centavos::numeric * (d.cantidad::numeric - coalesce(p.unidades, 0::numeric)) as esperado_total_centavos,
  (d.costo_ananja_centavos::numeric * n.vendidas::numeric)::bigint as esperado_por_vendidas_centavos
from v_costo_lote_desglose d
join netas n on n.lote_id = d.lote_id and n.producto_id = d.producto_id
left join perdidas p on p.lote_id = d.lote_id and p.producto_id = d.producto_id
left join v_stock_por_lote sp on sp.lote_id = d.lote_id and sp.producto_id = d.producto_id;

alter view v_cobranza_lote set (security_invoker = true);

-- ─── § 9 RPC: pagarle la diferencia a un encargado ────────────────────────
-- Un gasto "Diferencias de encargados" con encargado_beneficiario_id. El
-- medio sale de la Cuenta Ananja (mercado_pago / banco) o, en efectivo, de
-- la plata en mano de quien lo registra (gastos.vendedor_id = ese admin).
-- Errores: NO_AUTORIZADO, ENCARGADO_INVALIDO, PAGO_PROPIO (nadie registra un
-- pago a sí mismo), MONTO_INVALIDO, MEDIO_INVALIDO, FECHA_INVALIDA,
-- FECHA_FUTURA (fecha de Argentina), MONTO_MAYOR_A_DEUDA (detail
-- {saldo_centavos}; se saltea con p_forzar = true). El saldo se lee con el
-- encargado bloqueado: dos pagos simultáneos no pasan los dos el tope.
-- Devuelve {gasto_id, saldo_centavos (lo que queda debiendo)}.

create or replace function registrar_pago_diferencia_encargado(
  p_encargado_id uuid,
  p_monto_centavos bigint,
  p_medio_pago medio_pago,
  p_fecha date,
  p_nota text default null,
  p_forzar boolean default false
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_admin_id uuid;
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_nombre text;
  v_saldo bigint;
  v_categoria_id uuid;
  v_gasto_id uuid;
  v_nota text;
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;
  v_admin_id := __SCHEMA__.mi_vendedor_id();

  if p_encargado_id is null then
    raise exception 'ENCARGADO_INVALIDO';
  end if;

  if p_encargado_id = v_admin_id then
    raise exception 'PAGO_PROPIO';
  end if;

  select nombre into v_nombre
  from vendedores
  where id = p_encargado_id and rol = 'admin'
  for no key update;
  if not found then
    raise exception 'ENCARGADO_INVALIDO';
  end if;

  if p_monto_centavos is null or p_monto_centavos <= 0 then
    raise exception 'MONTO_INVALIDO';
  end if;

  if p_medio_pago is null then
    raise exception 'MEDIO_INVALIDO';
  end if;

  if p_fecha is null then
    raise exception 'FECHA_INVALIDA';
  end if;

  if p_fecha > v_hoy then
    raise exception 'FECHA_FUTURA';
  end if;

  select saldo_centavos into v_saldo
  from v_deuda_encargados
  where encargado_id = p_encargado_id;
  v_saldo := coalesce(v_saldo, 0);

  if p_monto_centavos > v_saldo and not coalesce(p_forzar, false) then
    raise exception 'MONTO_MAYOR_A_DEUDA'
      using detail = json_build_object('saldo_centavos', v_saldo)::text;
  end if;

  insert into categorias_gasto (nombre, es_costo_produccion, activa)
  values ('Diferencias de encargados', true, false)
  on conflict (nombre) do nothing;
  select id into v_categoria_id from categorias_gasto where nombre = 'Diferencias de encargados';

  v_nota := 'Diferencia de ' || v_nombre || coalesce(' · ' || nullif(btrim(p_nota), ''), '');

  insert into gastos (vendedor_id, monto_centavos, categoria_id, medio_pago, fecha, nota, encargado_beneficiario_id)
  values (v_admin_id, p_monto_centavos, v_categoria_id, p_medio_pago, p_fecha, v_nota, p_encargado_id)
  returning id into v_gasto_id;

  insert into notificaciones (tipo, titulo, detalle, referencia_id)
  values ('gasto_nuevo', 'Nuevo gasto registrado', v_nota, v_gasto_id);

  return json_build_object('gasto_id', v_gasto_id, 'saldo_centavos', v_saldo - p_monto_centavos);
end;
$$;

revoke execute on function registrar_pago_diferencia_encargado(uuid, bigint, medio_pago, date, text, boolean) from anon, public;
grant execute on function registrar_pago_diferencia_encargado(uuid, bigint, medio_pago, date, text, boolean) to authenticated;
