# `lib/data/`

Capa de consultas: un archivo por dominio. Objetivo de esta etapa: sacar
las lecturas directas (`supabase.from()/.rpc()`) de páginas y componentes.
Gastos (`lib/data/gastos.ts`) es la referencia; el resto de los dominios
copia esta convención.

Archivos de dominio: `catalogos.ts` (compartido, ver más abajo),
`clientes.ts`, `comprobantes.ts`, `ganancia.ts`, `gastos.ts`, `inicio.ts`,
`insumos.ts`, `lotes.ts`, `material.ts`, `mi.ts`, `negocio.ts` (configuración
editable del negocio — hoy el nombre del proveedor; lectura tolerante a que la
migración todavía no esté aplicada), `pagos-revendedor.ts`, `plata.ts`,
`revendedores.ts`, `stock.ts`, `tareas.ts`.

## Qué va acá

- Solo LECTURAS (`select`) y llamadas RPC de lectura. Nada de JSX, formateo
  ni reglas de negocio — eso vive en los módulos puros de `lib/dominio/`
  (ej. `lib/dominio/gastos.ts`, `lib/dominio/tareas.ts`; ver su README).
- Cada función recibe el cliente como primer parámetro,
  `supabase: SupabaseClient<Database>` — nunca lo crea (así sirve igual
  desde un Server Component, `lib/supabase/server.ts`, y desde un Client
  Component, `lib/supabase/client.ts`) y nunca usa la service role.
- Tipos explícitos exportados, derivados de `lib/types.ts`. Los `as unknown
  as` del límite jsonb (embeds que el generador de tipos no arma solo)
  quedan encerrados acá adentro, no en la página.
- `select` con columnas explícitas (no `*`, salvo que la pantalla de
  origen ya pedía `*`). Embed con FK explícita cuando la tabla tiene más de
  una FK hacia el mismo destino (si no, PostgREST tira PGRST201 —
  `vendedores!gastos_vendedor_id_fkey(nombre)`, lección de
  `supabase/migrations/0049`).

## Errores

Dos formas, según lo que ya hacía la mayoría del código (`lib/deudas.ts`,
`lib/data/tareas.ts`) — no se inventó una nueva para no cambiar el
comportamiento visible:

- **Listas**: `Promise<{ data: T[]; error: string | null }>`. En error,
  `data: []` (la pantalla sigue renderizando, vacía) y `error` ya es el
  mensaje para mostrar; loguear el error crudo con `console.error` antes de
  traducirlo.
- **Un solo registro**: `Promise<T | null>` — `null` tanto si no existe
  como si la consulta falló (así ya lo trataban las páginas: "no
  encontrado", sin distinguir el motivo).

## Catálogos compartidos

`lib/data/catalogos.ts` junta las lecturas que varios dominios pedían por
separado con exactamente las mismas columnas/filtros/orden:
`productos` (fila completa, orden ascendente por presentación —
Comprobantes, Revendedores y Depósito/Stock la usaban idénticas o con un
subconjunto de columnas) y `vendedores` `id`/`nombre` sin filtrar
(Ganancia y la ficha de Lote). Cada dominio conserva su función/nombre
exportado de siempre (para no tocar los `import` de las páginas) pero
delega en `catalogos.ts` por dentro.

Lo que difiere de verdad se queda en su archivo de dominio, sin forzar la
unificación: orden descendente (`/stock/lotes/nuevo`), filtros por rol o
por lista de ids (`listarAdminsActivos` en `plata.ts`,
`listarVendedoresPorIds` en `revendedores.ts`), o una vista distinta
(`v_productos_publicos` en `mi.ts`, para revendedoras — no es la misma
fuente que la tabla `productos`).

Antes de sumar una lectura nueva acá: solo va si es la MISMA
consulta (o un subconjunto/superconjunto inocuo de columnas, sin cambiar
orden ni filtros) que ya pide otro dominio — si difiere de verdad, se
queda en su archivo.

## Performance

- Consultas independientes de una pantalla van en UN solo `Promise.all`
  (una tanda). Si hace falta una segunda tanda que depende de la primera,
  que sea la única (ver `lib/data/tareas.ts` como ejemplo con dos tandas).
- Server Components: si un layout y su página leen lo mismo en el mismo
  request, envolver la lectura con `cache()` de React en un wrapper de
  servidor. Sin un caso real todavía en el repo para copiar — cuando
  aparezca uno, documentarlo acá con el archivo de ejemplo.

## Qué NO va acá

Las escrituras que hoy hacen los formularios (inserts, updates, RPC de
alta/edición) se quedan donde están en esta etapa, salvo que moverlas sea
trivial. El objetivo acá son las lecturas de páginas y componentes.

## Tests

Una función pura de mapeo/agregación → test (en `lib/dominio/`, no acá). La
consulta en sí no se testea con mocks de red — convención del repo.
