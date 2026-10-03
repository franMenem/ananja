-- Ananja/Germá: fechas de negocio en horario argentino, no en `current_date`
-- del servidor.
--
-- Diagnóstico (con evidencia): Postgres en Supabase corre en UTC (`SHOW
-- timezone` -> 'UTC'). Dos funciones usan `current_date` del servidor para
-- grabar fechas de negocio, así que entre las 21:00 y las 23:59 hora
-- argentina (UTC−3, sin horario de verano) graban el día SIGUIENTE:
--
--  1. cerrar_feria(p_feria_id) — no recibe ningún parámetro de fecha, así
--     que `fecha_fin = coalesce(fecha_fin, current_date)` depende 100% del
--     reloj del servidor.
--  2. registrar_pago_deuda — el insert en pagos_deuda.fecha ya usa
--     `coalesce(p_fecha, current_date)` (el cliente siempre manda
--     p_fecha), pero el `update deudas set saldada_en = current_date`, al
--     saldar la deuda completa, IGNORA ese mismo p_fecha — saldada_en puede
--     quedar un día adelantado respecto al pagos_deuda.fecha de la misma
--     transacción.
--
-- Arreglo:
--  1. cerrar_feria: + p_fecha_fin date default null (nuevo, al final de la
--     lista) -> `coalesce(fecha_fin, p_fecha_fin, current_date)`. El
--     `default null` mantiene compatible cualquier caller que solo mande
--     p_feria_id (hoy ninguno debería depender de eso: lib/ferias.ts pasa a
--     mandar la fecha argentina explícita, ver más abajo). Cambia el
--     conjunto de tipos de parámetros (uuid -> uuid, date), así que, mismo
--     patrón que 0007/0009/0010/0011/0015/0025/0033 al cambiar la firma de
--     una RPC: DROP de la función de 1 parámetro + CREATE de la de 2 — un
--     `create or replace` a secas dejaría DOS sobrecargas coexistiendo
--     (uuid) y (uuid, date), y las llamadas con un solo argumento quedarían
--     ambiguas entre "la vieja" y "la nueva con el default aplicado".
--  2. registrar_pago_deuda: el update de saldada_en pasa a usar
--     `coalesce(p_fecha, current_date)`, reusando el mismo p_fecha que la
--     función ya recibe (no cambia la firma: alcanza `create or replace`).
--
-- Resto de ambos cuerpos, `security definer`, `set search_path`, chequeo de
-- admin (`es_admin()`) y `grant`/`revoke` quedan EXACTAMENTE iguales a la
-- última definición vigente de cada una (cerrar_feria: 0022_rpcs_solo_admin.sql;
-- registrar_pago_deuda: 0028_costos_por_lote.sql, que le agregó el lock
-- `for update` sobre 0027_pagos_deuda.sql) — confirmado leyendo esas dos
-- migraciones completas antes de escribir esta.
--
-- Migración templada (__SCHEMA__, sin __BUCKET__). Ver supabase/README.md.
-- Sin bloques @solo-public: nada de esta migración es específica de un
-- negocio.

-- ============================================================
-- 1) cerrar_feria: + p_fecha_fin date default null
-- ============================================================

drop function if exists cerrar_feria(uuid);

create function cerrar_feria(p_feria_id uuid, p_fecha_fin date default null)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_estado text;
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select estado into v_estado from ferias where id = p_feria_id;
  if v_estado is null then
    raise exception 'FERIA_NO_ENCONTRADA';
  end if;

  if v_estado = 'cerrada' then
    raise exception 'FERIA_YA_CERRADA';
  end if;

  perform set_config('ananja.cambio_estado', 'on', true);
  update ferias set estado = 'cerrada', fecha_fin = coalesce(fecha_fin, p_fecha_fin, current_date)
  where id = p_feria_id;

  return json_build_object('id', p_feria_id);
end;
$$;

revoke execute on function cerrar_feria(uuid, date) from anon, public;
grant execute on function cerrar_feria(uuid, date) to authenticated;

-- ============================================================
-- 2) registrar_pago_deuda: saldada_en usa el mismo p_fecha del pago, no
--    current_date. Misma firma que 0028 -> alcanza create or replace.
-- ============================================================

create or replace function registrar_pago_deuda(
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

  -- Mismo criterio que registrar_pago_lote: bloquea la fila de la deuda
  -- hasta el commit para serializar pagos concurrentes sobre la misma.
  perform 1 from deudas where id = p_deuda_id for update;

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
  -- por completo, la deuda queda saldada. `saldada_en` usa el mismo
  -- p_fecha que ya recibe la función (antes usaba current_date del
  -- servidor, que corre en UTC — podía quedar un día adelantado respecto
  -- al pagos_deuda.fecha de esta misma transacción).
  if v_restante_centavos - p_monto_centavos <= 0 then
    update deudas set saldada_en = coalesce(p_fecha, current_date) where id = p_deuda_id;
    v_saldada := true;
  end if;

  return json_build_object('id', v_pago_id, 'saldada', v_saldada);
end;
$$;

revoke execute on function registrar_pago_deuda(uuid, bigint, medio_pago, date, bigint, text) from anon, public;
grant execute on function registrar_pago_deuda(uuid, bigint, medio_pago, date, bigint, text) to authenticated;
