-- Ananja: tabla de keep-alive para que el proyecto Supabase (plan free) no
-- se pause por inactividad — ver docs/ops/supabase-keepalive.md.
--
-- Supabase pausa los proyectos free tras un período sin actividad. Un
-- endpoint que solo hace SELECTs no alcanza (ver la lección de la primera
-- implementación de este mecanismo, en el proyecto Ascendant, documentada
-- en docs/ops/supabase-keepalive.md): siguieron llegando avisos de pausa
-- pese a leer la base varias veces por día. Esta tabla existe para que el
-- endpoint /api/cron/keepalive pueda hacer una ESCRITURA real (insert) y
-- una limpieza (delete de filas viejas) además de la lectura, disparado
-- por Vercel Cron (diario) y por un GitHub Action de respaldo (cada 6 h).
--
-- `source` distingue quién generó el ping (vercel/github/manual), solo
-- para poder diagnosticar si algún disparador dejó de andar — ver la
-- query de verificación en docs/ops/supabase-keepalive.md.
--
-- Sin policies de RLS (nadie necesita leerla/escribirla vía PostgREST: el
-- endpoint usa `createAdminClient()` con la service role key, que
-- bypasea RLS) y sin grants a `anon`/`authenticated` — la tabla no es
-- para el cliente, es infraestructura interna.
--
-- Migración sin templating (mismo criterio que 0049-0067): hardcodea
-- `public.` — Ananja es hoy el único negocio activo (schema `miel` en
-- pausa). No hay `search_path` en esta migración (no define funciones),
-- así que no aplica la regla de comillas de
-- supabase/render.mjs (ver ananja-search-path-comillas-render).

create table public.keepalive (
  id bigint generated always as identity primary key,
  pinged_at timestamptz not null default now(),
  source text not null check (source in ('vercel', 'github', 'manual'))
);

alter table public.keepalive enable row level security;

revoke all on public.keepalive from anon, authenticated;
