-- Ananja/Germá: sección "Material de venta"
--
--
-- Material de venta es contenido de referencia (qué es el producto, de
-- dónde sale, por qué vale lo que vale) que Fran escribe desde la app para
-- que un revendedor lo lea antes de salir a vender. Sin RPC: es un CRUD
-- simple cerrado por RLS (es_admin() en insert/update/delete; un
-- revendedor solo ve las filas con publicado = true).
--
-- Migración templated (__SCHEMA__, sin __BUCKET__ — no toca Storage: sin
-- imágenes/adjuntos en este alcance). Ver supabase/README.md para la
-- convención de "escribir una vez, aplicar en cada negocio".
--
-- Alcance:
--  1. Tabla materiales_venta.
--  2. Trigger forzar_actualizado_por_material (before insert or update).
--  3. RLS.
--  4. Seed de los tres borradores de Ananja (@solo-public — ver
--     supabase/negocios/miel.seed.sql para el seed de Germá, que se corre
--     aparte, a mano, después de aplicar esta migración sobre el schema
--     miel).

-- ============================================================
-- 1) materiales_venta
-- ============================================================

create table materiales_venta (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (btrim(titulo) <> ''),
  cuerpo text not null default '',
  orden int not null default 0,
  publicado boolean not null default false,
  actualizado_por uuid references vendedores(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_materiales_venta_orden on materiales_venta(orden);

create trigger trg_materiales_venta_updated_at
  before update on materiales_venta
  for each row execute function set_updated_at();

-- ============================================================
-- 2) forzar_actualizado_por_material — mismo patrón que
--    forzar_vendedor_movimiento_insumo (0017_insumos.sql): fuerza la
--    columna al vendedor logueado, no depende de lo que mande el cliente.
-- ============================================================

create function __SCHEMA__.forzar_actualizado_por_material()
returns trigger
language plpgsql
security definer
set search_path = __SCHEMA__
as $$
declare
  v_vendedor_id uuid;
begin
  v_vendedor_id := __SCHEMA__.mi_vendedor_id();
  if v_vendedor_id is null then
    raise exception 'VENDEDOR_NO_REGISTRADO';
  end if;

  new.actualizado_por := v_vendedor_id;
  return new;
end;
$$;

revoke execute on function __SCHEMA__.forzar_actualizado_por_material() from anon, authenticated, public;

create trigger trg_materiales_venta_actualizado_por
  before insert or update on materiales_venta
  for each row execute function __SCHEMA__.forzar_actualizado_por_material();

-- ============================================================
-- 3) RLS — sin RPC: CRUD directo cerrado por policy.
-- ============================================================

alter table materiales_venta enable row level security;
revoke all on materiales_venta from anon, authenticated, public;
grant select, insert, update, delete on materiales_venta to authenticated;

create policy materiales_venta_select on materiales_venta for select to authenticated
  using (__SCHEMA__.es_admin() or (__SCHEMA__.es_revendedor() and publicado));

create policy materiales_venta_insert on materiales_venta for insert to authenticated
  with check (__SCHEMA__.es_admin());

create policy materiales_venta_update on materiales_venta for update to authenticated
  using (__SCHEMA__.es_admin()) with check (__SCHEMA__.es_admin());

create policy materiales_venta_delete on materiales_venta for delete to authenticated
  using (__SCHEMA__.es_admin());

-- ============================================================
-- 4) Seed de Ananja (@solo-public) — ver supabase/negocios/miel.seed.sql
--    para el seed de Germá. Idempotente por título (where not exists, no
--    on conflict: titulo no lleva UNIQUE, ver spec § Modelo de datos).
-- ============================================================

-- @solo-public:inicio
-- El seed corre sin sesión autenticada (migración aplicada como
-- postgres/service role), así que mi_vendedor_id() (auth.uid() nulo)
-- dispararía VENDEDOR_NO_REGISTRADO en el trigger
-- trg_materiales_venta_actualizado_por. Se deshabilita solo para este
-- insert puntual (mismo criterio que un seed no interactivo) y se
-- rehabilita inmediatamente después; actualizado_por queda null en las
-- filas seed, coherente con que nadie las "actualizó" todavía.
alter table materiales_venta disable trigger trg_materiales_venta_actualizado_por;

insert into materiales_venta (titulo, cuerpo, orden, publicado)
select v.titulo, '', v.orden, false
from (values
  ('¿Qué es el aceite de oliva virgen extra?', 1),
  ('Composición y propiedades', 2),
  ('La historia de Ananja', 3)
) as v(titulo, orden)
where not exists (
  select 1 from materiales_venta m where m.titulo = v.titulo
);

alter table materiales_venta enable trigger trg_materiales_venta_actualizado_por;
-- @solo-public:fin
