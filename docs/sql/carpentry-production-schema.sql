-- Run in Supabase SQL editor when moving off assembly.metadata.carpentry (Phase 2+).

create table if not exists carpentry_production_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('carpentry_floor', 'quote_order')),
  quote_id uuid null,
  assembly_id uuid not null references warehouse_assemblies(id),
  product_qty numeric not null default 1,
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  accepted_by uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists carpentry_production_material_usage (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references carpentry_production_runs(id) on delete cascade,
  material_assembly_id uuid not null references warehouse_assemblies(id),
  warehouse_location_id uuid not null references locations(id),
  quantity numeric not null,
  uom text not null,
  created_at timestamptz not null default now()
);

create table if not exists quote_production_routing (
  quote_id uuid primary key,
  route text not null check (route in ('carpentry', 'upholstery')),
  sent_to_production_at timestamptz null,
  sent_by uuid null,
  accepted_at timestamptz null,
  completed_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists carpentry_production_runs_assembly_idx
  on carpentry_production_runs (assembly_id, created_at desc);
