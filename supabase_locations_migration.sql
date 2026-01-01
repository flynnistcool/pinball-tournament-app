-- Locations + machines presets
-- Run after supabase_schema.sql (and before/after other migrations is ok)

create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists location_machines (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_location_machines_location_id on location_machines(location_id);

alter table tournaments
  add column if not exists location_id uuid references locations(id);

create index if not exists idx_tournaments_location_id on tournaments(location_id);
