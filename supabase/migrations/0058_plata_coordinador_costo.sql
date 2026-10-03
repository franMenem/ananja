-- Ananja: "plata en manos" de un coordinador cuenta solo la PARTE ANANJA
-- de lo que le rindió su revendedora, no lo que le cobró. Sigue a
-- 0057_coordinador_plata_stock.sql.
--
-- El problema: un coordinador le vende a sus revendedoras a SU precio (por
-- ejemplo, a la revendedora Sofi le cobra un precio mayor por botella), pero
-- Ananja solo tiene que recibir su COSTO ANANJA. La diferencia es ganancia
-- del coordinador y NO tiene que figurar como plata que le debe a Ananja.
-- `v_plata_en_manos.rendiciones_centavos` hoy suma el
-- `rendiciones.monto_centavos` completo de toda rendición `via =
-- 'encargado'` — correcto para un admin (históricamente siempre cobró a
-- costo, sin margen) pero SOBRA la ganancia de un coordinador con margen.
--
-- REVISIÓN ADVERSARIAL (dos rondas sobre la primera versión de esta
-- migración, todavía sin aplicar): confirmó el cálculo pero encontró 3
-- BLOCKERs en total, corregidos acá mismo (nunca se llegó a aplicar la
-- versión vieja, así que se corrige el mismo archivo en vez de sumar una
-- migración nueva — mismo criterio que otras rondas de revisión de esta
-- tanda, ver 0029/0037/0057):
--
--  BLOCKER 1 (retroactividad): la primera versión usaba
--  `lote_items.costo_ananja_redondeado_centavos` VIGENTE como costo
--  Ananja de una venta. Eso rompe el principio de que lo ya vendido no
--  cambia: si se editan los costos de un lote con "Editar costos"
--  (`fijar_costos_lote` no lo impide), cambiaría hacia atrás lo que el
--  coordinador tiene que pasar, incluso de plata ya depositada. Corregido:
--  ahora la fuente es la FOTO congelada `entrega_items.costo_lote_unitario_centavos`
--  (la misma que YA usaba `v_margen_ventas` para la ganancia de Ananja,
--  0044/0052) — ver el punto 1 más abajo para la cadena completa y el
--  backfill puntual que hizo falta para un lote.
--
--  BLOCKER 2 (rendido completo en otros lugares): `lib/movimientos-plata.ts`
--  (`montoEnManos`) y `lib/movimientos-plata-datos.ts` armaban el detalle
--  de `/plata/en-manos/[id]` con `rendiciones.monto_centavos` crudo — la
--  suma de esa lista no daba el total del coordinador y saltaba (falso) el
--  aviso "puede faltar algún movimiento". `lib/tareas-datos.ts`
--  (`listarIngresosEnMano`) hacía lo mismo y calculaba mal desde cuándo
--  tiene la plata. Corregido exponiendo la parte Ananja POR RENDICIÓN
--  desde SQL (`v_rendiciones_ananja`, punto 3 más abajo) — ni
--  `lib/movimientos-plata.ts` ni `lib/tareas-datos.ts` duplican la
--  fórmula del ratio en TypeScript, la leen ya resuelta.
--
--  BLOCKER 3 (ganancia de Ananja contaba el margen del coordinador,
--  probado con Postgres local): `v_margen_ventas` (0044/0052) YA tenía el
--  concepto correcto — `LEAST(cobrado, costo Ananja de la foto)` para una
--  venta de revendedora con encargado — pero el JOIN que lo activa exige
--  `enc.rol = 'admin'::text`. Un coordinador tiene `rol = 'coordinador'`
--  (el pase de rol, ver 0057), así que ese JOIN no matchea para NINGUNA de
--  sus revendedoras: la ganancia de Ananja se calculaba con lo COBRADO en
--  vez de con el costo Ananja — exactamente la misma plata que este mismo
--  archivo le saca a la plata en manos del coordinador en el punto 4
--  (BLOCKER original, antes de esta ronda). Corregido en el punto 5 más
--  abajo: se saca por completo la dependencia del rol del encargado —
--  `LEAST` se aplica SIEMPRE que hay foto de costo, tenga o no encargado,
--  sea cual sea su rol (justificación completa en ese punto). Esto
--  también obliga a corregir lo que decía el punto 1 sobre el efecto del
--  backfill en la ganancia: CON el BLOCKER 3 sin corregir, el backfill
--  solo no cambiaba nada (porque `costo_lote_unitario_centavos` ni se leía
--  para las ventas del coordinador) — el efecto real sobre la ganancia de
--  Ananja es el del punto 5, no el del backfill aislado.
--
-- Verificado contra una base real (schema `public`, SELECTs de solo
-- lectura — las vistas con `es_admin()` dan vacío sin sesión, así que se
-- reconstruyó a mano desde las tablas):
--  - El coordinador era el ÚNICO tenedor con alguna rendición
--    `via = 'encargado'` en toda la base — ningún admin tenía rendiciones
--    así todavía, así que esta migración no podía tener ningún efecto
--    observable sobre ningún otro tenedor.
--  - Sus revendedoras rindieron cada una EXACTAMENTE lo mismo que vendieron
--    (`rendido = cobrado_vendido`, sin pago parcial pendiente) — el caso
--    general (parcial) queda cubierto con fixtures en
--    `tests/plata.test.ts`/`lib/plata.ts`.
--
-- ============================================================
-- 1) Backfill puntual y acotado — las fotos de un lote quedaron en el
--    costo CALCULADO sin redondear en vez del REDONDEADO que se carga a
--    mano.
-- ============================================================
--
-- `entrega_items.costo_lote_unitario_centavos` (la "foto" congelada del
-- costo Ananja al momento de la entrega, 0044/0052) se llenó, para las
-- entregas de ese lote, ANTES de que existiera el concepto de redondeo
-- (0054): quedó con el costo CALCULADO en vez del REDONDEADO que carga el
-- dueño (`lote_items.costo_ananja_redondeado_centavos`) — lo dice la
-- propia cabecera de 0054 ("Entregas ya hechas... siguen leyendo sus
-- fotos congeladas... el redondeo solo afecta lo que se entregue DE ACÁ EN
-- MÁS"). Como ahora la foto pasa a ser la fuente de verdad (BLOCKER 1),
-- este número viejo hay que corregirlo UNA VEZ, a mano, para ese lote
-- puntual — no es algo que la migración pueda inferir para lotes futuros
-- (esos van a nacer con la foto ya redondeada, por diseño de 0054).
--
-- Se corrigen exactamente las filas de `entrega_items` de ese lote cuya
-- foto es uno de los dos valores calculados viejos (uno por presentación),
-- verificados a mano; las devoluciones (`costo_lote_unitario_centavos is
-- null`, `registrar_entrega_revendedor`/su trigger nunca les carga costo)
-- no las toca el backfill, el `where` de abajo ya las excluye por
-- construcción.
--
-- NO se toca `costo_ananja_unitario_centavos` (lo que se le cobró a la
-- revendedora) ni `costo_produccion_unitario_centavos` — SOLO
-- `costo_lote_unitario_centavos`.
--
-- Efecto de ESTE backfill en `v_margen_ventas`, AISLADO: nulo — mientras
-- el BLOCKER 3 (más abajo, punto 5) no esté corregido, `costo_lote_unitario_centavos`
-- ni siquiera se lee para calcular la ganancia de una venta del
-- coordinador (el JOIN a `enc.rol = 'admin'` no matchea, así que se usa lo
-- cobrado crudo sin mirar el costo del lote en absoluto). El efecto real
-- sobre la ganancia de Ananja es el del punto 5 (BLOCKER 3), que ya
-- incluye este backfill — no hay que sumarlos por separado.
--
-- Alcance: SOLO ese lote. Existía OTRO lote con la misma clase de
-- desajuste (2 filas con la foto calculada contra un redondeado distinto)
-- pero queda FUERA de este backfill a propósito: el pedido fue puntual, y
-- ese otro lote no tenía ninguna revendedora de un coordinador (no afecta
-- ningún número de esta migración). Queda anotado acá para una limpieza
-- aparte, no se toca en esta migración.
--
-- Corrección puntual de datos ya aplicada en producción; no-op en una base
-- nueva (el UUID de abajo es un marcador que no matchea ningún lote).
update entrega_items ei
set costo_lote_unitario_centavos = c.redondeado
from (
  select ei2.id, li.costo_ananja_redondeado_centavos as redondeado
  from entrega_items ei2
  join lote_items li on li.lote_id = ei2.lote_id and li.producto_id = ei2.producto_id
  where ei2.lote_id = '00000000-0000-0000-0000-000000000000'
    and li.costo_ananja_redondeado_centavos is not null
    -- Cinturón y tirantes: además de "el redondeado es distinto de la
    -- foto", que la foto sea EXACTAMENTE uno de los dos calculados viejos
    -- verificados a mano arriba — nunca pisa un valor inesperado.
    and ei2.costo_lote_unitario_centavos in (0, 0)
) c
where ei.id = c.id;

-- ============================================================
-- 2) v_costo_ananja_revendedor — cobrado vs. costo Ananja acumulado por
--    revendedora, de toda su historia en ventas_revendedor. El costo
--    Ananja de cada venta sale de la FOTO congelada de su entrega (no del
--    redondeado vigente del lote — BLOCKER 1, evita la retroactividad),
--    con la misma cadena de respaldo que ya documentaba esta migración:
--     1. `entrega_items.costo_lote_unitario_centavos` (la foto — fuente
--        principal, la misma que usa `v_margen_ventas`);
--     2. si la venta no tiene `entrega_item_id` (sin trazabilidad de
--        lote), `entrega_items.costo_ananja_unitario_centavos` (lo
--        cobrado a la revendedora — ya no distingue margen, pero es lo
--        único que hay);
--     3. si tampoco hay `entrega_item_id` en absoluto (precio manual,
--        `revendedor_precios`, sin entrega), `ventas_revendedor.precio_costo_centavos`
--        (lo cobrado) — ratio 1, mismo comportamiento que hoy.
--    Sin clamp a ratio <= 1 (pedido explícito de Fran): si algún día un
--    coordinador vende por debajo del costo Ananja (`ananja_vendido >
--    cobrado_vendido`), Ananja igual tiene que recibir su costo completo
--    — no hay caso real hoy, cubierto con un test en `tests/plata.test.ts`.
-- ============================================================

