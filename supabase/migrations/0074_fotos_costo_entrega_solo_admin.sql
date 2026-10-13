-- Ananja: las fotos de costo de `entrega_items` pasan a ser de solo admin.
--
-- El problema (hallazgo de seguridad): `entrega_items` guarda dos fotos de
-- costo que son datos de admin,
--   - `costo_lote_unitario_centavos` (0044): el costo Ananja del lote al
--     momento de la entrega, y
--   - `costo_produccion_unitario_centavos` (0052): el costo real de
--     producción,
-- pero la tabla tiene `grant select` de TABLA a `authenticated` (0018) y su
-- policy solo filtra FILAS (0018, ampliada en 0055): una revendedora lee sus
-- entregas y una coordinadora las de sus revendedoras. Nada restringe las
-- COLUMNAS, así que con su propia sesión y la API REST cualquiera de las dos
-- lee el costo de producción (y con él el margen de Ananja), y una
-- revendedora a cargo de una coordinadora lee además cuánto se queda su
-- coordinadora (`costo_ananja_unitario_centavos` - `costo_lote_unitario_centavos`).
-- Lo mismo sale por `v_costo_lote_venta` (security_invoker, con grant a
-- `authenticated` y sin filtro de rol), por
-- `v_valor_stock_revendedor.valor_en_poder_ananja_centavos` (0059) y por
-- `v_rendiciones_ananja.monto_ananja_centavos` de las filas propias de una
-- revendedora (0061). Es el mismo dato que el resto del esquema ya guarda
-- solo para admins (`lote_costos`, `lote_valoraciones`,
-- `v_costo_lote_vigente`, `v_margen_ventas`).
--
-- Por qué no alcanza con un `revoke` de columnas: admins, revendedoras y
-- coordinadoras comparten el rol de Postgres `authenticated`. Un `revoke`
-- de columna se las saca también a los admins, y a toda vista
-- `security_invoker` que las nombre (Postgres chequea el permiso de TODAS
-- las columnas que usa la definición de la vista, se pidan o no). Por eso
-- las fotos se leen desde ahora por un único camino con chequeo de rol.
--
-- Qué toca:
--
--  1) `public.entrega_items_costos()`: función nueva, security definer, que
--     devuelve `(entrega_item_id, costo_lote_unitario_centavos,
--     costo_produccion_unitario_centavos)` de todos los ítems SOLO si quien
--     llama es admin (`es_admin()`); a cualquier otro le devuelve cero filas.
--     Es el único camino de lectura de las dos fotos para una sesión de
--     usuario: lo usan las vistas de los puntos 2 a 4 y las pantallas de
--     admin (`lib/data/entrega-items-costos.ts`).
--
--  2) `v_costo_lote_venta` (0052): mismo cuerpo y mismas columnas; las dos
--     fotos salen de `entrega_items_costos()` en vez de la tabla y se agrega
--     `where public.es_admin()` (igual que hizo 0060 con `v_margen_ventas`).
--     Sus tres lectores (`v_diferencia_encargado`, `v_diferencia_pendiente`,
--     `v_margen_ventas`) ya tenían ese mismo filtro; ninguna pantalla la lee
--     directo.
--
--  3) `v_cobranza_lote` (0052): mismo cuerpo y mismas columnas; la foto de
--     las salidas por entrega sale de `entrega_items_costos()`. Ya era de
--     admin en los hechos (arranca de `v_costo_lote_vigente`, que para un
--     no-admin no tiene filas).
--
--  4) `v_valor_stock_revendedor` (0059): mismo cuerpo y mismas columnas; el
--     costo real de `valor_en_poder_ananja_centavos` sale de
--     `entrega_items_costos()`. Para un admin da lo mismo que antes. Para
--     quien no es admin la función no devuelve filas y la columna cae al
--     respaldo que la vista ya tenía (`costo_ananja_unitario_centavos`, lo
--     que se le cobró): pasa a valer lo mismo que `valor_en_poder_centavos`.
--     `en_poder` y `valor_en_poder_centavos` no cambian para nadie.
--
--  5) `public.mi_stock_cobrado_con_margen()`: función nueva, security
--     definer, sin parámetros, que devuelve SOLO un booleano sobre el stock
--     de quien llama (`mi_vendedor_id()`). Hace falta porque `/mi` comparaba
--     las dos columnas del punto 4, con la sesión de la revendedora, para
--     decidir a quién nombrar en el renglón "Tu stock: Le debés a ...": el
--     nombre de su encargado si lo que le cobraron difiere del costo Ananja,
--     "Ananja" si no. Como esas columnas ya no difieren para ella, la
--     pregunta se contesta acá, con la misma cuenta que hacía la vista
--     (0059), sin devolver ningún monto. Da `true` únicamente en el caso en
--     que esa pantalla ya mostraba el nombre del encargado: tiene encargado
--     (`mi_encargado_revendedor()`), lo que tiene en su poder vale más de 0
--     a lo que le cobraron, y ese valor difiere del valor al costo Ananja.
--     En cualquier otro caso (sin encargado, sin stock, sin diferencia, o
--     quien llama no revende) da `false`. No le dice a nadie nada que su
--     propia pantalla no le mostrara ya.
--
--  6) `v_rendiciones_ananja` (0061): es la única vista en la que alguien que
--     NO es admin necesita un número calculado con la foto: la coordinadora
--     ve cuánto tiene que pasar a Ananja (`v_plata_en_manos`, su inicio). El
--     cálculo de 0061 (copiado tal cual, sin tocar una cuenta) se muda a
--     `public.rendiciones_parte_ananja()`, security definer, que devuelve
--     solo `(rendicion_id, monto_ananja_centavos)`, y la vista queda como
--     `rendiciones` (con su RLS de siempre, sigue siendo security_invoker)
--     unida a esa función. Mismas columnas y tipos. La función entrega la
--     parte Ananja:
--       - a un admin: de todas las rendiciones;
--       - a una coordinadora: de las rendiciones de las revendedoras que
--         tiene a cargo y de las suyas propias (su venta directa, 0073);
--       - a una revendedora: de ninguna.
--     Así la coordinadora sigue viendo exactamente el mismo número que hoy
--     (el total que debe pasar), pero ya no la foto cruda ítem por ítem.
--
--  7) `entrega_items`: se saca el `select` de tabla a `authenticated` y se
--     da `select` solo de las columnas que las pantallas de revendedoras y
--     coordinadoras usan: `id`, `entrega_id`, `producto_id`, `cantidad`,
--     `lote_id`, `costo_ananja_unitario_centavos` (lo que se le cobra a ella)
--     y `precio_sugerido_centavos`. Las dos fotos quedan sin permiso de
--     lectura directa. La policy de filas no cambia. OJO a futuro: una
--     columna nueva en `entrega_items` nace SIN permiso de lectura para
--     `authenticated`; si una pantalla la necesita hay que darle `grant
--     select (columna)` a mano.
--
-- Lo que NO cambia: todo lo que escribe `entrega_items` o sus fotos corre con
-- los permisos del dueño (funciones security definer, o funciones que solo
-- se llaman desde una que lo es) y sigue igual: los triggers
-- `entrega_items_foto_costo_lote` y `completar_fotos_costo_lote`,
-- `registrar_entrega_revendedor`, `tomar_del_deposito`, etc. Las dos
-- funciones SIN security definer que leen la tabla con los permisos de quien
-- llama, `stock_revendedor_por_entrega` (la usa `v_valor_stock_revendedor`)
-- y `buscar_cargas_parecidas`, solo leen columnas que siguen permitidas.
-- `v_stock_revendedor`, `v_resumen_revendedor`, `v_plata_en_manos`,
-- `v_margen_ventas` y las vistas de diferencia no se redefinen.
--
-- Cambios de comportamiento (todos para quien NO es admin; un admin ve los
-- mismos números que antes en todas las vistas):
--   a) `select` de las dos fotos (o `select *`) sobre `entrega_items` da
--      "permission denied" (42501). Es el objetivo de la migración.
--   b) `v_costo_lote_venta` da cero filas (antes: las ventas propias, con
--      las fotos).
--   c) `v_valor_stock_revendedor.valor_en_poder_ananja_centavos` vale lo
--      mismo que `valor_en_poder_centavos`. Ninguna pantalla de revendedora
--      o coordinadora la lee ya: `/mi` la usaba solo para elegir el nombre
--      del renglón "Tu stock: Le debés a ...", y ahora se lo pregunta a la
--      función del punto 5. Lo que se ve en `/mi` no cambia.
--   d) `v_rendiciones_ananja` da cero filas a una revendedora (antes: sus
--      propias rendiciones con la parte Ananja, de donde se deduce el plus
--      de su coordinadora). Ninguna pantalla de revendedora la lee.
--
-- Orden de despliegue: PRIMERO el código, DESPUÉS esta migración (el orden
-- habitual acá, con las migraciones aplicadas a mano). El código que la
-- acompaña anda igual contra la base todavía sin migrar: si las funciones
-- de los puntos 1 y 5 no existen (`PGRST202`/`42883`), las lecturas de
-- admin piden las fotos directo a la tabla como hasta hoy
-- (`lib/data/entrega-items-costos.ts`) y `/mi` hace la comparación de
-- columnas de siempre (`leerStockCobradoConMargen`, `lib/data/mi.ts`).
-- Al revés NO: la UI vieja contra la base ya migrada falla en tres lecturas
-- de admin que piden las fotos (o `*`) a la tabla (hilo de movimientos de
-- `/revendedores/[id]`, botellas adeudadas de `/revendedores` y
-- `/revendedores/[id]`, desglose por lote de `/plata/en-manos/[id]`) y en
-- `/mi` el renglón "Tu stock: Le debés a ..." pasa a decir siempre "Ananja"
-- (la comparación vieja ya no encuentra diferencia). Los puntos 1 a 6 solos
-- son compatibles con la UI vieja de admin; lo que la rompe es el `revoke`
-- del punto 7.
--
-- Migración sin templating (mismo criterio que 0049-0073): hardcodea
-- `public.`. `set search_path = public` va SIN comillas a propósito: con
-- comillas rompe el render multi-schema (supabase/render.mjs).
--
-- Cómo se verificó: aplicada la cadena 0001-0074 renderizada para `public`
-- en un Postgres 15 descartable (no en producción) con stubs mínimos de
-- `auth` y `storage` y los default privileges de Supabase; datos cargados
-- con las RPC reales (lotes con y sin costos, un lote con el costo vigente
-- distinto de las fotos, entregas de admin con plus y de coordinadora,
-- ventas, devolución, rendiciones, venta de coordinadora y depósito) y
-- comparación de todas las vistas de arriba ANTES y DESPUÉS, con usuarios
-- simulados: admin, dos coordinadoras, varias revendedoras (con y sin
-- encargado, con y sin plus) y `anon`. Se probó además que con SOLO el
-- `revoke` del punto 7 (sin los puntos 1 a 6) esas vistas fallan también
-- para un admin, y, contra un PostgREST local, que las lecturas de
-- `lib/data` y el nombre que elige `/mi` dan lo mismo en los tres casos:
-- código viejo sin 0074, código nuevo sin 0074 y código nuevo con 0074. Ver
-- el bloque de verificación de solo lectura al final de este archivo.
--
-- SIN APLICAR: se aplica en prod `public` solo con el OK de Fran.

