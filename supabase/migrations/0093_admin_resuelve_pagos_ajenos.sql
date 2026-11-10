-- 0093_admin_resuelve_pagos_ajenos.sql
--
-- QUÉ: `confirmar_pago_revendedor` y `rechazar_pago_revendedor` dejan de
-- bloquear a un admin cuando el pago informado va a OTRO admin. Se quita
-- ÚNICAMENTE el bloqueo `NO_AUTORIZADO` de "pago ajeno + destinatario = otro
-- admin activo" y lo que queda muerto por quitarlo (en `rechazar`, la lectura
-- del destinatario y sus tres variables; en `confirmar` no sobra nada: esa
-- lectura se sigue usando para decidir el tenedor). Misma firma, mismo cuerpo
-- en todo lo demás. NO se toca ningún chequeo de integridad de plata/stock
-- (PAGO_NO_ENCONTRADO, PAGO_YA_RESUELTO, MEDIO_INVALIDO, MOTIVO_REQUERIDO,
-- `es_admin()`), ni `registrar_pago_diferencia_encargado` (su PAGO_PROPIO es
-- otro flujo).
--
-- POR QUÉ: decisión del dueño (2026-11-10): "como admin tengo que poder
-- editar o eliminar todo, no solo lo que cargué yo". Hoy, si una revendedora
-- informa un pago a un encargado que es admin, el otro admin ve "Este pago lo
-- confirma X" y no puede resolverlo (ni confirmar ni rechazar).
--
-- A MANOS DE QUIÉN VA LA PLATA (no cambia): en `confirmar_pago_revendedor`,
-- `v_tenedor_id` sigue siendo `destinatario_id` cuando el destinatario es un
-- admin o coordinador activo, y solo si no (destinatario inactivo o de otro
-- rol) cae en el admin que confirma. Con destinatario null la vía sigue siendo
-- 'directo_cuenta' y el tenedor null. Quitar el bloqueo no toca esa lógica: un
-- admin que confirma un pago dado a otro admin NO se queda con la plata, la
-- tiene el destinatario (que la ve en "plata en manos"). La rendición queda a
-- nombre del admin que confirma (`admin_id`) y `resuelto_por` también.
--
-- PARTIDA: el cuerpo VIGENTE en producción (`pg_get_functiondef`, proyecto
-- uqgcixuvwyijvrzljjuz, 2026-11-10), no el de 0055 (la última migración que
-- las define; `docs/maquinas-de-estado.md` pasa a citar esta). Diferencias del
-- cuerpo de prod contra 0055: solo el nombre propio de un comentario. En prod
-- `search_path` figura como `'public'` (con comillas, así lo imprime
-- `pg_get_functiondef`; `proconfig` = `search_path=public`); acá va sin
-- comillas, que es la convención del repo (`render.mjs` no reescribe el
-- schema entrecomillado) y es equivalente.
--
-- PRIVILEGIOS: prod tiene `proacl` = {postgres=X, authenticated=X,
-- service_role=X} (sin anon ni public) para las dos; al final se repiten
-- explícitos `revoke ... from anon, public` y `grant ... to authenticated`.
--
-- ORDEN DE DESPLIEGUE: la UI nueva muestra el pago a todos los admins. Si el
-- código sale antes que esta migración, confirmar o rechazar un pago dado a
-- otro admin falla con `NO_AUTORIZADO` y la pantalla muestra un mensaje
-- genérico (no rompe). Conviene aplicar la migración primero o junto.
--
-- VERIFICACIÓN (solo lectura, después de aplicar):
--   select p.proname, p.prosecdef, p.proconfig, p.proacl::text,
--          pg_get_functiondef(p.oid) like '%v_destinatario_admin_activo and v_pago.destinatario_id <> v_admin_id%' as tiene_bloqueo
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('confirmar_pago_revendedor', 'rechazar_pago_revendedor');
--   -- esperado: prosecdef = true, proconfig = {search_path=public},
--   -- proacl = {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres},
--   -- tiene_bloqueo = false en las dos.
--
-- ROLLBACK: recrear las dos funciones reponiendo el bloque quitado.
-- En `confirmar_pago_revendedor`, en lugar del comentario nuevo de antes de
-- `v_via := ...`:
--
--   if v_pago.vendedor_id <> v_admin_id then
--     if v_destinatario_admin_activo and v_pago.destinatario_id <> v_admin_id then
--       raise exception 'NO_AUTORIZADO';
--     end if;
--   end if;
--
-- En `rechazar_pago_revendedor`, reponer las tres variables
-- (`v_destinatario_rol text; v_destinatario_activo_col boolean;
-- v_destinatario_admin_activo boolean;`) y, antes del `update`:
--
--   if v_pago.destinatario_id is not null then
--     select rol, activo into v_destinatario_rol, v_destinatario_activo_col
--     from vendedores where id = v_pago.destinatario_id;
--   end if;
--   v_destinatario_admin_activo := v_destinatario_activo_col is true and v_destinatario_rol = 'admin';
--   if v_pago.vendedor_id <> v_admin_id then
--     if v_destinatario_admin_activo and v_pago.destinatario_id <> v_admin_id then
--       raise exception 'NO_AUTORIZADO';
--     end if;
--   end if;

