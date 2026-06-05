-- 0004 — billing period tracking + per-agent customer privacy.
-- Safe to re-run (idempotent: IF NOT EXISTS / drop-policy-then-create).

-- ── organizations: store the Stripe billing period end ──────────────────────
-- Lets the billing UI show a real renewal/trial date and lets the server gate
-- enforce trial expiry (trial_ends_at already exists from 0001).
alter table public.organizations
  add column if not exists current_period_end timestamptz;

-- ── customers: tighten RLS from org-wide to per-agent ───────────────────────
-- Previously ANY member of the org could read every customer's PII (name,
-- phone, email, notes) via a direct Supabase query, even though the API scoped
-- to agent_id. Now each agent sees only their own customers; owners/admins keep
-- full-org read for desk oversight. Writes are restricted to the owning agent.
drop policy if exists customers_org on public.customers;

drop policy if exists customers_read on public.customers;
create policy customers_read on public.customers
  for select using (
    agent_id = auth.uid()
    or org_id in (
      select org_id from public.memberships
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );

drop policy if exists customers_write on public.customers;
create policy customers_write on public.customers
  for all using (
    agent_id = auth.uid()
  ) with check (
    agent_id = auth.uid()
    and org_id in (select org_id from public.memberships where user_id = auth.uid())
  );