-- ============================================================
-- 1) entrega_items_costos — único camino de lectura de las fotos
-- ============================================================

create function public.entrega_items_costos()
returns table (
  entrega_item_id uuid,
  costo_lote_unitario_centavos bigint,
  costo_produccion_unitario_centavos bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select ei.id, ei.costo_lote_unitario_centavos, ei.costo_produccion_unitario_centavos
  from entrega_items ei
  where public.es_admin();
$$;

revoke execute on function public.entrega_items_costos() from anon, public;
grant execute on function public.entrega_items_costos() to authenticated;

-- ============================================================
-- 2) v_costo_lote_venta — mismo cuerpo que 0052 (E.3); las fotos salen de
--    entrega_items_costos() y se agrega el filtro de admin.
-- ============================================================

create or replace view public.v_costo_lote_venta
with (security_invoker = true) as
select vr.id as venta_id,
    vr.vendedor_id,
    vr.fecha,
    vr.created_at,
    vr.cantidad,
    vr.precio_costo_centavos as cobrado_unitario_centavos,
        case
            when ei.lote_id is null then vr.precio_costo_centavos
            else coalesce(c.costo_lote_unitario_centavos,
            case
                when lc.completo and d.tiene_costos then d.costo_ananja_centavos
                else null::bigint
            end)
        end as costo_lote_unitario_centavos,
    ei.lote_id is not null and c.costo_lote_unitario_centavos is null and not coalesce(lc.completo and d.tiene_costos, false) as costo_lote_incompleto,
        case
            when ei.lote_id is null then null::bigint
            else coalesce(c.costo_produccion_unitario_centavos,
            case
                when lc.completo and d.tiene_costos then d.costo_unitario_centavos
                else null::bigint
            end)
        end as costo_produccion_unitario_centavos
   from ventas_revendedor vr
     left join entrega_items ei on ei.id = vr.entrega_item_id
     left join public.entrega_items_costos() c on c.entrega_item_id = ei.id
     left join v_lote_costos_completos lc on lc.lote_id = ei.lote_id and lc.producto_id = ei.producto_id
     left join v_costo_lote_vigente d on d.lote_id = ei.lote_id and d.producto_id = ei.producto_id
  where public.es_admin();