create view public.v_costo_ananja_revendedor as
select
  vr.vendedor_id,
  sum(vr.precio_costo_centavos::bigint * vr.cantidad) as cobrado_vendido_centavos,
  sum(
    coalesce(
      ei.costo_lote_unitario_centavos,
      ei.costo_ananja_unitario_centavos,
      vr.precio_costo_centavos
    )::bigint * vr.cantidad
  ) as ananja_vendido_centavos
from ventas_revendedor vr
left join entrega_items ei on ei.id = vr.entrega_item_id
group by vr.vendedor_id;

revoke all on public.v_costo_ananja_revendedor from anon, authenticated, public;
-- Sin grant a authenticated a propósito: sin `security_invoker` (corre
-- como el dueño, sin filtrar por fila), así que dejarla consultar directo
-- expondría el cobrado/costo agregado de CUALQUIER revendedora a
-- cualquier autenticado. Solo la usan, internamente, `v_rendiciones_ananja`
-- (punto 3) y — antes de esta revisión — `v_plata_en_manos`; ambas
-- vistas corren como el mismo dueño (`postgres`), dueño también de esta
-- vista, así que no hace falta ningún grant para esa lectura interna.

-- ============================================================
-- 3) v_rendiciones_ananja (vista nueva — BLOCKER 2) — la parte Ananja de
--    CADA rendición `via = 'encargado'`, para que nadie más duplique la
--    fórmula del ratio: `v_plata_en_manos` (punto 4), y en TypeScript
--    `lib/movimientos-plata-datos.ts` (detalle de "en manos de") y
--    `lib/tareas-datos.ts` § `listarIngresosEnMano` (antigüedad de la
--    plata en mano) pasan a leerla en vez de `rendiciones.monto_centavos`
--    crudo.
--
--    El ratio es el mismo que `v_costo_ananja_revendedor` (por
--    revendedora, TODA su historia). La parte de CADA rendición se
--    calcula así, para que la suma por revendedora dé EXACTO el mismo
--    número que ya calculaba `v_plata_en_manos` (redondeado una sola vez
--    sobre el TOTAL rendido a ese tenedor, no rendición por rendición —
--    ver la cabecera original más abajo, punto 4): se ordenan las
--    rendiciones de esa revendedora a ESE tenedor por fecha de carga: a
--    todas menos la ÚLTIMA se les redondea su propia parte
--    (`round(monto_centavos × ratio)`); la ÚLTIMA se lleva lo que falte
--    para que la suma del grupo dé EXACTO el total redondeado una sola
--    vez (`round(Σ monto_centavos × ratio)`) — así ninguna rendición
--    individual "inventa" redondeo de más, y la suma nunca se desvía ni
--    un centavo del total que ya daba la versión anterior (verificado
--    contra datos reales: con la foto corregida, el total por coordinador
--    sigue dando exacto lo mismo).
--
--    Mismo criterio de acceso que la RLS real de `rendiciones`
--    (`rendiciones_select`, 0042: `es_admin() or vendedor_id =
--    mi_vendedor_id() or es_coordinador_de(vendedor_id)`) — replicado acá
--    a mano porque esta vista, sin `security_invoker`, no hereda la RLS
--    de la tabla por sí sola (mismo patrón que ya usa `v_plata_en_manos`
--    para su propio filtro de fila). Sin esto, cualquier autenticado
--    vería la parte Ananja de CUALQUIER rendición.
-- ============================================================

