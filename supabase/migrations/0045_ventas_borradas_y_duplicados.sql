-- Ananja: registro de ventas borradas + aviso de carga repetida.
--
-- Por qué (pedido de Fran, 2026-09-15): a una revendedora se le cargó dos veces lo
-- mismo — un "Entregar" de 13 × 500 ml con fecha 27/08 y, 16 minutos
-- después, un "Cargar todo junto" con la MISMA entrega + venta + pago; y dos
-- entregas de 18 × 500 ml del 27/08 con 25 minutos de diferencia, cada una
-- con su venta de 18 y su pago. Después alguien borró una venta
-- y no hay forma de saber quién: `eliminar_venta_revendedor` borra la fila
-- de verdad.
--
-- § 1 ventas_revendedor_borradas: foto completa de cada fila de
--     `ventas_revendedor` que se borra, con quién la borró y cuándo. La llena
--     un trigger AFTER DELETE en la tabla (no el RPC), así queda registrada
--     por CUALQUIER camino: `eliminar_venta_revendedor` (que borra el grupo
--     entero, una fila por entrega), un borrado en cascada futuro o un
--     `delete` a mano desde el editor SQL (ahí `borrada_por` queda null: no
--     hay usuario de la app). TRUNCATE no dispara triggers de delete; la app
--     nunca lo usa.
--     Sin FKs a propósito: es un registro histórico y no puede impedir borrar
--     nada más adelante (una entrega, un lote, un producto); además
--     vendedor_id/registrada_por/borrada_por a `vendedores` volverían ambiguo
--     cualquier embed de PostgREST. La pantalla resuelve los nombres aparte.
--     Lectura: un admin ve todas; una revendedora, las de sus ventas. Nadie
--     escribe por REST (solo el trigger, security definer).
--
-- § 2 buscar_cargas_parecidas(p_vendedor_id, p_entrega, p_ventas, p_pago,
--     p_clave): solo lectura, solo admins. Las pantallas de admin
--     ("Entregar", "Cargar todo junto", "Cargar ventas", "Registrar pago") la
--     llaman justo antes de guardar y, si hay algo muy parecido ya cargado
--     para esa revendedora, muestran un aviso con "Guardar igual" /
--     "Revisar". NO bloquea nada del lado del servidor: ninguna firma de los
--     RPCs de guardado cambia.
--     Parecido =
--       - entrega: una entrega (tipo 'entrega') con la misma fecha que tiene
--         un ítem con el mismo producto, lote (null = sin lote) y cantidad;
--       - venta: una venta (grupo_id; una venta partida en dos entregas suma
--         sus filas) con la misma fecha, producto y cantidad total;
--       - pago: una rendición con la misma fecha y monto.
--     Formas (null = sección no incluida; otras claves se ignoran, así la
--     carga unificada manda el mismo pedido que a registrar_carga_revendedor):
--       p_entrega {fecha, items: [{producto_id, lote_id?, cantidad}]}
--       p_ventas  {fecha, items: [{producto_id, cantidad, grupo_id?}]}
--                 — grupo_id: la venta que se está por guardar con ese id
--                 (reintento idempotente de "Cargar ventas") no se compara
--                 contra sí misma.
--       p_pago    {fecha, monto_centavos}
--     p_clave: clave de idempotencia de "Cargar todo junto". Si esa carga ya
--     se guardó, el guardado va a devolver lo guardado (o
--     CARGA_YA_GUARDADA) sin duplicar nada → no hay nada que avisar (un
--     reintento no se avisa contra sí mismo).
--     Devuelve un array JSON ordenado por created_at:
--       [{seccion: 'entrega'|'venta'|'pago', id, producto_id,
--         producto_nombre, cantidad, monto_centavos, fecha, created_at}]
--     SECURITY INVOKER a propósito: un admin ya lee todas esas tablas por
--     RLS, así que la función no puede mostrar nada que no se pueda leer por
--     REST; igual corta con NO_AUTORIZADO a quien no es admin.
--
-- § 3 Índices (vendedor_id, fecha) para la búsqueda en las tres tablas.
--
-- Compatibilidad con la UI desplegada: solo agrega (tabla, trigger, función,
-- índices). Si el código nuevo llega antes que la migración, el aviso
-- simplemente no aparece (la pantalla guarda igual si la búsqueda falla).
--
-- APLICADA en prod `public` el 2026-09-15 (0045_ventas_borradas_y_duplicados_public).
--
-- Migración templated (__SCHEMA__, sin __BUCKET__), ver supabase/README.md.

