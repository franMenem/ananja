# `lib/dominio/`

Reglas de negocio PURAS: cálculo, validación, armado de resúmenes. Nada de
`supabase`, nada de `next/*`, nada de I/O — se puede testear con fixtures,
sin red ni mocks. Es el espejo puro de `lib/data/` (que es solo lecturas
contra Supabase) y de `lib/` raíz (infraestructura transversal — sesión,
navegación, storage, `money.ts`, `fechas.ts`, `negocio.ts`, `types.ts` — y
las escrituras/RPC que cada dominio todavía mantiene junto a sus tipos).

## Qué va acá

- Funciones puras de cálculo/validación/formateo de un dominio de negocio
  (costos de lote, márgenes, stock por entrega FIFO, tareas, plata en
  manos, etc.).
- Tipos y constantes que esas funciones necesitan.
- Nada que reciba un `SupabaseClient` ni haga `await` sobre una consulta.

## Qué NO va acá

- Lecturas contra Supabase → `lib/data/<dominio>.ts` (ver su README).
- Escrituras/RPC → se quedan en `lib/<dominio>.ts` junto a sus tipos,
  salvo que separarlas fuera trivial.
- Infraestructura transversal (sesión, navegación, storage, push, tipos
  generados, `money.ts`, `fechas.ts`) → se queda en `lib/` raíz.

## Un archivo mixto

Cuando un archivo de `lib/` mezcla cálculo puro con lecturas/escrituras, el
archivo original se queda con el I/O y esta carpeta se lleva solo la parte
pura (import cruzado desde `lib/<dominio>.ts` hacia acá cuando hace falta
un tipo o una función pura).
