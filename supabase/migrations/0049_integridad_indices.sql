-- Integridad y performance: FK que faltaba en gastos.encargado_beneficiario_id,
-- índices sobre FKs y fechas consultadas sin índice, y `auth.uid()` envuelto en
-- `(select ...)` en las policies de vendedores para que se evalúe una vez por
-- consulta y no por fila. Todo idempotente.

-- ─── 1) FK que faltaba: gastos.encargado_beneficiario_id ──────────────────
-- Misma cláusula que rendiciones.encargado_diferencia_id (0044).

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'gastos_encargado_beneficiario_id_fkey'
  ) then
    alter table gastos
      add constraint gastos_encargado_beneficiario_id_fkey
      foreign key (encargado_beneficiario_id) references vendedores(id);
  end if;
end $$;

-- ─── 2) Índices sobre FKs consultadas sin índice ───────────────────────────
-- Índices sobre FKs.

create index if not exists idx_cobros_vendedor_id
  on cobros(vendedor_id);

create index if not exists idx_depositos_cuenta_vendedor_id
  on depositos_cuenta(vendedor_id);

create index if not exists idx_entrega_items_producto_id
  on entrega_items(producto_id);

create index if not exists idx_entregas_revendedor_admin_id
  on entregas_revendedor(admin_id);

create index if not exists idx_lotes_produccion_vendedor_id
  on lotes_produccion(vendedor_id);

create index if not exists idx_materiales_venta_actualizado_por
  on materiales_venta(actualizado_por);

create index if not exists idx_movimientos_insumo_vendedor_id
  on movimientos_insumo(vendedor_id);

create index if not exists idx_notificaciones_destinatario_id
  on notificaciones(destinatario_id);

create index if not exists idx_pagos_deuda_vendedor_id
  on pagos_deuda(vendedor_id);

create index if not exists idx_pagos_revendedor_resuelto_por
  on pagos_revendedor(resuelto_por);

create index if not exists idx_rendiciones_admin_id
  on rendiciones(admin_id);

create index if not exists idx_revendedor_precios_producto_id
  on revendedor_precios(producto_id);

create index if not exists idx_ventas_revendedor_lote_id
  on ventas_revendedor(lote_id);

create index if not exists idx_ventas_revendedor_producto_id
  on ventas_revendedor(producto_id);

create index if not exists idx_ventas_revendedor_registrada_por
  on ventas_revendedor(registrada_por);

-- ─── 3) Índices por fecha ───────────────────────────────────────────────
-- ventas_revendedor.fecha, cobros.fecha y rendiciones (vendedor_id, fecha)
-- ya tenían índice.

create index if not exists idx_comprobantes_fecha
  on comprobantes(fecha desc);

create index if not exists idx_gastos_fecha
  on gastos(fecha desc);

-- ─── 4) RLS: auth.uid() cacheado en vendedores_select / vendedores_update ──
-- Mismo predicado que 0013; solo cambia auth.uid() por (select auth.uid()).

drop policy if exists vendedores_select on vendedores;
create policy vendedores_select on vendedores for select to authenticated
  using (user_id = (select auth.uid()) or __SCHEMA__.es_vendedor());

drop policy if exists vendedores_update on vendedores;
create policy vendedores_update on vendedores for update to authenticated
  using (user_id = (select auth.uid()) or __SCHEMA__.es_vendedor())
  with check (user_id = (select auth.uid()) or __SCHEMA__.es_vendedor());
