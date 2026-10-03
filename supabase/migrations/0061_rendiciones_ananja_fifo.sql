-- Ananja: `v_rendiciones_ananja` (0058) reparte la parte Ananja de cada
-- rendición `via = 'encargado'` con un RATIO PROMEDIO de toda la historia
-- de la revendedora (Σcosto_lote / Σprecio_costo) — pedido de Fran
-- (2026-09-18): en vez del promedio, cada pago tiene que mostrar la parte
-- REAL de Ananja de las botellas puntuales que ESE pago cubre, en orden
-- (FIFO): un pago de $1.000 que cubre exactamente una botella de 500 ml
-- (costo real $850) tiene que mostrar $850, no un valor intermedio (el
-- promedio que daba 0058).
--
-- Ejemplo (una revendedora bajo un coordinador): vende y le paga al
-- coordinador $700/250 ml y $1.000/500 ml, pero el costo REAL de Ananja
-- es $600/250 ml y $850/500 ml. El "plus" ($100/$150) es ganancia del
-- coordinador, no de Ananja — eso no cambia; lo
-- que cambia es CUÁL pago puntual se le atribuye a cada venta.
--
-- ============================================================
-- Cómo se calcula (por revendedora, `vendedor_id`, solo rendiciones
-- `via = 'encargado'` — mismo alcance que 0058):
--
--  1. Cada VENTA (`ventas_revendedor`) de la revendedora, ordenada por
--     `(fecha, created_at, id)`, aporta una franja de deuda de ancho
--     `cantidad × precio_costo_centavos` (pesos AL PRECIO DEL
--     COORDINADOR — lo que la revendedora le debe a su encargado por esa
--     venta). El costo Ananja de esa franja es
--     `cantidad × coalesce(costo_lote_unitario_centavos de la FOTO
--     congelada de la entrega, costo_ananja_unitario_centavos de esa
--     foto, precio_costo_centavos)` — mismo orden de fuentes que ya usaba
--     `v_costo_ananja_revendedor` (0058): la foto congelada primero (no
--     el costo VIGENTE del lote, que puede cambiar con "Editar costos" —
--     lo ya vendido no cambia retroactivamente), después lo que se le
--     cobró a la revendedora si la foto no tiene costo de lote, y por
--     último el propio precio cobrado (ratio 1) si la venta no tiene
--     ninguna trazabilidad de lote (precio manual, sin entrega). Las
--     ventas con `precio_costo_centavos = 0` (permitido por el check de
--     la tabla) no aportan ancho a la franja de deuda — no hay caso real
--     hoy (no se vende a $0), documentado por si aparece.
--
--  2. Cada RENDICIÓN `via = 'encargado'` de la revendedora (sin importar
--     el tenedor que la cobró — la deuda es de la revendedora, no de
--     quién recibió el pago puntual), ordenada por `(created_at, id)`,
--     aporta una franja de PAGO del mismo ancho que su `monto_centavos`,
--     en la MISMA recta numérica de "pesos precio coordinador".
--
--  3. Se intersectan las dos series de franjas (mismo patrón de
--     `offset_previo`/`fin_posicion` que ya usa `v_margen_ventas` para
--     repartir venta sin lote elegido contra la capacidad de los lotes,
--     0044/0052/0058 — acá con pagos contra ventas en vez de ventas
--     contra lotes): el tramo de una venta que un pago cubre aporta a la
--     parte Ananja de ESE pago `pesos_cubiertos × (ananja_de_la_venta /
--     pesos_de_la_venta)` — el ratio de ESA venta puntual, no un promedio
--     global.
--
--  4. Excedente: si la suma de pagos de una revendedora supera la deuda
--     total (a precio coordinador) de lo que vendió, el tramo que se pasa
--     de la deuda se atribuye a Ananja 1:1 (ratio 1) — mismo criterio que
--     el fallback que ya usaba 0058 cuando `cobrado_vendido <= 0`. Así
--     nunca se "pierde" plata: todo pago de más es, por definición, plata
--     de Ananja (nadie le debe margen a nadie de más).
--
--  5. Redondeo: los pasos 3/4 dan un número EXACTO (`numeric`, sin perder
--     precisión) por rendición. Se redondea cada uno individualmente
--     (`round`) y, dentro de cada grupo `(tenedor_id, vendedor_id)` —
--     mismo agrupamiento que 0058, porque es lo que consume
--     `v_plata_en_manos` por tenedor — la ÚLTIMA rendición del grupo (por
--     `created_at, id`) absorbe la diferencia entre la suma de los
--     redondeos individuales y el redondeo del TOTAL exacto del grupo:
--     así la suma de un grupo nunca se desvía ni un centavo del total
--     real, sin importar cuántas rendiciones lo compongan (mismo técnica
--     exacta que ya usaba 0058, aplicada ahora sobre el número FIFO en
--     vez del promedio).
--
-- Invariante verificado (test local + `tests/*.test.ts`): para una
-- revendedora con la deuda de lo vendido totalmente paga (pagos exactos,
-- sin excedente), la SUMA de `monto_ananja_centavos` de sus rendiciones da
-- EXACTO lo mismo que daba 0058 (Σcosto_lote_unitario × cantidad de lo
-- vendido) — el TOTAL no cambia, cambia el reparto por movimiento. Para
-- una revendedora que paga al costo (sin margen: el ratio
-- de cada una de sus ventas ya es 1 porque `costo_lote_unitario_centavos`
-- coincide con `precio_costo_centavos`), el comportamiento es idéntico al
-- de antes: la parte Ananja de cada pago es el pago completo.
--
-- `v_costo_ananja_revendedor` (0058) queda SIN USO: era el agregado que
-- alimentaba el ratio promedio, y esta vista ya no lo necesita (calcula
-- el costo Ananja por venta directamente). Se dropea acá — código
-- muerto, sin otro consumidor (grep verificado: solo la leía
-- `v_rendiciones_ananja`).
--
-- Mirrors TypeScript (`lib/movimientos-plata-datos.ts`,
-- `lib/tareas-datos.ts`): NINGUNO duplica la fórmula del ratio — ya leían
-- `v_rendiciones_ananja.monto_ananja_centavos` tal cual desde 0058
-- (BLOCKER 2 de esa migración fue justamente sacarles esa duplicación).
-- Heredan el número FIFO sin tocar una línea de código TypeScript.
--
-- Mismas columnas, tipos, filtro de fila
-- (`es_admin() or vendedor_id = mi_vendedor_id() or
-- es_coordinador_de(vendedor_id)`) y seguridad (revoke anon/public, grant
-- authenticated) que 0058 — `create or replace view` conserva los
-- permisos ya otorgados, se restatean igual por prolijidad/consistencia
-- con el resto de esta tanda de migraciones. `v_plata_en_manos` (0058,
-- sin cambios en esta migración) sigue funcionando: sigue sumando
-- `v_rendiciones_ananja.monto_ananja_centavos` por `tenedor_id`, que sigue
-- dando el mismo total por persona que antes.
--
-- Migración sin templating (mismo criterio que 0049-0059): hardcodea
-- `public.` y `search_path = public` — Ananja es hoy el único negocio
-- activo (schema `miel` en pausa).
-- ============================================================