revoke all on public.v_costo_lote_venta from anon, public;
grant select on public.v_costo_lote_venta to authenticated;

-- ============================================================
-- 3) v_cobranza_lote — mismo cuerpo que 0052 (E.5); la foto de las salidas
--    por entrega sale de entrega_items_costos().
-- ============================================================

create or replace view public.v_cobranza_lote
with (security_invoker = true) as
with salidas_venta as (
  -- Egresos motivo='venta' con SU propia foto (comprobante o entrega),
  -- por origen — null cuando esa salida no tiene foto (lote incompleto
  -- al momento de salir).
  select m.lote_id, m.producto_id, m.cantidad, ci.costo_lote_unitario_centavos as foto_centavos
  from movimientos_stock m
    join comprobante_items ci
      on ci.comprobante_id = m.comprobante_id and ci.producto_id = m.producto_id and ci.lote_id = m.lote_id
  where m.tipo = 'egreso'::tipo_movimiento and m.lote_id is not null and m.motivo = 'venta'::text
    and m.comprobante_id is not null
  union all
  select m.lote_id, m.producto_id, m.cantidad, c.costo_lote_unitario_centavos as foto_centavos
  from movimientos_stock m
    join entrega_items ei
      on ei.entrega_id = m.entrega_id and ei.producto_id = m.producto_id and ei.lote_id = m.lote_id
    left join public.entrega_items_costos() c on c.entrega_item_id = ei.id
  where m.tipo = 'egreso'::tipo_movimiento and m.lote_id is not null and m.motivo = 'venta'::text
    and m.entrega_id is not null
), salidas as (
  select lote_id, producto_id,
    sum(cantidad) as unidades,
    sum(cantidad) filter (where foto_centavos is not null) as unidades_con_foto,
    sum(cantidad * foto_centavos) filter (where foto_centavos is not null) as valor_con_foto_centavos
  from salidas_venta
  group by lote_id, producto_id
), devoluciones as (
         select movimientos_stock.lote_id,
            movimientos_stock.producto_id,
            sum(movimientos_stock.cantidad) as unidades
           from movimientos_stock
          where movimientos_stock.tipo = 'ingreso'::tipo_movimiento and movimientos_stock.lote_id is not null and movimientos_stock.entrega_id is not null
          group by movimientos_stock.lote_id, movimientos_stock.producto_id
        ), perdidas as (
         select v_perdidas_lote.lote_id,
            v_perdidas_lote.producto_id,
            sum(v_perdidas_lote.unidades) as unidades
           from v_perdidas_lote
          group by v_perdidas_lote.lote_id, v_perdidas_lote.producto_id
        ), netas as (
         select d_1.lote_id,
            d_1.producto_id,
            greatest(coalesce(s.unidades, 0::bigint) - coalesce(dv.unidades, 0::bigint), 0::bigint) as vendidas,
            coalesce(s.unidades, 0::bigint) as vendidas_brutas,
            coalesce(s.unidades_con_foto, 0::bigint) as unidades_con_foto,
            coalesce(s.valor_con_foto_centavos, 0::bigint) as valor_con_foto_centavos
           from v_costo_lote_vigente d_1
             left join salidas s on s.lote_id = d_1.lote_id and s.producto_id = d_1.producto_id
             left join devoluciones dv on dv.lote_id = d_1.lote_id and dv.producto_id = d_1.producto_id
        ), valor_vendido as (
         -- NUMERIC a propósito, sin cast a bigint acá (BUG1, revisión
         -- adversarial): v_cobranza_lote.esperado_total_centavos es
         -- `numeric` en prod HOY — un `create or replace view` que le
         -- cambie el tipo a una columna existente falla al aplicarse
         -- (Postgres no permite cambiar el tipo de una columna de vista ya
         -- publicada). El cast a bigint queda solo en
         -- esperado_por_vendidas_centavos (bigint en prod), más abajo.
         select n.lote_id, n.producto_id,
            case when n.vendidas_brutas = 0 then 0::numeric
              else round(
                (
                  n.valor_con_foto_centavos
                  + (n.vendidas_brutas - n.unidades_con_foto) * d.costo_ananja_centavos
                )::numeric * n.vendidas / n.vendidas_brutas
              )
            end as centavos
           from netas n
             join v_costo_lote_vigente d on d.lote_id = n.lote_id and d.producto_id = n.producto_id
        )
 select d.lote_id,
    d.producto_id,
    d.producto_nombre,
    d.presentacion_ml,
    d.cantidad as producidas,
    n.vendidas,
    coalesce(p.unidades, 0::numeric) as perdidas,
    coalesce(sp.quedan, 0::numeric) as en_deposito,
    d.costo_ananja_centavos,
    -- numeric (mismo tipo que prod hoy) — ver el comentario de valor_vendido.
    vv.centavos + coalesce(sp.quedan, 0::numeric) * d.costo_ananja_centavos as esperado_total_centavos,
    -- bigint (mismo tipo que prod hoy, ya lo era antes de 0052).
    vv.centavos::bigint as esperado_por_vendidas_centavos
   from v_costo_lote_vigente d
     join netas n on n.lote_id = d.lote_id and n.producto_id = d.producto_id
     join valor_vendido vv on vv.lote_id = d.lote_id and vv.producto_id = d.producto_id
     left join perdidas p on p.lote_id = d.lote_id and p.producto_id = d.producto_id
     left join v_stock_por_lote sp on sp.lote_id = d.lote_id and sp.producto_id = d.producto_id;