create or replace function public.confirmar_pago_revendedor(p_pago_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_pago pagos_revendedor%rowtype;
  v_destinatario_rol text;
  v_destinatario_activo_col boolean;
  v_destinatario_admin_activo boolean;
  v_destinatario_coordinador_activo boolean;
  v_tenedor_valido boolean;
  v_via text;
  v_tenedor_id uuid;
  v_rendicion_id uuid;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;
  v_admin_id := public.mi_vendedor_id();

  select * into v_pago from pagos_revendedor where id = p_pago_id for update;
  if not found then
    raise exception 'PAGO_NO_ENCONTRADO';
  end if;

  if v_pago.estado <> 'pendiente' then
    raise exception 'PAGO_YA_RESUELTO';
  end if;

  if v_pago.destinatario_id is not null then
    select rol, activo into v_destinatario_rol, v_destinatario_activo_col
    from vendedores where id = v_pago.destinatario_id;
  end if;
  v_destinatario_admin_activo := v_destinatario_activo_col is true and v_destinatario_rol = 'admin';
  v_destinatario_coordinador_activo := v_destinatario_activo_col is true and v_destinatario_rol = 'coordinador';
  v_tenedor_valido := v_destinatario_admin_activo or v_destinatario_coordinador_activo;

  -- Cualquier admin puede confirmar cualquier pago pendiente, sea de quien sea y
  -- vaya a quien vaya (decisión del dueño, 2026-11-10: un admin puede todo).
  -- La plata NO cambia de manos: si el destinatario es un admin o un
  -- coordinador activo, el tenedor sigue siendo ese destinatario (abajo), no
  -- quien aprieta el botón.

  v_via := case when v_pago.destinatario_id is null then 'directo_cuenta' else 'encargado' end;

  if v_via <> 'encargado' and v_pago.medio_pago = 'efectivo' then
    raise exception 'MEDIO_INVALIDO';
  end if;

  v_tenedor_id := case
    when v_via <> 'encargado' then null
    when v_tenedor_valido then v_pago.destinatario_id
    else v_admin_id
  end;

  insert into rendiciones (vendedor_id, monto_centavos, medio_pago, fecha, nota, admin_id, via, tenedor_id)
  values (
    v_pago.vendedor_id, v_pago.monto_centavos, v_pago.medio_pago, v_pago.fecha,
    coalesce(v_pago.nota, 'Pago informado desde la app'), v_admin_id, v_via, v_tenedor_id
  )
  returning id into v_rendicion_id;

  update pagos_revendedor set
    estado = 'confirmado',
    rendicion_id = v_rendicion_id,
    resuelto_por = v_admin_id,
    resuelto_en = now()
  where id = p_pago_id;

  return json_build_object('id', p_pago_id, 'rendicion_id', v_rendicion_id, 'via', v_via, 'tenedor_id', v_tenedor_id);
end;
$$;

create or replace function public.rechazar_pago_revendedor(p_pago_id uuid, p_motivo text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_pago pagos_revendedor%rowtype;
  v_motivo text;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;
  v_admin_id := public.mi_vendedor_id();

  v_motivo := nullif(btrim(p_motivo), '');
  if v_motivo is null then
    raise exception 'MOTIVO_REQUERIDO';
  end if;

  select * into v_pago from pagos_revendedor where id = p_pago_id for update;
  if not found then
    raise exception 'PAGO_NO_ENCONTRADO';
  end if;

  if v_pago.estado <> 'pendiente' then
    raise exception 'PAGO_YA_RESUELTO';
  end if;

  -- Cualquier admin puede rechazar cualquier pago pendiente (decisión del
  -- dueño, 2026-11-10: un admin puede todo). Rechazar no mueve plata.

  update pagos_revendedor set
    estado = 'rechazado',
    motivo_rechazo = v_motivo,
    resuelto_por = v_admin_id,
    resuelto_en = now()
  where id = p_pago_id;

  return json_build_object('id', p_pago_id);
end;
$$;

revoke execute on function public.confirmar_pago_revendedor(uuid) from anon, public;
grant execute on function public.confirmar_pago_revendedor(uuid) to authenticated;

revoke execute on function public.rechazar_pago_revendedor(uuid, text) from anon, public;
grant execute on function public.rechazar_pago_revendedor(uuid, text) to authenticated;