create view public.v_rendiciones_ananja as
with ratios as (
  select vendedor_id, cobrado_vendido_centavos, ananja_vendido_centavos
  from v_costo_ananja_revendedor
),
base as (
  select
    r.id as rendicion_id,
    r.tenedor_id,
    r.vendedor_id,
    r.monto_centavos,
    r.created_at,
    case
      when coalesce(rt.cobrado_vendido_centavos, 0) <= 0 then 1::numeric
      else rt.ananja_vendido_centavos::numeric / rt.cobrado_vendido_centavos
    end as ratio
  from rendiciones r
  left join ratios rt on rt.vendedor_id = r.vendedor_id
  where r.via = 'encargado'::text
),
con_partes as (
  select
    rendicion_id,
    tenedor_id,
    vendedor_id,
    monto_centavos,
    created_at,
    round(monto_centavos::numeric * ratio) as parte_bruta,
    round(sum(monto_centavos) over (partition by tenedor_id, vendedor_id) * ratio) as parte_total_grupo,
    row_number() over (partition by tenedor_id, vendedor_id order by created_at, rendicion_id) as posicion,
    count(*) over (partition by tenedor_id, vendedor_id) as filas_grupo,
    sum(round(monto_centavos::numeric * ratio)) over (partition by tenedor_id, vendedor_id) as suma_partes_brutas
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

-- ============================================================
-- 4) v_plata_en_manos — create or replace view, mismas columnas + `rol`
--    nueva al final; `rendiciones_centavos` (aparece dos veces en el
--    cuerpo, igual que hoy: como columna propia y adentro de la suma de
--    `total_centavos`) pasa de `sum(r.monto_centavos)` a sumar
--    `v_rendiciones_ananja.monto_ananja_centavos` — ya resuelta, sin
--    repetir acá el cálculo del ratio.
-- ============================================================

