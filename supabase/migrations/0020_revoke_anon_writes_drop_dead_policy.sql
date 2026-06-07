-- 0020 — defense-in-depth hardening (idempotent).
--
-- (1) Remove standing write grants that only RLS was backing. These are Supabase
-- default grants that earlier lockdowns (0006/0010/0014) only half-revoked. RLS
-- blocks anon/authenticated writes today, but with relforcerowsecurity off the
-- grant layer should not be the missing second line of defense — if a permissive
-- INSERT/UPDATE policy is ever added, these grants would instantly become an
-- exploit path. All tenant rows are written via the service role (which bypasses
-- both grants and RLS), so removing these is safe.
revoke insert, update, delete on public.organizations from anon;
revoke insert, update, delete on public.memberships  from anon;
revoke insert, update, delete on public.profiles      from anon;
-- organizations are created/mutated only via the service role (account.ts,
-- stripe webhook, admin). authenticated never needs direct row insert/delete.
revoke insert, delete on public.organizations from authenticated;

-- (2) Drop the now-dead members_write policy. 0010 revoked all membership writes
-- from authenticated, so this permissive FOR ALL (admin-scoped) policy is
-- unreachable. Dropping it makes the contract explicit (memberships are
-- read-only via RLS, written only by the service-role team API) and prevents a
-- future grant change from silently re-enabling admin self-promotion to owner.
drop policy if exists members_write on public.memberships;
