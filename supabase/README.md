# supabase/ — convención multi-negocio

Un mismo proyecto Supabase aloja dos negocios
independientes, cada uno en su propio schema Postgres, con las mismas
tablas/vistas/RPCs:

- `public` — Ananja (aceite de oliva). Schema histórico, migraciones
  0001-0013 ya aplicadas en producción.
- `miel` — Germá (miel). Mismo esquema, creado renderizando las mismas
  migraciones.

`auth.users` es compartido entre ambos negocios: un vendedor se distingue
por `raw_user_meta_data->>'negocio'` (`'ananja'` o `'germa'`), y un único
trigger/función global en `auth.users` (ver `0013_multi_negocio.sql`) rutea
el alta a `public.vendedores` o `miel.vendedores` según corresponda.

## Estado de producción (2026-09-06)

- `public` (Ananja): `0013_multi_negocio.sql` aplicada. **Importante:**
  `0012_ferias_validar_feria.sql` todavía **no** estaba aplicada en `public`
  al momento de crear el schema `miel` — es decir, `public` quedó en
  0001-0011 + 0013 (sin 0012) en ese momento; el schema `miel`, en cambio,
  sí se creó con el render completo 0001-0013 (0012 incluida). Hay que
  aplicar 0012 sobre `public` para emparejar ambos negocios.
- `miel` (Germá): schema completo creado renderizando 0001-0013 (render
  por default, todas las migraciones), más el seed
  (`supabase/negocios/miel.seed.sql`), más
  `0014_service_role_grants.sql` (aplicada en prod con el nombre
  `0014_service_role_grants_miel`; ver abajo).
- `0014_service_role_grants.sql`: aplicada en `miel`. Pendiente en
  `public` (ahí es redundante/idempotente: `public.service_role` ya tiene
  los privilegios por los default privileges del proyecto Supabase, pero
  conviene aplicarla igual para que ambos schemas queden en el mismo
  estado de migraciones).
- Exposed schemas: ya no se administra desde el dashboard, se fijó por SQL
  (`alter role authenticator set pgrst.db_schemas = 'public, graphql_public,
  miel'; notify pgrst, 'reload config';`) — ver detalle y advertencia en
  "Cómo aplicar en cada schema" más abajo.

## Convención: "escribir una vez, aplicar en cada negocio"

Toda migración se escribe **templated** (no hardcodea `public` ni
`comprobantes`) y se aplica sin cambios de contenido en cada negocio,
sustituyendo dos placeholders:

- `__SCHEMA__` — reemplaza toda referencia al schema de la app: `set
  search_path = __SCHEMA__` dentro de funciones, y calificaciones
  explícitas `__SCHEMA__.tabla` / `__SCHEMA__.funcion`.
  **No** reemplaza la palabra `public` cuando se usa como **rol** de
  Postgres (`grant ... to public`, `revoke ... from anon, authenticated,
  public` — el pseudo-rol "todos"), ni cuando es un nombre de columna
  (`storage.buckets.public`, el booleano que indica si el bucket es
  público).
- `__BUCKET__` — reemplaza el id/nombre del bucket de Storage
  `comprobantes` (en `storage.buckets` y `bucket_id = '...'`). **No**
  reemplaza la tabla `comprobantes` del schema de la app.

### `search_path = public` sin placeholder (migraciones "sueltas")

Algunas migraciones (p.ej. `0011_ferias.sql` / `0012_ferias_validar_feria.sql`,
escritas en otra rama sin pasar por el templating) fijan
`set search_path = public` (o `set search_path to public`, con o sin
esquemas adicionales separados por coma, p.ej. `search_path = public,
extensions`) a mano en sus funciones `security definer`, en vez de usar
`__SCHEMA__`. Para que también se rendericen correctamente por negocio,
`render.mjs` aplica una sustitución genérica adicional, sobre **todos** los
archivos, que reemplaza únicamente la palabra `public` cuando aparece
inmediatamente después de `search_path =` / `search_path to` (cualquier otra
aparición de `public` en el archivo, incluidas las de `__SCHEMA__` ya
resueltas, queda intacta). Para `--schema public` este reemplazo es un
no-op (`public` → `public`), así que no rompe la invariante de que
`0001`-`0013` renderizan byte a byte igual a sus fuentes.