revoke all on public.v_cobranza_lote from anon, public;
grant select on public.v_cobranza_lote to authenticated;

-- ============================================================
-- 4) v_valor_stock_revendedor — mismo cuerpo que 0059; el costo real sale
--    de entrega_items_costos() (cero filas para quien no es admin: la
--    columna cae al respaldo `costo_ananja_unitario_centavos`).
-- ============================================================

create or replace view public.v_valor_stock_revendedor
with (security_invoker = true) as
select
  pares.vendedor_id,
  pares.producto_id,
  coalesce(sum(s.quedan), 0)::int as en_poder,
  coalesce(sum(s.quedan * coalesce(s.costo_ananja_unitario_centavos, 0)), 0)::bigint
    as valor_en_poder_centavos,
  coalesce(sum(s.quedan * coalesce(c.costo_lote_unitario_centavos, s.costo_ananja_unitario_centavos, 0)), 0)::bigint
    as valor_en_poder_ananja_centavos
from (
  select distinct e.vendedor_id, ei.producto_id
  from entregas_revendedor e
  join entrega_items ei on ei.entrega_id = e.id
  where e.tipo = 'entrega'
) pares
cross join lateral public.stock_revendedor_por_entrega(pares.vendedor_id, pares.producto_id) s
join entrega_items ei on ei.id = s.entrega_item_id
left join public.entrega_items_costos() c on c.entrega_item_id = ei.id
group by pares.vendedor_id, pares.producto_id;

