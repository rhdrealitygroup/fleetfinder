-- 0010 — audit hardening. Idempotent.

-- H1: stop clients from writing `memberships` directly (the members_write policy
-- allowed an admin to UPDATE their own role to 'owner' via PostgREST). All roster
-- changes already go through the service-role team API; keep read-only RLS only.
revoke insert, update, delete on public.memberships from authenticated;

-- M7: the dealer-removal queue is owner/admin-only (agents shouldn't read it or
-- other requesters' emails directly via PostgREST).
drop policy if exists drr_read on public.dealer_removal_requests;
create policy drr_read on public.dealer_removal_requests
  for select using (org_id in (select public.my_admin_org_ids()));

-- H3: per-dealer dump lock — prevents two concurrent dumps of the same dealer
-- from clobbering updated_at and sweeping still-in-stock cars.
alter table public.tracked_dealers add column if not exists dump_started_at timestamptz;

-- H4: webhook event ordering — the timestamp of the last Stripe event applied to
-- this org, so a stale out-of-order event can't un-cancel a canceled sub.
alter table public.organizations add column if not exists last_sub_event_at timestamptz;