create or replace view public.v_rendiciones_ananja as
with ventas_base as (
  select
    vr.id as venta_id,
    vr.vendedor_id,
    vr.fecha,
    vr.created_at,
    (vr.cantidad::bigint * vr.precio_costo_centavos::bigint) as pesos_centavos,
    (
      vr.cantidad::bigint * coalesce(
        ei.costo_lote_unitario_centavos,
        ei.costo_ananja_unitario_centavos,
        vr.precio_costo_centavos
      )::bigint
    ) as ananja_centavos
  from ventas_revendedor vr
  left join entrega_items ei on ei.id = vr.entrega_item_id
),
-- Ventas con ancho > 0 en la recta de "pesos precio coordinador" — una
-- venta a $0 (permitida por el check de la tabla, sin caso hoy) no
-- consume ningún tramo de pago, así que se excluye antes de calcular los
-- offsets acumulados (mismo patrón que `lote_capacidad_off` en
-- `v_margen_ventas`, que también filtra capacidad > 0 antes de acumular).
ventas_pos as (
  select * from ventas_base where pesos_centavos > 0
),
ventas_rango as (
  select
    venta_id,
    vendedor_id,
    pesos_centavos,
    ananja_centavos,
    coalesce(
      sum(pesos_centavos) over (
        partition by vendedor_id
        order by fecha, created_at, venta_id
        rows between unbounded preceding and 1 preceding
      ),
      0
    ) as offset_previo,
    coalesce(
      sum(pesos_centavos) over (
        partition by vendedor_id
        order by fecha, created_at, venta_id
        rows between unbounded preceding and 1 preceding
      ),
      0
    ) + pesos_centavos as fin_posicion
  from ventas_pos
),
deuda_total as (
  select vendedor_id, coalesce(sum(pesos_centavos), 0)::bigint as total_pesos
  from ventas_pos
  group by vendedor_id
),
pagos_base as (
  select
    r.id as rendicion_id,
    r.tenedor_id,
    r.vendedor_id,
    r.monto_centavos::bigint as monto_centavos,
    r.created_at
  from rendiciones r
  where r.via = 'encargado'::text
),
pagos_rango as (
  select
    rendicion_id,
    tenedor_id,
    vendedor_id,
    monto_centavos,
    created_at,
    coalesce(
      sum(monto_centavos) over (
        partition by vendedor_id
        order by created_at, rendicion_id
        rows between unbounded preceding and 1 preceding
      ),
      0
    ) as offset_previo,
    coalesce(
      sum(monto_centavos) over (
        partition by vendedor_id
        order by created_at, rendicion_id
        rows between unbounded preceding and 1 preceding
      ),
      0
    ) + monto_centavos as fin_posicion
  from pagos_base
),
-- Parte Ananja de lo que cada pago cubre de VENTAS: intersección de la
-- franja del pago con la de cada venta del mismo vendedor (mismo patrón
-- de rango-contra-rango que `sin_lote_resuelto` en `v_margen_ventas`).
partes_venta as (
  select
    p.rendicion_id,
    sum(
      (least(p.fin_posicion, v.fin_posicion) - greatest(p.offset_previo, v.offset_previo))::numeric
        * v.ananja_centavos::numeric / v.pesos_centavos::numeric
    ) as parte_ventas
  from pagos_rango p
  join ventas_rango v
    on v.vendedor_id = p.vendedor_id
   and v.offset_previo < p.fin_posicion
   and v.fin_posicion > p.offset_previo
  group by p.rendicion_id
),
-- Excedente: el tramo de cada pago que cae MÁS ALLÁ de la deuda total
-- vendida de esa revendedora (o toda su plata, si no vendió nada) se
-- atribuye a Ananja a ratio 1 — "no pierdas plata".
excedentes as (
  select
    p.rendicion_id,
    greatest(
      p.fin_posicion - greatest(p.offset_previo, coalesce(dt.total_pesos, 0)::bigint),
      0
    )::numeric as parte_excedente
  from pagos_rango p
  left join deuda_total dt on dt.vendedor_id = p.vendedor_id
),
base as (
  select
    p.rendicion_id,
    p.tenedor_id,
    p.vendedor_id,
    p.monto_centavos,
    p.created_at,
    coalesce(pv.parte_ventas, 0::numeric) + coalesce(ex.parte_excedente, 0::numeric) as parte_exacta
  from pagos_rango p
  left join partes_venta pv on pv.rendicion_id = p.rendicion_id
  left join excedentes ex on ex.rendicion_id = p.rendicion_id
),
con_partes as (
  select
    rendicion_id,
    tenedor_id,
    vendedor_id,
    monto_centavos,
    created_at,
    round(parte_exacta) as parte_bruta,
    round(sum(parte_exacta) over (partition by tenedor_id, vendedor_id)) as parte_total_grupo,
    row_number() over (partition by tenedor_id, vendedor_id order by created_at, rendicion_id) as posicion,
    count(*) over (partition by tenedor_id, vendedor_id) as filas_grupo,
    sum(round(parte_exacta)) over (partition by tenedor_id, vendedor_id) as suma_partes_brutas
  from base
)
select
  rendicion_id,
  tenedor_id,
  vendedor_id,
  monto_centavos,
  created_at,
  case
    when posicion = filas_grupo then parte_bruta + (parte_total_grupo - suma_partes_brutas)
    else parte_bruta
  end as monto_ananja_centavos
from con_partes
where public.es_admin()
  or vendedor_id = public.mi_vendedor_id()
  or public.es_coordinador_de(vendedor_id);

revoke all on public.v_rendiciones_ananja from anon, authenticated, public;
grant select on public.v_rendiciones_ananja to authenticated;

-- v_costo_ananja_revendedor (0058) queda sin ningún consumidor — se
-- dropea después de reemplazar v_rendiciones_ananja (que era su único
-- lector) para no dejar código muerto.
drop view public.v_costo_ananja_revendedor;
