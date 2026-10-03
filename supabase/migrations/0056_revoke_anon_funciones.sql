-- Ananja: saca el EXECUTE que Supabase le da a `anon` por default privileges
-- al crear una función en `public` (mismo hallazgo de 0004/0008/0044: el
-- rol `postgres` tiene un `ALTER DEFAULT PRIVILEGES` en `public` que arma
-- toda función nueva con `{postgres=X,anon=X,authenticated=X,service_role=X}`
-- — un `revoke ... from public` NO alcanza a `anon`, hay que revocarlo
-- explícito). Verificado contra prod con `pg_proc.proacl` y
-- `get_advisors(security)`: el lint `anon_security_definer_function_executable`
-- da exactamente estas 4 funciones, ninguna otra función de `public` tiene
-- `anon` de más (las 45 restantes ya quedaron limpias por 0004/0008/0044/
-- 0049/0050/0052, que revocan `anon` a mano en cada RPC/trigger nuevo).
--
--  - `es_coordinador()`/`es_coordinador_de(uuid)`/
--    `lotes_disponibles_coordinador(uuid)` (0055): a estas SÍ les faltó el
--    `revoke ... from anon` que sus hermanas `es_admin()`/`es_vendedor()`/
--    `mi_vendedor_id()`/`puede_revender()` sí tienen — la migración solo
--    hacía `revoke all ... from public; grant ... to authenticated;`, que
--    deja colado el grant explícito a `anon` del default. Ninguna pantalla
--    pública (`/login`, `/bienvenida`, `/auth/confirm`, invitaciones) llama
--    a estas tres — se verificó el código, ahí solo se usa
--    `supabase.auth.*`, ningún `.rpc()` — así que sacarle `anon` no rompe
--    nada; siguen ejecutables por `authenticated` (las usan las policies de
--    RLS y `lib/coordinador.ts`).
--  - `comprobante_items_foto_costo_lote()` (0052): función trigger nueva
--    (`create function`, no `create or replace`) que se quedó SIN el
--    `revoke ... from anon, authenticated, public` que su hermana
--    `entrega_items_foto_costo_lote()` (0044) sí tiene — un descuido de
--    0052, no algo de esta rama. Como es una función trigger
--    (`returns trigger`), Postgres no chequea EXECUTE para dispararla
--    desde el trigger (solo hace falta para llamarla directo por SQL/REST,
--    `/rest/v1/rpc/comprobante_items_foto_costo_lote`) — revocarle el
--    EXECUTE a los tres roles no cambia el comportamiento del trigger,
--    mismo criterio que `entrega_items_foto_costo_lote`.
--
-- Fuera de esta migración (evaluado, no aplica): el `ALTER DEFAULT
-- PRIVILEGES` en sí no se toca — cambiarlo significa `alter default
-- privileges for role postgres in schema public revoke execute on functions
-- from anon`, que requeriría ejecutarse con el rol `postgres` (no
-- disponible desde una migración de `supabase db push` corriendo como el
-- rol de la migración) y además taparía el default de UNA SOLA VEZ, sin
-- garantía de que seguirá vigente si algún día se crea la función con otro
-- rol/owner — más frágil que seguir revocando `anon` a mano en cada
-- función nueva, que es el patrón ya establecido y probado en este repo
-- desde 0004. Se deja como está: cada migración que agregue una función en
-- `public` sigue teniendo que revocar `anon` explícito (y `public`/
-- `authenticated` si es una función trigger).

revoke execute on function public.es_coordinador() from anon;
revoke execute on function public.es_coordinador_de(uuid) from anon;
revoke execute on function public.lotes_disponibles_coordinador(uuid) from anon;

revoke execute on function public.comprobante_items_foto_costo_lote() from anon, authenticated, public;
