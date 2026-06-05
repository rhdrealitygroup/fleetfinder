-- Nationwide dealer directory (all US dealers), refreshed by a weekly cron.
-- Too large for a code file, so it lives here and is queried server-side.

create table if not exists public.dealer_catalog (
  id            text primary key,            -- MarketCheck dealer id
  name          text,
  street        text,
  city          text,
  state         text,
  zip           text,
  phone         text,
  type          text,                         -- franchise | independent
  dealer_group  text,
  website       text,
  lat           double precision,
  lng           double precision,
  listing_count int  default 0,
  makes         text[] default '{}',          -- new-car makes the dealer carries
  synced_at     timestamptz not null default now()
);

create index if not exists dealer_catalog_state_idx  on public.dealer_catalog(state);
create index if not exists dealer_catalog_makes_idx  on public.dealer_catalog using gin(makes);
create index if not exists dealer_catalog_synced_idx on public.dealer_catalog(synced_at);

-- Public directory: any signed-in user can read; writes are service-role only.
alter table public.dealer_catalog enable row level security;
drop policy if exists dealer_catalog_read on public.dealer_catalog;
create policy dealer_catalog_read on public.dealer_catalog
  for select using (auth.role() = 'authenticated');

-- Tracks the rolling weekly refresh cursor (which states were synced when).
create table if not exists public.dealer_sync_state (
  state      text primary key,
  synced_at  timestamptz not null default now(),
  count      int not null default 0
);
alter table public.dealer_sync_state enable row level security;
