-- Columnas "Valor en poder" / "Total" en /revendedores (Parte E del plan de
-- costos de lote). Vista de conjunto sobre `stock_revendedor_por_entrega`
-- (0040_revendedores_pagos_precios.sql:288-415, FIFO por tramo de entrega):
-- en vez de que la página la invoque N veces (una por vendedor/producto),
-- una sola consulta hace `lateral join` contra ella para todos los pares a
-- la vez y suma. Reusar la función en vez de reescribir el FIFO a mano
-- garantiza la misma lógica exacta (espejo ya probado en
-- `lib/revendedor-stock.ts` / `tests/revendedor-stock.test.ts`) sin
-- triplicar el algoritmo.
--
-- La función es `stable`, no `security definer`, y solo lee
-- `entrega_items`/`entregas_revendedor`/`ventas_revendedor` (RLS ya las
-- protege: `es_admin() or vendedor_id = mi_vendedor_id()`). Estaba con
-- `execute` revocado a `authenticated` porque hasta ahora solo la llamaban
-- RPCs `security definer` — como la vista es `security_invoker = true`
-- (misma RLS de siempre, no la bypasea), Postgres chequea el `execute` de
-- la función contra el rol que realmente consulta la vista, así que hace
-- falta otorgárselo. No cambia su superficie de seguridad: sigue sin poder
-- ver nada que la RLS de esas tablas ya no le dejara ver llamándola desde
-- un RPC de la misma revendedora (ej. `registrar_venta_revendedor`).
--
-- `valor_en_poder_centavos`: por tramo, `quedan × costo_ananja_unitario_centavos`
-- (lo que se le cobró a ELLA por esa entrega, no el costo real de
-- producción) — coalescido a 0 cuando el tramo no tiene costo aprobado
-- (entregas viejas, previas a 0040), para no inventar un valor.

grant execute on function __SCHEMA__.stock_revendedor_por_entrega(uuid, uuid) to authenticated;

create view v_valor_stock_revendedor as
select
  pares.vendedor_id,
  pares.producto_id,
  coalesce(sum(s.quedan), 0)::int as en_poder,
  coalesce(sum(s.quedan * coalesce(s.costo_ananja_unitario_centavos, 0)), 0)::bigint
    as valor_en_poder_centavos
from (
  select distinct e.vendedor_id, ei.producto_id
  from entregas_revendedor e
  join entrega_items ei on ei.entrega_id = e.id
  where e.tipo = 'entrega'
) pares
cross join lateral __SCHEMA__.stock_revendedor_por_entrega(pares.vendedor_id, pares.producto_id) s
group by pares.vendedor_id, pares.producto_id;

alter view v_valor_stock_revendedor set (security_invoker = true);
revoke all on v_valor_stock_revendedor from anon, public;
grant select on v_valor_stock_revendedor to authenticated;
