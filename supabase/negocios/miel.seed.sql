-- Germá (miel): seed de productos
--
-- Mismas columnas que el seed de Ananja (supabase/migrations/0003_rls_seeds.sql,
-- bloque @solo-public), pero con presentaciones propias del negocio: la
-- unidad de `presentacion_ml` para miel es GRAMOS, no mililitros (ver
-- comment on column productos.presentacion_ml en
-- supabase/migrations/0013_multi_negocio.sql).
--
-- Aplicar DESPUÉS de crear el schema miel y correr el render completo de
-- 0001-0013 con --schema miel. Idempotente (on conflict do nothing) para
-- poder re-ejecutarlo sin duplicar filas.

set search_path to miel;

insert into productos (nombre, presentacion_ml, costo_centavos, umbral_minimo) values
  ('Frasco 500 g', 500, 0, 10),
  ('Frasco 1 kg', 1000, 0, 10)
on conflict (presentacion_ml) do nothing;

-- Insumos y recetas de Germá
-- Aplicar DESPUÉS de correr supabase/migrations/0017_insumos.sql sobre el
-- schema miel (ver supabase/README.md § "Cómo aplicar en cada schema").
-- Idempotente (on conflict do nothing) para poder re-ejecutarlo sin
-- duplicar filas. Recetas resueltas por nombre de insumo y
-- presentacion_ml de producto (no por uuid), mismo criterio que el bloque
-- @solo-public de 0017_insumos.sql para Ananja.

insert into insumos (nombre, tipo, unidad, umbral_minimo) values
  ('Miel a granel', 'materia_prima', 'kilo', 0),
  ('Frasco 500 g', 'envase', 'unidad', 0),
  ('Frasco 1 kg', 'envase', 'unidad', 0),
  ('Etiqueta chica frente', 'etiqueta', 'unidad', 0),
  ('Etiqueta chica retro', 'etiqueta', 'unidad', 0),
  ('Etiqueta grande frente', 'etiqueta', 'unidad', 0),
  ('Etiqueta grande retro', 'etiqueta', 'unidad', 0)
on conflict (nombre) do nothing;

insert into recetas (producto_id, insumo_id, cantidad)
select p.id, i.id, v.cantidad
from (values
  (500, 'Miel a granel', 0.5),
  (500, 'Frasco 500 g', 1),
  (500, 'Etiqueta chica frente', 1),
  (500, 'Etiqueta chica retro', 1),
  (1000, 'Miel a granel', 1),
  (1000, 'Frasco 1 kg', 1),
  (1000, 'Etiqueta grande frente', 1),
  (1000, 'Etiqueta grande retro', 1)
) as v(presentacion_ml, insumo_nombre, cantidad)
join productos p on p.presentacion_ml = v.presentacion_ml
join insumos i on i.nombre = v.insumo_nombre
on conflict (producto_id, insumo_id) do nothing;

-- Material de venta de Germá
-- Aplicar DESPUÉS de correr supabase/migrations/0023_material_venta.sql
-- sobre el schema miel (ver supabase/README.md § "Cómo aplicar en cada
-- schema"). Idempotente (where not exists) para poder re-ejecutarlo sin
-- duplicar filas — mismo criterio que el seed de Ananja de
-- 0023_material_venta.sql (titulo no lleva UNIQUE, así que no se usa
-- on conflict).

-- El seed corre sin sesión autenticada, así que mi_vendedor_id()
-- (auth.uid() nulo) dispararía VENDEDOR_NO_REGISTRADO en el trigger
-- trg_materiales_venta_actualizado_por (ver el mismo ajuste en el
-- bloque @solo-public de 0023_material_venta.sql). Se deshabilita solo
-- para este insert puntual y se rehabilita inmediatamente después.
alter table materiales_venta disable trigger trg_materiales_venta_actualizado_por;

insert into materiales_venta (titulo, cuerpo, orden, publicado)
select v.titulo, '', v.orden, false
from (values
  ('¿Qué es la miel pura?', 1),
  ('Composición y propiedades', 2),
  ('La historia de Germá', 3)
) as v(titulo, orden)
where not exists (
  select 1 from materiales_venta m where m.titulo = v.titulo
);

alter table materiales_venta enable trigger trg_materiales_venta_actualizado_por;
