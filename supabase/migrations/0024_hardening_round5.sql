-- 0024 — audit round 5 hardening. Idempotent.

-- (R5-6) 0020 only revoked standing write grants on organizations/memberships/
-- profiles. inventory, leads, and dealer_removal_requests still carry the Supabase
-- default anon/authenticated write grants. All three are written exclusively by
-- the service role (inventory dump, lead capture API, removal-requests API), so
-- remove the unused grants — RLS shouldn't be the only barrier.
revoke insert, update, delete on public.inventory               from anon, authenticated;
revoke insert, update, delete on public.leads                   from anon, authenticated;
revoke insert, update, delete on public.dealer_removal_requests from anon, authenticated;

-- (R5-12) Longer referral code → a collision on the volatile column DEFAULT
-- (which would fail org creation, misreported as the owner-unique violation) is
-- now negligible (16^12).
create or replace function public.gen_referral_code()
returns text language sql volatile as $$
  select upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 12));
$$;

-- (R5-11) gen_referral_code is only invoked as a column DEFAULT by service-role
-- inserts (which run as the table owner). Revoke EXECUTE from PostgREST roles so
-- it can't be called via /rpc (mirrors 0015's definer-function lockdown).
revoke execute on function public.gen_referral_code() from anon, authenticated;