create or replace view public.v_plata_en_manos as
select
  id as tenedor_id,
  nombre,
  coalesce((select sum(cp.cobrado_centavos) from comprobantes cp where cp.vendedor_id = v.id and cp.medio_pago = 'efectivo'::medio_pago), 0::numeric)
    + coalesce((select sum(co.monto_centavos) from cobros co where co.vendedor_id = v.id and co.medio_pago = 'efectivo'::medio_pago), 0::numeric)
    as ventas_cobros_centavos,
  coalesce((select sum(ra.monto_ananja_centavos) from v_rendiciones_ananja ra where ra.tenedor_id = v.id), 0::numeric)
    as rendiciones_centavos,
  coalesce((select sum(g.monto_centavos) from gastos g where g.vendedor_id = v.id and g.medio_pago = 'efectivo'::medio_pago), 0::numeric)
    as gastos_centavos,
  coalesce((select sum(pd.monto_caja_centavos) from pagos_deuda pd where pd.vendedor_id = v.id and pd.medio_pago = 'efectivo'::medio_pago), 0::numeric)
    as pagos_deuda_centavos,
  coalesce((select sum(a.monto_centavos) from ajustes_caja a where a.vendedor_id = v.id and a.medio_pago = 'efectivo'::medio_pago), 0::numeric)
    as ajustes_centavos,
  coalesce((select sum(t.monto_centavos) from transferencias_caja t where t.vendedor_id = v.id and t.destino = 'efectivo'::medio_pago), 0::numeric)
    - coalesce((select sum(t.monto_centavos) from transferencias_caja t where t.vendedor_id = v.id and t.origen = 'efectivo'::medio_pago), 0::numeric)
    as transferencias_centavos,
  coalesce((select sum(dc.monto_centavos) from depositos_cuenta dc where dc.tenedor_id = v.id), 0::numeric)
    as depositos_centavos,
  coalesce((select sum(cp.cobrado_centavos) from comprobantes cp where cp.vendedor_id = v.id and cp.medio_pago = 'efectivo'::medio_pago), 0::numeric)
    + coalesce((select sum(co.monto_centavos) from cobros co where co.vendedor_id = v.id and co.medio_pago = 'efectivo'::medio_pago), 0::numeric)
    + coalesce((select sum(ra.monto_ananja_centavos) from v_rendiciones_ananja ra where ra.tenedor_id = v.id), 0::numeric)
    - coalesce((select sum(g.monto_centavos) from gastos g where g.vendedor_id = v.id and g.medio_pago = 'efectivo'::medio_pago), 0::numeric)
    - coalesce((select sum(pd.monto_caja_centavos) from pagos_deuda pd where pd.vendedor_id = v.id and pd.medio_pago = 'efectivo'::medio_pago), 0::numeric)
    + coalesce((select sum(a.monto_centavos) from ajustes_caja a where a.vendedor_id = v.id and a.medio_pago = 'efectivo'::medio_pago), 0::numeric)
    + coalesce((select sum(t.monto_centavos) from transferencias_caja t where t.vendedor_id = v.id and t.destino = 'efectivo'::medio_pago), 0::numeric)
    - coalesce((select sum(t.monto_centavos) from transferencias_caja t where t.vendedor_id = v.id and t.origen = 'efectivo'::medio_pago), 0::numeric)
    - coalesce((select sum(dc.monto_centavos) from depositos_cuenta dc where dc.tenedor_id = v.id), 0::numeric)
    as total_centavos,
  rol
from vendedores v
where rol in ('admin', 'coordinador')
  and (public.es_admin() or (public.es_coordinador() and id = public.mi_vendedor_id()));

