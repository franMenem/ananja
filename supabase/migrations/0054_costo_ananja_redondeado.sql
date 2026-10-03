-- Ananja: costo Ananja REDONDEADO por pedido y presentación — pedido de
-- Fran (dueño), decisiones cerradas 2026-09-17. El costo Ananja calculado
-- (costo real × (1 + ganancia%)) sale con decimales; Fran carga un
-- redondeado por pedido y presentación, al lado del calculado, que pasa a
-- ser el precio que se les exige a las revendedoras y el costo que le
-- importa a Ananja. Sin redondeo cargado, se sigue usando el calculado —
-- ningún lote existente cambia de número con esta migración sola (columnas
-- nuevas, todas nullable, sin backfill de redondeo).
--
-- Esta migración es SOLO la parte A del plan de la tanda (costo redondeado).
-- Dos ramas en paralelo tocan temas relacionados y quedan FUERA de acá:
--  - `feature/sin-diferencia-encargado` saca la "diferencia de encargado"
--    (0044) del código, sin migraciones — esta migración no depende de eso
--    ni lo toca: `entrega_items.costo_lote_unitario_centavos`/
--    `v_costo_lote_venta` (el framework de fotos de costo que 0044 empezó y
--    0052 generalizó) siguen exactamente iguales.
--  - Un futuro rol "coordinador" (parte B del plan) no se toca acá.
--
-- Diseño (verificado contra prod, schema `public`,
-- 2026-09-17, con `pg_get_viewdef`/`pg_get_functiondef`/
-- `information_schema.columns` — no contra los .sql de migraciones
-- anteriores, que pueden no ser 100% lo que corre hoy: 0049 se aplicó a
-- mano):
--
--  1) `lote_items.costo_ananja_redondeado_centavos` (nueva, nullable, grano
--     exacto de "por pedido y presentación" — `lote_items` ya tiene
--     `UNIQUE(lote_id, producto_id)`, confirmado, no hace falta tabla
--     nueva). Se guarda dentro del mismo `p_costos` que ya usan
--     `crear_lote`/`fijar_costos_lote` (mismo patrón que `p_costos.redondeos`
--     desde 0038): una clave nueva, `costos_ananja_redondeados` (array de
--     `{producto_id, monto_centavos}`), que la UI manda con una fila por
--     presentación del pedido. Elegí este mínimo cambio — en vez de agregar
--     un parámetro nuevo a `crear_lote`/`fijar_costos_lote` — porque las
--     dos funciones YA delegan todo el guardado de costos en
--     `public.aplicar_costos_lote(p_lote_id, p_costos)` (confirmado con
--     `pg_get_functiondef`: ninguna de las dos toca `lote_costos`/
--     `lote_items` directamente), así que agregar el bloque ahí adentro
--     alcanza para las dos SIN tocar su firma ni su cuerpo — cero cambio en
--     `crear_lote`/`fijar_costos_lote`.
--
--  2) `lote_valoraciones.costo_ananja_calculado_centavos` (nueva, NOT NULL
--     tras backfill — siempre se puede calcular) y
--     `.costo_ananja_redondeado_centavos` (nueva, nullable) — la valoración
--     ("Actualizar costos del depósito", 0052) lleva SU PROPIO redondeo,
--     independiente del redondeo del pedido en `lote_items`: mismo patrón
--     `p_costos.costos_ananja_redondeados`, pasado a
--     `actualizar_costo_lote_vigente`. Si esa llamada no menciona un
--     producto en el array, hereda el redondeo VIGENTE de `lote_items` de
--     ese producto (no lo pierde en silencio) — la pantalla lo precarga
--     igual que ya hace con ganancia/mayorista/minorista%, así que en la
--     práctica siempre viene explícito.
--     Backfill: las 6 filas ya existentes de `lote_valoraciones` (prod,
--     2026-09-17) se guardaron ANTES de que existiera el concepto de
--     redondeo — su `costo_ananja_centavos` YA ERA el calculado de ese
--     momento, así que `costo_ananja_calculado_centavos = costo_ananja_centavos`
--     reproduce exactamente lo mismo (coalesce con `redondeado = null` da
--     el mismo `costo_ananja_centavos` que ya tenían).
--
--  3) `v_costo_lote_desglose`/`v_costo_lote_vigente` — `create or replace
--     view`, columnas nuevas AL FINAL (`costo_ananja_calculado_centavos`,
--     `costo_ananja_redondeado_centavos`), ningún tipo de columna existente
--     cambia (verificado columna por columna contra
--     `information_schema.columns` de prod antes de escribir esto — mismo
--     BUG que ya atrapó 0052 rev. 3, acá evitado desde el vamos).
--     `costo_ananja_centavos` (columna YA EXISTENTE, misma posición, mismo
--     tipo `bigint`) cambia SOLO la fórmula: pasa de
--     `round(costo_unitario_centavos × (1+ganancia_pct/100))` a
--     `coalesce(costo_ananja_redondeado_centavos, ese mismo cálculo)` — así
--     TODO lo que ya lee `costo_ananja_centavos` por nombre
--     (`v_costo_lote_venta`, `v_margen_ventas`, `v_cobranza_lote`,
--     `lib/lotes-disponibles.ts`, los sugeridos mayorista/minorista de esta
--     misma vista) recibe el redondeado automáticamente, sin tocar cada
--     consumidor uno por uno — verificado con `pg_get_viewdef` que ninguno
--     de esos usa `select *` (todos nombran la columna), así que no hace
--     falta redefinirlos.
--     Sugeridos mayorista/minorista (pregunta abierta 1 del plan, decisión
--     de Fran: A — encadenados desde el REDONDEADO): sin cambios en su
--     fórmula, ya encadenan desde `costo_ananja_centavos` de esta misma
--     vista — al pasar esa columna a ser el coalesce, los sugeridos siguen
--     el redondeado automáticamente.
--
--  4) `public.aplicar_costos_lote` — `create or replace function` (MISMA
--     firma `(uuid, jsonb)`, confirmado current grants con
--     `has_function_privilege`: ya estaba revocada de anon/authenticated,
--     una función interna — se preservan tal cual, `create or replace` no
--     los toca). Agrega, después de re-armar `lote_costos`: valida y
--     persiste `p_costos.costos_ananja_redondeados` en
--     `lote_items.costo_ananja_redondeado_centavos` — alcanza para
--     `crear_lote` (los `lote_items` ya existen en ese punto de la función,
--     insertados antes de llamar a `aplicar_costos_lote`) y para
--     `fijar_costos_lote` (edita un lote existente).
--
--  5) `public.actualizar_costo_lote_vigente` — `create or replace function`
--     (MISMA firma `(uuid, jsonb, text)`, confirmado `authenticated` ya
--     puede ejecutarla — sin cambios de grants). Agrega la misma validación
--     de `costos_ananja_redondeados` y guarda
--     `costo_ananja_calculado_centavos`/`costo_ananja_redondeado_centavos`
--     en cada fila de `lote_valoraciones` que inserta — con fallback al
--     redondeo vigente de `lote_items` para el producto que el array no
--     mencione.
--
-- Validación: un redondeo cargado tiene que ser `> 0` (check de columna +
-- validación de la función, mismo patrón que el resto de `p_costos`) —
-- "menor que el costo de producción" NO se bloquea acá (decisión de Fran:
-- se avisa en la UI, sin bloquear el guardado; un pedido recién armado
-- puede tener el costo de producción todavía subiendo mientras se cargan
-- los conceptos, así que un redondeo "bajo" en ese momento no es
-- necesariamente un error).
--
-- Efecto sobre datos existentes: NINGUNO. Las columnas nuevas son nullable
-- (o se backfillean para reproducir exactamente lo que ya había, punto 2)
-- y `coalesce(redondeado, calculado)` da el mismo `costo_ananja_centavos`
-- que hoy en todo lote/valoración sin redondeo cargado — que es TODOS los
-- lotes de prod hoy (2 lotes, 4 lote_items, 6 lote_valoraciones, ninguno
-- con este concepto todavía). Entregas ya hechas no se tocan: siguen leyendo
-- sus fotos congeladas (`entrega_items.costo_lote_unitario_centavos`,
-- 0044/0052) — el redondeo solo afecta lo que se entregue DE ACÁ EN MÁS,
-- vía la precarga de `lib/lotes-disponibles.ts` (que ya lee
-- `v_costo_lote_vigente.costo_ananja_centavos` por nombre, sin cambios de
-- código necesarios ahí).
--
-- Migración sin templating (mismo criterio que 0049/0050/0051/0052/0053):
-- hardcodea `public.` y `search_path = public` — Ananja es hoy el único
-- negocio activo (schema `miel` en pausa).