revoke all on public.v_valor_stock_revendedor from anon, public;
grant select on public.v_valor_stock_revendedor to authenticated;

-- ============================================================
-- 5) mi_stock_cobrado_con_margen — el booleano que `/mi` sacaba comparando
--    las dos columnas del punto 4 (ya iguales para quien no es admin).
-- ============================================================

-- Misma cuenta que `v_valor_stock_revendedor` (0059), acotada a quien llama
-- y sumada sobre todos sus productos (la página sumaba las filas de la vista
-- antes de comparar): lo cobrado (`costo_ananja_unitario_centavos`) contra la
-- foto del costo Ananja (`costo_lote_unitario_centavos`, con el mismo
-- respaldo). Las dos primeras condiciones no agregan información: son los
-- casos en que la pantalla igual decía "Ananja" o no mostraba el renglón.
create function public.mi_stock_cobrado_con_margen()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (select 1 from public.mi_encargado_revendedor())
    and coalesce(sum(s.quedan * coalesce(s.costo_ananja_unitario_centavos, 0)), 0) > 0
    and coalesce(sum(s.quedan * coalesce(s.costo_ananja_unitario_centavos, 0)), 0)
      <> coalesce(sum(s.quedan * coalesce(ei.costo_lote_unitario_centavos, s.costo_ananja_unitario_centavos, 0)), 0)
  from (
    select distinct ei.producto_id
    from entregas_revendedor e
    join entrega_items ei on ei.entrega_id = e.id
    where e.tipo = 'entrega'
      and e.vendedor_id = public.mi_vendedor_id()
  ) pares
  cross join lateral public.stock_revendedor_por_entrega(public.mi_vendedor_id(), pares.producto_id) s
  join entrega_items ei on ei.id = s.entrega_item_id;
