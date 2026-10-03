-- Ananja (public): seed de productos
--
-- Documenta, para simetría con supabase/negocios/miel.seed.sql, el seed de
-- presentaciones propio de Ananja (aceite de oliva). El origen canónico de
-- este seed es el bloque `@solo-public` dentro de
-- supabase/migrations/0003_rls_seeds.sql — ya aplicado en producción junto
-- con el resto de esa migración. Este archivo NO hace falta correrlo de
-- nuevo en `public`; queda acá solo como referencia y por si alguna vez se
-- necesita re-derivar el schema `public` desde cero sin pasar por
-- render.mjs (por eso es idempotente igual que el de miel).

set search_path to public;

insert into productos (nombre, presentacion_ml, costo_centavos, umbral_minimo) values
  ('Botella 250 ml', 250, 0, 10),
  ('Botella 500 ml', 500, 0, 10)
on conflict (presentacion_ml) do nothing;