-- ============================================================
-- 1) Columna en lote_items — redondeo del PEDIDO, por presentación.
-- ============================================================

alter table lote_items
  add column costo_ananja_redondeado_centavos bigint
  check (costo_ananja_redondeado_centavos is null or costo_ananja_redondeado_centavos > 0);

-- ============================================================
-- 2) Columnas en lote_valoraciones — redondeo de la VALORACIÓN (independiente
--    del de lote_items), + el calculado (siempre presente, para poder
--    mostrar "calculado $X" al lado del efectivo sin volver a calcularlo).
-- ============================================================

alter table lote_valoraciones
  add column costo_ananja_calculado_centavos bigint;

update lote_valoraciones set costo_ananja_calculado_centavos = costo_ananja_centavos;

alter table lote_valoraciones
  alter column costo_ananja_calculado_centavos set not null;

alter table lote_valoraciones
  add column costo_ananja_redondeado_centavos bigint
  check (costo_ananja_redondeado_centavos is null or costo_ananja_redondeado_centavos > 0);

-- ============================================================
-- 3a) v_costo_lote_desglose — create or replace view, columnas nuevas al
--     final, costo_ananja_centavos cambia de fórmula (mismo nombre/tipo/
--     posición). Cuerpo base: pg_get_viewdef de prod, 2026-09-17.
-- ============================================================