$$;

revoke execute on function public.mi_stock_cobrado_con_margen() from anon, public;
grant execute on function public.mi_stock_cobrado_con_margen() to authenticated;

-- ============================================================
-- 6) v_rendiciones_ananja — el cálculo de 0061 pasa a una función security
--    definer que solo entrega la parte Ananja de cada rendición.
-- ============================================================

-- Cuerpo: las CTEs de `v_rendiciones_ananja` de 0061, copiadas tal cual.
-- Cambia solo el final: devuelve dos columnas y el filtro de quién ve qué
-- (antes `es_admin() or vendedor_id = mi_vendedor_id() or
-- es_coordinador_de(vendedor_id)`; la revendedora ya no entra, la
-- coordinadora conserva sus propias rendiciones).
create function public.rendiciones_parte_ananja()
returns table (
  rendicion_id uuid,
  monto_ananja_centavos numeric
)
language sql
stable
security definer
set search_path = public
as $$
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
  case
    when posicion = filas_grupo then parte_bruta + (parte_total_grupo - suma_partes_brutas)
    else parte_bruta
  end as monto_ananja_centavos
from con_partes
where public.es_admin()
  or public.es_coordinador_de(vendedor_id)
  or (public.es_coordinador() and vendedor_id = public.mi_vendedor_id());
$$;

revoke execute on function public.rendiciones_parte_ananja() from anon, public;
grant execute on function public.rendiciones_parte_ananja() to authenticated;

-- Mismas columnas, tipos y orden que 0061. Las filas las acota la RLS de
-- `rendiciones` (la vista sigue siendo security_invoker) y el `join` con la
-- función: sin parte Ananja para quien consulta, no hay fila.
create or replace view public.v_rendiciones_ananja
with (security_invoker = true) as
select
  r.id as rendicion_id,
  r.tenedor_id,
  r.vendedor_id,
  r.monto_centavos,
  r.created_at,
  p.monto_ananja_centavos
from rendiciones r
join public.rendiciones_parte_ananja() p on p.rendicion_id = r.id;

revoke all on public.v_rendiciones_ananja from anon, authenticated, public;
grant select on public.v_rendiciones_ananja to authenticated;

-- ============================================================
-- 7) entrega_items — select solo de las columnas que no son de admin
-- ============================================================

