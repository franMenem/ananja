-- Las funciones trigger no deben quedar expuestas como RPC vía PostgREST
-- (Supabase otorga EXECUTE a anon/authenticated por default al crearlas,
-- igual hallazgo que 0004_fix_advisors.sql para los RPCs legítimos). Estas
-- dos solo tienen sentido invocadas por su trigger, nunca por el cliente.

revoke execute on function __SCHEMA__.forzar_vendedor_movimiento_stock() from anon, authenticated, public;
-- @solo-public:inicio
revoke execute on function __SCHEMA__.handle_new_auth_user() from anon, authenticated, public;
-- @solo-public:fin
