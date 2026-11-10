-- 0088_rpc_escrituras_2.sql
--
-- MIGRACIÓN A de la SEGUNDA TANDA (ADITIVA). Mismo método que la 0086/0087:
-- crea las funciones (RPC) por las que va a pasar TODA escritura de las
-- tablas que todavía se escriben por REST directo con el rol `authenticated`:
-- categorias_gasto, clientes, materiales_venta y productos (umbral_minimo).
-- No revoca nada, no cambia ninguna función existente y no toca datos: es
-- segura de aplicar ANTES de desplegar el código. La 0089 (migración B)
-- revoca los permisos de escritura directa y se aplica DESPUÉS de desplegar
-- el código nuevo.
--
-- ── Qué crea (todas `security definer`, `set search_path = public`) ──────
--   crear_categoria_gasto(p_nombre)                          -> fila de categorias_gasto
--   crear_cliente(p_nombre, p_telefono, p_direccion, p_email, p_nota)
--                                                            -> fila de clientes
--   editar_cliente(p_cliente_id, p_nombre, p_telefono, p_direccion, p_email,
--                  p_nota)
--   cambiar_estado_cliente(p_cliente_id, p_activo)
--   crear_material(p_titulo, p_cuerpo, p_orden, p_publicado)
--   actualizar_material(p_material_id, p_titulo, p_cuerpo, p_publicado)
--   eliminar_material(p_material_id)
--   reordenar_materiales(p_items)
--   actualizar_umbral_producto(p_producto_id, p_umbral_minimo)
--
-- Las que devuelven la fila (crear_categoria_gasto, crear_cliente) lo hacen
-- porque el cliente la necesita: la agrega a la lista de opciones y selecciona
-- su id sin recargar (antes `.insert().select().single()`).
--
-- ── Regla de acceso (de dónde sale cada una; policies vigentes en prod) ──
-- `es_vendedor()` está definida como `select public.es_admin()` y `es_admin()`
-- es "vendedores.user_id = auth.uid() and activo and rol = 'admin'" (ambas
-- verificadas con pg_get_functiondef). Por eso toda función exige
-- `public.es_admin()` y levanta 'NO_AUTORIZADO' si no. Como `security definer`
-- saltea RLS, el chequeo y lo que RLS/grants/triggers garantizaban se
-- reproducen explícitos:
--
--   categorias_gasto_insert  with check es_vendedor()  (grant insert: id, nombre,
--                            activa, es_costo_produccion)
--     -> crear_categoria_gasto: es_admin(); escribe SOLO nombre (activa y
--        es_costo_produccion quedan en sus defaults true/false: la app nunca los
--        manda y así una categoría nueva no puede nacer como "costo de
--        producción" por REST). Check de la tabla (nombre no vacío) y UNIQUE
--        (nombre) se validan con código propio: NOMBRE_INVALIDO /
--        CATEGORIA_DUPLICADA.
--   clientes_insert / clientes_update  es_vendedor()  + trigger set_updated_at
--     -> crear_cliente / editar_cliente / cambiar_estado_cliente: es_admin();
--        escriben solo nombre, telefono, direccion, email, nota (y `activo` la
--        última). Los textos opcionales vacíos pasan a null (igual que el
--        `.trim() || null` del formulario). El trigger de updated_at no mira
--        current_user, así que sigue corriendo dentro de la función. Los
--        clientes no se borran (no hay policy de delete): solo se da de baja.
--   materiales_venta_insert/update/delete  es_admin()  (select: es_admin o
--                            revendedor con `publicado`; no cambia)
--        + trigger forzar_actualizado_por_material (before insert/update)
--     -> crear_material / actualizar_material / eliminar_material /
--        reordenar_materiales: es_admin(). El trigger fija actualizado_por con
--        mi_vendedor_id() (que lee auth.uid(), igual dentro de una función
--        security definer) y no mira current_user: sigue corriendo y las
--        funciones no tocan esa columna. actualizar_material no toca `orden`
--        (solo cambia con reordenar_materiales, como hoy). reordenar_materiales
--        recibe [{id, orden}, ...] y los aplica TODOS en una transacción (antes
--        eran dos update sueltos desde el navegador y uno podía fallar a medias).
--        eliminar_material es idempotente (eliminado = false si ya no existe,
--        como el delete directo, que no daba error con 0 filas).
--   productos_update  using/check es_vendedor() + grant update(costo_centavos,
--                     umbral_minimo)
--     -> actualizar_umbral_producto: es_admin(); solo umbral_minimo (entero
--        >= 0, como productos_umbral_minimo_check). costo_centavos NO tiene
--        ninguna escritura en la app (no se crea RPC; la 0089 revoca el grant).
--
-- Errores: 'CODIGO' plano (mismo patrón que la 0086); el cliente los traduce con
-- traducirErrorRpc y conserva los mensajes de hoy. Cambio de comportamiento
-- chico: actualizar_material / editar_cliente / actualizar_umbral_producto sobre
-- una fila que ya no existe ahora dan error (MATERIAL_NO_ENCONTRADO,
-- CLIENTE_NO_ENCONTRADO, PRODUCTO_NO_ENCONTRADO) en vez de "guardar" en
-- silencio 0 filas; el cliente muestra el mismo mensaje de error de siempre.
--
-- ── Lo que NO se pasa a RPC (ver 0089) ───────────────────────────────────
--   push_subscriptions: ya tiene RPC desde la 0076 (guardar_suscripcion_push,
--     solo admin, dueño = auth.uid(), verificada en pg_proc); el único uso
--     directo que quedaba en el código era el camino de respaldo "si la función
--     todavía no existe", que se elimina en este mismo cambio. El borrado de
--     suscripciones vencidas (/api/push/send) usa la service role. No hace
--     falta ninguna función nueva.
--   cajas.update(saldo_inicial_centavos), productos.update(costo_centavos),
--   vendedores.update(nombre): ninguna pantalla ni acción de servidor con
--   sesión de usuario las escribe (el alta/rol de vendedores usa la service
--   role) -> solo se revocan en la 0089.
--
-- ── Verificación posterior (solo lectura) ────────────────────────────────
--   select proname, prosecdef, proconfig, proacl::text
--     from pg_proc
--    where pronamespace = 'public'::regnamespace
--      and proname in ('crear_categoria_gasto','crear_cliente','editar_cliente',
--                      'cambiar_estado_cliente','crear_material',
--                      'actualizar_material','eliminar_material',
--                      'reordenar_materiales','actualizar_umbral_producto')
--    order by 1;
--   -- esperado: 9 filas, prosecdef = true, proconfig = {search_path=public},
--   --   proacl con postgres, authenticated y service_role; sin anon ni PUBLIC.
--
-- ── Rollback ─────────────────────────────────────────────────────────────
--   drop function public.crear_categoria_gasto(text);
--   drop function public.crear_cliente(text, text, text, text, text);
--   drop function public.editar_cliente(uuid, text, text, text, text, text);
--   drop function public.cambiar_estado_cliente(uuid, boolean);
--   drop function public.crear_material(text, text, integer, boolean);
--   drop function public.actualizar_material(uuid, text, text, boolean);
--   drop function public.eliminar_material(uuid);
--   drop function public.reordenar_materiales(jsonb);
--   drop function public.actualizar_umbral_producto(uuid, integer);
--   (solo si la 0089 NO se aplicó; si se aplicó, revertir primero la 0089.)

-- ── 1) crear_categoria_gasto ─────────────────────────────────────────────
create function public.crear_categoria_gasto(
  p_nombre text
)
returns public.categorias_gasto
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
  v_fila public.categorias_gasto%rowtype;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  v_nombre := btrim(coalesce(p_nombre, ''));
  if v_nombre = '' then
    raise exception 'NOMBRE_INVALIDO';
  end if;

  begin
    insert into public.categorias_gasto (nombre)
    values (v_nombre)
    returning * into v_fila;
  exception when unique_violation then
    raise exception 'CATEGORIA_DUPLICADA';
  end;

  return v_fila;