create or replace view public.v_costo_lote_desglose as
with peso_item as (
  select li.lote_id, li.producto_id, p.presentacion_ml * li.cantidad as peso
  from lote_items li
  join productos p on p.id = li.producto_id
), aceite_directo as (
  select lote_costos.lote_id, lote_costos.producto_id, sum(lote_costos.total_centavos) as monto
  from lote_costos where lote_costos.concepto = 'aceite'
  group by lote_costos.lote_id, lote_costos.producto_id
), etiqueta_directo as (
  select lote_costos.lote_id, lote_costos.producto_id, sum(lote_costos.total_centavos) as monto
  from lote_costos where lote_costos.concepto = 'etiqueta'
  group by lote_costos.lote_id, lote_costos.producto_id
), envase_directo as (
  select lote_costos.lote_id, lote_costos.producto_id, sum(lote_costos.total_centavos) as monto
  from lote_costos where lote_costos.concepto = 'envase'
  group by lote_costos.lote_id, lote_costos.producto_id
), transporte_directo as (
  select lote_costos.lote_id, lote_costos.producto_id, sum(lote_costos.total_centavos) as monto
  from lote_costos where lote_costos.concepto = 'transporte' and lote_costos.producto_id is not null
  group by lote_costos.lote_id, lote_costos.producto_id
), transporte_lote as (
  select lote_costos.lote_id, sum(lote_costos.total_centavos) as total
  from lote_costos where lote_costos.concepto = 'transporte' and lote_costos.producto_id is null
  group by lote_costos.lote_id
), otro_lote as (
  select lote_costos.lote_id, sum(lote_costos.total_centavos) as total
  from lote_costos where lote_costos.concepto = 'otro'
  group by lote_costos.lote_id
), legacy_directo as (
  select gastos.lote_id, gastos.producto_id, sum(gastos.monto_centavos) as monto
  from gastos
  where gastos.lote_id is not null and gastos.producto_id is not null and gastos.concepto_lote is null
  group by gastos.lote_id, gastos.producto_id
), legacy_compartido_lote as (
  select gastos.lote_id, sum(gastos.monto_centavos) as total
  from gastos
  where gastos.lote_id is not null and gastos.producto_id is null and gastos.concepto_lote is null
  group by gastos.lote_id
), compartido_item as (
  select
    pi.lote_id,
    pi.producto_id,
    coalesce(round(coalesce(tl.total, 0::numeric) * pi.peso::numeric / sum(pi.peso) over (partition by pi.lote_id)::numeric), 0::numeric)::bigint as transporte_compartido_centavos,
    coalesce(round(coalesce(ol.total, 0::numeric) * pi.peso::numeric / sum(pi.peso) over (partition by pi.lote_id)::numeric), 0::numeric)::bigint as otro_compartido_centavos,
    coalesce(round(coalesce(lcl.total, 0::numeric) * pi.peso::numeric / sum(pi.peso) over (partition by pi.lote_id)::numeric), 0::numeric)::bigint as legacy_compartido_centavos
  from peso_item pi
  left join transporte_lote tl on tl.lote_id = pi.lote_id
  left join otro_lote ol on ol.lote_id = pi.lote_id
  left join legacy_compartido_lote lcl on lcl.lote_id = pi.lote_id
), base as (
  select
    li.lote_id,
    li.producto_id,
    l.fecha,
    l.created_at,
    l.ganancia_pct,
    l.mayorista_pct,
    l.minorista_pct,
    l.dolar_centavos,
    l.precio_litro_aceite_usd_centavos,
    p.presentacion_ml,
    p.nombre as producto_nombre,
    li.cantidad,
    li.costo_ananja_redondeado_centavos,
    coalesce(ad.monto, 0::numeric) as aceite_centavos,
    coalesce(ed.monto, 0::numeric) as etiqueta_centavos,
    coalesce(ev.monto, 0::numeric) as envase_centavos,
    (coalesce(td.monto, 0::numeric) + coalesce(ci.transporte_compartido_centavos, 0::bigint)::numeric)::bigint as transporte_centavos,
    coalesce(ld.monto, 0::numeric) + coalesce(ci.otro_compartido_centavos, 0::bigint)::numeric + coalesce(ci.legacy_compartido_centavos, 0::bigint)::numeric as otros_centavos
  from lote_items li
  join productos p on p.id = li.producto_id
  join lotes_produccion l on l.id = li.lote_id
  left join aceite_directo ad on ad.lote_id = li.lote_id and ad.producto_id = li.producto_id
  left join etiqueta_directo ed on ed.lote_id = li.lote_id and ed.producto_id = li.producto_id
  left join envase_directo ev on ev.lote_id = li.lote_id and ev.producto_id = li.producto_id
  left join transporte_directo td on td.lote_id = li.lote_id and td.producto_id = li.producto_id
  left join legacy_directo ld on ld.lote_id = li.lote_id and ld.producto_id = li.producto_id
  left join compartido_item ci on ci.lote_id = li.lote_id and ci.producto_id = li.producto_id
), costeado as (
  select
    b.lote_id, b.producto_id, b.fecha, b.created_at, b.ganancia_pct, b.mayorista_pct, b.minorista_pct,
    b.dolar_centavos, b.precio_litro_aceite_usd_centavos, b.presentacion_ml, b.producto_nombre, b.cantidad,
    b.costo_ananja_redondeado_centavos,
    b.aceite_centavos, b.etiqueta_centavos, b.envase_centavos, b.transporte_centavos, b.otros_centavos,
    b.aceite_centavos + b.etiqueta_centavos + b.envase_centavos + b.transporte_centavos::numeric + b.otros_centavos as total_centavos
  from base b
), con_costo_unitario as (
  select
    c.lote_id, c.producto_id, c.fecha, c.created_at, c.ganancia_pct, c.mayorista_pct, c.minorista_pct,
    c.dolar_centavos, c.precio_litro_aceite_usd_centavos, c.presentacion_ml, c.producto_nombre, c.cantidad,
    c.costo_ananja_redondeado_centavos,
    c.aceite_centavos, c.etiqueta_centavos, c.envase_centavos, c.transporte_centavos, c.otros_centavos, c.total_centavos,
    case when c.total_centavos = 0::numeric then 0::bigint else round(c.total_centavos / c.cantidad::numeric)::bigint end as costo_unitario_centavos
  from costeado c
), con_costo_ananja as (
  select
    u.lote_id, u.producto_id, u.fecha, u.created_at, u.ganancia_pct, u.mayorista_pct, u.minorista_pct,
    u.dolar_centavos, u.precio_litro_aceite_usd_centavos, u.presentacion_ml, u.producto_nombre, u.cantidad,
    u.aceite_centavos, u.etiqueta_centavos, u.envase_centavos, u.transporte_centavos, u.otros_centavos, u.total_centavos,
    u.costo_unitario_centavos,
    u.costo_ananja_redondeado_centavos,
    round(u.costo_unitario_centavos::numeric * (100::numeric + u.ganancia_pct) / 100::numeric)::bigint as costo_ananja_calculado_centavos,
    coalesce(
      u.costo_ananja_redondeado_centavos,
      round(u.costo_unitario_centavos::numeric * (100::numeric + u.ganancia_pct) / 100::numeric)::bigint
    ) as costo_ananja_centavos
  from con_costo_unitario u
), con_mayorista as (
  select
    a.lote_id, a.producto_id, a.fecha, a.created_at, a.ganancia_pct, a.mayorista_pct, a.minorista_pct,
    a.dolar_centavos, a.precio_litro_aceite_usd_centavos, a.presentacion_ml, a.producto_nombre, a.cantidad,
    a.aceite_centavos, a.etiqueta_centavos, a.envase_centavos, a.transporte_centavos, a.otros_centavos, a.total_centavos,
    a.costo_unitario_centavos, a.costo_ananja_centavos, a.costo_ananja_calculado_centavos, a.costo_ananja_redondeado_centavos,
    round(a.costo_ananja_centavos::numeric * (100::numeric + a.mayorista_pct) / 100::numeric)::bigint as precio_mayorista_sugerido_centavos
  from con_costo_ananja a
)
select
  lote_id, producto_id, fecha, presentacion_ml, producto_nombre, cantidad,
  aceite_centavos, etiqueta_centavos, envase_centavos, transporte_centavos, otros_centavos, total_centavos,
  costo_unitario_centavos,
  total_centavos > 0::numeric as tiene_costos,
  ganancia_pct, mayorista_pct, minorista_pct,
  costo_ananja_centavos,
  precio_mayorista_sugerido_centavos,
  round(precio_mayorista_sugerido_centavos::numeric * (100::numeric + minorista_pct) / 100::numeric)::bigint as precio_minorista_sugerido_centavos,
  created_at, dolar_centavos, precio_litro_aceite_usd_centavos,
  costo_ananja_calculado_centavos,
  costo_ananja_redondeado_centavos
