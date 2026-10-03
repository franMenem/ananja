# Keep-alive de Supabase

## Qué problema resuelve

El proyecto Supabase de Ananja está en el **plan free**. Supabase pausa
los proyectos free que no ven suficiente actividad en ~7 días. Si el
proyecto se pausa, la app entera deja de funcionar hasta que alguien lo
reactiva a mano desde el dashboard de Supabase.

## Cómo funciona

```
Vercel Cron (diario, 12:17 UTC)  ──┐
                                    ├──▶  GET /api/cron/keepalive  ──▶  insert + delete en public.keepalive
GitHub Action (cada 6 h)  ─────────┘
```

Dos disparadores externos e independientes, a horarios que no coinciden,
le pegan al mismo endpoint:

- **Vercel Cron** (`vercel.json`) — una vez por día, `17 12 * * *`. El
  plan Hobby de Vercel no permite más frecuencia que esa para cron jobs.
- **GitHub Action** (`.github/workflows/supabase-keepalive.yml`) — cada 6
  horas, de respaldo. Si el ping principal falla, el workflow prueba un
  fallback directo contra Supabase (`/auth/v1/health` con la anon key,
  sin pasar por la app) antes de darse por vencido — así, si el deploy de
  Vercel está roto, igual se genera actividad contra el proyecto.

El endpoint (`app/api/cron/keepalive/route.ts`) hace, con
`createAdminClient()` (service role, salta RLS):

1. Un **insert** en `public.keepalive` con `source` = `vercel` / `github` /
   `manual` según quién llamó.
2. Un **delete** de las filas de esa tabla con más de 30 días.
3. Un select de conteo (extra, no cambia nada — solo confirma que la
   tabla sigue siendo legible con la service role).

## Por qué hace falta escribir y no alcanza con leer

Esto **no es la primera vez** que se implementa este mecanismo. La
primera fue en otro proyecto (Ascendant), con un endpoint que solo hacía
un `SELECT`. Resultado real: siguieron llegando avisos de pausa de
Supabase (2026-07-08, 2026-07-15, 2026-08-15) pese a tener ~4 lecturas
diarias corriendo. Solo se resolvió de verdad al agregar una escritura
real (insert) además de la lectura. Por eso esta implementación en
Ananja escribe desde el primer día, en vez de repetir el error.

Existe una **skill genérica** (`supabase-keepalive`) que destila el
patrón de las dos implementaciones (Ascendant y Ananja) para el próximo
proyecto que necesite esto.

## Dónde vive cada secreto

| Secreto | Dónde | Para qué |
|---|---|---|
| `CRON_SECRET` | Vercel → Settings → Environment Variables (Production + Preview) | Vercel Cron lo manda automáticamente como `Authorization: Bearer $CRON_SECRET` — solo si la env var está seteada en el proyecto. |
| `CRON_SECRET` | GitHub → repo → Settings → Secrets and variables → Actions | El workflow lo manda igual, a mano, en el `curl`. **Tiene que ser el mismo valor** que el de Vercel — son dos configuraciones separadas que no se sincronizan solas. |
| `KEEPALIVE_URL` | GitHub Secrets | URL completa del endpoint en prod, **sin** query string (ej. `https://ananja.example.com/api/cron/keepalive`). Si cambia el dominio de producción, actualizar este secreto — si no, el keep-alive le sigue pegando a una URL vieja en silencio. |
| `SUPABASE_URL` | GitHub Secrets | Base para el fallback directo (`/auth/v1/health`). |
| `SUPABASE_ANON_KEY` | GitHub Secrets | Header `apikey` del fallback. |

Solo la tabla `keepalive` es tocada por este mecanismo — el endpoint
nunca lee ni escribe ninguna otra tabla de la base.

## `keepalive`, la tabla

Migración `0068_keepalive.sql`. RLS activado, **sin policies** (eso ya
bloquea todo acceso vía REST a `anon`/`authenticated`) más un `revoke`
explícito como refuerzo. Solo el cliente con la service role key
(`lib/supabase/admin.ts`, usado server-side) puede tocarla — el mismo
patrón que ya usan `/api/push/send` y las rutas de invitación.

## Cómo verificar que anda

- **Filas por origen** (SQL Editor de Supabase o vía MCP, de solo
  lectura):

  ```sql
  select source, count(*), max(pinged_at)
  from public.keepalive
  group by source;
  ```

  Después de que ambos disparadores corrieron al menos una vez, tiene que
  aparecer una fila `vercel` y otra `github` (y `manual` si se probó a
  mano con `curl`).

- **Workflow de GitHub**:

  ```bash
  gh workflow run supabase-keepalive.yml
  gh run list --workflow supabase-keepalive.yml --limit 1
  ```

  Tiene que terminar en `success`.

- **Logs de Vercel** — Vercel → proyecto → Logs, filtrando por
  `/api/cron/keepalive`, o Settings → Cron Jobs para confirmar que el
  cron está registrado con el `schedule` esperado.

- **A mano**:

  ```bash
  # Sin header: tiene que dar 401 (no un redirect a /login — ver el
  # gotcha del matcher más abajo).
  curl -i https://ananja.example.com/api/cron/keepalive

  # Con el secreto: 200 y { ok: true }.
  curl -i -H "Authorization: Bearer <CRON_SECRET>" \
    "https://ananja.example.com/api/cron/keepalive?source=manual"
  ```

## Cómo rotar el secreto

1. Generar uno nuevo (ej. `openssl rand -hex 32`).
2. Actualizarlo en Vercel (Settings → Environment Variables →
   `CRON_SECRET`) **y** en GitHub Secrets (`CRON_SECRET`) — son dos
   lugares independientes con el mismo nombre; si se actualiza uno y no
   el otro, ese disparador empieza a recibir 401.
3. Redesplegar (o esperar al próximo deploy) para que Vercel Cron use el
   valor nuevo.

## El gotcha del `matcher` de `proxy.ts`

`proxy.ts` protege casi toda la app redirigiendo a `/login` sin sesión.
Vercel Cron y el GitHub Action le pegan al endpoint **sin cookie de
sesión** — sin excluir `api/cron` del `matcher`, el proxy los redirige a
`/login` antes de que el request llegue al route handler: el ping
"funciona" (devuelve algo con 200/307) pero nunca toca la base, y el
aviso de pausa de Supabase vuelve igual. El `matcher` de `proxy.ts` ya
excluye `api/cron` junto con `api/version` (mismo problema, ya resuelto
ahí antes) — si se reescribe el `matcher` en el futuro, no perder esa
exclusión.

## Cómo sacarlo si se pasa a Supabase Pro

Los planes pagos de Supabase **no se pausan nunca** — es el arreglo de
fondo, y este keep-alive es solo un parche mientras el proyecto sigue en
free. Si en algún momento se pasa a Pro:

1. Borrar `app/api/cron/keepalive/route.ts` y `lib/cron/autorizar.ts`
   (+ su test).
2. Sacar la entrada `crons` de `vercel.json`.
3. Borrar `.github/workflows/supabase-keepalive.yml` y los secrets
   `CRON_SECRET`/`KEEPALIVE_URL`/`SUPABASE_URL`/`SUPABASE_ANON_KEY` de
   GitHub (y `CRON_SECRET` de Vercel).
4. Sacar `api/cron` de la exclusión del `matcher` en `proxy.ts`.
5. Una migración que haga `drop table public.keepalive;`.

No hace falta hacerlo con urgencia — dejar el keep-alive corriendo en un
proyecto Pro no rompe nada, solo es trabajo de sobra.
