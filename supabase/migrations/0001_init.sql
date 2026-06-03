-- FleetFinder v2 — initial schema
-- Multi-tenant: organizations (leasing companies) → memberships (users w/ role)
-- Roles: owner | admin | agent. Super-admins are identified by email in the
-- app layer (SUPER_ADMIN_EMAILS env) and operate via the service role, so RLS
-- here only needs to enforce per-organization tenant isolation.
--
-- HOW TO APPLY: Supabase dashboard → SQL Editor → paste this whole file → Run.
-- Safe to re-run (idempotent: IF NOT EXISTS / CREATE OR REPLACE / drop-policy).

-- ─── Extensions ────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ─── Helper: orgs the current user belongs to ──────────────────────────────
create or replace function public.my_org_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select org_id from public.memberships where user_id = auth.uid()
$$;

-- ─── profiles (1:1 with auth.users) ────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  created_at  timestamptz not null default now()
);

-- ─── organizations (leasing companies) ─────────────────────────────────────
create table if not exists public.organizations (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  owner_id               uuid references auth.users(id) on delete set null,
  -- Billing
  stripe_customer_id     text,
  stripe_subscription_id text,
  plan_status            text not null default 'trial',  -- trial|active|past_due|canceled
  trial_ends_at          timestamptz default (now() + interval '14 days'),
  agent_limit            int not null default 1,
  -- Per-company dealer restriction toggle
  restrict_to_dealers    boolean not null default false,
  created_at             timestamptz not null default now()
);

-- ─── memberships (user ↔ org, with role) ───────────────────────────────────
create table if not exists public.memberships (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'agent',  -- owner|admin|agent
  first_name  text,
  last_name   text,
  email       text,
  created_at  timestamptz not null default now(),
  unique (org_id, user_id)
);
create index if not exists memberships_user_idx on public.memberships(user_id);
create index if not exists memberships_org_idx  on public.memberships(org_id);

-- ─── customers (7-day customer profile vault — desking feature) ─────────────
create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  agent_id    uuid references auth.users(id) on delete set null,
  name        text not null,
  phone       text,
  email       text,
  notes       text,
  needs       jsonb not null default '{}'::jsonb,  -- preferences for matching
  expires_at  timestamptz not null default (now() + interval '7 days'),
  created_at  timestamptz not null default now()
);
create index if not exists customers_org_idx on public.customers(org_id);

-- ─── saved_vehicles (per-user favorites) ───────────────────────────────────
create table if not exists public.saved_vehicles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  org_id      uuid references public.organizations(id) on delete cascade,
  vin         text,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists saved_user_idx on public.saved_vehicles(user_id);

-- ─── recent_searches (per-user history) ────────────────────────────────────
create table if not exists public.recent_searches (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  criteria    jsonb not null default '{}'::jsonb,
  summary     text,
  created_at  timestamptz not null default now()
);
create index if not exists recent_user_idx on public.recent_searches(user_id);

-- ─── dealers (per-org dealer directory) ────────────────────────────────────
create table if not exists public.dealers (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null,
  dealer_key  text,
  city        text,
  state       text,
  selected    boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists dealers_org_idx on public.dealers(org_id);

-- ─── Shared caches (service-role only; no RLS access for clients) ───────────
create table if not exists public.trim_cache (
  key text primary key, make text, model text, payload jsonb,
  provider text, expires_at timestamptz not null
);
create table if not exists public.color_cache (
  key text primary key, make text, model text, payload jsonb,
  provider text, expires_at timestamptz not null
);
create table if not exists public.style_cache (
  key text primary key, year int, make text, model text, payload jsonb,
  provider text, expires_at timestamptz not null
);
create table if not exists public.vin_decode_cache (
  vin text primary key, payload jsonb, provider text, expires_at timestamptz not null
);
create table if not exists public.search_cache (
  key text primary key, criteria jsonb, summary text, payload jsonb,
  total int, provider text, expires_at timestamptz not null
);

-- ─── API usage tracking ─────────────────────────────────────────────────────
create table if not exists public.provider_usage (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null,
  period        text not null,            -- YYYY-MM
  calls         int not null default 0,
  rate_limited  int not null default 0,
  last_call_at  timestamptz,
  unique (provider, period)
);

-- ═══ Row-Level Security ═════════════════════════════════════════════════════
alter table public.profiles        enable row level security;
alter table public.organizations   enable row level security;
alter table public.memberships     enable row level security;
alter table public.customers       enable row level security;
alter table public.saved_vehicles  enable row level security;
alter table public.recent_searches enable row level security;
alter table public.dealers         enable row level security;
-- Caches + usage: no policies → only the service role (backend) can touch them.
alter table public.trim_cache       enable row level security;
alter table public.color_cache      enable row level security;
alter table public.style_cache      enable row level security;
alter table public.vin_decode_cache enable row level security;
alter table public.search_cache     enable row level security;
alter table public.provider_usage   enable row level security;

-- profiles: a user sees/edits only their own row
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- organizations: members can read; owners/admins can update
drop policy if exists orgs_read on public.organizations;
create policy orgs_read on public.organizations
  for select using (id in (select public.my_org_ids()));
drop policy if exists orgs_update on public.organizations;
create policy orgs_update on public.organizations
  for update using (
    id in (select org_id from public.memberships
           where user_id = auth.uid() and role in ('owner','admin'))
  );

-- memberships: members can read their org's roster; owners/admins manage it
drop policy if exists members_read on public.memberships;
create policy members_read on public.memberships
  for select using (org_id in (select public.my_org_ids()));
drop policy if exists members_write on public.memberships;
create policy members_write on public.memberships
  for all using (
    org_id in (select org_id from public.memberships
               where user_id = auth.uid() and role in ('owner','admin'))
  ) with check (
    org_id in (select org_id from public.memberships
               where user_id = auth.uid() and role in ('owner','admin'))
  );

-- customers: any member of the org
drop policy if exists customers_org on public.customers;
create policy customers_org on public.customers
  for all using (org_id in (select public.my_org_ids()))
  with check (org_id in (select public.my_org_ids()));

-- saved_vehicles + recent_searches: the owning user only
drop policy if exists saved_self on public.saved_vehicles;
create policy saved_self on public.saved_vehicles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists recent_self on public.recent_searches;
create policy recent_self on public.recent_searches
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- dealers: any member of the org reads; owners/admins manage
drop policy if exists dealers_read on public.dealers;
create policy dealers_read on public.dealers
  for select using (org_id in (select public.my_org_ids()));
drop policy if exists dealers_write on public.dealers;
create policy dealers_write on public.dealers
  for all using (
    org_id in (select org_id from public.memberships
               where user_id = auth.uid() and role in ('owner','admin'))
  ) with check (
    org_id in (select org_id from public.memberships
               where user_id = auth.uid() and role in ('owner','admin'))
  );

-- ─── Auto-create a profile row when a user signs up ─────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