from con_mayorista;

-- ============================================================
-- 3b) v_costo_lote_vigente — create or replace view, mismo criterio: columnas
--     nuevas al final, costo_ananja_centavos conserva su fórmula
--     (coalesce contra la valoración vigente), que ya recibe el redondeado
--     automáticamente porque `d.costo_ananja_centavos` (v_costo_lote_desglose)
--     y `v.costo_ananja_centavos` (lote_valoraciones) ya lo incluyen cada
--     uno por su lado.
-- ============================================================

create or replace view public.v_costo_lote_vigente as
with vigente as (
  select distinct on (lote_valoraciones.lote_id, lote_valoraciones.producto_id)
    lote_valoraciones.lote_id,
    lote_valoraciones.producto_id,
    lote_valoraciones.aceite_centavos,
    lote_valoraciones.etiqueta_centavos,
    lote_valoraciones.envase_centavos,
    lote_valoraciones.transporte_centavos,
    lote_valoraciones.otros_centavos,
    lote_valoraciones.total_centavos,
    lote_valoraciones.costo_unitario_centavos,
    lote_valoraciones.costo_ananja_centavos,
    lote_valoraciones.precio_mayorista_sugerido_centavos,
    lote_valoraciones.precio_minorista_sugerido_centavos,
    lote_valoraciones.ganancia_pct,
    lote_valoraciones.mayorista_pct,
    lote_valoraciones.minorista_pct,
    lote_valoraciones.vendedor_id,
    lote_valoraciones.created_at,
    lote_valoraciones.costo_ananja_calculado_centavos,
    lote_valoraciones.costo_ananja_redondeado_centavos
  from lote_valoraciones
  order by lote_valoraciones.lote_id, lote_valoraciones.producto_id, lote_valoraciones.created_at desc, lote_valoraciones.id desc
)
select
  d.lote_id,
  d.producto_id,
  d.fecha,
  d.presentacion_ml,
  d.producto_nombre,
  d.cantidad,
  coalesce(v.aceite_centavos::numeric, d.aceite_centavos) as aceite_centavos,
  coalesce(v.etiqueta_centavos::numeric, d.etiqueta_centavos) as etiqueta_centavos,
  coalesce(v.envase_centavos::numeric, d.envase_centavos) as envase_centavos,
  coalesce(v.transporte_centavos, d.transporte_centavos) as transporte_centavos,
  coalesce(v.otros_centavos::numeric, d.otros_centavos) as otros_centavos,
  coalesce(v.total_centavos::numeric, d.total_centavos) as total_centavos,
  coalesce(v.costo_unitario_centavos, d.costo_unitario_centavos) as costo_unitario_centavos,
  d.tiene_costos,
  coalesce(v.ganancia_pct, d.ganancia_pct) as ganancia_pct,
  coalesce(v.mayorista_pct, d.mayorista_pct) as mayorista_pct,
  coalesce(v.minorista_pct, d.minorista_pct) as minorista_pct,
  coalesce(v.costo_ananja_centavos, d.costo_ananja_centavos) as costo_ananja_centavos,
  coalesce(v.precio_mayorista_sugerido_centavos, d.precio_mayorista_sugerido_centavos) as precio_mayorista_sugerido_centavos,
  coalesce(v.precio_minorista_sugerido_centavos, d.precio_minorista_sugerido_centavos) as precio_minorista_sugerido_centavos,
  d.created_at,
  d.dolar_centavos,
  d.precio_litro_aceite_usd_centavos,
  d.costo_unitario_centavos as costo_unitario_original_centavos,
  d.costo_ananja_centavos as costo_ananja_original_centavos,
  v.created_at as actualizado_en,
  v.vendedor_id as actualizado_por,
  coalesce(v.costo_ananja_calculado_centavos, d.costo_ananja_calculado_centavos) as costo_ananja_calculado_centavos,
  coalesce(v.costo_ananja_redondeado_centavos, d.costo_ananja_redondeado_centavos) as costo_ananja_redondeado_centavos