Las mismas migraciones también hardcodean el prefijo de schema en vez de
dejarlo resolver por `search_path`: `create function public.foo()`,
`execute function public.foo()`, `revoke execute on function public.foo()
from ...`. `render.mjs` aplica un segundo reemplazo genérico, línea por
línea, que cambia `public.` (schema-prefijo, seguido de punto) por
`<schema>.`, salvo en líneas que son comentario completo (para no tocar
prosa como la de `0013_multi_negocio.sql` que menciona a propósito la tabla
real `public.notificaciones` de Ananja). No toca el rol `public` de
Postgres (`grant ... to public`, sin punto detrás) ni columnas como
`storage.buckets.public`.

Toda migración **nueva** debe preferir `__SCHEMA__` en vez de depender de
estas dos sustituciones; quedan documentadas solo porque 0011/0012 ya
existían así.

### Bloques `@solo-public`

Un bloque de SQL que solo tiene sentido en `public` (algo global del
proyecto, o un seed específico del negocio de Ananja) se marca así:

```sql
-- @solo-public:inicio
... SQL que solo corre para public ...
-- @solo-public:fin
```

`render.mjs` omite el bloque completo (markers incluidos) cuando
`--schema` no es `public`; cuando sí es `public`, deja el contenido pero
igual elimina las dos líneas de marker. Por eso renderizar con
`--schema public --bucket comprobantes` da un resultado **byte a byte
idéntico** al SQL original (verificado — ver "Verificación" abajo).

Bloques marcados hoy:

- **`0003_rls_seeds.sql`** — seed de `productos` (presentaciones de
  Ananja: Botella 250 ml / 500 ml). Cada negocio tiene su propio catálogo
  de presentaciones — ver `supabase/negocios/*.seed.sql`. Los seeds de
  `cajas` y `categorias_gasto` NO están marcados: son genéricos y van para
  todos los negocios. También están marcadas las 2 `create policy ...
  on storage.objects` (`comprobantes_storage_insert`/`_select`): esa
  tabla es global (ver regla de "objetos globales" abajo) y esos nombres
  fijos solo pueden crearse una vez en toda la base; `0013_multi_negocio.sql`
  los reemplaza por policies con nombre por-schema
  (`storage_insert_<schema>` / `storage_select_<schema>`).
- **`0007_vendedores_auth.sql`** — el bloque completo "2) Alta automática
  de vendedor" + "3) Backfill" (creación de la función/trigger
  `on_auth_user_created` sobre `auth.users`, y el backfill de los
  `auth.users` existentes sin vendedor vinculado). `auth.users` es una
  tabla compartida: solo puede existir UNA función/trigger global sobre
  ella (`0013_multi_negocio.sql` reemplaza su cuerpo por un router que lee
  `negocio`); y el backfill es una operación puntual sobre los usuarios
  que ya existían en 2026-09 (todos de Ananja) — repetirlo al renderizar
  `miel` volcaría todos los vendedores de Ananja dentro de
  `miel.vendedores`.
- **`0008_revoke_trigger_functions_rpc.sql`** — el `revoke execute ... on
  function __SCHEMA__.handle_new_auth_user()`: esa función solo existe en
  `public` (ver punto anterior), así que el revoke fallaría si se
  renderizara calificado hacia un schema donde la función no existe.
- **`0013_multi_negocio.sql`** — la función router
  `__SCHEMA__.handle_new_auth_user()` en sí (punto d).

## Cómo renderizar

