-- Ananja/Germá: fecha propia en ajustes_caja
--
-- Reporte del dueño: "no puedo ajustar saldo con fecha, porque el ajuste de
-- saldo es cuando iniciamos con Ananja" — el saldo inicial real del negocio
-- se carga HOY vía "Ajustar saldo"/"Corregir saldo", pero sin una `fecha`
-- propia (separada de `created_at`) queda registrado como si el ajuste
-- hubiera pasado hoy, no en la fecha real en que arrancó el negocio.
--
-- `gastos`, `comprobantes`, `deudas`/`pagos_deuda`, `transferencias_caja`,
-- `rendiciones` y `cobros` ya tienen esa distinción (`fecha date` propia,
-- separada de `created_at timestamptz`, con `p_fecha date default null` ->
-- `coalesce(p_fecha, current_date)` en su RPC de alta) — `ajustes_caja` era
-- la única tabla de Caja sin ese campo. Ver supabase/README.md para la
-- convención templated (__SCHEMA__/__BUCKET__) de este proyecto multi-negocio.
--
-- Migración templated (__SCHEMA__, sin __BUCKET__ — no toca Storage). Sin
-- bloques @solo-public: nada de esta migración es específica de un negocio.
--
-- Alcance:
--  1. ajustes_caja.fecha date not null default current_date, backfilleada
--     desde created_at para las filas existentes (hoy: una sola fila en
--     prod, "Cuenta principal" en mercado_pago, creada hoy — el backfill le
--     asigna la fecha de hoy, la misma que ya tenía; si el dueño quiere que
--     ese ajuste puntual quede con la fecha real de inicio del negocio,
--     hace falta un UPDATE manual aparte, ver README de este chunk / reporte
--     final).
--  2. crear_ajuste_caja: se le agrega p_fecha date default null (nuevo
--     parámetro, al final de la lista) -> coalesce(p_fecha, current_date),
--     mismo criterio que el resto de las RPCs de alta. Postgres NO trata
--     esto como un simple `create or replace` sobre la firma existente: al
--     cambiar el conjunto de tipos de parámetros de entrada (3 -> 4), un
--     `create or replace function crear_ajuste_caja(medio_pago, bigint,
--     text, date default null)` crearía una SEGUNDA función (sobrecarga)
--     en vez de reemplazar la de 3 parámetros — y con eso, una llamada con
--     los 3 argumentos de siempre (medio_pago, bigint, text) queda
--     AMBIGUA entre "la de 3 parámetros" y "la de 4 con el default
--     aplicado", y Postgres la rechaza (`function ... is not unique`). Por
--     eso, mismo patrón que usaron 0007/0009/0010/0011/0015/0025 al
--     cambiar la firma de una RPC: DROP de la función de 3 parámetros +
--     CREATE de la de 4 — así queda una sola función, sin ambigüedad, y los
--     callers que no pasan p_fecha (ninguno hoy) seguirían andando igual.

-- ------------------------------------------------------------
-- 1) ajustes_caja.fecha
-- ------------------------------------------------------------

alter table ajustes_caja add column fecha date;
update ajustes_caja set fecha = created_at::date;
alter table ajustes_caja alter column fecha set not null;
alter table ajustes_caja alter column fecha set default current_date;

-- ------------------------------------------------------------
-- 2) crear_ajuste_caja: + p_fecha date default null
-- ------------------------------------------------------------

drop function if exists crear_ajuste_caja(medio_pago, bigint, text);

create function crear_ajuste_caja(
  p_medio_pago medio_pago,
  p_monto_centavos bigint,
  p_nota text,
  p_fecha date default null
)
returns json
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_vendedor_id uuid;
  v_ajuste_id uuid;
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select id into v_vendedor_id from vendedores where user_id = auth.uid();
  if v_vendedor_id is null then
    raise exception 'VENDEDOR_NO_REGISTRADO';
  end if;

  if p_nota is null or btrim(p_nota) = '' then
    raise exception 'NOTA_REQUERIDA';
  end if;

  if p_monto_centavos is null or p_monto_centavos = 0 then
    raise exception 'MONTO_INVALIDO';
  end if;

  insert into ajustes_caja (medio_pago, monto_centavos, nota, vendedor_id, fecha)
  values (p_medio_pago, p_monto_centavos, p_nota, v_vendedor_id, coalesce(p_fecha, current_date))
  returning id into v_ajuste_id;

  return json_build_object('ajuste_id', v_ajuste_id);
end;
$$;

revoke execute on function crear_ajuste_caja(medio_pago, bigint, text, date) from anon, public;
grant execute on function crear_ajuste_caja(medio_pago, bigint, text, date) to authenticated;

-- Nota: v_saldos_caja (0002_views_rpcs.sql) suma ajustes_caja.monto_centavos
-- sin filtrar/ordenar por fecha — el saldo no depende de esta columna, así
-- que la vista queda sin cambios a propósito.
