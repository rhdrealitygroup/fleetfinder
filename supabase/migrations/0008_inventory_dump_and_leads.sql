-- 0008 — nightly/6-hourly inventory dump + consumer leads.
-- Idempotent.

-- ── tracked_dealers: the DEDUPED union of every dealer any org has selected ──
-- One row per dealer regardless of how many orgs picked it. Drives the dump.
create table if not exists public.tracked_dealers (
  dealer_id        text primary key,
  name             text,
  city             text,
  state            text,
  first_tracked_at timestamptz not null default now(),
  last_dumped_at   timestamptz,
  listing_count    int not null default 0
);
alter table public.tracked_dealers enable row level security; -- service-role only

-- ── inventory: the dumped listings (one row per VIN), options pre-decoded ─────
create table if not exists public.inventory (
  vin             text primary key,
  dealer_id       text,
  make            text,
  model           text,
  trim            text,
  year            int,
  price           int,
  msrp            int,
  miles           int,
  exterior_color  text,
  car_type        text,            -- 'new' | 'used'
  payload         jsonb not null default '{}'::jsonb,  -- full unified listing
  options         jsonb not null default '[]'::jsonb,  -- decoded option names
  options_decoded boolean not null default false,
  updated_at      timestamptz not null default now(),
  dumped_at       timestamptz not null default now()
);
create index if not exists inventory_dealer_idx   on public.inventory(dealer_id);
create index if not exists inventory_mm_idx        on public.inventory(make, model);
create index if not exists inventory_cartype_idx   on public.inventory(car_type);
create index if not exists inventory_decoded_idx   on public.inventory(options_decoded);
create index if not exists inventory_price_idx     on public.inventory(price);
alter table public.inventory enable row level security;
-- Signed-in brokers may read the shared inventory (it's public market data, not
-- tenant data). The consumer site reads via the service role in its API.
drop policy if exists inventory_read on public.inventory;
create policy inventory_read on public.inventory
  for select using (auth.role() = 'authenticated');

-- ── leads: consumer enquiries from the /usedcar site (referral pipeline) ─────
create table if not exists public.leads (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  name         text,
  email        text,
  phone        text,
  vin          text,
  vehicle      jsonb not null default '{}'::jsonb,  -- snapshot of the car asked about
  dealer_id    text,
  dealer_name  text,
  source       text not null default 'usedcar',
  message      text,
  status       text not null default 'new'          -- new | contacted | sold | dead
);
create index if not exists leads_created_idx on public.leads(created_at);
alter table public.leads enable row level security; -- service-role only (insert + read via API)