-- `revoke all` de tabla también saca los permisos de columna que hubiera.
revoke all on public.entrega_items from anon, authenticated, public;
grant select (
  id,
  entrega_id,
  producto_id,
  cantidad,
  lote_id,
  costo_ananja_unitario_centavos,
  precio_sugerido_centavos
) on public.entrega_items to authenticated;

-- ============================================================
-- Verificación (solo lectura; SQL Editor de Supabase)
-- ============================================================
--
--   -- a) permisos de entrega_items: sin select de tabla, 7 columnas
--   select grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_schema = 'public' and table_name = 'entrega_items'
--     and grantee in ('anon', 'authenticated', 'public');
--   -- esperado: 0 filas
--   select column_name
--   from information_schema.column_privileges
--   where table_schema = 'public' and table_name = 'entrega_items'
--     and grantee = 'authenticated' and privilege_type = 'SELECT'
--   order by column_name;
--   -- esperado: cantidad, costo_ananja_unitario_centavos, entrega_id, id,
--   --   lote_id, precio_sugerido_centavos, producto_id (7 filas; NO están
--   --   costo_lote_unitario_centavos ni costo_produccion_unitario_centavos)
--
--   -- b) las tres funciones: una firma cada una, security definer, search_path
--   select p.oid::regprocedure as firma, p.prosecdef, p.proconfig, p.proacl
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('entrega_items_costos', 'mi_stock_cobrado_con_margen',
--                       'rendiciones_parte_ananja')
--   order by p.proname;
--   -- esperado: 3 filas, prosecdef = true, proconfig = {search_path=public},
--   --   proacl con "authenticated=X/..." y sin "=X/..." ni "anon=X/..."
--
--   -- c) las cuatro vistas siguen siendo security_invoker
--   select c.relname, c.reloptions
--   from pg_class c
--   join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public'
--     and c.relname in ('v_costo_lote_venta', 'v_cobranza_lote',
--                       'v_valor_stock_revendedor', 'v_rendiciones_ananja')
--   order by c.relname;
--   -- esperado: 4 filas, todas con {security_invoker=true}
--
--   -- d) ANTES y DESPUÉS de aplicar, con "Impersonate" de un admin: guardar
--   --    y comparar (tienen que dar idéntico, fila por fila)
--   select * from public.v_plata_en_manos order by tenedor_id;
--   select * from public.v_rendiciones_ananja order by rendicion_id;
--   select * from public.v_valor_stock_revendedor order by vendedor_id, producto_id;
--   select * from public.v_cobranza_lote order by lote_id, producto_id;
--   select * from public.v_costo_lote_venta order by venta_id;
--
--   -- e) ANTES y DESPUÉS, con "Impersonate" de una coordinadora: idéntico
--   select * from public.v_plata_en_manos;
--   select * from public.v_rendiciones_ananja order by rendicion_id;
--
--   -- f) DESPUÉS, con "Impersonate" de una revendedora o una coordinadora
--   select costo_lote_unitario_centavos from public.entrega_items limit 1;
--   -- esperado: ERROR 42501 permission denied for table entrega_items
--   select count(*) from public.entrega_items_costos();   -- esperado: 0
--   select count(*) from public.v_costo_lote_venta;       -- esperado: 0
--   select public.mi_stock_cobrado_con_margen();
--   -- esperado: true/false, lo mismo que hoy muestra su `/mi` (nombre del
--   --   encargado en "Tu stock: Le debés a ..." = true); coordinadora: false
--   select id, cantidad, costo_ananja_unitario_centavos
--   from public.entrega_items limit 5;                    -- esperado: sus filas
--
-- ============================================================
-- Rollback
-- ============================================================
--
--   revoke all on public.entrega_items from anon, authenticated, public;
--   grant select on public.entrega_items to authenticated;
--   -- y volver a correr, en este orden, los `create or replace view` de
--   -- `v_rendiciones_ananja` (0061, más su `alter view ... set
--   -- (security_invoker = true)` de 0063), `v_valor_stock_revendedor`
--   -- (0059), `v_cobranza_lote` y `v_costo_lote_venta` (0052, E.5 y E.3) y
--   -- después:
--   drop function public.mi_stock_cobrado_con_margen();
--   drop function public.rendiciones_parte_ananja();
--   drop function public.entrega_items_costos();
