-- Ananja: poder eliminar un movimiento MANUAL de stock cargado por error,
-- dejando registro de lo que se borró.
--
-- Por qué: desde `/stock/nuevo` (`components/stock/movimiento-form.tsx`) se
-- carga un "egreso manual" (venta suelta, degustación, rotura, regalo u otro)
-- con un insert directo por REST. Si se carga mal (producto o cantidad
-- equivocados, duplicado), hoy NADIE lo puede deshacer desde la app:
-- `authenticated` no tiene privilegio DELETE sobre `movimientos_stock` (0003
-- solo da select + insert), no hay policy de delete ni RPC. Un movimiento
-- compensatorio tampoco sirve: un ingreso con lote pero sin `entrega_id` sube
-- el stock global, pero NO el `quedan` del lote (`v_stock_por_lote`, 0028,
-- solo netea los ingresos que llevan `entrega_id`). Hay que borrar la fila.
--
-- Borrar la fila revierte su efecto solo, porque todo el stock se calcula
-- sumando filas: `v_stock_actual` (0002), `v_stock_por_lote` (0028),
-- `v_perdidas_lote` y `v_cobranza_lote` (0029/0040/0044/0052) leen
-- `movimientos_stock` y no guardan ningún total aparte. No hay FKs entrantes
-- hacia `movimientos_stock` ni triggers de DELETE (el único trigger de la
-- tabla es el BEFORE INSERT de 0007 que fuerza `vendedor_id`).
--
-- Qué toca:
--
--  1) Tabla `public.movimientos_stock_borrados`: la foto de cada fila que se
--     borra (todas las columnas de `movimientos_stock`, con el `id` original
--     en `movimiento_id` y el `created_at` original) + `borrado_por`
--     (vendedor que la borró) + `borrado_at`. Select solo `es_admin()`; nadie
--     escribe por REST (sin insert/update/delete para `authenticated`): solo
--     la RPC de abajo.
--
--     SIN FKs a propósito (mismo criterio que `ventas_revendedor_borradas`,
--     0045): es un registro histórico y no puede impedir borrar nada más
--     adelante (un producto, un lote, un vendedor dado de baja); además un FK
--     a `vendedores` (dos columnas: `vendedor_id` y `borrado_por`) volvería
--     ambiguo cualquier embed de PostgREST (PGRST201, ya pasó con 0049). La
--     pantalla resuelve nombres de producto/vendedor/lote con consultas
--     aparte.
--
--  2) RPC `public.eliminar_movimiento_stock(p_movimiento_id uuid)`: security
--     definer, solo admins. Bloquea la fila (`for update`), verifica que sea
--     un movimiento MANUAL, la copia a `movimientos_stock_borrados` y la
--     borra, todo en la misma transacción. Devuelve `{id}`.
--
--     El respaldo lo escribe la RPC y NO un trigger AFTER DELETE: los
--     borrados en cascada (eliminar un comprobante borra sus movimientos por
--     `on delete cascade`) y `actualizar_comprobante` (que borra y reinserta
--     los movimientos del comprobante en cada edición) llenarían la tabla de
--     ruido que no es una decisión de nadie.
--
-- Qué es un movimiento "manual" (regla de la RPC; espejo exacto en
-- `esMovimientoStockBorrable`, `lib/dominio/movimientos-stock.ts`):
--
--     tipo = 'egreso'  AND  comprobante_id IS NULL  AND  entrega_id IS NULL
--                      AND  feria_id IS NULL
--
-- Se revisaron TODOS los lugares que escriben en `movimientos_stock`:
--   - egresos de venta (`crear_comprobante` / `actualizar_comprobante`: 0002,
--     0007, 0009, 0011, 0022, 0025, 0028, 0029, 0031): llevan `comprobante_id`
--     (se borran con la venta, nunca sueltos);
--   - egresos/devoluciones de revendedoras (`registrar_entrega_revendedor`:
--     0018, 0020, 0026, 0028, 0029, 0040, 0055): llevan `entrega_id`;
--   - degustación de feria (`crear_feria`, 0011/0022): lleva `feria_id`
--     (`cerrar_feria` se eliminó en 0065, pero pueden quedar filas viejas);
--   - ingresos de producción (`crear_lote`: 0010, 0015, 0017, 0022, 0028,
--     0029, 0030): llevan `lote_id` (y `producido` sale de `lote_items`, no
--     de estas filas);
--   - egresos directos del cliente (`movimiento-form.tsx`, RLS 0003/0013
--     `comprobante_id is null`): los únicos que quedan con `comprobante_id`,
--     `entrega_id` y `feria_id` en null (`lote_id` sí puede venir completo:
--     desde 0028 el egreso manual elige de qué lote sale).
-- Ninguna RPC genera un egreso sin `comprobante_id`, `entrega_id` ni
-- `feria_id`, así que esa combinación es inequívoca: solo puede venir de un
-- insert directo (el formulario de egreso manual).
--
-- INGRESOS: la RPC acepta SOLO egresos manuales. Un ingreso "manual" (sin
-- lote, sin comprobante, sin entrega, sin feria) no se puede distinguir con
-- certeza de los ingresos de producción anteriores a los lotes (0010 creó
-- `lote_id`; los ingresos previos quedaron con `lote_id` null y se cargaban
-- con el mismo formulario), y además la app ya no tiene ningún camino para
-- cargarlos a mano (`/stock/nuevo?tipo=ingreso` redirige a
-- `/stock/lotes/nuevo`, que es el alta de un lote). Un ingreso con `lote_id`
-- tampoco se puede distinguir de uno de producción (la RLS de insert directo
-- deja mandar cualquier `lote_id`). Ante la duda no se borra: cualquier
-- ingreso responde `MOVIMIENTO_NO_MANUAL`. Por lo mismo no hace falta el
-- chequeo `STOCK_INSUFICIENTE`: borrar un egreso siempre SUBE el stock (del
-- producto y del lote), nunca lo deja negativo.
--
-- Errores: `NO_AUTORIZADO` (no es admin), `MOVIMIENTO_INVALIDO` (no existe,
-- o el id es null), `MOVIMIENTO_NO_MANUAL` (ingreso, o egreso de una venta /
-- entrega / feria).
--
-- Compatibilidad con la UI desplegada: solo agrega (tabla + función); nada
-- existente cambia. Si el código nuevo sale antes que esta migración, la
-- pantalla de movimientos se ve igual que antes (la consulta de "Eliminados"
-- falla en silencio y el botón ELIMINAR, si se toca, devuelve un error
-- traducido porque la función todavía no existe).
--
-- Migración sin templating (mismo criterio que 0049-0071): hardcodea
-- `public.`. `set search_path = public` va SIN comillas a propósito: con
-- comillas rompe el render multi-schema (supabase/render.mjs).
--
-- Cómo se verificó: aplicada la cadena 0001-0072 renderizada para `public` en
-- un Postgres 15 descartable (no en producción) con stubs mínimos de `auth` y
-- `storage`; probado con usuarios simulados: un admin borra un egreso manual
-- (la fila pasa a la tabla de borrados con `borrado_por` y el stock del
-- producto, del lote y las pérdidas se recalculan); ingresos de producción,
-- movimientos de venta, de entrega y de feria responden
-- `MOVIMIENTO_NO_MANUAL`; un id inexistente `MOVIMIENTO_INVALIDO`; una
-- revendedora y una coordinadora `NO_AUTORIZADO`; `anon` no puede ejecutar; un
-- no-admin no lee la tabla de borrados y nadie puede insertar ni borrar en
-- ella por REST.
--
-- APLICADA y verificada en producción (schema `public`) el 2026-10-10: por
-- `pg_proc` (firma única y cuerpo idéntico al de este archivo),
-- `information_schema.columns`, RLS/policies y ACL; no por la tabla de
-- tracking de migraciones. Ver el bloque de verificación de solo lectura al
-- final de este archivo.