-- security_invoker / revoke / grant sin cambios (create or replace,
-- mismas columnas + una nueva al final) — ya aplicados en 0037. Nota: acá
-- SÍ corre sin `security_invoker` (owner), pero como ahora lee
-- `v_rendiciones_ananja` (que SÍ filtra por fila con `es_admin()`/
-- `mi_vendedor_id()`/`es_coordinador_de()` de la SESIÓN real, no del
-- dueño — son funciones que leen `auth.uid()` directo, no dependen de
-- `security_invoker`) el resultado sigue siendo correcto para quien
-- llama, sea admin (ve todas las filas de `v_rendiciones_ananja`, mismo
-- total que antes) o el propio coordinador consultando su fila (ve las
-- rendiciones de SUS revendedoras vía `es_coordinador_de`, nunca las de
-- otro coordinador).
--
-- Sin clamp a ratio <= 1 en ningún punto de esta migración (pedido
-- explícito de Fran, sin caso real hoy): la regla es que Ananja recibe su
-- costo completo aunque el coordinador haya cobrado menos — un test en
-- `tests/plata.test.ts` cubre el caso (venta por debajo del costo
-- Ananja, ratio > 1, la parte Ananja de una rendición puede superar lo
-- que esa rendición puntual trajo).
--
-- ============================================================
-- 5) v_margen_ventas (BLOCKER 3) — `create or replace view`, MISMAS
--    columnas en el mismo orden y tipo (diff semántico contra el
--    `pg_get_viewdef` vigente en prod, 2026-09-19: el único cambio real
--    son 2 líneas del CTE `costo_venta_revendedor`). El resto del cuerpo
--    (atribución FIFO de costo para ventas sin lote elegido, `costo_seguro`,
--    el `SELECT` final) se reproduce tal cual, sin tocarlo.
--
--    Qué cambia, y por qué (ver BLOCKER 3 en la cabecera):
--     - `ananja_unitario_centavos`: pasa de
--       `CASE WHEN costo_lote_incompleto OR enc.id IS NULL THEN cobrado
--             ELSE LEAST(cobrado, costo_lote_unitario_centavos) END`
--       a
--       `CASE WHEN costo_lote_incompleto THEN cobrado
--             ELSE LEAST(cobrado, costo_lote_unitario_centavos) END`
--       — se saca `OR enc.id IS NULL` del todo: el `LEAST` se aplica
--       SIEMPRE que hay foto de costo (`costo_lote_incompleto = false`),
--       sin mirar si hay un encargado ni de qué rol es. Decisión
--       (pedido de Fran, punto 2 de esta ronda): "Ananja nunca gana más
--       que su costo en ventas de revendedoras, tenga o no encargado" —
--       la simplificación es CORRECTA y no cambia nada para una venta sin
--       margen (el caso de un admin, que históricamente siempre cobró a
--       costo: `cobrado = costo`, así que `LEAST` da lo mismo que antes,
--       verificado: 0 filas de un admin con `costo_ananja_unitario_centavos
--       <> costo_lote_unitario_centavos`) ni para las ventas directas por
--       comprobante (esa rama del `CASE` final ni pasa por este CTE, usa
--       `t.costo_lote_unitario_centavos`/`d.costo_ananja_unitario_centavos`
--       directo). Es estrictamente más simple Y más robusta que dejar
--       `admin|coordinador` a mano: cubre cualquier rol futuro que sirva
--       de encargado sin volver a tocar esta vista.
--     - `encargado_unitario_centavos` (informativo, sin uso en la UI hoy
--       — `margen_encargado_centavos` no se lee en ningún lado, ver
--       `lib/margen.ts`): pasa de `enc.rol = 'admin'::text AND enc.activo`
--       a solo `enc.activo` — sigue necesitando un encargado real (activo,
--       no uno mismo) para tener sentido atribuirle un margen a alguien,
--       pero ya no exige que sea admin.
--
--    Efecto verificado (origen = 'revendedor', SELECT de solo lectura, CON
--    el backfill del punto 1 aplicado — es el estado que queda después de
--    correr esta migración completa): el ingreso y la ganancia de Ananja
--    bajan exactamente en el mismo monto (el costo de PRODUCCIÓN no
--    cambia), tanto en el total como por producto.
--    Esa baja es la misma plata, exacta, que este archivo ya le saca a
--    "plata en manos" del coordinador (punto 4) — su margen a la
--    revendedora más el resto de redondeo que le cargó de más a las
--    demás: antes de esta corrección, esa plata se contaba DOS VECES como
--    ganancia de Ananja: una vez (mal) en la ganancia de
--    `v_margen_ventas`/`/ganancia`/Inicio, y quedaba, además, sin pasar a
--    la cuenta real — con esta migración deja de contarse en la ganancia
--    reportada, y sigue sin pasar a la cuenta hasta que el coordinador la
--    pase (es de él).
--
--    `lib/margen.ts` § `calcularFilaMargen` (espejo TS): mismo cambio —
--    ver la cabecera de esa función y `tests/margen.test.ts`. Sigue sin
--    existir una columna "ganancia del encargado": no se muestra en
--    ningún lado (mismo criterio que Plata).
--
--    `Inicio` (`lib/inicio.ts`/`lib/inicio-datos.ts`) y `/ganancia`
--    (`app/(app)/ganancia/page.tsx`) leen `v_margen_ventas` directo por
--    columna (`margen_ananja_centavos`/`ingreso_ananja_centavos`), sin
--    duplicar ninguna fórmula — heredan el número corregido sin tocar su
--    código.
-- ============================================================

