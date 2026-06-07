-- 0006 — complimentary access + close the billing-bypass / RLS gaps.
-- Idempotent; safe to re-run.

-- ── Complimentary (free) access flag ────────────────────────────────────────
-- A "comped" org bypasses Stripe payment entirely but uses the normal app with
-- no admin powers. Toggled by a super-admin from /admin. requireActivePlan()
-- treats comped orgs as active.
alter table public.organizations
  add column if not exists comped boolean not null default false;

-- ── HIGH: stop owners from editing their own billing columns via direct RLS ──
-- The orgs_update policy let any owner PATCH plan_status / agent_limit /
-- trial_ends_at etc. through PostgREST, granting themselves a free unlimited
-- plan. Billing columns must only change via the service-role (webhook/checkout/
-- admin). Authenticated users may only edit cosmetic columns.
revoke update on public.organizations from authenticated;
grant update (name, restrict_to_dealers) on public.organizations to authenticated;

-- ── De-recurse members_write (a policy on memberships that queried memberships)
-- via a security-definer helper, removing the latent recursion class.
create or replace function public.my_admin_org_ids()
returns setof uuid language sql security definer stable as $$
  select org_id from public.memberships
  where user_id = auth.uid() and role in ('owner','admin')
$$;

drop policy if exists members_write on public.memberships;
create policy members_write on public.memberships
  for all
  using (org_id in (select public.my_admin_org_ids()))
  with check (org_id in (select public.my_admin_org_ids()));

-- ── Tighten customers_write: scope existing-row access to the agent's own org ─
drop policy if exists customers_write on public.customers;
create policy customers_write on public.customers
  for all
  using (agent_id = auth.uid() and org_id in (select public.my_org_ids()))
  with check (agent_id = auth.uid() and org_id in (select public.my_org_ids()));