-- ============================================================
-- 1) Registro de movimientos borrados
-- ============================================================

create table public.movimientos_stock_borrados (
  id uuid primary key default gen_random_uuid(),
  -- Columnas de la fila borrada, tal cual estaban (id y created_at originales).
  movimiento_id uuid not null,
  producto_id uuid not null,
  tipo public.tipo_movimiento not null,
  cantidad int not null,
  vendedor_id uuid not null,
  comprobante_id uuid,
  nota text,
  created_at timestamptz not null,
  lote_id uuid,
  feria_id uuid,
  entrega_id uuid,
  motivo text,
  -- vendedores.id de quien la borró.
  borrado_por uuid,
  borrado_at timestamptz not null default now()
);

create index idx_movimientos_stock_borrados_borrado_at
  on public.movimientos_stock_borrados (borrado_at desc);

alter table public.movimientos_stock_borrados enable row level security;
revoke all on public.movimientos_stock_borrados from anon, authenticated, public;
grant select on public.movimientos_stock_borrados to authenticated;

create policy movimientos_stock_borrados_select on public.movimientos_stock_borrados
  for select to authenticated
  using (public.es_admin());
-- Sin insert/update/delete por REST: solo la RPC de abajo.

-- ============================================================
-- 2) eliminar_movimiento_stock
-- ============================================================

