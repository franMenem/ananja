-- 0091_eliminar_movimientos.sql
--
-- MIGRACIÓN ADITIVA. Agrega las funciones (RPC) para poder DESHACER desde la
-- app cuatro cosas que hoy quedan para siempre una vez cargadas. No toca
-- datos, no cambia ninguna función existente, no revoca nada.
--
--   eliminar_transferencia_caja(p_transferencia_id)  borra una transferencia entre cajas
--   eliminar_deuda(p_deuda_id)                       borra una deuda cargada a mano
--   reabrir_deuda(p_deuda_id)                        deshace "Marcar saldada sin pago"
--   eliminar_ajuste_insumo(p_movimiento_id)          borra un ajuste manual de insumo
--
-- (Eliminar un pago de deuda y un cobro ya tienen RPC desde antes:
-- `eliminar_pago_deuda` 0027 y `eliminar_cobro` 0025. Esta migración no las
-- toca: lo que faltaba era el botón en la lista de movimientos de Plata.)
--
-- ── Por qué borrar la fila alcanza ───────────────────────────────────────
-- Verificado en producción (schema `public`, solo lectura de catálogos):
--   * `transferencias_caja`, `deudas`, `pagos_deuda` y `movimientos_insumo`
--     NO tienen triggers (ninguno propio), así que `security definer` no se
--     saltea nada que antes corriera.
--   * Los saldos se CALCULAN sumando filas, no hay total guardado:
--     `v_saldos_caja` (transferencias: resta en origen, suma en destino),
--     `v_plata_en_manos` (el lado efectivo es de quien la cargó),
--     `v_saldo_deuda` (pagado = suma de pagos), `v_stock_insumos` y
--     `v_tanque_aceite` (suma de ingresos - egresos de `movimientos_insumo`).
--     Borrar la fila revierte todo solo.
--   * Ninguna tabla tiene FK hacia `transferencias_caja` ni hacia
--     `movimientos_insumo`. `pagos_deuda.deuda_id` referencia a `deudas` con
--     ON DELETE CASCADE (por eso `eliminar_deuda` rechaza si hay pagos: no se
--     deben perder pagos, y con ellos plata de las cajas, en silencio).
--
-- Criterio de respaldo: igual que `eliminar_cobro`, `eliminar_pago_deuda`,
-- `eliminar_deposito_cuenta` y `eliminar_ajuste_caja` (que no archivan lo
-- borrado), estas funciones NO crean tablas de respaldo.
--
-- ── Reglas ───────────────────────────────────────────────────────────────
-- Todas: solo admin (`NO_AUTORIZADO`), lock `for update` de la fila antes de
-- decidir.
--
-- eliminar_transferencia_caja
--   TRANSFERENCIA_NO_ENCONTRADA   no existe (id null o ya borrada).
--   SALDO_INSUFICIENTE            si al borrarla la caja DESTINO quedaría en
--                                 negativo (esa plata ya se gastó o se
--                                 movió). `detail` trae {destino, disponible}
--                                 como `registrar_transferencia_caja`.
--   Efecto: los centavos vuelven a la caja origen (si era efectivo, a las
--   manos de quien la cargó) y salen de la caja destino.
--
-- eliminar_deuda
--   DEUDA_NO_ENCONTRADA   no existe.
--   DEUDA_DE_PEDIDO       tiene `lote_id`: la mantiene
--                         `sincronizar_deuda_aceite_lote` (0081) desde el
--                         pedido; se corrige ahí.
--   DEUDA_CON_PAGOS       tiene pagos: primero hay que eliminar sus pagos.
--   Efecto: la deuda desaparece de Pendientes/Saldadas. No mueve plata
--   (sin pagos no hay nada en las cajas).
--
-- reabrir_deuda
--   DEUDA_NO_ENCONTRADA   no existe.
--   DEUDA_DE_PEDIDO       ídem eliminar_deuda.
--   DEUDA_NO_SALDADA      no está saldada (`saldada_en` null).
--   DEUDA_PAGADA_COMPLETA los pagos ya cubren el monto: ahí "saldada" es
--                         consecuencia de los pagos (se deshace borrando un
--                         pago, que ya reabre sola).
--   Efecto: `saldada_en = null`; la deuda vuelve a Pendientes con su saldo.
--   No mueve plata.
--
-- eliminar_ajuste_insumo
--   MOVIMIENTO_INVALIDO     no existe.
--   MOVIMIENTO_NO_MANUAL    tiene `gasto_id` o `lote_id` (compra o consumo
--                           de un pedido): se corrige borrando el gasto o
--                           desde el pedido. Los únicos movimientos sin
--                           ninguno de los dos son los de `ajustar_insumo`
--                           (verificado: `registrar_compra_insumo`,
--                           `registrar_compra_insumos_factura` y `crear_lote`
--                           siempre mandan uno de los dos).
--   STOCK_INSUFICIENTE      el ajuste era un ingreso y, sin él, el stock del
--                           insumo quedaría negativo. Borrar un egreso
--                           siempre sube el stock, nunca da este error.
--   Efecto: el stock del insumo se recalcula sin ese ajuste.
--
-- Compatibilidad con el código desplegado: solo agrega funciones. Si el código
-- nuevo sale antes que esta migración, los botones nuevos devuelven el mensaje
-- genérico de error ("No se pudo eliminar...") porque la función todavía no
-- existe; ninguna pantalla se rompe.
--
-- Migración sin templating (mismo criterio que 0049-0090): hardcodea
-- `public.`. `set search_path = public` va SIN comillas a propósito: con
-- comillas rompe el render multi-schema (supabase/render.mjs).
--
-- ── Verificación posterior (SOLO LECTURA) ────────────────────────────────
--   select p.oid::regprocedure as firma, p.prosecdef, p.proconfig, p.proacl::text
--     from pg_proc p
--    where p.pronamespace = 'public'::regnamespace
--      and p.proname in ('eliminar_transferencia_caja','eliminar_deuda',
--                        'reabrir_deuda','eliminar_ajuste_insumo')
--    order by 1;
--   -- esperado: 4 filas, una por función, prosecdef = true,
--   --   proconfig = {search_path=public}, proacl con postgres, authenticated y
--   --   service_role; sin anon ni PUBLIC (sin entrada "=X/...").
--
-- ── Rollback ─────────────────────────────────────────────────────────────
--   drop function public.eliminar_transferencia_caja(uuid);
--   drop function public.eliminar_deuda(uuid);
--   drop function public.reabrir_deuda(uuid);
--   drop function public.eliminar_ajuste_insumo(uuid);
--   (no hay datos que revertir: solo agrega funciones.)