create or replace view public.v_margen_ventas as
 WITH lote_directo AS (
         SELECT dl.lote_id,
            dl.producto_id,
            COALESCE(sum(dl.cantidad), 0::bigint) AS asignado_directo
           FROM ( SELECT ci.lote_id,
                    ci.producto_id,
                    ci.cantidad
                   FROM comprobante_items ci
                  WHERE ci.lote_id IS NOT NULL
                UNION ALL
                 SELECT vr.lote_id,
                    vr.producto_id,
                    vr.cantidad
                   FROM ventas_revendedor vr
                  WHERE vr.lote_id IS NOT NULL) dl
          GROUP BY dl.lote_id, dl.producto_id
        ), lote_capacidad AS (
         SELECT li.lote_id,
            li.producto_id,
            l.fecha,
            l.created_at,
            GREATEST(li.cantidad - COALESCE(ld.asignado_directo, 0::bigint), 0::bigint) AS capacidad
           FROM lote_items li
             JOIN lotes_produccion l ON l.id = li.lote_id
             LEFT JOIN lote_directo ld ON ld.lote_id = li.lote_id AND ld.producto_id = li.producto_id
        ), lote_capacidad_off AS (
         SELECT lc.lote_id,
            lc.producto_id,
            lc.fecha,
            lc.created_at,
            lc.capacidad,
            COALESCE(sum(lc.capacidad) OVER (PARTITION BY lc.producto_id ORDER BY lc.fecha, lc.created_at, lc.lote_id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0::numeric)::bigint AS offset_previo
           FROM lote_capacidad lc
          WHERE lc.capacidad > 0
        ), lote_capacidad_rango AS (
         SELECT o.lote_id,
            o.producto_id,
            o.fecha,
            o.created_at,
            o.capacidad,
            o.offset_previo,
            o.offset_previo + o.capacidad AS fin_posicion
           FROM lote_capacidad_off o
        ), demanda_sin_lote AS (
         SELECT 'comprobante'::text AS origen,
            ci.comprobante_id AS documento_id,
            c.fecha,
            c.created_at,
            ci.id AS orden_id,
            ci.producto_id,
            ci.cantidad,
            c.vendedor_id,
            c.feria_id,
            ci.precio_unitario_centavos,
            NULL::bigint AS precio_costo_real_centavos,
            NULL::bigint AS costo_lote_unitario_centavos,
            NULL::bigint AS costo_produccion_unitario_centavos
           FROM comprobante_items ci
             JOIN comprobantes c ON c.id = ci.comprobante_id
          WHERE ci.lote_id IS NULL
        UNION ALL
         SELECT 'revendedor'::text AS origen,
            vr.id AS documento_id,
            vr.fecha,
            vr.created_at,
            vr.id AS orden_id,
            vr.producto_id,
            vr.cantidad,
            vr.vendedor_id,
            NULL::uuid AS feria_id,
            vr.precio_venta_centavos AS precio_unitario_centavos,
            vr.precio_costo_centavos AS precio_costo_real_centavos,
            NULL::bigint AS costo_lote_unitario_centavos,
            NULL::bigint AS costo_produccion_unitario_centavos
           FROM ventas_revendedor vr
          WHERE vr.lote_id IS NULL
        ), demanda_off AS (
         SELECT d_1.origen,
            d_1.documento_id,
            d_1.fecha,
            d_1.created_at,
            d_1.orden_id,
            d_1.producto_id,
            d_1.cantidad,
            d_1.vendedor_id,
            d_1.feria_id,
            d_1.precio_unitario_centavos,
            d_1.precio_costo_real_centavos,
            d_1.costo_lote_unitario_centavos,
            d_1.costo_produccion_unitario_centavos,
            COALESCE(sum(d_1.cantidad) OVER (PARTITION BY d_1.producto_id ORDER BY d_1.fecha, d_1.created_at, d_1.orden_id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0::bigint) AS offset_previo
           FROM demanda_sin_lote d_1
        ), demanda_con_frontera AS (
         SELECT d_1.origen,
            d_1.documento_id,
            d_1.fecha,
            d_1.created_at,
            d_1.orden_id,
            d_1.producto_id,
            d_1.cantidad,
            d_1.vendedor_id,
            d_1.feria_id,
            d_1.precio_unitario_centavos,
            d_1.precio_costo_real_centavos,
            d_1.costo_lote_unitario_centavos,
            d_1.costo_produccion_unitario_centavos,
            d_1.offset_previo,
            COALESCE(( SELECT max(lcr.fin_posicion) AS max
                   FROM lote_capacidad_rango lcr
                  WHERE lcr.producto_id = d_1.producto_id AND lcr.fecha <= d_1.fecha), 0::bigint) AS frontera,
            GREATEST(LEAST(d_1.offset_previo + d_1.cantidad, COALESCE(( SELECT max(lcr.fin_posicion) AS max
                   FROM lote_capacidad_rango lcr
                  WHERE lcr.producto_id = d_1.producto_id AND lcr.fecha <= d_1.fecha), 0::bigint)) - d_1.offset_previo, 0::bigint) AS cantidad_satisfecha
           FROM demanda_off d_1
        ), sin_lote_resuelto AS (
         SELECT d_1.origen,
            d_1.documento_id,
            d_1.fecha,
            d_1.producto_id,
            lcr.lote_id,
            d_1.vendedor_id,
            d_1.feria_id,
            d_1.precio_unitario_centavos,
            d_1.precio_costo_real_centavos,
            d_1.costo_lote_unitario_centavos,
            d_1.costo_produccion_unitario_centavos,
            (LEAST(d_1.offset_previo + d_1.cantidad_satisfecha, lcr.fin_posicion) - GREATEST(d_1.offset_previo, lcr.offset_previo))::integer AS cantidad,
            true AS costo_estimado
           FROM demanda_con_frontera d_1
             JOIN lote_capacidad_rango lcr ON lcr.producto_id = d_1.producto_id AND lcr.offset_previo < (d_1.offset_previo + d_1.cantidad_satisfecha) AND lcr.fin_posicion > d_1.offset_previo
          WHERE d_1.cantidad_satisfecha > 0
        ), sin_lote_no_resuelto AS (
         SELECT d_1.origen,
            d_1.documento_id,
            d_1.fecha,
            d_1.producto_id,
            NULL::uuid AS lote_id,
            d_1.vendedor_id,
            d_1.feria_id,
            d_1.precio_unitario_centavos,
            d_1.precio_costo_real_centavos,
            d_1.costo_lote_unitario_centavos,
            d_1.costo_produccion_unitario_centavos,
            (d_1.cantidad - d_1.cantidad_satisfecha)::integer AS cantidad,
            true AS costo_estimado
           FROM demanda_con_frontera d_1
          WHERE (d_1.cantidad - d_1.cantidad_satisfecha) > 0
        ), sin_lote_agregado AS (
         SELECT s.origen,
            s.documento_id,
            s.fecha,
            s.producto_id,
            s.lote_id,
            s.vendedor_id,
            s.feria_id,
            s.precio_unitario_centavos,
            s.precio_costo_real_centavos,
            s.costo_lote_unitario_centavos,
            s.costo_produccion_unitario_centavos,
            s.cantidad,
            s.costo_estimado
           FROM sin_lote_resuelto s
        UNION ALL
         SELECT s.origen,
            s.documento_id,
            s.fecha,
            s.producto_id,
            s.lote_id,
            s.vendedor_id,
            s.feria_id,
            s.precio_unitario_centavos,
            s.precio_costo_real_centavos,
            s.costo_lote_unitario_centavos,
            s.costo_produccion_unitario_centavos,
            s.cantidad,
            s.costo_estimado
           FROM sin_lote_no_resuelto s
        ), con_lote AS (
         SELECT 'comprobante'::text AS origen,
            ci.comprobante_id AS documento_id,
            c.fecha,
            ci.producto_id,
            ci.lote_id,
            c.vendedor_id,
            c.feria_id,
            ci.precio_unitario_centavos,
            NULL::bigint AS precio_costo_real_centavos,
            ci.costo_lote_unitario_centavos,
            ci.costo_produccion_unitario_centavos,
            ci.cantidad,
            false AS costo_estimado
           FROM comprobante_items ci
             JOIN comprobantes c ON c.id = ci.comprobante_id
          WHERE ci.lote_id IS NOT NULL
        UNION ALL
         SELECT 'revendedor'::text AS origen,
            vr.id AS documento_id,
            vr.fecha,
            vr.producto_id,
            vr.lote_id,
            vr.vendedor_id,
            NULL::uuid AS feria_id,
            vr.precio_venta_centavos AS precio_unitario_centavos,
            vr.precio_costo_centavos AS precio_costo_real_centavos,
            NULL::bigint AS costo_lote_unitario_centavos,
            NULL::bigint AS costo_produccion_unitario_centavos,
            vr.cantidad,
            false AS costo_estimado
           FROM ventas_revendedor vr
          WHERE vr.lote_id IS NOT NULL
        ), todas AS (
         SELECT c.origen,
            c.documento_id,
            c.fecha,
            c.producto_id,
            c.lote_id,
            c.vendedor_id,
            c.feria_id,
            c.precio_unitario_centavos,
            c.precio_costo_real_centavos,
            c.costo_lote_unitario_centavos,
            c.costo_produccion_unitario_centavos,
            c.cantidad,
            c.costo_estimado
           FROM con_lote c
        UNION ALL
         SELECT s.origen,
            s.documento_id,
            s.fecha,
            s.producto_id,
            s.lote_id,
            s.vendedor_id,
            s.feria_id,
            s.precio_unitario_centavos,
            s.precio_costo_real_centavos,
            s.costo_lote_unitario_centavos,
            s.costo_produccion_unitario_centavos,
            s.cantidad,
            s.costo_estimado
           FROM sin_lote_agregado s
        ), costo_seguro AS (
         SELECT v_costo_lote_vigente.lote_id,
            v_costo_lote_vigente.producto_id,
                CASE
                    WHEN v_costo_lote_vigente.tiene_costos THEN v_costo_lote_vigente.costo_unitario_centavos
                    ELSE NULL::bigint
                END AS costo_produccion_unitario_centavos,
                CASE
                    WHEN v_costo_lote_vigente.tiene_costos THEN v_costo_lote_vigente.costo_ananja_centavos
                    ELSE NULL::bigint
                END AS costo_ananja_unitario_centavos
           FROM v_costo_lote_vigente
        ), costo_venta_revendedor AS (
         SELECT c.venta_id,
            c.costo_lote_incompleto,
                CASE
                    WHEN c.costo_lote_incompleto THEN c.cobrado_unitario_centavos
                    ELSE LEAST(c.cobrado_unitario_centavos, c.costo_lote_unitario_centavos)
                END AS ananja_unitario_centavos,
                CASE
                    WHEN c.costo_lote_incompleto THEN NULL::bigint
                    WHEN enc.id IS NULL THEN 0::bigint
                    ELSE GREATEST(c.cobrado_unitario_centavos - c.costo_lote_unitario_centavos, 0::bigint)
                END AS encargado_unitario_centavos,
            c.costo_produccion_unitario_centavos AS produccion_unitario_centavos,
            c.costo_lote_unitario_centavos AS ananja_display_centavos
           FROM v_costo_lote_venta c
             JOIN vendedores yo ON yo.id = c.vendedor_id
             LEFT JOIN vendedores enc ON enc.id = yo.encargado_id AND enc.activo AND enc.id <> yo.id
        )
 SELECT t.origen,
    t.documento_id,
    t.fecha,
    t.vendedor_id,
    t.feria_id,
    t.producto_id,
    t.lote_id,
    t.cantidad,
        CASE
            WHEN t.origen = 'revendedor'::text THEN COALESCE(cv.produccion_unitario_centavos, d.costo_produccion_unitario_centavos)
            WHEN t.origen = 'comprobante'::text THEN COALESCE(t.costo_produccion_unitario_centavos, d.costo_produccion_unitario_centavos)
            ELSE d.costo_produccion_unitario_centavos
        END AS costo_produccion_unitario_centavos,
        CASE
            WHEN t.origen = 'revendedor'::text THEN COALESCE(cv.ananja_display_centavos, d.costo_ananja_unitario_centavos)
            WHEN t.origen = 'comprobante'::text THEN COALESCE(t.costo_lote_unitario_centavos, d.costo_ananja_unitario_centavos)
            ELSE d.costo_ananja_unitario_centavos
        END AS costo_ananja_unitario_centavos,
    t.precio_unitario_centavos AS precio_unitario_venta_centavos,
    t.costo_estimado,
        CASE
            WHEN t.origen = 'revendedor'::text THEN cv.ananja_unitario_centavos * t.cantidad
            WHEN t.origen = 'comprobante'::text AND t.costo_lote_unitario_centavos IS NOT NULL THEN t.costo_lote_unitario_centavos * t.cantidad
            WHEN d.costo_ananja_unitario_centavos IS NOT NULL THEN d.costo_ananja_unitario_centavos * t.cantidad
            ELSE NULL::bigint
        END AS ingreso_ananja_centavos,
        CASE
            WHEN t.origen = 'revendedor'::text THEN
            CASE
                WHEN cv.costo_lote_incompleto THEN NULL::bigint
                WHEN cv.ananja_unitario_centavos IS NOT NULL AND COALESCE(cv.produccion_unitario_centavos, d.costo_produccion_unitario_centavos) IS NOT NULL THEN (cv.ananja_unitario_centavos - COALESCE(cv.produccion_unitario_centavos, d.costo_produccion_unitario_centavos)) * t.cantidad
                ELSE NULL::bigint
            END
            WHEN t.origen = 'comprobante'::text AND t.costo_lote_unitario_centavos IS NOT NULL AND COALESCE(t.costo_produccion_unitario_centavos, d.costo_produccion_unitario_centavos) IS NOT NULL THEN (t.costo_lote_unitario_centavos - COALESCE(t.costo_produccion_unitario_centavos, d.costo_produccion_unitario_centavos)) * t.cantidad
            WHEN d.costo_ananja_unitario_centavos IS NOT NULL AND d.costo_produccion_unitario_centavos IS NOT NULL THEN (d.costo_ananja_unitario_centavos - d.costo_produccion_unitario_centavos) * t.cantidad
            ELSE NULL::bigint
        END AS margen_ananja_centavos,
        CASE
            WHEN t.origen = 'revendedor'::text THEN
            CASE
                WHEN t.precio_unitario_centavos IS NOT NULL AND t.precio_costo_real_centavos IS NOT NULL THEN (t.precio_unitario_centavos - t.precio_costo_real_centavos) * t.cantidad
                ELSE NULL::bigint
            END
            WHEN t.precio_unitario_centavos IS NOT NULL AND t.origen = 'comprobante'::text AND t.costo_lote_unitario_centavos IS NOT NULL THEN (t.precio_unitario_centavos - t.costo_lote_unitario_centavos) * t.cantidad
            WHEN t.precio_unitario_centavos IS NOT NULL AND d.costo_ananja_unitario_centavos IS NOT NULL THEN (t.precio_unitario_centavos - d.costo_ananja_unitario_centavos) * t.cantidad
            ELSE NULL::bigint
        END AS margen_vendedor_centavos,
        CASE
            WHEN t.origen = 'revendedor'::text THEN cv.encargado_unitario_centavos * t.cantidad
            ELSE 0::bigint
        END AS margen_encargado_centavos
   FROM todas t
     LEFT JOIN costo_seguro d ON d.lote_id = t.lote_id AND d.producto_id = t.producto_id
     LEFT JOIN costo_venta_revendedor cv ON t.origen = 'revendedor'::text AND cv.venta_id = t.documento_id;

-- security_invoker / revoke / grant sin cambios (create or replace,
-- mismas columnas) — ya aplicados en 0031/0044/0052.

-- Qué sigue sin cambiar: `v_cuenta_ananja` y los saldos de caja (lo
-- depositado sigue siendo lo depositado); `ventas_cobros_centavos`/
-- `gastos_centavos`/`pagos_deuda_centavos`/`ajustes_centavos`/
-- `transferencias_centavos`/`depositos_centavos`; `informar_deposito_cuenta`
-- (0057)/`registrar_deposito_cuenta` (0037)/`confirmar_deposito_informado`
-- (0057) — ninguna toca `rendiciones_centavos` directo, las tres leen
-- `v_plata_en_manos.total_centavos` por nombre; `asignar_rol_revendedor`,
-- `registrar_rendicion`, `registrar_entrega_revendedor`, `v_costo_lote_venta`
-- — ninguna función ni vista más se toca, todas siguen guardando/leyendo
-- los mismos datos crudos.
--
-- Migración sin templating (mismo criterio que 0049-0057): hardcodea
-- `public.` y `search_path = public` — Ananja es hoy el único negocio
-- activo (schema `miel` en pausa).
