-- 0007 — enforce one organization per owner (fixes the duplicate-org race).
-- ensureOrgForUser did check-then-insert with no DB backstop, so parallel
-- first-load requests each created a separate org for the same user. This
-- dedupes any remaining duplicates (keeping the earliest org per owner and
-- repointing child rows), then adds a UNIQUE(owner_id) constraint so the code's
-- idempotent fallback can rely on it. Safe to re-run (dedupe is a no-op when
-- there are no duplicates).

-- 1) Map each duplicate org → the keeper (earliest) org for its owner.
drop table if exists _dup_map;
create temp table _dup_map as
select o.id as dup_id, kp.keep_id
from public.organizations o
join (
  select distinct on (owner_id) owner_id, id as keep_id
  from public.organizations
  where owner_id is not null
  order by owner_id, created_at asc, id asc
) kp on kp.owner_id = o.owner_id
where o.id <> kp.keep_id;

-- 2) Repoint child rows from duplicate orgs to the keeper.
--    Memberships first (skip ones that would collide on the keeper, then drop
--    the leftover duplicates).
update public.memberships m set org_id = d.keep_id
  from _dup_map d
  where m.org_id = d.dup_id
    and not exists (select 1 from public.memberships m2 where m2.org_id = d.keep_id and m2.user_id = m.user_id);
delete from public.memberships m using _dup_map d where m.org_id = d.dup_id;

update public.customers c set org_id = d.keep_id from _dup_map d where c.org_id = d.dup_id;
update public.saved_vehicles s set org_id = d.keep_id from _dup_map d where s.org_id = d.dup_id;
update public.dealers dl set org_id = d.keep_id from _dup_map d where dl.org_id = d.dup_id;

-- 3) Delete the now-empty duplicate orgs.
delete from public.organizations o using _dup_map d where o.id = d.dup_id;

drop table if exists _dup_map;

-- 4) Enforce it going forward.
alter table public.organizations drop constraint if exists organizations_owner_uniq;
alter table public.organizations add constraint organizations_owner_uniq unique (owner_id);