create function public.eliminar_movimiento_stock(p_movimiento_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mov public.movimientos_stock%rowtype;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select * into v_mov
  from public.movimientos_stock
  where id = p_movimiento_id
  for update;

  if not found then
    raise exception 'MOVIMIENTO_INVALIDO';
  end if;

  -- Manual = egreso cargado a mano. Ver la cabecera: ningún otro camino deja
  -- un egreso sin comprobante, sin entrega y sin feria, y los ingresos no se
  -- pueden distinguir con certeza de los de producción.
  if v_mov.tipo <> 'egreso'
    or v_mov.comprobante_id is not null
    or v_mov.entrega_id is not null
    or v_mov.feria_id is not null
  then
    raise exception 'MOVIMIENTO_NO_MANUAL';
  end if;

  insert into public.movimientos_stock_borrados (
    movimiento_id, producto_id, tipo, cantidad, vendedor_id, comprobante_id,
    nota, created_at, lote_id, feria_id, entrega_id, motivo, borrado_por
  ) values (
    v_mov.id, v_mov.producto_id, v_mov.tipo, v_mov.cantidad, v_mov.vendedor_id,
    v_mov.comprobante_id, v_mov.nota, v_mov.created_at, v_mov.lote_id,
    v_mov.feria_id, v_mov.entrega_id, v_mov.motivo, public.mi_vendedor_id()
  );

  delete from public.movimientos_stock where id = v_mov.id;

  return json_build_object('id', v_mov.id);
end;
$$;

revoke execute on function public.eliminar_movimiento_stock(uuid) from anon, public;
grant execute on function public.eliminar_movimiento_stock(uuid) to authenticated;

-- ============================================================
-- Verificación post-aplicación (SOLO LECTURA — correr en el SQL Editor):
--
--   -- a) la tabla y sus columnas
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'movimientos_stock_borrados'
--   order by ordinal_position;
--   -- esperado, en orden: id, movimiento_id, producto_id, tipo, cantidad,
--   --   vendedor_id, comprobante_id, nota, created_at, lote_id, feria_id,
--   --   entrega_id, motivo, borrado_por, borrado_at (15 filas; NOT NULL en
--   --   id, movimiento_id, producto_id, tipo, cantidad, vendedor_id,
--   --   created_at, borrado_at)
--
--   -- b) RLS activada y una sola policy de select solo para admins
--   select c.relrowsecurity
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and c.relname = 'movimientos_stock_borrados';
--   -- esperado: true
--   select policyname, cmd, roles, qual
--   from pg_policies
--   where schemaname = 'public' and tablename = 'movimientos_stock_borrados';
--   -- esperado: 1 fila, movimientos_stock_borrados_select, SELECT,
--   --   {authenticated}, qual = es_admin()
--
--   -- c) privilegios de la tabla: authenticated solo SELECT; anon nada
--   select grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_schema = 'public' and table_name = 'movimientos_stock_borrados'
--     and grantee in ('anon', 'authenticated', 'public')
--   order by grantee, privilege_type;
--   -- esperado: una sola fila (authenticated, SELECT)
--
--   -- d) UNA sola eliminar_movimiento_stock, security definer, search_path = public
--   select p.oid::regprocedure as firma, p.prosecdef, p.proconfig
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'eliminar_movimiento_stock';
--   -- esperado: 1 fila, firma eliminar_movimiento_stock(uuid),
--   --   prosecdef = true, proconfig = {search_path=public}
--
--   -- e) ACL de la función: sin anon ni public, con authenticated
--   select p.proacl
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'eliminar_movimiento_stock';
--   -- esperado: el ACL NO tiene una entrada "=X/..." (public) ni "anon=X/...";
--   -- sí "authenticated=X/..." (y postgres / service_role)
-- ============================================================
