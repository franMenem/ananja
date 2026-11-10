-- 0090_vistas_solo_lectura.sql
--
-- Deja las 35 vistas `v_*` de `public` en solo lectura para `anon` y
-- `authenticated`: revoca insert, update, delete, truncate, references y
-- trigger. NO toca `select`.
--
-- ── Hallazgo (auditado contra prod, solo lectura) ────────────────────────
-- 33 de las 35 vistas tenían los 7 privilegios (arwdDxt) para `authenticated`
-- (las otras 2, v_productos_publicos y v_rendiciones_ananja, ya eran solo
-- `select`). `anon`
-- no tiene ningún privilegio sobre ninguna vista.
--
-- ¿Agujero real? NO. Las 35 vistas tienen `security_invoker = true`, así que
-- una escritura por una vista auto-actualizable se chequea contra RLS y los
-- grants de la tabla base con el invocador: no saltea 0082/0087. Solo 4 vistas
-- son auto-actualizables (pg_relation_is_updatable = 28): v_deuda_vendedor,
-- v_plata_en_manos, v_saldo_comprobante y v_saldo_deuda; el resto no lo son.
-- Ninguna tiene triggers INSTEAD OF. Ningún código escribe sobre una vista.
-- Es, entonces, un exceso de privilegios redundante (defensa en profundidad):
-- si mañana alguien quita `security_invoker` de una de esas 4, la escritura
-- sí pasaría a saltear RLS; esta migración lo evita.
--
-- Lectura: todas con `security_invoker`, así que ninguna expone filas
-- salteando RLS. No se cambia nada de `select`.
--
-- ── Origen de los grants ─────────────────────────────────────────────────
-- Default privileges de Supabase: `postgres` (y `supabase_admin`) en el
-- schema public dan `arwdDxtm` a anon, authenticated y service_role sobre toda
-- relación nueva (pg_default_acl, defaclobjtype 'r', que cubre tablas Y
-- vistas). Por eso las vistas nuevas nacerán con el mismo exceso. NO se
-- cambia el default privilege: es el mismo para tablas, y quitarlo rompería
-- los grants que dan por hecho las tablas nuevas. Quien cree una vista nueva
-- debe agregarla a esta lista (o hacer su propio revoke); el test
-- tests/migracion-0090.test.ts compara con las migraciones.
--
-- `service_role` no se toca (no pasa por estos grants de la app).
--
-- Idempotente. Cada vista tiene guarda `to_regclass` y relkind 'v'.
--
-- ── Verificación posterior (solo lectura) ────────────────────────────────
--   select c.relname, g.grantee, g.privilege_type
--     from pg_class c
--     join information_schema.role_table_grants g
--       on g.table_schema = 'public' and g.table_name = c.relname
--    where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
--      and g.grantee in ('anon', 'authenticated')
--      and g.privilege_type <> 'SELECT';
--   -- esperado: 0 filas.
--   -- y `select` intacto: authenticated sigue con SELECT en las 35.
--
-- ── Rollback ─────────────────────────────────────────────────────────────
--   grant insert, update, delete, truncate, references, trigger
--     on <vista> to authenticated;   -- para cada vista de la lista
--   (no hace falta: ninguna pantalla escribe ni usa esos privilegios).

do $$
declare
  v text;
begin
  foreach v in array array[
    'public.v_cobranza_lote',
    'public.v_costo_lote',
    'public.v_costo_lote_desglose',
    'public.v_costo_lote_item',
    'public.v_costo_lote_venta',
    'public.v_costo_lote_vigente',
    'public.v_costo_producto',
    'public.v_cuenta_ananja',
    'public.v_deuda_aceite_lote',
    'public.v_deuda_cliente',
    'public.v_deuda_encargados',
    'public.v_deuda_vendedor',
    'public.v_diferencia_encargado',
    'public.v_diferencia_pendiente',
    'public.v_feria_participante_productos',
    'public.v_feria_participantes',
    'public.v_lote_costos_completos',
    'public.v_margen_ventas',
    'public.v_perdidas_lote',
    'public.v_plata_en_manos',
    'public.v_precio_item',
    'public.v_productos_publicos',
    'public.v_rendiciones_ananja',
    'public.v_resumen_revendedor',
    'public.v_saldo_comprobante',
    'public.v_saldo_deuda',
    'public.v_saldo_lote',
    'public.v_saldo_lote_concepto',
    'public.v_saldos_caja',
    'public.v_stock_actual',
    'public.v_stock_insumos',
    'public.v_stock_por_lote',
    'public.v_stock_revendedor',
    'public.v_tanque_aceite',
    'public.v_valor_stock_revendedor'
  ] loop
    if to_regclass(v) is not null
       and (select relkind from pg_class where oid = to_regclass(v)) = 'v' then
      execute format(
        'revoke insert, update, delete, truncate, references, trigger on %s from anon, authenticated',
        v
      );
    end if;
  end loop;
end $$;
