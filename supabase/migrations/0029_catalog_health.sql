-- Drift watchdog state for the make/model catalog. One row per (make, model),
-- updated by the catalog-health cron with the latest observed trim/color counts.
-- A model with had_data=true that later reports trims=0 is a regression.
create table if not exists public.catalog_health (
  make         text not null,
  model        text not null,
  trims        integer not null default 0,
  ext_colors   integer not null default 0,
  int_colors   integer not null default 0,
  had_data     boolean not null default false,  -- has this model ever shown trims? (sticky baseline)
  status       text    not null default 'unknown', -- ok | empty | regressed | unknown
  last_checked timestamptz,
  last_ok_at   timestamptz,
  alerted_at   timestamptz,                       -- last time we emailed about a regression
  primary key (make, model)
);

-- Service-role only (the cron writes, admin reads via service role). Lock out
-- the API roles entirely: RLS on with no policies + revoke table privileges.
alter table public.catalog_health enable row level security;
revoke all on public.catalog_health from anon, authenticated;