-- ── 1) eliminar_transferencia_caja ───────────────────────────────────────
create function public.eliminar_transferencia_caja(p_transferencia_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transferencia public.transferencias_caja%rowtype;
  v_saldo_destino bigint;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select * into v_transferencia
  from public.transferencias_caja
  where id = p_transferencia_id
  for update;

  if not found then
    raise exception 'TRANSFERENCIA_NO_ENCONTRADA';
  end if;

  -- La caja destino perdería lo que esta transferencia le sumó: si eso la
  -- deja en negativo, esa plata ya se usó y no se puede deshacer sin romper
  -- el saldo.
  select saldo_centavos into v_saldo_destino
  from public.v_saldos_caja
  where medio_pago = v_transferencia.destino::text;

  if coalesce(v_saldo_destino, 0) - v_transferencia.monto_centavos < 0 then
    raise exception 'SALDO_INSUFICIENTE'
      using detail = json_build_object(
        'destino', v_transferencia.destino,
        'disponible', coalesce(v_saldo_destino, 0)
      )::text;
  end if;

  delete from public.transferencias_caja where id = v_transferencia.id;

  return json_build_object('id', v_transferencia.id);
end;
$$;

revoke all on function public.eliminar_transferencia_caja(uuid) from public, anon;
grant execute on function public.eliminar_transferencia_caja(uuid) to authenticated;

-- ── 2) eliminar_deuda ────────────────────────────────────────────────────
create function public.eliminar_deuda(p_deuda_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lote_id uuid;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select lote_id into v_lote_id
  from public.deudas
  where id = p_deuda_id
  for update;

  if not found then
    raise exception 'DEUDA_NO_ENCONTRADA';
  end if;

  if v_lote_id is not null then
    raise exception 'DEUDA_DE_PEDIDO';
  end if;

  -- El lock de la deuda frena un pago nuevo en simultáneo (el FK de
  -- pagos_deuda toma un lock compartido sobre esta fila).
  if exists (select 1 from public.pagos_deuda where deuda_id = p_deuda_id) then
    raise exception 'DEUDA_CON_PAGOS';
  end if;

  delete from public.deudas where id = p_deuda_id;

  return json_build_object('id', p_deuda_id);
end;
$$;

revoke all on function public.eliminar_deuda(uuid) from public, anon;
grant execute on function public.eliminar_deuda(uuid) to authenticated;

-- ── 3) reabrir_deuda ─────────────────────────────────────────────────────
create function public.reabrir_deuda(p_deuda_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deuda public.deudas%rowtype;
  v_pagado bigint;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select * into v_deuda
  from public.deudas
  where id = p_deuda_id
  for update;

  if not found then
    raise exception 'DEUDA_NO_ENCONTRADA';
  end if;

  if v_deuda.lote_id is not null then
    raise exception 'DEUDA_DE_PEDIDO';
  end if;

  if v_deuda.saldada_en is null then
    raise exception 'DEUDA_NO_SALDADA';
  end if;

  select coalesce(sum(monto_centavos), 0) into v_pagado
  from public.pagos_deuda
  where deuda_id = p_deuda_id;

  if v_pagado >= v_deuda.monto_centavos then
    raise exception 'DEUDA_PAGADA_COMPLETA';
  end if;

  update public.deudas set saldada_en = null where id = p_deuda_id;

  return json_build_object('id', p_deuda_id);
end;
$$;

revoke all on function public.reabrir_deuda(uuid) from public, anon;
grant execute on function public.reabrir_deuda(uuid) to authenticated;

-- ── 4) eliminar_ajuste_insumo ────────────────────────────────────────────
create function public.eliminar_ajuste_insumo(p_movimiento_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mov public.movimientos_insumo%rowtype;
  v_stock numeric;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select * into v_mov
  from public.movimientos_insumo
  where id = p_movimiento_id
  for update;

  if not found then
    raise exception 'MOVIMIENTO_INVALIDO';
  end if;

  -- Manual = sin compra (gasto) ni consumo de pedido (lote). Ver cabecera.
  if v_mov.gasto_id is not null or v_mov.lote_id is not null then
    raise exception 'MOVIMIENTO_NO_MANUAL';
  end if;

  -- Un ingreso que se borra baja el stock: no puede dejarlo en negativo.
  -- Un egreso que se borra siempre lo sube.
  if v_mov.tipo = 'ingreso' then
    select coalesce(sum(case when tipo = 'ingreso' then cantidad else -cantidad end), 0)
      into v_stock
    from public.movimientos_insumo
    where insumo_id = v_mov.insumo_id;

    if v_stock - v_mov.cantidad < 0 then
      raise exception 'STOCK_INSUFICIENTE';
    end if;
  end if;

  delete from public.movimientos_insumo where id = v_mov.id;

  return json_build_object('id', v_mov.id);
end;
$$;

revoke all on function public.eliminar_ajuste_insumo(uuid) from public, anon;
grant execute on function public.eliminar_ajuste_insumo(uuid) to authenticated;
