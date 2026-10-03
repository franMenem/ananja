# Ananja

> **English summary.** Ananja is a back-office web app (mobile-first, installable
> as a PWA) for a small olive-oil brand. It tracks production batches with real
> per-bottle costs, stock, sales receipts, expenses, reseller accounts
> (deliveries, sales, payments with proof of payment) and cash across bank,
> Mercado Pago and cash held by people. Built with Next.js 16 (App Router),
> React 19, TypeScript, Tailwind CSS 4 and Supabase (Postgres with RLS and
> `security definer` SQL functions). Business rules live in pure, unit-tested
> TypeScript modules; every write goes through audited SQL functions; access is
> split by role (admin / coordinator / reseller). The UI is in Spanish
> (Argentina). The data and names in this repository are fictional.

Ananja es la app de gestión de una marca chica de aceite de oliva: lleva la
producción por lotes con **costos reales**, el stock, las ventas y comprobantes,
los gastos, las **revendedoras** (entregas, ventas, pagos con comprobante) y la
**plata** (cuenta bancaria, Mercado Pago y efectivo que está en manos de
personas hasta que se transfiere).

Es una aplicación web pensada para el celular (se instala como PWA) y con
versión de escritorio.

## Qué resuelve

- **Producción por lotes.** Cada pedido a la fábrica es un lote con sus costos
  reales: aceite (en dólares, con el dólar del lote), envasado, etiquetas
  (frente y reverso), transporte e IVA no recuperable. Calcula el costo por
  botella, el costo para la marca (con redondeo manual opcional) y los precios
  sugeridos (márgenes encadenados). Separa **lo que cuesta** de **lo que se
  paga**, con pagos por concepto y saldo pendiente.
- **Stock.** Depósito por presentación y por lote (FIFO), insumos con recetas,
  mermas y degustaciones como egresos explícitos, alertas de stock bajo.
- **Ventas.** Comprobantes con foto, ventas a crédito con cobros parciales,
  clientes con deuda, material de venta para compartir.
- **Revendedoras.** Entregas por lote, ventas con atribución FIFO del costo,
  pagos con confirmación, ganancia de la marca y de cada revendedora, y un
  espacio propio (`/mi`) donde cada una ve y carga lo suyo.
- **Plata.** Una cuenta única de la marca, efectivo en manos de personas por
  transferir, depósitos informados y confirmados, deuda por vendedora.
- **Tareas y avisos.** Lo pendiente (confirmar pagos, pasar efectivo, completar
  costos) con notificaciones push.

## Stack

| Capa | Tecnología |
| --- | --- |
| Framework | Next.js 16 (App Router, Server Components) |
| UI | React 19, Tailwind CSS 4 |
| Lenguaje | TypeScript |
| Datos y auth | Supabase: Postgres, Auth, Storage |
| Seguridad de datos | Row Level Security + funciones SQL `security definer` |
| Validación | Zod |
| Tests | Vitest (unitarios, snapshots de UI con jsdom) |
| CI/CD | GitHub Actions, despliegue en Vercel |
| Extras | Web Push, OCR de montos opcional (Vercel AI Gateway) |

## Arquitectura

```
app/            Rutas (App Router): (app) panel admin, (mi) espacio de revendedora,
                (auth) login, api/ endpoints (push, cron, OCR, versión)
components/     UI por dominio (stock, plata, revendedores, comprobantes, ...)
lib/data/       Lecturas contra Supabase: una función por consulta, sin lógica
lib/dominio/    Reglas de negocio PURAS (costos, márgenes, FIFO, plata, tareas):
                sin red ni mocks, cubiertas por tests
lib/            Infraestructura transversal (sesión, navegación, dinero, fechas)
                y las escrituras (llamadas a RPC) de cada dominio
supabase/       Migraciones SQL numeradas, plantillas de mails y render por negocio
tests/          Vitest: reglas de dominio, componentes, esquema de migraciones
```

Decisiones de diseño:

- **Lecturas** en `lib/data`, pensadas para correr tanto en un Server Component
  como en el cliente, siempre con el cliente de Supabase del usuario (nunca
  con la service role).
- **Lógica pura y testeada** en `lib/dominio`: el cálculo del costo de una
  botella, el reparto FIFO de ventas por entrega, la parte de la marca en cada
  pago, etc. son funciones sin efectos, con tests de ejemplos hechos a mano.
- **Escrituras** únicamente por **funciones SQL `security definer`** (RPC):
  validan el rol, aplican las invariantes (saldos, stock, pagos) dentro de una
  transacción y devuelven errores con códigos que la UI traduce. La app no
  hace `insert`/`update` directos sobre las tablas sensibles.
- **RLS por rol**: `admin` (todo), `coordinador` (ve y administra a sus
  revendedoras y la plata que tiene en mano) y `revendedor` (solo lo propio).
  Las vistas usan `security_invoker` para heredar las políticas de las tablas.
- **Multi-negocio opcional**: las migraciones están escritas con placeholders
  (`__SCHEMA__`, `__BUCKET__`) y `supabase/render.mjs` las renderiza para cada
  negocio/schema (ver `supabase/README.md`).

## Cómo correrlo en local

Requisitos: Node 24 (ver `.nvmrc`) y un proyecto de Supabase (gratuito alcanza).

```bash
npm install
cp .env.example .env.local   # completá URL y anon key de tu proyecto
```

1. En Supabase, creá un proyecto vacío y aplicá las migraciones de
   `supabase/migrations/` en orden (SQL Editor o Supabase CLI). Para renderizar
   las migraciones para un schema distinto de `public`: `npm run db:render`
   (ver `supabase/README.md`).
2. Creá un usuario administrador con `supabase/crear-vendedor.sql` (leé los
   comentarios del archivo antes de ejecutarlo) o invitá uno desde el panel de
   Authentication.
3. Arrancá el servidor de desarrollo:

```bash
npm run dev      # http://localhost:3000
```

Variables de entorno: están todas documentadas en `.env.example`. Solo la URL y
la anon key de Supabase son obligatorias; push, OCR, invitaciones por mail y el
keep-alive son opcionales.

## Tests y calidad

```bash
npm test                       # Vitest (unitarios y snapshots)
npx tsc --noEmit               # tipos
npm run lint                   # ESLint, sin warnings
./scripts/ci/check-migraciones.sh   # sanidad de las migraciones SQL
npm run build                  # build de producción
```

Los tests de fechas esperan el huso horario de Argentina:

```bash
TZ=America/Argentina/Buenos_Aires npm test
```

`npm run test:integration` corre invariantes contra una base real de Supabase y
necesita las variables `TEST_USER_*` (ver `.env.example`); no forma parte de la
CI.

El workflow de GitHub Actions (`.github/workflows/ci.yml`) corre tipos, lint,
tests, chequeo de migraciones y build en cada push y pull request.

## Estructura de la base

Las migraciones (`supabase/migrations/`, numeradas desde `0001`) crean tablas,
vistas, funciones y políticas RLS. Algunos módulos centrales:

- **Producción**: lotes, ítems por presentación, costos por concepto, pagos del
  pedido, vistas de costo y saldo.
- **Ventas y stock**: comprobantes, movimientos de stock, cobros, clientes.
- **Revendedoras**: entregas, ventas por entrega, rendiciones (pagos),
  encargados y coordinadores.
- **Plata**: cajas, transferencias, depósitos a la cuenta de la marca, vistas de
  plata en manos y deuda por vendedora.

## Licencia

Proyecto personal publicado como muestra de trabajo. Todos los nombres, montos y
datos de los ejemplos y de los tests son inventados.
