-- Run in Supabase SQL editor before using Warehouse Storage / Sold flow.
create table if not exists warehouse_storage_sends (
  id uuid primary key,
  storage_number text not null unique,
  sale_id bigint,
  sale_item_id bigint,
  receipt_number text,
  assembly_id uuid not null,
  assembly_name text not null,
  assembly_sku text,
  customer_id uuid,
  customer_name text,
  customer_phone text,
  quantity integer not null check (quantity > 0),
  status text not null default 'in_storage',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_email text,
  created_by_name text,
  labels_printed_at timestamptz,
  delivered_at timestamptz,
  delivery_number text,
  driver_id text,
  driver_name text,
  driver_signature_url text,
  metadata jsonb default '{}'::jsonb
);

create index if not exists warehouse_storage_sends_status_created
  on warehouse_storage_sends (status, created_at desc);

create index if not exists warehouse_storage_sends_customer
  on warehouse_storage_sends (customer_name, created_at desc);
