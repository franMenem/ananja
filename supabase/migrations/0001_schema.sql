-- Ananja: esquema base (enums + tablas)
-- Fase 1 data-model.md — montos en centavos ARS (bigint), ids uuid, nombres en español.

create extension if not exists pgcrypto;

-- ============================================================
-- Enums
-- ============================================================

create type medio_pago as enum ('banco', 'mercado_pago', 'efectivo');
create type tipo_movimiento as enum ('ingreso', 'egreso');
create type tipo_notificacion as enum ('stock_bajo', 'gasto_nuevo');
create type estado_ocr as enum ('no_intentado', 'propuesto', 'corregido', 'fallido');

-- ============================================================
-- Trigger genérico para updated_at
-- ============================================================

create function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- vendedores
-- ============================================================

create table vendedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (btrim(nombre) <> ''),
  activo boolean not null default true
);

-- ============================================================
-- productos
-- ============================================================

create table productos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (btrim(nombre) <> ''),
  presentacion_ml int not null unique check (presentacion_ml in (250, 500)),
  costo_centavos bigint not null default 0 check (costo_centavos >= 0),
  umbral_minimo int not null default 10 check (umbral_minimo >= 0)
);

-- ============================================================
-- categorias_gasto
-- ============================================================

create table categorias_gasto (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (btrim(nombre) <> ''),
  activa boolean not null default true
);

-- ============================================================
-- cajas
-- ============================================================

create table cajas (
  id uuid primary key default gen_random_uuid(),
  medio_pago medio_pago not null unique,
  saldo_inicial_centavos bigint not null default 0
);

-- ============================================================
-- comprobantes
-- ============================================================

create table comprobantes (
  id uuid primary key default gen_random_uuid(),
  vendedor_id uuid not null references vendedores(id),
  monto_centavos bigint not null check (monto_centavos > 0),
  medio_pago medio_pago not null,
  imagen_path text not null,
  fecha date not null default current_date,
  estado_ocr estado_ocr not null default 'no_intentado',
  ocr_monto_centavos bigint,
  nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_comprobantes_updated_at
  before update on comprobantes
  for each row execute function set_updated_at();

-- ============================================================
-- comprobante_items
-- ============================================================

create table comprobante_items (
  id uuid primary key default gen_random_uuid(),
  comprobante_id uuid not null references comprobantes(id) on delete cascade,
  producto_id uuid not null references productos(id),
  cantidad int not null check (cantidad > 0),
  unique (comprobante_id, producto_id)
);

-- ============================================================
-- movimientos_stock
-- ============================================================

create table movimientos_stock (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos(id),
  tipo tipo_movimiento not null,
  cantidad int not null check (cantidad > 0),
  vendedor_id uuid not null references vendedores(id),
  comprobante_id uuid references comprobantes(id) on delete cascade,
  nota text,
  created_at timestamptz not null default now()
);

create index idx_movimientos_stock_producto on movimientos_stock(producto_id);
create index idx_movimientos_stock_comprobante on movimientos_stock(comprobante_id);

-- ============================================================
-- gastos
-- ============================================================

create table gastos (
  id uuid primary key default gen_random_uuid(),
  vendedor_id uuid not null references vendedores(id),
  monto_centavos bigint not null check (monto_centavos > 0),
  categoria_id uuid not null references categorias_gasto(id),
  medio_pago medio_pago not null,
  fecha date not null default current_date,
  nota text,
  imagen_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_gastos_updated_at
  before update on gastos
  for each row execute function set_updated_at();

-- ============================================================
-- ajustes_caja
-- ============================================================

create table ajustes_caja (
  id uuid primary key default gen_random_uuid(),
  medio_pago medio_pago not null,
  monto_centavos bigint not null check (monto_centavos <> 0),
  nota text not null check (btrim(nota) <> ''),
  vendedor_id uuid not null references vendedores(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- notificaciones
-- ============================================================

create table notificaciones (
  id uuid primary key default gen_random_uuid(),
  tipo tipo_notificacion not null,
  titulo text not null,
  detalle text,
  referencia_id uuid,
  created_at timestamptz not null default now()
);

create index idx_notificaciones_created_at on notificaciones(created_at desc);

-- ============================================================
-- push_subscriptions
-- ============================================================

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);
