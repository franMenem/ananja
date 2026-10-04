-- Ananja: poder eliminar un depósito ("pasar a la cuenta") cargado por error.
--
-- `depositos_cuenta` solo tiene policy de select (0037) y no había RPC para
-- borrar: un depósito mal cargado (por ejemplo, a nombre de la persona
-- equivocada) quedaba para siempre. Mismo criterio que `eliminar_ajuste_caja`
-- (0034): una RPC `security definer` gateada por `es_admin()` que borra la
-- fila entera; nada de update/delete directo por REST.
--
-- Borrar el depósito revierte su efecto de forma automática, porque
-- `v_plata_en_manos` y `v_cuenta_ananja` lo calculan a partir de las filas
-- de `depositos_cuenta`: la plata vuelve a figurar en manos de quien la
-- tenía y deja de contar en la cuenta destino.
--
-- Un depósito que nació de un aviso de coordinador confirmado
-- (`depositos_informados.deposito_id`, 0057, FK sin `on delete`) no se puede
-- borrar: dejaría el aviso apuntando a la nada (y la FK lo impide igual).
-- Se avisa con un error claro (`DEPOSITO_CON_AVISO`) en vez de dejar que
-- salte la violación de FK.
--
-- Errores: `NO_AUTORIZADO` (no es admin), `DEPOSITO_INVALIDO` (no existe),
-- `DEPOSITO_CON_AVISO` (viene de un aviso confirmado).
--
-- Migración sin templating (mismo criterio que 0049-0069): hardcodea
-- `public.`. `set search_path = public` va SIN comillas a propósito: con
-- comillas rompe el render multi-schema (supabase/render.mjs).

create function public.eliminar_deposito_cuenta(p_deposito_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if not exists (select 1 from public.depositos_cuenta where id = p_deposito_id) then
    raise exception 'DEPOSITO_INVALIDO';
  end if;

  if exists (select 1 from public.depositos_informados where deposito_id = p_deposito_id) then
    raise exception 'DEPOSITO_CON_AVISO';
  end if;

  delete from public.depositos_cuenta where id = p_deposito_id;

  return json_build_object('deposito_id', p_deposito_id);
end;
$$;

revoke execute on function public.eliminar_deposito_cuenta(uuid) from anon, public;
grant execute on function public.eliminar_deposito_cuenta(uuid) to authenticated;
