-- 0005 — fix the self-recursive memberships RLS + clean up duplicate orgs.
-- Safe to re-run.

-- The old members_read policy was `org_id in (select my_org_ids())`. Because
-- my_org_ids() itself reads public.memberships, evaluating it *while* checking
-- RLS on public.memberships recurses and yields nothing — so a user could not
-- read their own membership row. That made every org-scoped feature think the
-- user had no org (billing/team/checkout → "Unauthorized") and made
-- ensureOrgForUser create a fresh duplicate org on every visit.
--
-- Fix: allow a direct, NON-recursive self-read (user_id = auth.uid()). The
-- org-wide branch is kept for reading coworkers; the app also resolves the
-- caller's own membership via the service role for reliability.
drop policy if exists members_read on public.memberships;
create policy members_read on public.memberships
  for select using (
    user_id = auth.uid()
    or org_id in (select public.my_org_ids())
  );

-- De-duplicate the orgs that accumulated from the bug above. Keep each user's
-- earliest org; delete the later auto-created duplicates that have no Stripe
-- subscription (cascades to their memberships). Real/paid orgs are never touched.
with ranked as (
  select org_id,
         row_number() over (partition by user_id order by created_at asc) as rn
  from public.memberships
)
delete from public.organizations o
using ranked r
where o.id = r.org_id
  and r.rn > 1
  and o.stripe_subscription_id is null;
