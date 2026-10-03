-- v_valor_stock_revendedor (0051): hasta acá valuaba el stock en poder de
-- una revendedora SOLO con `costo_ananja_unitario_centavos` — lo que se le
-- cobró a ELLA por esa entrega. Para una revendedora directa eso coincide
-- con el costo real de Ananja, pero para una revendedora de un
-- COORDINADOR (`vendedores.encargado_id` con `rol = 'coordinador'`,
-- 0055/0057/0058) es el precio DEL COORDINADOR, no el costo real de
-- producción — ej. una revendedora de un coordinador: se le cobra
-- $700/$1.000 la botella, pero el costo real de Ananja es $600/$850.
--
-- Por eso la ficha de admin de esa revendedora mostraba "Valor en poder" (y el
-- "Total") con la plata que le debe al coordinador, no lo que Ananja tiene
-- en juego de verdad — pedido de Fran (2026-09-18): separar las dos
-- valuaciones.
--
-- `valor_en_poder_centavos` (columna existente, sin tocar) sigue siendo el
-- costo AL QUE SE LE COBRÓ a la revendedora — la vista que necesita
-- `/mi` (su propia deuda) y el home del coordinador (lo que sus
-- revendedoras le deben A ÉL). Se agrega, al final (`create or replace
-- view` no permite reordenar/retipar columnas existentes),
-- `valor_en_poder_ananja_centavos`: el costo REAL de Ananja por ese
-- tramo — la que necesita un admin ("Le debe a Ananja" de verdad).
--
-- Fuente del costo real: `entrega_items.costo_lote_unitario_centavos`, la
-- misma FOTO congelada que ya usa `v_margen_ventas` para la ganancia real
-- de Ananja (0044/0052) y que 0058 ya usó para el mismo propósito del lado
-- de Plata — no es el costo VIGENTE del lote (que puede cambiar con
-- "Editar costos"), es el que quedó fijado en la entrega. La función
-- `stock_revendedor_por_entrega` (0040) no lo devuelve (solo devuelve
-- `costo_ananja_unitario_centavos`), así que se suma acá un `join` contra
-- `entrega_items` por `s.entrega_item_id` — no se toca la función.
create or replace view v_valor_stock_revendedor as
select
  pares.vendedor_id,
  pares.producto_id,
  coalesce(sum(s.quedan), 0)::int as en_poder,
  coalesce(sum(s.quedan * coalesce(s.costo_ananja_unitario_centavos, 0)), 0)::bigint
    as valor_en_poder_centavos,
  coalesce(sum(s.quedan * coalesce(ei.costo_lote_unitario_centavos, s.costo_ananja_unitario_centavos, 0)), 0)::bigint
    as valor_en_poder_ananja_centavos
from (
  select distinct e.vendedor_id, ei.producto_id
  from entregas_revendedor e
  join entrega_items ei on ei.entrega_id = e.id
  where e.tipo = 'entrega'
) pares
cross join lateral __SCHEMA__.stock_revendedor_por_entrega(pares.vendedor_id, pares.producto_id) s
join entrega_items ei on ei.id = s.entrega_item_id
group by pares.vendedor_id, pares.producto_id;

-- Misma superficie de seguridad que 0051: `security_invoker = true` (RLS
-- de las tablas de abajo, no la bypasea), sin acceso a `anon`/`public`
-- (`default privileges` de este proyecto le otorgan select a `anon` en
-- objetos nuevos si no se revoca a mano).
alter view v_valor_stock_revendedor set (security_invoker = true);
revoke all on v_valor_stock_revendedor from anon, public;
grant select on v_valor_stock_revendedor to authenticated;
