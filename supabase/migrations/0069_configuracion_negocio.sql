-- Ananja: configuración del negocio editable desde la app — por ahora, el
-- NOMBRE DEL PROVEEDOR del aceite.
--
-- Por qué: el nombre del proveedor estaba escrito a mano en unos 20 textos
-- de la interfaz ("+ Pedido a ...", "En ...", etc.). El código se va a
-- publicar y no debe llevar nombres de terceros, así que el nombre pasa a
-- ser un dato de la base que el dueño carga desde la app
-- (`/stock/proveedor`). Mientras no esté cargado, la interfaz dice
-- "proveedor" (ver `lib/dominio/proveedor.ts`).
--
-- `public.configuracion_negocio`: tabla de UNA sola fila (`id boolean
-- primary key default true check (id)` — la única fila posible es la que
-- tiene `id = true`). Se inserta ya acá, SIN nombre: nunca se siembra un
-- nombre real desde una migración.
--
-- Lectura: solo admins, por RLS (`es_admin()`; `es_vendedor()` es un alias
-- puro de `es_admin()` desde 0018, pero acá se usa `es_admin()` directo).
-- Escritura: ningún `insert`/`update`/`delete` directo — todo por la RPC
-- `guardar_proveedor`, `security definer` con chequeo de `es_admin()`, igual
-- que el resto de las escrituras sensibles del repo.
--
-- `guardar_proveedor('')` (o solo espacios) vuelve al valor por defecto
-- (null → la interfaz dice "proveedor"). El generador de tipos de Supabase
-- tipa `p_nombre` como no-nulo, por eso la UI manda '' para "borrar".
--
-- Migración sin templating (mismo criterio que 0049-0068): hardcodea
-- `public.` y `search_path = public` SIN comillas (así `supabase/render.mjs`
-- puede reescribirlo para `miel`; ver supabase/README.md).
--
-- SIN APLICAR: queda para que Fran la aplique cuando decida (SQL Editor o
-- `supabase db push`). El código tolera que la tabla todavía no exista
-- (`lib/data/negocio.ts` loguea y muestra "proveedor").

-- ============================================================
-- 1) Tabla de una fila
-- ============================================================

create table public.configuracion_negocio (
  id boolean primary key default true check (id),
  proveedor_nombre text
    check (proveedor_nombre is null or char_length(btrim(proveedor_nombre)) between 1 and 60),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

-- La única fila, sin nombre.
insert into public.configuracion_negocio (id) values (true);

alter table public.configuracion_negocio enable row level security;

revoke all on public.configuracion_negocio from anon, authenticated;
grant select on public.configuracion_negocio to authenticated;

create policy configuracion_negocio_select
  on public.configuracion_negocio
  for select
  to authenticated
  using (public.es_admin());

-- ============================================================
-- 2) RPC guardar_proveedor
-- ============================================================

create or replace function public.guardar_proveedor(p_nombre text)
returns void
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

  -- Vacío o solo espacios = volver al valor por defecto (null).
  v_nombre := nullif(btrim(p_nombre), '');

  if v_nombre is not null and char_length(v_nombre) > 60 then
    raise exception 'NOMBRE_MUY_LARGO';
  end if;

  -- Upsert: aunque la fila única no existiera (nadie puede borrarla, pero
  -- así no depende de eso), queda creada.
  insert into public.configuracion_negocio (id, proveedor_nombre, updated_at, updated_by)
  values (true, v_nombre, now(), auth.uid())
  on conflict (id) do update
    set proveedor_nombre = excluded.proveedor_nombre,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;
end;
$$;

revoke execute on function public.guardar_proveedor(text) from public, anon;
grant execute on function public.guardar_proveedor(text) to authenticated;