end;
$$;

revoke all on function public.crear_categoria_gasto(text) from public, anon;
grant execute on function public.crear_categoria_gasto(text) to authenticated;

-- ── 2) crear_cliente ─────────────────────────────────────────────────────
create function public.crear_cliente(
  p_nombre text,
  p_telefono text default null,
  p_direccion text default null,
  p_email text default null,
  p_nota text default null
)
returns public.clientes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
  v_fila public.clientes%rowtype;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  v_nombre := btrim(coalesce(p_nombre, ''));
  if v_nombre = '' then
    raise exception 'NOMBRE_INVALIDO';
  end if;

  insert into public.clientes (nombre, telefono, direccion, email, nota)
  values (
    v_nombre,
    nullif(btrim(coalesce(p_telefono, '')), ''),
    nullif(btrim(coalesce(p_direccion, '')), ''),
    nullif(btrim(coalesce(p_email, '')), ''),
    nullif(btrim(coalesce(p_nota, '')), '')
  )
  returning * into v_fila;

  return v_fila;
end;
$$;

revoke all on function public.crear_cliente(text, text, text, text, text) from public, anon;
grant execute on function public.crear_cliente(text, text, text, text, text) to authenticated;

-- ── 3) editar_cliente ────────────────────────────────────────────────────
create function public.editar_cliente(
  p_cliente_id uuid,
  p_nombre text,
  p_telefono text default null,
  p_direccion text default null,
  p_email text default null,
  p_nota text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  v_nombre := btrim(coalesce(p_nombre, ''));
  if v_nombre = '' then
    raise exception 'NOMBRE_INVALIDO';
  end if;

  update public.clientes
     set nombre = v_nombre,
         telefono = nullif(btrim(coalesce(p_telefono, '')), ''),
         direccion = nullif(btrim(coalesce(p_direccion, '')), ''),
         email = nullif(btrim(coalesce(p_email, '')), ''),
         nota = nullif(btrim(coalesce(p_nota, '')), '')
   where id = p_cliente_id;
  if not found then
    raise exception 'CLIENTE_NO_ENCONTRADO';
  end if;

  return json_build_object('id', p_cliente_id);
end;
$$;

revoke all on function public.editar_cliente(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.editar_cliente(uuid, text, text, text, text, text) to authenticated;

-- ── 4) cambiar_estado_cliente ────────────────────────────────────────────
create function public.cambiar_estado_cliente(
  p_cliente_id uuid,
  p_activo boolean
)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if p_activo is null then
    raise exception 'ESTADO_INVALIDO';
  end if;

  update public.clientes set activo = p_activo where id = p_cliente_id;
  if not found then
    raise exception 'CLIENTE_NO_ENCONTRADO';
  end if;

  return json_build_object('id', p_cliente_id, 'activo', p_activo);
end;
$$;

revoke all on function public.cambiar_estado_cliente(uuid, boolean) from public, anon;
grant execute on function public.cambiar_estado_cliente(uuid, boolean) to authenticated;

-- ── 5) crear_material ────────────────────────────────────────────────────
create function public.crear_material(
  p_titulo text,
  p_cuerpo text,
  p_orden integer,
  p_publicado boolean
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_titulo text;
  v_id uuid;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  v_titulo := btrim(coalesce(p_titulo, ''));
  if v_titulo = '' then
    raise exception 'TITULO_INVALIDO';
  end if;

  if p_orden is null then
    raise exception 'ORDEN_INVALIDO';
  end if;

  if p_publicado is null then
    raise exception 'PUBLICADO_INVALIDO';
  end if;

  -- actualizado_por lo fija el trigger forzar_actualizado_por_material.
  insert into public.materiales_venta (titulo, cuerpo, orden, publicado)
  values (v_titulo, coalesce(p_cuerpo, ''), p_orden, p_publicado)
  returning id into v_id;

  return json_build_object('id', v_id);
end;
$$;

revoke all on function public.crear_material(text, text, integer, boolean) from public, anon;
grant execute on function public.crear_material(text, text, integer, boolean) to authenticated;

-- ── 6) actualizar_material ───────────────────────────────────────────────
create function public.actualizar_material(
  p_material_id uuid,
  p_titulo text,
  p_cuerpo text,
  p_publicado boolean
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_titulo text;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  v_titulo := btrim(coalesce(p_titulo, ''));
  if v_titulo = '' then
    raise exception 'TITULO_INVALIDO';
  end if;

  if p_publicado is null then
    raise exception 'PUBLICADO_INVALIDO';
  end if;

  -- No toca `orden` ni actualizado_por (lo fija el trigger).
  update public.materiales_venta
     set titulo = v_titulo,
         cuerpo = coalesce(p_cuerpo, ''),
         publicado = p_publicado
   where id = p_material_id;
  if not found then
    raise exception 'MATERIAL_NO_ENCONTRADO';
  end if;

  return json_build_object('id', p_material_id);
end;
$$;

revoke all on function public.actualizar_material(uuid, text, text, boolean) from public, anon;
grant execute on function public.actualizar_material(uuid, text, text, boolean) to authenticated;

-- ── 7) eliminar_material ─────────────────────────────────────────────────
create function public.eliminar_material(
  p_material_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_borradas integer;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  delete from public.materiales_venta where id = p_material_id;
  get diagnostics v_borradas = row_count;

  return json_build_object('id', p_material_id, 'eliminado', v_borradas > 0);
end;
$$;

revoke all on function public.eliminar_material(uuid) from public, anon;
grant execute on function public.eliminar_material(uuid) to authenticated;

-- ── 8) reordenar_materiales ──────────────────────────────────────────────
-- p_items: [{"id": "<uuid>", "orden": <entero>}, ...]. Todo o nada.
create function public.reordenar_materiales(
  p_items jsonb
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_orden integer;
  v_cuenta integer := 0;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 500 then
    raise exception 'ITEMS_INVALIDOS';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object'
       or jsonb_typeof(v_item -> 'id') <> 'string'
       or (v_item ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(v_item -> 'orden') <> 'number'
       or (v_item ->> 'orden') !~ '^-?[0-9]{1,9}$' then
      raise exception 'ITEMS_INVALIDOS';
    end if;

    v_id := (v_item ->> 'id')::uuid;
    v_orden := (v_item ->> 'orden')::integer;

    update public.materiales_venta set orden = v_orden where id = v_id;
    if not found then
      raise exception 'MATERIAL_NO_ENCONTRADO';
    end if;
    v_cuenta := v_cuenta + 1;
  end loop;

  return json_build_object('actualizados', v_cuenta);
end;
$$;

revoke all on function public.reordenar_materiales(jsonb) from public, anon;
grant execute on function public.reordenar_materiales(jsonb) to authenticated;

-- ── 9) actualizar_umbral_producto ────────────────────────────────────────
create function public.actualizar_umbral_producto(
  p_producto_id uuid,
  p_umbral_minimo integer
)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if p_umbral_minimo is null or p_umbral_minimo < 0 then
    raise exception 'UMBRAL_INVALIDO';
  end if;

  update public.productos set umbral_minimo = p_umbral_minimo where id = p_producto_id;
  if not found then
    raise exception 'PRODUCTO_NO_ENCONTRADO';
  end if;

  return json_build_object('id', p_producto_id);
end;
$$;

revoke all on function public.actualizar_umbral_producto(uuid, integer) from public, anon;
grant execute on function public.actualizar_umbral_producto(uuid, integer) to authenticated;