-- ─── § 1 Ventas borradas ───────────────────────────────────────────────────

create table ventas_revendedor_borradas (
  id uuid primary key default gen_random_uuid(),
  -- Columnas de la fila borrada, tal cual estaban (id y created_at originales).
  venta_id uuid not null,
  vendedor_id uuid not null,
  producto_id uuid not null,
  cantidad int not null,
  precio_venta_centavos bigint,
  precio_costo_centavos bigint not null,
  medio_pago medio_pago,
  fecha date not null,
  nota text,
  entrega_item_id uuid,
  lote_id uuid,
  grupo_id uuid not null,
  registrada_por uuid,
  created_at timestamptz not null,
  -- vendedores.id de quien la borró (null = fuera de la app, ej. editor SQL).
  borrada_por uuid,
  borrada_at timestamptz not null default now()
);

create index idx_ventas_revendedor_borradas_vendedor_id
  on ventas_revendedor_borradas (vendedor_id, borrada_at desc);

alter table ventas_revendedor_borradas enable row level security;
revoke all on ventas_revendedor_borradas from anon, authenticated, public;
grant select on ventas_revendedor_borradas to authenticated;

create policy ventas_revendedor_borradas_select on ventas_revendedor_borradas
  for select to authenticated
  using (__SCHEMA__.es_admin() or vendedor_id = __SCHEMA__.mi_vendedor_id());
-- Sin insert/update/delete por REST: solo el trigger de abajo.

-- Quién borra: el vendedor del usuario logueado. No se usa mi_vendedor_id()
-- tal cual porque exige `activo`: si alguien dado de baja llegara a borrar
-- (ej. un RPC futuro), igual queda su nombre.
create or replace function ventas_revendedor_registrar_borrada()
returns trigger
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
begin
  insert into ventas_revendedor_borradas (
    venta_id, vendedor_id, producto_id, cantidad, precio_venta_centavos,
    precio_costo_centavos, medio_pago, fecha, nota, entrega_item_id, lote_id,
    grupo_id, registrada_por, created_at, borrada_por
  ) values (
    old.id, old.vendedor_id, old.producto_id, old.cantidad, old.precio_venta_centavos,
    old.precio_costo_centavos, old.medio_pago, old.fecha, old.nota, old.entrega_item_id, old.lote_id,
    old.grupo_id, old.registrada_por, old.created_at,
    (select v.id from vendedores v where v.user_id = auth.uid() order by v.activo desc limit 1)
  );
  return null;
end;
$$;

revoke execute on function ventas_revendedor_registrar_borrada() from anon, authenticated, public;

create trigger trg_ventas_revendedor_registrar_borrada
after delete on ventas_revendedor
for each row execute function ventas_revendedor_registrar_borrada();

-- ─── § 2 Búsqueda de cargas parecidas ─────────────────────────────────────

create or replace function buscar_cargas_parecidas(
  p_vendedor_id uuid,
  p_entrega jsonb,
  p_ventas jsonb,
  p_pago jsonb,
  p_clave uuid default null
)
returns json
language plpgsql
stable
set search_path = __SCHEMA__
as $$
declare
  v_resultado json;
