-- Ananja: índices sobre FKs consultadas, sugeridos por el advisor de performance
-- (get_advisors type=performance, lint unindexed_foreign_keys) tras T036.
-- Estas columnas se filtran/joinean en las pantallas principales (listados
-- por vendedor, items por producto, gastos por categoría/vendedor, etc.).

create index if not exists idx_ajustes_caja_vendedor
  on ajustes_caja(vendedor_id);

create index if not exists idx_comprobante_items_producto
  on comprobante_items(producto_id);

create index if not exists idx_comprobantes_vendedor
  on comprobantes(vendedor_id);

create index if not exists idx_gastos_categoria
  on gastos(categoria_id);

create index if not exists idx_gastos_vendedor
  on gastos(vendedor_id);

create index if not exists idx_movimientos_stock_vendedor
  on movimientos_stock(vendedor_id);
