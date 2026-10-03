-- Ananja: complemento de la migración 0011.
-- `feria_id` en gastos y movimientos_stock se podía escribir directo por
-- REST sin la validación de feria (existe y está abierta) que hacen los
-- RPC. Estos triggers aplican la misma regla en la tabla, para cualquier
-- vía de escritura. También bloquea editar precio/cantidad_llevada de
-- feria_productos cuando la feria está cerrada.

create function public.validar_feria_abierta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if new.feria_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.feria_id is not distinct from old.feria_id then
    return new;
  end if;

  select estado into v_estado from ferias where id = new.feria_id;
  if v_estado is null then
    raise exception 'FERIA_NO_ENCONTRADA';
  end if;
  if v_estado <> 'abierta' then
    raise exception 'FERIA_CERRADA';
  end if;

  return new;
end;
$$;

revoke execute on function public.validar_feria_abierta() from anon, authenticated, public;

create trigger trg_gastos_validar_feria
  before insert or update of feria_id on gastos
  for each row execute function public.validar_feria_abierta();

create trigger trg_movimientos_stock_validar_feria
  before insert or update of feria_id on movimientos_stock
  for each row execute function public.validar_feria_abierta();

create trigger trg_comprobantes_validar_feria
  before insert or update of feria_id on comprobantes
  for each row execute function public.validar_feria_abierta();

create function public.proteger_feria_productos_cerrada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  select estado into v_estado from ferias where id = new.feria_id;
  if v_estado <> 'abierta' then
    raise exception 'FERIA_CERRADA';
  end if;
  return new;
end;
$$;

revoke execute on function public.proteger_feria_productos_cerrada() from anon, authenticated, public;

create trigger trg_feria_productos_cerrada
  before update on feria_productos
  for each row execute function public.proteger_feria_productos_cerrada();
