-- Ananja: corrige hallazgos de get_advisors (security)
-- 1) Supabase otorga EXECUTE directo a anon/authenticated al crear funciones
--    (default privileges), por lo que "revoke ... from public" en 0002 no
--    alcanzaba a anon. Se revoca explícitamente de anon, dejando solo
--    authenticated, en línea con "acceso solo para rol authenticated".
-- 2) search_path mutable en la función trigger set_updated_at.

revoke execute on function crear_comprobante(uuid, bigint, medio_pago, text, date, text, estado_ocr, bigint, jsonb, boolean) from anon;
revoke execute on function actualizar_comprobante(uuid, uuid, bigint, medio_pago, text, date, text, estado_ocr, bigint, jsonb, boolean) from anon;
revoke execute on function crear_gasto(uuid, bigint, uuid, medio_pago, date, text, text) from anon;
revoke execute on function crear_ajuste_caja(medio_pago, bigint, text, uuid) from anon;

alter function set_updated_at() set search_path = __SCHEMA__;