from v_costo_lote_desglose d
left join vigente v on v.lote_id = d.lote_id and v.producto_id = d.producto_id;

-- ============================================================
-- 4) public.aplicar_costos_lote — create or replace (misma firma). Agrega,
--    al final (después de re-armar lote_costos y sincronizar la deuda de
--    aceite), la persistencia del redondeo del PEDIDO en lote_items.
--    Cuerpo base: pg_get_functiondef de prod, 2026-09-17 (idéntico al de
--    0053, que fue la última en tocarla).
-- ============================================================

create or replace function public.aplicar_costos_lote(
  p_lote_id uuid,
  p_costos jsonb
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_redondeo_ananja jsonb;
  v_ra jsonb;
  v_ra_producto_id uuid;
  v_ra_monto bigint;
  v_ra_vistos uuid[] := '{}';
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  if nullif(p_costos->>'envase_cobrado_sin_iva', '')::boolean is not null then
    update lotes_produccion
    set envase_cobrado_sin_iva = nullif(p_costos->>'envase_cobrado_sin_iva', '')::boolean
    where id = p_lote_id;
  end if;

  delete from lote_costos where lote_id = p_lote_id;

  insert into lote_costos (
    lote_id, producto_id, concepto, descripcion, cantidad,
    costo_unitario_centavos, neto_centavos, envio_centavos, total_centavos,
    se_paga, insumo_id, a_pagar_centavos, costo_neto_centavos
  )
  select
    p_lote_id, c.producto_id, c.concepto, c.descripcion, c.cantidad,
    c.costo_unitario_centavos, c.neto_centavos, c.envio_centavos, c.total_centavos,
    c.se_paga, c.insumo_id, c.a_pagar_centavos, c.costo_neto_centavos
  from public.calcular_costos_lote(p_lote_id, p_costos) c;

  perform public.sincronizar_deuda_aceite_lote(p_lote_id);

  -- Costo Ananja redondeado (0054) — por presentación, dentro del mismo
  -- p_costos que ya usan crear_lote/fijar_costos_lote (alcanza con tocar
  -- esta función: las dos delegan el guardado de costos acá, sin tocar
  -- lote_items directamente). Una entrada por producto_id de este lote,
  -- `monto_centavos` null = "borrar el redondeo, usar el calculado". Un
  -- producto que el array no menciona no se toca (sigue con lo que ya
  -- tenía) — la UI manda una fila por presentación del pedido, así que en
  -- la práctica siempre viene completo.
  v_redondeo_ananja := coalesce(p_costos->'costos_ananja_redondeados', '[]'::jsonb);
  if jsonb_typeof(v_redondeo_ananja) <> 'array' then
    raise exception 'COSTO_ANANJA_REDONDEADO_INVALIDO';
  end if;

  for v_ra in select * from jsonb_array_elements(v_redondeo_ananja)
  loop
    v_ra_producto_id := nullif(v_ra->>'producto_id', '')::uuid;
    v_ra_monto := nullif(v_ra->>'monto_centavos', '')::bigint;

    if v_ra_producto_id is null or v_ra_producto_id = any(v_ra_vistos) then
      raise exception 'COSTO_ANANJA_REDONDEADO_DUPLICADO';
    end if;
    v_ra_vistos := array_append(v_ra_vistos, v_ra_producto_id);

    if v_ra_monto is not null and v_ra_monto <= 0 then
      raise exception 'COSTO_ANANJA_REDONDEADO_INVALIDO';
    end if;

    if not exists (select 1 from lote_items where lote_id = p_lote_id and producto_id = v_ra_producto_id) then
      raise exception 'PRODUCTO_NO_EN_LOTE';
    end if;

    update lote_items
    set costo_ananja_redondeado_centavos = v_ra_monto
    where lote_id = p_lote_id and producto_id = v_ra_producto_id;
  end loop;
end;
$$;

revoke execute on function public.aplicar_costos_lote(uuid, jsonb) from anon, authenticated, public;

-- ============================================================
-- 5) public.actualizar_costo_lote_vigente — create or replace (misma
--    firma). Agrega la misma validación de costos_ananja_redondeados, y usa
--    su resultado (con fallback al redondeo vigente de lote_items para el
--    producto que el array no mencione) al insertar cada fila de
--    lote_valoraciones. Cuerpo base: pg_get_functiondef de prod,
--    2026-09-17.
-- ============================================================