```bash
# Ananja (public) — para verificar el invariante byte a byte
node supabase/render.mjs --schema public --bucket comprobantes

# Germá (miel) — todas las migraciones, a un archivo
node supabase/render.mjs --schema miel --bucket comprobantes-miel --out /tmp/miel.sql

# Un archivo puntual
node supabase/render.mjs --schema miel --bucket comprobantes-miel supabase/migrations/0013_multi_negocio.sql
```

También como script npm: `npm run db:render -- --schema miel --bucket comprobantes-miel`.

Sin archivos explícitos, concatena **todas** las `.sql` de
`supabase/migrations/` en orden alfabético/numérico — este es el camino
documentado para renderizar un negocio: todas las migraciones (0001-0013,
incluida la sección de Ferias) están templated con la misma convención, así
que no hace falta pasar una lista explícita de archivos.

## Cómo aplicar en cada schema

1. Renderizar (ver arriba) con el `--schema`/`--bucket` del negocio.
2. Aplicar el SQL resultante contra el proyecto: vía MCP de Supabase
   (`apply_migration`) con el SQL renderizado como contenido, o pegándolo
   en el SQL Editor del dashboard.
3. Correr el seed del negocio (`supabase/negocios/<schema>.seed.sql`).
4. Pasos manuales en el dashboard (una vez por negocio nuevo):
   - **Exposed schemas**: agregar el schema (ej. `miel`) para que
     PostgREST lo sirva — sin esto, `supabase-js` con
     `db: { schema: 'miel' }` no puede consultar nada. En producción esto
     se hizo por SQL en vez de por el dashboard (Project Settings → API →
     Exposed schemas no llegó a aplicarse a tiempo):
     ```sql
     alter role authenticator set pgrst.db_schemas = 'public, graphql_public, miel';
     notify pgrst, 'reload config';
     ```
     Advertencia (doc de Supabase): una vez que `pgrst.db_schemas` se fija
     por `alter role`, el dashboard deja de administrar los schemas
     expuestos (el campo de Project Settings → API queda desincronizado).
     Para agregar otro negocio nuevo hay que volver a correr el mismo
     `alter role` con la lista **completa** de schemas (no solo el nuevo).
     Para volver a que el dashboard controle esto: `alter role
     authenticator reset pgrst.db_schemas;` (y volver a configurar los
     schemas expuestos ahí).
   - **Database → Replication**: confirmar que la tabla `notificaciones`
     del schema quedó agregada a la publicación `supabase_realtime` (la
     hace `0005_realtime.sql` vía `search_path`, pero conviene verificar
     en el dashboard que el toggle de Realtime está activo).
   - Confirmar en **Storage** que el bucket propio del negocio (ej.
     `comprobantes-miel`) quedó creado y privado (lo crea `0003_rls_seeds.sql`
     templated).
   - Dar de alta el primer vendedor del negocio con
     `supabase/crear-vendedor.sql` (`v_negocio` = `'ananja'` o `'germa'`).

## Regla de oro

Toda migración **nueva** se escribe templated (`__SCHEMA__`/`__BUCKET__`,
`@solo-public` donde corresponda) y se aplica en **todos** los negocios
existentes (hoy: `public` y `miel`). No se escriben migraciones
hardcodeadas a un solo negocio salvo que el bloque sea explícitamente
`@solo-public` y esté justificado (algo global del proyecto, o un seed
propio de ese negocio).

## Regla: objetos globales (fuera del schema de la app)

Todos los negocios de este proyecto conviven en la **misma base**
Postgres. La mayoría de los objetos de una migración viven calificados por
`__SCHEMA__` (tablas, funciones, policies de tablas de la app) y por lo
tanto no colisionan entre negocios: cada uno tiene su propia copia. Pero
algunos objetos son **globales al proyecto**, no al schema — existen UNA
sola vez en toda la base aunque se rendericen N veces (una por negocio):

