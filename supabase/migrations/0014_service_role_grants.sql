-- Ananja/Germá: privilegios de service_role por schema.
-- En `public` service_role ya tiene todo por los default privileges del
-- proyecto Supabase; en un schema nuevo (miel) no existen, y los clientes
-- service-role de la app (app/api/push/send, app/api/ocr-monto) fallarían
-- con "permission denied". Solo service_role: anon/authenticated siguen con
-- los grants explícitos por tabla de las migraciones anteriores.
grant usage on schema __SCHEMA__ to service_role;
grant all on all tables in schema __SCHEMA__ to service_role;
grant all on all routines in schema __SCHEMA__ to service_role;
grant all on all sequences in schema __SCHEMA__ to service_role;
alter default privileges for role postgres in schema __SCHEMA__ grant all on tables to service_role;
alter default privileges for role postgres in schema __SCHEMA__ grant all on routines to service_role;
alter default privileges for role postgres in schema __SCHEMA__ grant all on sequences to service_role;
