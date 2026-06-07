-- 0009 — per-org custom pricing + agent dealer-removal requests. Idempotent.

-- ── Per-org custom monthly price (super-admin set; used at checkout) ─────────
alter table public.organizations
  add column if not exists monthly_price_override integer;        -- whole dollars/mo, null = standard
alter table public.organizations
  add column if not exists stripe_custom_price_id text;           -- cached Stripe Price for the override

-- ── Agent dealer-removal requests ───────────────────────────────────────────
-- Agents can request a dealer be removed from the company list; owners/admins
-- approve (which actually removes it) or dismiss.
create table if not exists public.dealer_removal_requests (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  dealer_key        text not null,
  dealer_name       text,
  requested_by      uuid references auth.users(id) on delete set null,
  requested_by_email text,
  status            text not null default 'pending',  -- pending | approved | dismissed
  created_at        timestamptz not null default now()
);
create index if not exists drr_org_status_idx on public.dealer_removal_requests(org_id, status);
alter table public.dealer_removal_requests enable row level security;
-- Members of the org can read their org's requests; writes/approvals go through
-- the API with the service role (scoped to verified membership + role).
drop policy if exists drr_read on public.dealer_removal_requests;
create policy drr_read on public.dealer_removal_requests
  for select using (org_id in (select public.my_org_ids()));