- `storage.objects` / `storage.buckets` — una sola tabla de Storage
  compartida por todo el proyecto. Los **nombres de policy son únicos por
  tabla**, no por schema: si dos negocios crean una policy con el mismo
  nombre fijo (ej. `comprobantes_storage_insert`), el segundo `create
  policy` falla (ya existe) o, si la migración hace `drop policy if
  exists` + `create policy` con ese nombre fijo (como hacía
  `0013_multi_negocio.sql` antes de esta corrección), el segundo negocio
  literalmente **le roba la policy al primero** (la borra y la recrea
  apuntando a su propio bucket). Por eso las policies de storage llevan
  `__SCHEMA__` en el nombre (`storage_insert___SCHEMA__` /
  `storage_select___SCHEMA__`, ver `0013_multi_negocio.sql`); el bucket en
  sí no tiene este problema porque cada negocio usa un `id` de bucket
  distinto (`__BUCKET__`) y el insert es idempotente (`on conflict (id) do
  nothing`).
- `auth.users` — tabla de Auth compartida. Solo puede existir **un**
  trigger `on_auth_user_created` sobre ella (no uno por negocio): en vez
  de un trigger por schema, hay un único trigger + función router
  (`__SCHEMA__.handle_new_auth_user()`, creado en `public` dentro de
  `@solo-public` por `0007_vendedores_auth.sql` y `0013_multi_negocio.sql`)
  que lee `raw_user_meta_data->>'negocio'` y decide en qué schema insertar.
- `supabase_realtime` (publicación de Replication) — una sola publicación
  compartida; cada negocio agrega su propia tabla (`__SCHEMA__.notificaciones`,
  vía `search_path`, en `0005_realtime.sql`) como miembro separado, así que
  no hay colisión: agregar `miel.notificaciones` no toca la membresía de
  `public.notificaciones`.
- Extensiones (`pgcrypto`, `create extension if not exists` en
  `0001_schema.sql`) — son de base completa, no de schema; `if not exists`
  las hace seguras de re-ejecutar al renderizar cada negocio.

**Regla:** cualquier objeto nuevo que viva fuera del schema de la app
(`storage.*`, `auth.*`, publicaciones, extensiones, roles, `pg_cron`,
etc.) tiene que o (a) llevar `__SCHEMA__`/`__BUCKET__` en su nombre para
que cada negocio tenga el suyo, o (b) ir en un bloque `@solo-public`
justificado porque es realmente único para todo el proyecto (y entonces
verificar que crearlo/reemplazarlo una sola vez alcanza para todos los
negocios), o (c) ser idempotente de forma que aplicarlo una vez por
negocio no rompa lo que ya existe de otro negocio (`if not exists` /
`on conflict do nothing`, nunca `create` a secas ni `drop ... ; create
...` con un nombre fijo).

## Verificación

