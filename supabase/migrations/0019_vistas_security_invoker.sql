-- Corrige security_invoker faltante en v_saldos_caja
--
--
-- 0018_revendedores.sql redefinió v_saldos_caja con `create or replace
-- view` para sumar rendiciones, pero no volvió a declarar
-- `security_invoker = true` en esa sentencia. A diferencia de un `alter
-- view ... set (...)`, un `create or replace view` no conserva las
-- reloptions previas: quedaron perdidas y la vista volvió a evaluarse
-- con los privilegios del dueño (security definer implícito) en lugar
-- de los del usuario que consulta. Esta migración la corrige, y de paso
-- confirma que el resto de las vistas del schema (v_costo_lote,
-- v_costo_lote_item, v_costo_producto, v_feria_stock, v_feria_totales,
-- v_precio_item, v_resumen_revendedor, v_stock_actual, v_stock_insumos,
-- v_stock_revendedor) ya tienen security_invoker=true.
--
-- Migración templated (__SCHEMA__).

alter view __SCHEMA__.v_saldos_caja set (security_invoker = true);
