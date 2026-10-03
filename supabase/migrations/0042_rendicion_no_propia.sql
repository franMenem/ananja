-- Ananja: un admin no puede registrar un pago (rendición) a su propio
-- nombre. Un admin con espacio de revendedor que rinde plata tiene que
-- pedirle a OTRO admin que se lo registre — si no, el mismo que debe es el
-- que da por recibida la plata.
--
-- registrar_rendicion: recreada desde la definición ACTUAL de prod (0040,
-- misma firma, security definer, search_path, guard es_admin() y grants).
-- Único cambio: justo después de `v_admin_id := mi_vendedor_id();`, si
-- p_vendedor_id es el propio admin → raise 'PAGO_PROPIO' (la UI lo traduce
-- en components/revendedores/rendicion-form.tsx).
--
-- SIN APLICAR: se aplica en prod `public` solo con el OK de Fran.

create or replace function registrar_rendicion(
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

  if p_vendedor_id = v_admin_id then
    raise exception 'PAGO_PROPIO';
  end if;

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
  -- la base ANTES de 0037 (toda rendición acreditaba su medio_pago tal
  -- cual, sin distinción de via).
  v_via := coalesce(p_via, case when p_medio_pago = 'efectivo' then 'encargado' else 'directo_cuenta' end);

  if v_via not in ('encargado', 'directo_cuenta', 'cliente_directo') then
    raise exception 'VIA_INVALIDA';
  end if;

  if v_via <> 'encargado' and p_medio_pago = 'efectivo' then
    raise exception 'MEDIO_INVALIDO';
  end if;

  if v_via = 'encargado' then
    select enc.id into v_encargado_id
    from vendedores yo
    join vendedores enc on enc.id = yo.encargado_id
    where yo.id = p_vendedor_id and enc.rol = 'admin' and enc.activo;
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