```bash
# 1a) Migraciones templated (tienen __SCHEMA__/__BUCKET__: 0002, 0003, 0004,
#     0007, 0008, 0009, 0010): renderizarlas con --schema public --bucket
#     comprobantes NO da el archivo actual (que tiene los placeholders
#     literales) — da el SQL ORIGINAL, previo al templating de
#     a3b8135 (commit "feat: soporte multi-negocio..."). Comparar contra
#     esa versión, no contra el archivo en disco:
for f in 0002_views_rpcs.sql 0003_rls_seeds.sql 0004_fix_advisors.sql \
         0007_vendedores_auth.sql 0008_revoke_trigger_functions_rpc.sql \
         0009_clientes.sql 0010_lotes_produccion.sql; do
  diff <(node supabase/render.mjs --schema public --bucket comprobantes "supabase/migrations/$f") \
       <(git show a3b8135^:"supabase/migrations/$f")
done
# (sin salida = idéntico al SQL previo al templating)

# 1b) Migraciones sin placeholders (0001, 0005, 0006, 0011, 0012): nunca
#     pasaron por el templating (0011/0012 fijan `search_path = public` a
#     mano — ver "search_path = public sin placeholder" arriba; 0001/0005/
#     0006 no tienen SQL schema-calificado que sustituir). Para estas sí
#     vale comparar el render contra el archivo tal cual, porque coincide
#     byte a byte con su propia versión pre-templating:
for f in 0001_schema.sql 0005_realtime.sql 0006_indexes_fk.sql \
         0011_ferias.sql 0012_ferias_validar_feria.sql; do
  diff <(node supabase/render.mjs --schema public --bucket comprobantes "supabase/migrations/$f") \
       "supabase/migrations/$f"
done
# (sin salida = idéntico)

# 1c) Excepción: 0013_multi_negocio.sql y 0014_service_role_grants.sql
#     nacieron DESPUÉS del templating (a3b8135 y el commit de 0014,
#     respectivamente), ya escritas con __SCHEMA__/__BUCKET__ desde el
#     principio — no existe una versión pre-templating de ninguna de las
#     dos con la que comparar, así que no aplica un diff byte a byte acá.
#     Se verifican con el chequeo de "sin placeholders colgados" del
#     punto 2 (renderizando miel, más abajo).

# 2) Render de miel sin errores, y sin referencias colgadas — sin lista
#    explícita de archivos: toma TODAS las migraciones (0001-0014)
node supabase/render.mjs --schema miel --bucket comprobantes-miel \
  --out /tmp/miel.rendered.sql
grep -n '__SCHEMA__\|__BUCKET__' /tmp/miel.rendered.sql   # no debe haber matches
grep -n 'public\.' /tmp/miel.rendered.sql                  # no debe haber matches (tablas/funciones de la app)
```

### Verificación local: SIEMPRE en UNA sola base, con la secuencia de prod

Los objetos globales (ver regla arriba) solo se detectan probando contra
la **misma base** que recibe ambos negocios — testear `public` y `miel`
en bases separadas esconde exactamente este tipo de bug (pasó con las
policies de `storage.objects`: cada negocio en su propia base nunca choca
con el otro). La verificación local reproduce la secuencia real de
producción en un único Postgres descartable:

1. Levantar un Postgres 15 descartable (`initdb` + `pg_ctl` en un
   directorio temporal, con roles `anon`/`authenticated`, stubs mínimos de
   `auth.users` + `auth.uid()` (leyendo un GUC de sesión, ver
   `auth.login_as(uuid)` de ejemplo) y de `storage.buckets`/`storage.objects`,
   `pgcrypto`, y una publicación `supabase_realtime` vacía).
2. Render `--schema public --bucket comprobantes` de 0001..0012 (estado
   actual de prod) y aplicarlo.
3. Render `--schema public --bucket comprobantes` SOLO de
   `0013_multi_negocio.sql` y aplicarlo (simula la migración que falta
   correr en prod sobre `public`).
4. Render `--schema miel --bucket comprobantes-miel` completo (default,
   0001..0013) y aplicarlo (crea `miel` desde cero, en la MISMA base que
   ya tiene `public`).
5. Aplicar `supabase/negocios/miel.seed.sql`.
6. Verificar en esa misma base: `pg_policies` de `storage.objects` (4
   policies, una por negocio × operación, apuntando cada una a su
   bucket); `storage.buckets` tiene los 2 buckets; 0 policies de
   `public`/`miel` con `qual`/`with_check` literal `'true'`; un único
   trigger `on_auth_user_created` sobre `auth.users` cuya función router
   inserta en `public.vendedores` o `miel.vendedores` según
   `raw_user_meta_data->>'negocio'`; `pg_publication_tables` tiene
   `public.notificaciones` y `miel.notificaciones`; y aislamiento RLS
   (`set role authenticated` + `auth.login_as(<uuid>)`) — un vendedor de
   un negocio ve sus propias filas y 0 filas del otro negocio.
7. Parar el Postgres y borrar el directorio de datos.
