-- Revendedores: `mi_vendedor_id()` deja de devolver el id de un vendedor
-- inactivo (fix 1 de la revisión de seguridad de Task 3).
--
-- 0018_revendedores.sql definió `mi_vendedor_id()` como
-- `select id from vendedores where user_id = auth.uid()` — sin filtrar por
-- `activo`, a diferencia de `es_admin()`/`es_revendedor()`, que sí exigen
-- `activo`. Un vendedor con `activo = false` quedaba bloqueado en
-- ESCRITURA (todos los RPCs que dependen de `mi_vendedor_id()` primero
-- exigen `es_admin()` o `es_revendedor()`, que ya devuelven false para
-- inactivos — ver 0020_revendedores_rpc_helpers.sql), pero no en LECTURA:
-- las policies `... or vendedor_id = __SCHEMA__.mi_vendedor_id()` de
-- `revendedor_precios`, `entregas_revendedor`, `entrega_items`,
-- `ventas_revendedor` y `rendiciones` seguían dejando pasar a un
-- revendedor desactivado.
--
-- Revisado (0020_revendedores_rpc_helpers.sql + 0018_revendedores.sql):
-- ningún RPC de escritura depende de que `mi_vendedor_id()` devuelva un id
-- para un vendedor inactivo.
--  - `registrar_entrega_revendedor`/`registrar_rendicion`: llaman
--    `es_admin()` antes de `mi_vendedor_id()` (para el ADMIN que ejecuta,
--    no el revendedor destinatario) — sin cambio de comportamiento.
--  - `registrar_venta_revendedor`: llama `es_revendedor()` antes de
--    `mi_vendedor_id()` — sin cambio de comportamiento.
--  - `eliminar_venta_revendedor`: llama `mi_vendedor_id()` directo y
--    exige que no sea null (`NO_AUTORIZADO` si lo es) — con este fix, un
--    revendedor desactivado que intente borrar su propia venta ahora
--    recibe `NO_AUTORIZADO` en vez de que se le permita, que es el
--    comportamiento correcto (queda bloqueado, no solo en las policies).
--  - `fijar_precio_revendedor`/`asignar_rol_revendedor`: usan `es_admin()`
--    inline sin pasar por `mi_vendedor_id()`.
--
-- `create or replace function` preserva `security definer`,
-- `set search_path = __SCHEMA__` y el revoke/grant ya aplicado en 0018 (se
-- repiten igual por claridad, mismo criterio que 0020).
--
-- Migración templated (__SCHEMA__, sin __BUCKET__).

create or replace function __SCHEMA__.mi_vendedor_id()
returns uuid
language sql
stable
security definer
set search_path = __SCHEMA__
as $$
  select id from vendedores where user_id = auth.uid() and activo;
$$;

revoke execute on function __SCHEMA__.mi_vendedor_id() from public, anon;
grant execute on function __SCHEMA__.mi_vendedor_id() to authenticated;
