-- Ananja: RLS (rol authenticated), seeds y bucket de Storage

-- ============================================================
-- Vistas: forzar permisos del invocador (no del dueño de la vista)
-- ============================================================

alter view v_stock_actual set (security_invoker = true);
alter view v_saldos_caja set (security_invoker = true);

revoke all on v_stock_actual from anon, public;
revoke all on v_saldos_caja from anon, public;
grant select on v_stock_actual to authenticated;
grant select on v_saldos_caja to authenticated;

-- ============================================================
-- vendedores: select; insert/update
-- ============================================================

alter table vendedores enable row level security;
revoke all on vendedores from anon, authenticated, public;
grant select, insert, update on vendedores to authenticated;

create policy vendedores_select on vendedores for select to authenticated using (true);
create policy vendedores_insert on vendedores for insert to authenticated with check (true);
create policy vendedores_update on vendedores for update to authenticated using (true) with check (true);

-- ============================================================
-- productos: select; update solo de costo_centavos y umbral_minimo
-- ============================================================

alter table productos enable row level security;
revoke all on productos from anon, authenticated, public;
grant select on productos to authenticated;
grant update (costo_centavos, umbral_minimo) on productos to authenticated;

create policy productos_select on productos for select to authenticated using (true);
create policy productos_update on productos for update to authenticated using (true) with check (true);

-- ============================================================
-- categorias_gasto: select; insert/update
-- ============================================================

alter table categorias_gasto enable row level security;
revoke all on categorias_gasto from anon, authenticated, public;
grant select, insert, update on categorias_gasto to authenticated;

create policy categorias_gasto_select on categorias_gasto for select to authenticated using (true);
create policy categorias_gasto_insert on categorias_gasto for insert to authenticated with check (true);
create policy categorias_gasto_update on categorias_gasto for update to authenticated using (true) with check (true);

-- ============================================================
-- cajas: select; update solo de saldo_inicial_centavos
-- ============================================================

alter table cajas enable row level security;
revoke all on cajas from anon, authenticated, public;
grant select on cajas to authenticated;
grant update (saldo_inicial_centavos) on cajas to authenticated;

create policy cajas_select on cajas for select to authenticated using (true);
create policy cajas_update on cajas for update to authenticated using (true) with check (true);

-- ============================================================
-- comprobantes: select + delete directo; insert/update solo vía RPC
-- ============================================================

alter table comprobantes enable row level security;
revoke all on comprobantes from anon, authenticated, public;
grant select, delete on comprobantes to authenticated;

create policy comprobantes_select on comprobantes for select to authenticated using (true);
create policy comprobantes_delete on comprobantes for delete to authenticated using (true);

-- ============================================================
-- comprobante_items: select + delete directo; insert solo vía RPC
-- ============================================================

alter table comprobante_items enable row level security;
revoke all on comprobante_items from anon, authenticated, public;
grant select, delete on comprobante_items to authenticated;

create policy comprobante_items_select on comprobante_items for select to authenticated using (true);
create policy comprobante_items_delete on comprobante_items for delete to authenticated using (true);

-- ============================================================
-- movimientos_stock: select; insert directo solo sin comprobante_id
-- (ingreso de producción/reposición o egreso manual); los egresos de
-- venta se insertan vía RPC security definer con comprobante_id.
-- ============================================================

alter table movimientos_stock enable row level security;
revoke all on movimientos_stock from anon, authenticated, public;
grant select, insert on movimientos_stock to authenticated;

create policy movimientos_stock_select on movimientos_stock for select to authenticated using (true);
create policy movimientos_stock_insert on movimientos_stock for insert to authenticated
  with check (comprobante_id is null);

-- ============================================================
-- gastos: select/update/delete; insert solo vía RPC (notificación atómica)
-- ============================================================

alter table gastos enable row level security;
revoke all on gastos from anon, authenticated, public;
grant select, update, delete on gastos to authenticated;

create policy gastos_select on gastos for select to authenticated using (true);
create policy gastos_update on gastos for update to authenticated using (true) with check (true);
create policy gastos_delete on gastos for delete to authenticated using (true);

-- ============================================================
-- ajustes_caja: solo select; insert vía RPC crear_ajuste_caja; sin update/delete
-- ============================================================

alter table ajustes_caja enable row level security;
revoke all on ajustes_caja from anon, authenticated, public;
grant select on ajustes_caja to authenticated;

create policy ajustes_caja_select on ajustes_caja for select to authenticated using (true);

-- ============================================================
-- notificaciones: solo select (las crean los RPCs)
-- ============================================================

alter table notificaciones enable row level security;
revoke all on notificaciones from anon, authenticated, public;
grant select on notificaciones to authenticated;

create policy notificaciones_select on notificaciones for select to authenticated using (true);

-- ============================================================
-- push_subscriptions: insert/delete del propio endpoint (sin select)
-- ============================================================

alter table push_subscriptions enable row level security;
revoke all on push_subscriptions from anon, authenticated, public;
grant insert, delete on push_subscriptions to authenticated;

create policy push_subscriptions_insert on push_subscriptions for insert to authenticated with check (true);
create policy push_subscriptions_delete on push_subscriptions for delete to authenticated using (true);

-- ============================================================
-- Seeds
-- ============================================================

-- @solo-public:inicio
insert into productos (nombre, presentacion_ml, costo_centavos, umbral_minimo) values
  ('Botella 250 ml', 250, 0, 10),
  ('Botella 500 ml', 500, 0, 10);
-- @solo-public:fin

insert into cajas (medio_pago, saldo_inicial_centavos) values
  ('banco', 0),
  ('mercado_pago', 0),
  ('efectivo', 0);

insert into categorias_gasto (nombre) values
  ('Insumos'),
  ('Envases y etiquetas'),
  ('Logística'),
  ('Otros');

-- ============================================================
-- Storage: bucket privado "comprobantes"
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  '__BUCKET__',
  '__BUCKET__',
  false,
  10485760,
  array['image/heic', 'image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

-- @solo-public:inicio
create policy comprobantes_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = '__BUCKET__');

create policy comprobantes_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = '__BUCKET__');
-- @solo-public:fin