begin
  if not __SCHEMA__.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if p_vendedor_id is null then
    return '[]'::json;
  end if;

  -- Reintento de una carga ya guardada: no se avisa contra sí misma.
  if p_clave is not null and exists (select 1 from cargas_revendedor where clave = p_clave) then
    return '[]'::json;
  end if;

  -- JSON null == sección no incluida
  if jsonb_typeof(p_entrega) is distinct from 'object' then p_entrega := null; end if;
  if jsonb_typeof(p_ventas) is distinct from 'object' then p_ventas := null; end if;
  if jsonb_typeof(p_pago) is distinct from 'object' then p_pago := null; end if;

  with
  entrega_items_in as (
    select
      nullif(i->>'producto_id', '')::uuid as producto_id,
      nullif(i->>'lote_id', '')::uuid as lote_id,
      nullif(i->>'cantidad', '')::int as cantidad
    from jsonb_array_elements(
      case when jsonb_typeof(p_entrega->'items') = 'array' then p_entrega->'items' else '[]'::jsonb end
    ) i
  ),
  ventas_in as (
    select
      nullif(i->>'producto_id', '')::uuid as producto_id,
      nullif(i->>'cantidad', '')::int as cantidad,
      nullif(i->>'grupo_id', '')::uuid as grupo_id
    from jsonb_array_elements(
      case when jsonb_typeof(p_ventas->'items') = 'array' then p_ventas->'items' else '[]'::jsonb end
    ) i
  ),
  -- Grupos que se están por guardar (no se comparan contra sí mismos).
  grupos_propios as (
    select grupo_id from ventas_in where grupo_id is not null
  ),
  entregas as (
    select distinct
      'entrega'::text as seccion,
      ei.id,
      ei.producto_id,
      ei.cantidad,
      null::bigint as monto_centavos,
      e.fecha,
      e.created_at
    from entregas_revendedor e
    join entrega_items ei on ei.entrega_id = e.id
    join entrega_items_in x
      on x.producto_id = ei.producto_id
     and x.lote_id is not distinct from ei.lote_id
     and x.cantidad = ei.cantidad
    where e.vendedor_id = p_vendedor_id
      and e.tipo = 'entrega'
      and e.fecha = nullif(p_entrega->>'fecha', '')::date
  ),
  ventas_grupo as (
    select
      v.grupo_id,
      v.producto_id,
      v.fecha,
      sum(v.cantidad)::int as cantidad,
      min(v.created_at) as created_at
    from ventas_revendedor v
    where v.vendedor_id = p_vendedor_id
      and v.fecha = nullif(p_ventas->>'fecha', '')::date
      and v.grupo_id not in (select grupo_id from grupos_propios)
    group by v.grupo_id, v.producto_id, v.fecha
  ),
  ventas as (
    select distinct
      'venta'::text as seccion,
      g.grupo_id as id,
      g.producto_id,
      g.cantidad,
      null::bigint as monto_centavos,
      g.fecha,
      g.created_at
    from ventas_grupo g
    join ventas_in x on x.producto_id = g.producto_id and x.cantidad = g.cantidad
  ),
  pagos as (
    select
      'pago'::text as seccion,
      r.id,
      null::uuid as producto_id,
      null::int as cantidad,
      r.monto_centavos,
      r.fecha,
      r.created_at
    from rendiciones r
    where p_pago is not null
      and r.vendedor_id = p_vendedor_id
      and r.fecha = nullif(p_pago->>'fecha', '')::date
      and r.monto_centavos = nullif(p_pago->>'monto_centavos', '')::bigint
  ),
  todas as (
    select * from entregas
    union all
    select * from ventas
    union all
    select * from pagos
  )
  select coalesce(
    json_agg(
      json_build_object(
        'seccion', t.seccion,
        'id', t.id,
        'producto_id', t.producto_id,
        'producto_nombre', p.nombre,
        'cantidad', t.cantidad,
        'monto_centavos', t.monto_centavos,
        'fecha', t.fecha,
        'created_at', t.created_at
      )
      order by t.created_at, t.seccion, t.id
    ),
    '[]'::json
  )
  into v_resultado
  from todas t
  left join productos p on p.id = t.producto_id;

  return v_resultado;
end;
$$;

revoke execute on function buscar_cargas_parecidas(uuid, jsonb, jsonb, jsonb, uuid) from anon, public;
grant execute on function buscar_cargas_parecidas(uuid, jsonb, jsonb, jsonb, uuid) to authenticated;

-- ─── § 3 Índices ──────────────────────────────────────────────────────────

create index idx_entregas_revendedor_vendedor_fecha on entregas_revendedor (vendedor_id, fecha);
create index idx_ventas_revendedor_vendedor_fecha on ventas_revendedor (vendedor_id, fecha);
create index idx_rendiciones_vendedor_fecha on rendiciones (vendedor_id, fecha);