create or replace function public.actualizar_costo_lote_vigente(
  p_lote_id uuid,
  p_costos jsonb,
  p_nota text default null::text
)
returns json
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_vendedor_id uuid;
  v_existe boolean;
  v_ganancia_pct numeric;
  v_mayorista_pct numeric;
  v_minorista_pct numeric;
  v_insertados int;
  v_redondeo_ananja jsonb;
  v_ra jsonb;
  v_ra_producto_id uuid;
  v_ra_monto bigint;
  v_ra_vistos uuid[] := '{}';
  v_redondeos_ananja_map jsonb := '{}'::jsonb;
begin
  if not public.es_admin() then
    raise exception 'NO_AUTORIZADO';
  end if;

  select id into v_vendedor_id from vendedores where user_id = auth.uid();
  if v_vendedor_id is null then
    raise exception 'VENDEDOR_NO_REGISTRADO';
  end if;

  -- Bloquea la fila del lote hasta el commit — mismo patrón que
  -- fijar_costos_lote (0028/0047): serializa con una edición de costos
  -- concurrente (otra actualización, o "Editar costos") sobre el MISMO
  -- lote, para que no lean el mismo estado "viejo" en simultáneo.
  select true into v_existe from lotes_produccion where id = p_lote_id for update;
  if v_existe is null then
    raise exception 'LOTE_NO_ENCONTRADO';
  end if;

  if p_costos is null then
    raise exception 'COSTOS_INVALIDOS';
  end if;

  if not exists (select 1 from lote_items where lote_id = p_lote_id) then
    raise exception 'LOTE_NO_ENCONTRADO';
  end if;

  if exists (
    select 1 from lote_items li
    where li.lote_id = p_lote_id and not public.lote_costos_completos(p_lote_id, li.producto_id)
  ) then
    raise exception 'COSTOS_ORIGINALES_INCOMPLETOS';
  end if;

  select
    coalesce(nullif(p_costos->>'ganancia_pct', '')::numeric, l.ganancia_pct),
    coalesce(nullif(p_costos->>'mayorista_pct', '')::numeric, l.mayorista_pct),
    coalesce(nullif(p_costos->>'minorista_pct', '')::numeric, l.minorista_pct)
    into v_ganancia_pct, v_mayorista_pct, v_minorista_pct
  from lotes_produccion l where l.id = p_lote_id;

  -- Costo Ananja redondeado (0054) — propio de ESTA valoración, independiente
  -- del redondeo del pedido (lote_items). Misma validación que
  -- aplicar_costos_lote; el resultado se guarda en un mapa producto_id ->
  -- monto (JSON null = "vino explícito, sin redondeo") para distinguir "no
  -- lo mencionó" (hereda el vigente de lote_items, abajo) de "lo mandó
  -- vacío" (usa el calculado de ESTA valoración).
  v_redondeo_ananja := coalesce(p_costos->'costos_ananja_redondeados', '[]'::jsonb);
  if jsonb_typeof(v_redondeo_ananja) <> 'array' then
    raise exception 'COSTO_ANANJA_REDONDEADO_INVALIDO';
  end if;

  for v_ra in select * from jsonb_array_elements(v_redondeo_ananja)
  loop
    v_ra_producto_id := nullif(v_ra->>'producto_id', '')::uuid;
    v_ra_monto := nullif(v_ra->>'monto_centavos', '')::bigint;

    if v_ra_producto_id is null or v_ra_producto_id = any(v_ra_vistos) then
      raise exception 'COSTO_ANANJA_REDONDEADO_DUPLICADO';
    end if;
    v_ra_vistos := array_append(v_ra_vistos, v_ra_producto_id);

    if v_ra_monto is not null and v_ra_monto <= 0 then
      raise exception 'COSTO_ANANJA_REDONDEADO_INVALIDO';
    end if;

    if not exists (select 1 from lote_items where lote_id = p_lote_id and producto_id = v_ra_producto_id) then
      raise exception 'PRODUCTO_NO_EN_LOTE';
    end if;

    v_redondeos_ananja_map :=
      jsonb_set(v_redondeos_ananja_map, array[v_ra_producto_id::text], coalesce(to_jsonb(v_ra_monto), 'null'::jsonb));
  end loop;

  with calculado as (
    select * from public.calcular_costos_lote(p_lote_id, p_costos)
  ),
  peso_item as (
    select li.producto_id, li.cantidad, p.presentacion_ml * li.cantidad as peso
    from lote_items li
    join productos p on p.id = li.producto_id
    where li.lote_id = p_lote_id
  ),
  directo as (
    select producto_id, concepto, sum(total_centavos) as monto
    from calculado
    where producto_id is not null and concepto in ('aceite', 'etiqueta', 'envase')
    group by producto_id, concepto
  ),
  transporte_directo as (
    select producto_id, sum(total_centavos) as monto
    from calculado
    where concepto = 'transporte' and producto_id is not null
    group by producto_id
  ),
  transporte_compartido as (
    select coalesce(sum(total_centavos), 0) as total
    from calculado where concepto = 'transporte' and producto_id is null
  ),
  otro_compartido as (
    select coalesce(sum(total_centavos), 0) as total
    from calculado where concepto = 'otro'
  ),
  compartido_item as (
    select
      pi.producto_id,
      coalesce(round((select total from transporte_compartido) * pi.peso / nullif(sum(pi.peso) over (), 0)), 0)::bigint
        as transporte_compartido_centavos,
      coalesce(round((select total from otro_compartido) * pi.peso / nullif(sum(pi.peso) over (), 0)), 0)::bigint
        as otro_compartido_centavos
    from peso_item pi
  ),
  agregado as (
    select
      pi.producto_id,
      pi.cantidad,
      coalesce((select monto from directo d where d.producto_id = pi.producto_id and d.concepto = 'aceite'), 0)::bigint as aceite_centavos,
      coalesce((select monto from directo d where d.producto_id = pi.producto_id and d.concepto = 'etiqueta'), 0)::bigint as etiqueta_centavos,
      coalesce((select monto from directo d where d.producto_id = pi.producto_id and d.concepto = 'envase'), 0)::bigint as envase_centavos,
      (coalesce((select monto from transporte_directo td where td.producto_id = pi.producto_id), 0)
        + coalesce(ci.transporte_compartido_centavos, 0))::bigint as transporte_centavos,
      coalesce(ci.otro_compartido_centavos, 0)::bigint as otros_centavos
    from peso_item pi
    left join compartido_item ci on ci.producto_id = pi.producto_id
  ),
  final as (
    select
      producto_id, cantidad,
      aceite_centavos, etiqueta_centavos, envase_centavos, transporte_centavos, otros_centavos,
      (aceite_centavos + etiqueta_centavos + envase_centavos + transporte_centavos + otros_centavos) as total_centavos,
      case when (aceite_centavos + etiqueta_centavos + envase_centavos + transporte_centavos + otros_centavos) = 0 then 0
        else round((aceite_centavos + etiqueta_centavos + envase_centavos + transporte_centavos + otros_centavos)::numeric / cantidad)::bigint
      end as costo_unitario_centavos
    from agregado
  ),
  con_calculado as (
    select
      f.*,
      round(f.costo_unitario_centavos * (100 + v_ganancia_pct) / 100)::bigint as costo_ananja_calculado_centavos,
      case
        when v_redondeos_ananja_map ? f.producto_id::text
          then nullif(v_redondeos_ananja_map->>f.producto_id::text, '')::bigint
        else li2.costo_ananja_redondeado_centavos
      end as costo_ananja_redondeado_centavos
    from final f
    left join lote_items li2 on li2.lote_id = p_lote_id and li2.producto_id = f.producto_id
  ),
  con_ananja as (
    select c.*, coalesce(c.costo_ananja_redondeado_centavos, c.costo_ananja_calculado_centavos) as costo_ananja_centavos
    from con_calculado c
  )
  insert into lote_valoraciones (
    lote_id, producto_id, aceite_centavos, etiqueta_centavos, envase_centavos, transporte_centavos, otros_centavos,
    total_centavos, costo_unitario_centavos, costo_ananja_centavos, costo_ananja_calculado_centavos, costo_ananja_redondeado_centavos,
    precio_mayorista_sugerido_centavos, precio_minorista_sugerido_centavos,
    ganancia_pct, mayorista_pct, minorista_pct, costos_jsonb, nota, vendedor_id
  )
  select
    p_lote_id, c.producto_id, c.aceite_centavos, c.etiqueta_centavos, c.envase_centavos, c.transporte_centavos, c.otros_centavos,
    c.total_centavos, c.costo_unitario_centavos,
    c.costo_ananja_centavos, c.costo_ananja_calculado_centavos, c.costo_ananja_redondeado_centavos,
    round(c.costo_ananja_centavos * (100 + v_mayorista_pct) / 100)::bigint as precio_mayorista_sugerido_centavos,
    round(round(c.costo_ananja_centavos * (100 + v_mayorista_pct) / 100) * (100 + v_minorista_pct) / 100)::bigint as precio_minorista_sugerido_centavos,
    v_ganancia_pct, v_mayorista_pct, v_minorista_pct, p_costos, p_nota, v_vendedor_id
  from con_ananja c
  where c.total_centavos > 0;

  get diagnostics v_insertados = row_count;
  if v_insertados = 0 then
    raise exception 'COSTOS_INVALIDOS';
  end if;

  return json_build_object('lote_id', p_lote_id, 'productos_actualizados', v_insertados);
end;
$$;
