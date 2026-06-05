-- Nightly snapshot of every model's catalog (trims, sub-variants, colors,
-- options) — the data moat. Refreshed by a daily rolling cron.

create table if not exists public.vehicle_catalog (
  key        text primary key,          -- make::model::kind
  make       text,
  model      text,
  kind       text,                        -- trims | versions | colors | options
  payload    jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists vehicle_catalog_mm_idx      on public.vehicle_catalog(make, model);
create index if not exists vehicle_catalog_updated_idx on public.vehicle_catalog(updated_at);
alter table public.vehicle_catalog enable row level security;
drop policy if exists vehicle_catalog_read on public.vehicle_catalog;
create policy vehicle_catalog_read on public.vehicle_catalog
  for select using (auth.role() = 'authenticated');

-- Rolling-refresh cursor: which model was snapshotted when.
create table if not exists public.catalog_sync_state (
  key        text primary key,          -- make::model
  updated_at timestamptz not null default now()
);
alter table public.catalog_sync_state enable row level security;
