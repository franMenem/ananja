-- Cierra un leak real de seguridad (ERROR `security_definer_view` del
-- linter de Supabase): `public.v_margen_ventas` es SECURITY DEFINER (no
-- tiene `security_invoker`), su dueño es `postgres` (bypassa RLS de las
-- tablas base) y NO filtra por rol. Resultado: cualquier usuario
-- `authenticated` (incluida una revendedora) puede leer por la API
-- PostgREST la ganancia/costo de TODO el negocio.
--
-- Cómo se coló: 0031 sí ponía `alter view v_margen_ventas set
-- (security_invoker = true)` a mano después de crearla. Pero el `create
-- or replace view` de 0058 (última migración que redefine el cuerpo de
-- la vista) no repitió esa reloption — un `create or replace view` que no
-- repite las reloptions previas las PIERDE (mismo comportamiento que ya
-- documentó 0032_v_productos_publicos_security_definer.sql), y la vista
-- volvió a correr como el dueño (`postgres`), bypassando RLS.
--
-- Quién la lee hoy (confirmado con grep): solo 2 pantallas de admin,
-- `lib/inicio-datos.ts` (`.from("v_margen_ventas")`, acotado a mes
-- actual + anterior) y `app/(app)/ganancia/page.tsx`. `/mi` (la pantalla
-- de la revendedora) NO la lee — calcula su propia ganancia con
-- `lib/margen.ts` sobre sus datos.
--
-- Fix: recrear la vista IDÉNTICA (mismas columnas, mismo orden, mismos
-- CTEs, sin tocar ningún cálculo — el cuerpo es un copy/paste exacto del
-- `create or replace view public.v_margen_ventas as ...` de 0058), con
-- DOS capas:
--  1) `with (security_invoker = true)` explícito en el propio `create or
--     replace view` (repetir la reloption esta vez, como ya advertía
--     0032 que hacía falta) — vuelve a correr con los privilegios de
--     quien consulta, no del dueño, así que las RLS de las tablas base
--     (`comprobantes`/`comprobante_items`/`ventas_revendedor`/
--     `lotes_produccion`/`lote_items`/`vendedores`, todas con policies
--     `es_admin()`/`es_vendedor()` — HOY `es_vendedor()` es literalmente
--     `es_admin()`, ver comentario en 0052) se ejercen de verdad. Cierra
--     también el ERROR `security_definer_view` del linter de Supabase
--     para esta vista.
--  2) `where public.es_admin()` — mismo patrón que ya usa
--     `v_rendiciones_ananja` (0058) y las vistas de Plata (0037): sin
--     esto, con SOLO `security_invoker`, una revendedora igual vería SUS
--     PROPIAS filas (las RLS de base la dejan ver sus propios
--     comprobantes/ventas), y esta vista es de admin únicamente — nadie
--     más la necesita (confirmado con grep, ver más abajo). El filtro de
--     rol adentro de la vista es lo que da 0 filas para cualquier no-admin,
--     más allá de qué le permitan ver las RLS de base.
--
-- Por qué las dos y no una sola: `where es_admin()` solo (sin
-- security_invoker) ya cierra el leak, pero la vista sigue corriendo
-- definer y el linter de Supabase la sigue marcando ERROR.
-- `security_invoker` solo (sin el where) no alcanza: como se explica en
-- el punto 2, un revendedor pasaría las RLS para sus propias filas.
--
-- Efecto para los 2 lectores actuales: ambos corren siempre como admin
-- (`lib/inicio-datos.ts` y `/ganancia` son pantallas de admin, protegidas
-- en la UI) → `es_admin()` da `true` Y las RLS de las tablas base lo
-- dejan pasar (mismo criterio ya probado en prod por 0031, y que hoy
-- usan `v_costo_lote_vigente`/`v_costo_lote_venta` desde 0044/0052/0055
-- sin problema) → siguen viendo EXACTAMENTE las mismas filas que hoy,
-- sin cambios.
--
-- Probado en Postgres 15 local (stubs + 0001..0059 renderizadas + 0060),
-- con datos de 2 vendedores distintos (un comprobante del admin, un
-- comprobante Y una `ventas_revendedor` de la revendedora de prueba):
-- `auth.login_as` del admin ve las 3 filas de los DOS vendedores (prueba
-- que `security_invoker` no le recorta nada); `auth.login_as` de la
-- revendedora ve 0 filas en `v_margen_ventas` — AUNQUE esa misma
-- revendedora sí puede ver su propia fila directo en `ventas_revendedor`
-- (RLS de base se lo permite: `es_admin() or vendedor_id =
-- mi_vendedor_id()`), lo que confirma que el `where es_admin()` de la
-- vista es el que la bloquea, no solo `security_invoker`; sin sesión
-- (`anon`), permiso denegado (ya lo tenía por el `revoke ... from anon`
-- original).
--
-- Migración sin templating (mismo criterio que 0049-0059): hardcodea
-- `public.` y `search_path = public` — Ananja es hoy el único negocio
-- activo (schema `miel` en pausa).

create or replace view public.v_margen_ventas
with (security_invoker = true) as
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
     LEFT JOIN costo_venta_revendedor cv ON t.origen = 'revendedor'::text AND cv.venta_id = t.documento_id
where public.es_admin();

-- Grants: sin cambios respecto a los que ya tenía la vista (aplicados en
-- 0031, repetidos por prolijidad en 0044/0052 — un `create or replace
-- view` conserva los grants existentes aunque no los repita, a
-- diferencia de las reloptions).
revoke all on public.v_margen_ventas from anon, public;
grant select on public.v_margen_ventas to authenticated;
